# Checkout & Rewards Service

A reliable checkout and rewards service built with **Node.js, TypeScript, Express, PostgreSQL, Prisma, and Jest**.

The service focuses on safe inventory handling, idempotent checkout, transactional order creation, coupon redemption, milestone-based rewards, and an admin reconciliation report.

---

## Tech Stack

- **Node.js**
- **TypeScript**
- **Express.js**
- **PostgreSQL 16**
- **Prisma ORM**
- **Jest + Supertest**
- **Docker / Docker Compose**

---

## Features

### Products
- Product listing and product lookup
- Integer-based money representation using paise
- Inventory tracking
- Limited-stock products

### Carts
- Create and retrieve carts
- Add, update, and remove cart items
- Product existence and quantity validation
- Current product price and availability validation
- Prevents modification of checked-out carts
- One product can appear only once in a cart

### Checkout
- Validates cart before checkout
- Calculates prices using current product prices at checkout
- Creates an order transactionally
- Stores product name and price snapshots in order items
- Prevents the same cart from being checked out twice
- Idempotent checkout using an idempotency key
- Protects inventory from concurrent overselling
- No real payment processing is performed

### Rewards & Coupons
- Every configured milestone of successful orders becomes eligible for a reward
- Admin can generate the next eligible reward coupon
- Coupons are single-use
- Coupon redemption is concurrency-safe
- Failed checkout does not consume a coupon
- Discount is calculated using integer paise

### Admin Report
Provides:
- Total successful orders
- Purchased quantity by product
- Gross revenue
- Total discounts
- Net revenue
- Generated coupons
- Available coupons
- Redeemed coupons

The report is read-only and does not mutate business data.

---

## Project Structure

```text
checkout-rewards-service/
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── cart.test.ts
│   ├── checkout.test.ts
│   ├── coupon.test.ts
│   └── admin.test.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── .env
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── DECISIONS.md
└── README.md
```

---

## Requirements

- Node.js 20+
- Docker Desktop
- npm

---

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/checkout_service?schema=public"
PORT=3000

