import request from "supertest";
import app from "../../../src/api/app";

describe("Stripe webhook receiver", () => {
  it("returns 400 for missing/invalid signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const res = await request(app).post("/api/webhooks/stripe").send({ hello: "world" });
    expect(res.status).toBe(400);
  });
});
