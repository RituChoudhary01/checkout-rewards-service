import request from "supertest";
import app from "../src/app";
import prisma from "../src/utils/prisma";

const createSuccessfulOrders = async (count: number) => {
  const carts = await Promise.all(
    Array.from({ length: count }, () =>
      prisma.cart.create({
        data: {
          status: "CHECKED_OUT",
        },
      })
    )
  );

  await prisma.order.createMany({
    data: carts.map((cart) => ({
      cartId: cart.id,
      subtotalInPaise: 10000,
      discountInPaise: 0,
      totalInPaise: 10000,
    })),
  });
};

describe("Coupon API", () => {
  beforeEach(async () => {
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.coupon.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("generates coupon when milestone is reached", async () => {
    await createSuccessfulOrders(5);

    const response = await request(app)
      .post("/api/admin/coupons/generate")
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.code).toBe("REWARD-MILESTONE-5");
    expect(response.body.data.discountPercent).toBe(10);
    expect(response.body.data.status).toBe("AVAILABLE");

    const couponCount = await prisma.coupon.count();

    expect(couponCount).toBe(1);
  });

  test("does not generate the same milestone twice", async () => {
    await createSuccessfulOrders(5);

    const firstResponse = await request(app)
      .post("/api/admin/coupons/generate")
      .expect(201);

    expect(firstResponse.body.data.code).toBe("REWARD-MILESTONE-5");

    const secondResponse = await request(app)
      .post("/api/admin/coupons/generate")
      .expect(409);

    expect(secondResponse.body.success).toBe(false);
    expect(secondResponse.body.error.code).toBe("NO_ELIGIBLE_MILESTONE");

    const couponCount = await prisma.coupon.count();

    expect(couponCount).toBe(1);
  });
});