# Design Decisions

## 1. Core Invariants

The service maintains the following invariants:

- Product inventory must never become negative or oversell during concurrent checkout.
- A cart can be checked out at most once.
- A successful checkout creates exactly one order for a cart.
- A given idempotency key can create at most one order; repeated requests with the same key return the same order.
- A coupon can be redeemed by at most one successful checkout.
- A checkout that fails rolls back its database changes, including inventory and coupon redemption.
- Order items store product name and price snapshots so historical orders remain correct even if product data changes later.
- Money is stored and calculated as integer paise; floating-point arithmetic is not used for monetary calculations.
- Admin reporting is read-only and does not mutate orders, coupons, or inventory.

---

## 2. Ambiguities and Chosen Semantics

The assignment leaves some business semantics open. The following choices were made:

### Cart price and stock

The cart stores the product ID and quantity rather than reserving a price or inventory amount.

The cart API can display the product's current price and stock. At checkout, current product price and stock are read again.

Therefore:

- A product price change before checkout affects the final order price.
- A stock reduction before checkout can cause checkout to fail.
- A successful order always stores the actual price paid at checkout.

This avoids implementing inventory reservations and reservation expiry for the scope of this assignment.

### Coupon scope

A coupon applies to the complete order subtotal.

Only one coupon can be applied to an order.

The discount is percentage-based and configured through environment variables.

### Payment

No real payment integration is required by the assignment.

For this service, a successful checkout represents a successful purchase. No external payment call is made, so checkout can remain fully transactional.

### Idempotency

An idempotency key is required for checkout.

The key is persisted with a unique database constraint and associated with the resulting order.

A future improvement would be to store a request hash with the key and reject reuse of the same key with a different request payload.

### Reward milestones

Reward configuration is provided through environment variables:

- `REWARD_MILESTONE`
- `REWARD_DISCOUNT_PERCENT`

Every N successful orders makes the next reward milestone eligible.

Coupon generation is explicitly performed through the admin API rather than automatically during checkout.

For example, with a milestone of 5:

- 5 successful orders → milestone 5 eligible
- 10 successful orders → milestone 10 eligible

The admin endpoint generates one coupon for the next unrewarded eligible milestone.

---

## 3. Database Choice: PostgreSQL

### Context

Checkout requires strong consistency for inventory, coupon redemption, cart state, and idempotency.

### Options considered

- PostgreSQL with transactions, row-level locks, and unique constraints.
- MongoDB with multi-document transactions.
- Application-level locks.

### Decision

PostgreSQL was selected.

### Reason

PostgreSQL provides the database-level primitives required for this assignment:

- Transactions
- Row-level locking
- Conditional updates
- Unique constraints
- Atomic stock updates

This allows the important invariants to be enforced by the database rather than relying on process-local state.

### Trade-off

The relational schema is more structured than a document model, but the consistency requirements of checkout make that trade-off appropriate.

---

## 4. Transaction and Concurrency Strategy

Checkout executes inside a PostgreSQL transaction.

The cart row is locked using:

`SELECT ... FOR UPDATE`

before checkout state is validated and modified.

This ensures that concurrent checkout attempts against the same cart are serialized.

Inventory is then checked against the current product stock and decremented atomically with a condition equivalent to:

`stock >= requested quantity`

Therefore, a checkout cannot reduce stock below zero even when multiple carts attempt to purchase limited inventory concurrently.

### Alternative considered

Optimistic locking with version numbers was considered.

Pessimistic database locking was chosen because it provides straightforward correctness for this relatively short transaction and avoids implementing retry loops.

### Production consideration

Row-level locking can become a throughput bottleneck for extremely hot carts or products. At larger scale, lock contention and inventory partitioning would need to be measured and addressed based on actual workload.

---

## 5. Idempotency Strategy

Checkout requires an idempotency key.

The key is stored in the `IdempotencyKey` table with a unique constraint and a one-to-one relationship with the resulting order.

The checkout flow:

