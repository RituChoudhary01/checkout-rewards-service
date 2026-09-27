import request from "supertest";
import app from "../src/app";

describe("Cart API", () => {
  test("creates a new cart", async () => {
    const response = await request(app)
      .post("/api/carts")
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.status).toBe("ACTIVE");
  });
});