import { describe, expect, it } from "vitest";
import {
  buildPaymentIntent,
  mapPaymentIntentToTransactionRequest,
  validateCreatePaymentIntentRequest,
} from "../../src/services/agentic-payment.service";

describe("agentic-payment.service", () => {
  const request = validateCreatePaymentIntentRequest({
    idempotency_key: "idem-001",
    correlation_id: "corr-001",
    principal: {
      principal_id: "agent-1",
      principal_type: "app_agent",
      organization_id: "merchant-xyz",
    },
    delegation_grant_id: "00000000-0000-0000-0000-000000000123",
    reference_id: "ORDER-001",
    account_id: "00000000-0000-0000-0000-000000000001",
    merchant_id: "00000000-0000-0000-0000-000000000002",
    amount_cents: 1200,
    currency: "SGD",
    category: "saas",
    metadata: { channel: "chat" },
  });

  it("maps a payment intent request to a transaction request", () => {
    const transactionRequest = mapPaymentIntentToTransactionRequest(request);

    expect(transactionRequest).toEqual({
      reference_id: "ORDER-001",
      account_id: "00000000-0000-0000-0000-000000000001",
      merchant_id: "00000000-0000-0000-0000-000000000002",
      amount_cents: 1200,
      currency: "SGD",
    });
  });

  it("builds a canonical payment intent envelope", () => {
    const now = new Date("2026-05-02T10:00:00Z");
    const paymentIntent = buildPaymentIntent(request, {
      id: "00000000-0000-0000-0000-000000000999",
      now,
    });

    expect(paymentIntent).toMatchObject({
      id: "00000000-0000-0000-0000-000000000999",
      idempotency_key: "idem-001",
      correlation_id: "corr-001",
      principal: {
        principal_id: "agent-1",
        principal_type: "app_agent",
      },
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      status: "received",
      denial_reason_code: null,
      created_at: now,
      updated_at: now,
    });
  });

  it("rejects invalid payment intent payloads", () => {
    expect(() =>
      validateCreatePaymentIntentRequest({
        correlation_id: "corr-001",
        principal: {
          principal_id: "agent-1",
          principal_type: "app_agent",
        },
        reference_id: "ORDER-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 1200,
        currency: "SGD",
      })
    ).toThrowError(/Zod validation failed/);
  });
});