1. Checks for an existing idempotency key.
2. Locks the cart row inside the transaction.
3. Re-checks the idempotency key after acquiring the cart lock.
4. If an existing order is found, returns that order.
5. Otherwise, continues checkout and creates the order and idempotency record in the same transaction.

A unique-constraint conflict (`P2002`) is also handled as a defensive fallback by looking up the existing order and returning it.

### Why PostgreSQL instead of Redis?

Redis could be used as a fast idempotency cache, but the order itself is persisted in PostgreSQL.

Using PostgreSQL as the source of truth avoids consistency problems between a cache and the database and removes an additional infrastructure dependency.

### Deferred improvement

A request hash can be stored with the idempotency key so that reusing the same key with a different checkout payload can be explicitly rejected.

---

## 6. Inventory Protection

Inventory is protected at two levels:

1. Current stock is validated during checkout.
2. The stock update only succeeds when enough stock is still available.

The update is effectively:

`stock = stock - quantity WHERE stock >= quantity`

If the conditional update affects zero rows, the checkout fails with an insufficient-stock error.

This prevents negative inventory and overselling.

Cart addition does not reserve inventory. Inventory is only consumed by a successful checkout.

---

## 7. Integer Money Representation

All monetary values are stored as integer paise.

Examples:

- ₹2,999.00 → `299900`
- ₹99.00 → `9900`

Discount calculation is performed using integer arithmetic and rounding.

The final total is never allowed to become negative.

### Alternative considered

PostgreSQL `DECIMAL`/`NUMERIC` values were considered.

Integer minor units were chosen because they provide deterministic arithmetic and avoid floating-point precision issues in JavaScript.

---

## 8. Order Snapshots

`OrderItem` stores:

- Product ID
- Product name snapshot
- Unit price snapshot
- Quantity
- Line total

The snapshot is created during successful checkout.

This means an old order remains historically correct even if:

- The product name changes.
- The product price changes.
- The product's current inventory changes.

The order does not depend on the current product price for historical totals.

---

## 9. Coupon Redemption

Coupon redemption happens inside the checkout transaction.

A coupon can only be redeemed when its current status is `AVAILABLE`.

The database update changes the coupon to `REDEEMED` conditionally.

This prevents two concurrent transactions from both successfully redeeming the same coupon.

If checkout later fails, the entire transaction rolls back and the coupon becomes available again.

Therefore a failed checkout does not consume a coupon.

---

## 10. Reward Coupon Generation

Reward coupons are generated through:

`POST /api/admin/coupons/generate`

The service counts successful orders and determines the next eligible milestone.

A unique constraint on `milestoneNumber` prevents the same milestone from being generated more than once.

If two admin requests attempt to generate the same milestone concurrently, one succeeds and the database unique constraint causes the other request to receive a conflict response.

Coupon generation itself does not modify orders or inventory.

### Alternative considered

Automatic coupon creation during the Nth checkout was considered.

Explicit admin generation was chosen because the assignment specifically provides an admin coupon-generation API and this makes reward creation deterministic and auditable.

---

## 11. Error Handling

Business errors use structured error codes and HTTP status codes.

Examples include:

- `PRODUCT_NOT_FOUND`
- `INVALID_QUANTITY`
- `CART_NOT_FOUND`
- `CART_ALREADY_CHECKED_OUT`
- `EMPTY_CART`
- `INSUFFICIENT_STOCK`
- `COUPON_NOT_FOUND`
- `COUPON_ALREADY_REDEEMED`
- `MILESTONE_NOT_REACHED`
- `NO_ELIGIBLE_MILESTONE`
- `INVALID_REWARD_CONFIG`

Unexpected errors return a generic:

`500 INTERNAL_SERVER_ERROR`

response without exposing internal implementation details.

Stable error codes allow clients to handle errors without parsing human-readable messages.

---

## 12. Admin Reporting

The admin report is read-only.

It reports information including:

- Total successful orders
- Purchased quantity by product
- Gross revenue
- Total discounts
- Net revenue
- Coupons generated
- Coupons available
- Coupons redeemed

