import request from "supertest";
import app from "../src/app";

describe("Admin API", () => {
  test("returns admin report", async () => {
    const response = await request(app)
      .get("/api/admin/report")
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();

    expect(response.body.data.totalSuccessfulOrders).toEqual(
      expect.any(Number)
    );

    expect(response.body.data.grossRevenueInPaise).toEqual(
      expect.any(Number)
    );

    expect(response.body.data.netRevenueInPaise).toEqual(
      expect.any(Number)
    );
  });
});
