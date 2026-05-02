import { beforeEach, describe, expect, it, vi } from "vitest";

const createTransactionMock = vi.hoisted(() => vi.fn());
const policyDecisionMock = vi.hoisted(() => vi.fn());
const paymentIntentState = vi.hoisted(() => {
  const store = new Map<string, any>();

  return {
    store,
    findByIdempotencyKey: vi.fn(async (idempotencyKey: string) =>
      store.get(idempotencyKey) ?? null
    ),
    createReceivedIntent: vi.fn(async (request: any) => {
      const record = {
        id: "00000000-0000-0000-0000-000000000901",
        idempotency_key: request.idempotency_key,
        correlation_id: request.correlation_id,
        request_fingerprint: request.request_fingerprint,
        payment_intent_payload: request.payment_intent_payload,
        transaction_id: null,
        status: "received",
        failure_reason: null,
        created_at: new Date("2026-05-02T10:00:00Z"),
        updated_at: new Date("2026-05-02T10:00:00Z"),
      };

      store.set(request.idempotency_key, record);
      return record;
    }),
    markProcessing: vi.fn(async (id: string) => {
      for (const [key, record] of store.entries()) {
        if (record.id === id) {
          const updated = { ...record, status: "processing" };
          store.set(key, updated);
          return updated;
        }
      }

      return null;
    }),
    markQueued: vi.fn(async (id: string, transactionId: string) => {
      for (const [key, record] of store.entries()) {
        if (record.id === id) {
          const updated = {
            ...record,
            status: "queued",
            transaction_id: transactionId,
          };
          store.set(key, updated);
          return updated;
        }
      }

      return null;
    }),
    markFailed: vi.fn(async (id: string, failureReason: string) => {
      for (const [key, record] of store.entries()) {
        if (record.id === id) {
          const updated = {
            ...record,
            status: "failed",
            failure_reason: failureReason,
          };
          store.set(key, updated);
          return updated;
        }
      }

      return null;
    }),
  };
});

vi.mock("../../src/services/transaction.service", () => ({
  transactionService: {
    createTransaction: createTransactionMock,
    getTransaction: vi.fn(),
  },
}));

vi.mock("../../src/services/delegation-policy.service", () => ({
  delegationPolicyService: {
    decideDelegationPolicy: policyDecisionMock,
  },
}));

vi.mock("../../src/db/repositories/payment-intent.repository", () => ({
  paymentIntentRepository: paymentIntentState,
}));

import {
  submitAgentPaymentIntent,
  validateCreatePaymentIntentRequest,
} from "../../src/services/agentic-payment.service";

describe("submitAgentPaymentIntent", () => {
  const request = validateCreatePaymentIntentRequest({
    idempotency_key: "idem-submit-1",
    correlation_id: "corr-submit-1",
    principal: {
      principal_id: "agent-submit-1",
      principal_type: "app_agent",
    },
    delegation_grant_id: "00000000-0000-0000-0000-000000000123",
    reference_id: "ORDER-SUBMIT-001",
    account_id: "00000000-0000-0000-0000-000000000001",
    merchant_id: "00000000-0000-0000-0000-000000000002",
    amount_cents: 1200,
    currency: "SGD",
    category: "saas",
    metadata: {},
  });

  beforeEach(() => {
    createTransactionMock.mockReset();
    policyDecisionMock.mockReset();
    paymentIntentState.store.clear();
  });

  it("creates a transaction when delegation policy allows the request", async () => {
    createTransactionMock.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000777",
      reference_id: request.reference_id,
      account_id: request.account_id,
      merchant_id: request.merchant_id,
      amount_cents: request.amount_cents,
      currency: request.currency,
      status: "queued",
      requires_approval: false,
      approved_by_user_id: null,
      approval_timestamp: null,
      rejection_reason: null,
      failure_reason: null,
      created_at: new Date("2026-05-02T10:00:00Z"),
      updated_at: new Date("2026-05-02T10:00:00Z"),
    });
    policyDecisionMock.mockResolvedValue({
      allowed: true,
      reason_code: "delegation_grant_allowed",
      delegation_grant_id: request.delegation_grant_id ?? null,
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    const result = await submitAgentPaymentIntent(request);

    expect(policyDecisionMock).toHaveBeenCalledTimes(1);
    expect(createTransactionMock).toHaveBeenCalledTimes(1);
    expect(result.payment_intent.status).toBe("queued");
    expect(paymentIntentState.markQueued).toHaveBeenCalledTimes(1);
  });

  it("denies the request before queueing when delegation policy rejects it", async () => {
    policyDecisionMock.mockResolvedValue({
      allowed: false,
      reason_code: "delegation_grant_required",
      delegation_grant_id: null,
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    await expect(submitAgentPaymentIntent(request)).rejects.toMatchObject({
      code: "DELEGATION_POLICY_DENIED",
      statusCode: 403,
    });

    expect(createTransactionMock).not.toHaveBeenCalled();
    expect(paymentIntentState.markFailed).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000901",
      "delegation_grant_required"
    );
  });

  it("replays a previously denied request as the same policy error", async () => {
    const existing = {
      id: "00000000-0000-0000-0000-000000000901",
      idempotency_key: request.idempotency_key,
      correlation_id: request.correlation_id,
      request_fingerprint: JSON.stringify({
        idempotency_key: request.idempotency_key,
        correlation_id: request.correlation_id,
        principal: request.principal,
        delegation_grant_id: request.delegation_grant_id ?? null,
        reference_id: request.reference_id,
        account_id: request.account_id,
        merchant_id: request.merchant_id,
        amount_cents: request.amount_cents,
        currency: request.currency,
        category: request.category ?? null,
        metadata: request.metadata ?? {},
      }),
      payment_intent_payload: request,
      transaction_id: null,
      status: "failed",
      failure_reason: "delegation_grant_required",
      created_at: new Date("2026-05-02T10:00:00Z"),
      updated_at: new Date("2026-05-02T10:00:00Z"),
    };

    paymentIntentState.store.set(request.idempotency_key, existing);

    await expect(submitAgentPaymentIntent(request)).rejects.toMatchObject({
      code: "DELEGATION_POLICY_DENIED",
      statusCode: 403,
    });

    expect(createTransactionMock).not.toHaveBeenCalled();
    expect(policyDecisionMock).not.toHaveBeenCalled();
  });
});