Revenue is calculated from order/order-item data rather than current product prices, so historical reporting remains stable.

The report does not mutate any application state.

### Current implementation

The current implementation loads successful orders and aggregates the results in application memory.

### Production evolution

For a large order table, the report should move to SQL aggregation with appropriate indexes, pagination, or a dedicated reporting/read model.

---

## 13. Testing Strategy

The project uses Jest and Supertest with a real PostgreSQL database.

The test suite covers important business behavior including:

- Cart creation
- Cart item operations
- Successful checkout
- Idempotent checkout retry
- Preventing checkout of an already checked-out cart
- Empty-cart rejection
- Concurrent inventory protection
- Reward milestone coupon generation
- Preventing duplicate milestone coupon generation
- Admin report response

The tests exercise actual database transactions and constraints rather than mocking the database behavior.

### Test database

A dedicated test database would be preferable for CI and production-quality development isolation.

The current take-home setup uses the configured PostgreSQL database to keep the environment simple.

---

## 14. Implemented vs Deferred

### Implemented

- Product persistence and seed data
- Cart creation and retrieval
- Add/update/remove cart items
- Product and quantity validation
- Transactional checkout
- Cart row locking
- Inventory protection against overselling
- Idempotent checkout
- Order creation and historical snapshots
- Atomic coupon redemption
- Admin coupon generation
- Admin reporting
- Structured business errors
- Automated integration tests

### Deferred

- Idempotency request-payload hashing
- Authentication and authorization
- Dedicated CI/test database
- SQL-level aggregation for large-scale reporting
- Pagination for large report datasets
- Advanced observability and metrics
- Load/performance testing beyond the required concurrency scenarios
- Coupon expiry/minimum-order-value rules

These are production-hardening improvements rather than required functionality for the take-home scope.

---

## 15. Multi-Instance and Production Scaling

The application relies on PostgreSQL for correctness rather than process-local memory.

Therefore multiple Express instances can share the same PostgreSQL database while retaining the important concurrency guarantees provided by:

- Database transactions
- Row-level locks
- Conditional inventory updates
- Unique constraints

At production scale, the following would be considered:

- Connection pooling
- SQL aggregation for reporting
- Read replicas for reporting workloads
- Redis caching for suitable read-heavy endpoints
- Structured logging and metrics
- Distributed tracing
- Load testing under realistic concurrency
- Further inventory partitioning strategies if individual products become extremely high contention

The database remains the source of truth for inventory, orders, coupons, and idempotency.

---

## 16. AI Tool Usage

AI tools were used during development for scaffolding, implementation suggestions, debugging, test design, and reviewing edge cases.

AI suggestions were treated as proposals and were manually reviewed against the actual requirements and implementation.

### Example of rejected AI output

An early approach suggested adding Redis as an idempotency-key cache.

After reviewing the requirement, PostgreSQL was kept as the source of truth because the idempotency key, order, and transaction already live in the same database. Redis would add another infrastructure dependency without improving the core correctness guarantee for this assignment.

### Example of a discovered test issue

An earlier checkout test used `product.deleteMany()` during test setup.

This unintentionally deleted the seeded development products whenever the test suite ran.

The destructive product deletion was removed so that tests no longer erase the application's seeded catalog.

### AI-assisted concurrency review

AI suggestions were also used to review checkout locking and database race conditions. The final implementation was validated against the actual PostgreSQL transaction behavior and automated tests rather than relying on AI output alone.

---

## 17. Next four Hours

If additional implementation time were available, the priorities would be:

1. Add request-payload hashing to idempotency keys.
2. Add authentication and authorization for admin endpoints.
3. Configure a dedicated test database for CI.
4. Move large admin-report calculations to SQL aggregation.
5. Add higher-concurrency load tests.
6. Add structured logging, metrics, and tracing.
7. Add additional API validation and documentation.

---

## 18. Approximate Time Spent

Approximately 4 hours were spent on the implementation and validation of the core assignment, excluding environment setup and debugging iterations.