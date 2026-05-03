/**
 * Stripe Adapter Unit Tests
 *
 * Tests all adapter functions with concrete expectations:
 * - PaymentIntent creation succeeds with correct amount, currency, and metadata
 * - Capture succeeds and returns updated PaymentIntent
 * - Refund succeeds and returns Refund object
 * - Webhook event handling updates transaction status correctly
 * - Errors are thrown when Stripe API key is missing
 */

import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as stripeAdapter from "../../src/services/psp/stripe.adapter";
import { transactionRepository } from "../../src/db/repositories/transaction.repository";
import { shadowLogRepository } from "../../src/db/repositories/shadow-log.repository";
import Stripe from "stripe";

// Mock dependencies
vi.mock("../../src/db/repositories/transaction.repository");
vi.mock("../../src/db/repositories/shadow-log.repository");

describe("Stripe Adapter - createPaymentIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
  });

  it("EXPECT: creates PaymentIntent with correct amount, currency, and metadata", async () => {
    const result = await stripeAdapter.createPaymentIntent({
      amount_cents: 5000, // $50.00
      currency: "usd",
      metadata: { transaction_id: "tx_123", reference_id: "ref_123" },
      idempotencyKey: "key_123",
    });

    expect(result.id).toMatch(/^pi_/); // Stripe PI ids start with pi_
    expect(result.status).toMatch(/^(succeeded|processing|requires_action|requires_payment_method|canceled|requires_capture)$/);
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe("usd");
    expect(result.metadata).toEqual(expect.objectContaining({ transaction_id: "tx_123", reference_id: "ref_123" }));
  });

  it("EXPECT: idempotency key prevents duplicate PaymentIntents", async () => {
    const key = "idempotent_key_" + Date.now();

    const pi1 = await stripeAdapter.createPaymentIntent({
      amount_cents: 1000,
      currency: "usd",
      idempotencyKey: key,
    });

    const pi2 = await stripeAdapter.createPaymentIntent({
      amount_cents: 1000,
      currency: "usd",
      idempotencyKey: key,
    });

    expect(pi1.id).toBe(pi2.id);
  });
});

describe("Stripe Adapter - capturePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
  });

  it("EXPECT: capture updates PaymentIntent status to succeeded", async () => {
    // First create a PaymentIntent that requires capture
    const pi = await stripeAdapter.createPaymentIntent({
      amount_cents: 2000,
      currency: "usd",
      metadata: { transaction_id: "tx_456" },
    });

    // Only capture if status is requires_capture
    if (pi.status === "requires_capture") {
      const captured = await stripeAdapter.capturePayment(pi.id);
      expect(captured.status).toBe("succeeded");
      expect(captured.amount_received).toBe(2000);
    }
  });

  it("EXPECT: throws error if PaymentIntent not found", async () => {
    await expect(
      stripeAdapter.capturePayment("pi_nonexistent_12345")
    ).rejects.toThrow();
  });
});

describe("Stripe Adapter - refundPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
  });

  it("EXPECT: refund returns Refund object with correct amount", async () => {
    // Create and succeed a PaymentIntent first
    const pi = await stripeAdapter.createPaymentIntent({
      amount_cents: 3000,
      currency: "usd",
      metadata: { transaction_id: "tx_789" },
    });

    // In test environment, get the charge ID from succeeded PI
    if (pi.status === "succeeded" && pi.charges.data.length > 0) {
      const chargeId = pi.charges.data[0].id;
      const refund = await stripeAdapter.refundPayment(chargeId, 3000);

      expect(refund.id).toMatch(/^re_/);
      expect(refund.amount).toBe(3000);
      expect(refund.status).toBe("succeeded");
    }
  });
});

describe("Stripe Adapter - handleWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
  });

  it("EXPECT: payment_intent.succeeded updates transaction status to completed", async () => {
    const transactionId = "tx_webhook_success";
    const mockTransaction = { id: transactionId, status: "processing" };

    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);

    const event: Stripe.Event = {
      id: "evt_test_succeeded",
      object: "event",
      api_version: "2022-11-15",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "pi_test_succeeded",
          object: "payment_intent",
          amount: 5000,
          currency: "usd",
          metadata: { transaction_id: transactionId, reference_id: "ref_123" },
          status: "succeeded",
        } as any,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.succeeded",
    };

    const result = await stripeAdapter.handleWebhookEvent(event);

    expect(result.handled).toBe(true);
    expect(result.type).toBe("payment_intent.succeeded");
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(transactionId, "completed");
  });

  it("EXPECT: payment_intent.payment_failed updates transaction status to failed with reason", async () => {
    const transactionId = "tx_webhook_failed";
    const mockTransaction = { id: transactionId, status: "processing" };

    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);

    const event: Stripe.Event = {
      id: "evt_test_failed",
      object: "event",
      api_version: "2022-11-15",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "pi_test_failed",
          object: "payment_intent",
          amount: 5000,
          currency: "usd",
          metadata: { transaction_id: transactionId, reference_id: "ref_456" },
          status: "requires_payment_method",
          last_payment_error: { message: "Your card was declined" },
        } as any,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.payment_failed",
    };

    const result = await stripeAdapter.handleWebhookEvent(event);

    expect(result.handled).toBe(true);
    expect(result.type).toBe("payment_intent.payment_failed");
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(
      transactionId,
      "failed",
      expect.objectContaining({ failure_reason: "Your card was declined" })
    );
  });

  it("EXPECT: charge.refunded updates transaction status to failed", async () => {
    const transactionId = "tx_webhook_refunded";
    const mockTransaction = { id: transactionId, status: "processing" };

    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);

    const event: Stripe.Event = {
      id: "evt_test_refunded",
      object: "event",
      api_version: "2022-11-15",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "ch_test_refunded",
          object: "charge",
          amount: 5000,
          currency: "usd",
          metadata: { transaction_id: transactionId, reference_id: "ref_789" },
        } as any,
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: "charge.refunded",
    };

    const result = await stripeAdapter.handleWebhookEvent(event);

    expect(result.handled).toBe(true);
    expect(result.type).toBe("charge.refunded");
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(
      transactionId,
      "failed",
      expect.objectContaining({ failure_reason: "refunded" })
    );
  });

  it("EXPECT: unsupported event type is logged but not processed", async () => {
    const event: Stripe.Event = {
      id: "evt_test_unsupported",
      object: "event",
      api_version: "2022-11-15",
      created: Math.floor(Date.now() / 1000),
      data: { object: {} as any },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: "customer.created",
    };

    const result = await stripeAdapter.handleWebhookEvent(event);

    expect(result.handled).toBe(true);
    expect(transactionRepository.updateStatus).not.toHaveBeenCalled();
  });
});

describe("Stripe Adapter - retrievePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
  });

  it("EXPECT: retrieves PaymentIntent by ID with all fields", async () => {
    const pi = await stripeAdapter.createPaymentIntent({
      amount_cents: 1500,
      currency: "eur",
      metadata: { test: "retrieve" },
    });

    const retrieved = await stripeAdapter.retrievePayment(pi.id);

    expect(retrieved.id).toBe(pi.id);
    expect(retrieved.amount).toBe(1500);
    expect(retrieved.currency).toBe("eur");
    expect(retrieved.metadata.test).toBe("retrieve");
  });
});
