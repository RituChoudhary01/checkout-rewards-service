import request from "supertest";
import app from "../src/app";
import prisma from "../src/utils/prisma";

describe("Checkout API", () => {
  let productId: string;

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.product.deleteMany();

    const product = await prisma.product.create({
      data: {
        name: "Test Product",
        priceInPaise: 10000,
        stock: 10,
      },
    });

    productId = product.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createCartWithItem = async (quantity = 1) => {
    const cartResponse = await request(app)
      .post("/api/carts")
      .expect(201);

    const cartId = cartResponse.body.data.id;

    await request(app)
      .post(`/api/carts/${cartId}/items`)
      .send({
        productId,
        quantity,
      })
      .expect(201);

    return cartId;
  };

  test("successfully checks out a cart", async () => {
    const cartId = await createCartWithItem(2);

    const response = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "checkout-test-1",
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.totalInPaise).toBe(20000);
    expect(response.body.idempotentReplay).toBe(false);

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    expect(product?.stock).toBe(8);
  });

  test("same idempotency key returns the same order", async () => {
    const cartId = await createCartWithItem(1);

    const first = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "same-key-test",
      })
      .expect(201);

    const second = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "same-key-test",
      })
      .expect(200);

    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    // Stock must only decrease once.
    expect(product?.stock).toBe(9);

    expect(await prisma.order.count()).toBe(1);
  });

  test("prevents checkout of the same cart twice with different keys", async () => {
    const cartId = await createCartWithItem(1);

    await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "first-key",
      })
      .expect(201);

    const response = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "second-key",
      })
      .expect(409);

    expect(response.body.error.code).toBe("CART_ALREADY_CHECKED_OUT");
  });

  test("prevents overselling limited inventory", async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { stock: 1 },
    });

    const cart1 = await createCartWithItem(1);
    const cart2 = await createCartWithItem(1);

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/carts/${cart1}/checkout`)
        .send({ idempotencyKey: "concurrent-1" }),

      request(app)
        .post(`/api/carts/${cart2}/checkout`)
        .send({ idempotencyKey: "concurrent-2" }),
    ]);

    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 409]);

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    expect(product?.stock).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });

  test("rejects checkout with an empty cart", async () => {
    const cartResponse = await request(app)
      .post("/api/carts")
      .expect(201);

    const cartId = cartResponse.body.data.id;

    const response = await request(app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({
        idempotencyKey: "empty-cart-test",
      })
      .expect(400);

    expect(response.body.error.code).toBe("EMPTY_CART");
  });
});