REWARD_MILESTONE=5
REWARD_DISCOUNT_PERCENT=10
```

### Configuration

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API server port |
| `REWARD_MILESTONE` | Number of successful orders required for each reward milestone |
| `REWARD_DISCOUNT_PERCENT` | Discount percentage of generated reward coupons |

Money is stored as integer paise. For example:

```text
₹2999.00 → 299900 paise
```

No floating-point values are used for monetary calculations.

---

## Running PostgreSQL with Docker

Start PostgreSQL:

```bash
docker compose up -d
```

Verify:

```bash
docker ps
```

The project PostgreSQL container exposes port `5433` on the host and uses PostgreSQL port `5432` inside the container.

---

## Database Setup

Run migrations:

```bash
npx prisma migrate dev
```

For a completely fresh database:

```bash
npx prisma migrate reset
```

Seed the database:

```bash
npx prisma db seed
```

The seed creates five sample products and sample carts.

Reward coupons are generated through the admin reward endpoint rather than being pre-created by the seed.

---

## Start the Application

Development mode:

```bash
npm run dev
```

The API runs on:

```text
http://localhost:3000
```

Health check:

```http
GET /health
```

---

# API Endpoints

## Products

### Get all products

```http
GET /api/products
```

### Get product by ID

```http
GET /api/products/:productId
```

---

## Carts

### Create cart

```http
POST /api/carts
```

### Get cart

```http
GET /api/carts/:cartId
```

### Add item

```http
POST /api/carts/:cartId/items
```

Example:

```json
{
  "productId": "PRODUCT_ID",
  "quantity": 2
}
```

### Update item quantity

```http
PATCH /api/carts/:cartId/items/:productId
```

Example:

```json
{
  "quantity": 3
}
```

A quantity of `0` removes the item.

### Remove item

```http
DELETE /api/carts/:cartId/items/:productId
```

---

# Checkout

### Checkout cart

```http
POST /api/carts/:cartId/checkout
```

Example:

```json
{
  "idempotencyKey": "checkout-001"
}
```

With an optional coupon:

```json
{
  "idempotencyKey": "checkout-002",
  "couponCode": "REWARD-MILESTONE-5"
}
```

A successful new checkout returns `201`.

Repeating the same checkout with the same idempotency key returns the previously created order rather than creating another order.

---

# Orders

### Get order

```http
GET /api/orders/:orderId
```

Order items contain snapshots of:

- Product name
- Unit price
- Quantity
- Line total

This keeps historical order information stable even if the product changes later.

---

# Admin APIs

## Generate reward coupon

```http
POST /api/admin/coupons/generate
```

A reward is generated only when the configured successful-order milestone has been reached and there is an unrewarded eligible milestone.

Example generated coupon:

```text
REWARD-MILESTONE-5
```

with the configured discount percentage.

## Admin report

```http
GET /api/admin/report
```

The report summarizes successful orders, product quantities, revenue, discounts, and coupon status.

---

# Reliability & Concurrency

The checkout flow uses PostgreSQL transactions and locking to protect business invariants.

### Inventory

Checkout revalidates inventory inside the transaction and uses an atomic stock update with a condition that stock must be sufficient.

This prevents concurrent checkouts from reducing inventory below zero.

### Cart checkout

The cart row is locked during checkout so concurrent attempts for the same cart are serialized.

A cart can produce only one successful order.

### Idempotency

The idempotency key is uniquely stored in the database.

Checkout:

1. Checks for an existing idempotency key.
2. Locks the cart.
3. Re-checks the idempotency key inside the transaction.
4. Creates the order and idempotency record transactionally.
5. Replays the existing order for repeated requests.

### Coupons

Coupon redemption uses a conditional database update so that a coupon cannot be successfully redeemed twice concurrently.

If checkout fails and the transaction rolls back, the coupon remains available.

---

# Money Handling

All monetary values are stored as integers in paise.

Example:

```text
₹100.00 = 10000 paise
```

This avoids floating-point precision issues.

Discounts are calculated using integer arithmetic and the final discount is never allowed to make the order total negative.

---

# Order Snapshots

Order items store:

```text
productNameSnapshot
unitPriceInPaiseSnapshot
quantity
lineTotalInPaise
```

This means an order retains the exact product information and price used at checkout even if the current product price or name changes later.

---

# Testing

Run the complete test suite:

```bash
npm test
```

Tests cover important business scenarios including:

- Successful checkout
- Idempotent checkout replay
- Preventing duplicate checkout with different keys
- Concurrent limited-inventory checkout
- Empty cart rejection
- Cart operations
- Reward coupon generation
- Duplicate milestone prevention
- Admin reporting

The checkout tests use isolated test data and clean product records before each test.

---

# Build

Run TypeScript compilation:

```bash
npm run build
```

Start the compiled application:

```bash
npm start
```

---

# Design Decisions

Detailed architectural decisions, invariants, concurrency handling, ambiguity resolution, deferred improvements, AI usage, and production scaling considerations are documented in:

```text
DECISIONS.md
```

---

# Production Evolution

The current implementation is designed for a single PostgreSQL-backed service.

For a larger multi-instance production deployment, the next improvements would include:

- Database-backed distributed coordination where required
- More extensive database indexing
- SQL-level aggregation for large admin reports
- Pagination for large datasets
- Request-level idempotency payload validation
- Observability, metrics, and tracing
- Authentication and authorization for admin endpoints
- Production-grade connection pooling
- External payment integration with payment-state handling

These are intentionally kept outside the current take-home scope unless required.

---

# AI Usage

AI tools were used during development for:

- Reviewing architecture and edge cases
- Improving test coverage
- Reviewing transaction and concurrency behavior
- Identifying potential implementation issues

Generated suggestions were reviewed and adapted to the actual implementation rather than being accepted blindly.

For example, suggestions that did not match the required persistence/concurrency model were rejected or changed after reviewing the actual application requirements.

More details are documented in `DECISIONS.md`.

---

# Approximate Development Time

Approximately **2 hours** of focused implementation and testing, excluding setup/debugging iterations.

---

## License

This project was created as a take-home assignment.
```

Ye **final README** ke liye enough hai. Isko `README.md` mein paste kar do.

Ek correction maine jaan-bujhkar rakhi hai: README mein **unsupported claims nahi daale**—jaise specific product-lock ordering ya koi concurrency scenario jo actual tests mein nahi hai. Isse evaluator ke saamne documentation aur implementation match rahenge.