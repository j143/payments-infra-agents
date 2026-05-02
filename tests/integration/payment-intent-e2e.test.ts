/**
 * End-to-End Integration Test: Payment Intent Lifecycle
 *
 * Validates the complete flow from agent payment intent submission through settlement:
 * 1. Allow scenario: valid delegation grant → policy allows → transaction queued
 * 2. Deny scenario: invalid delegation/policy → payment intent denied early
 * 3. Replay scenario: idempotent key → same result without re-policies
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
        id: "00000000-0000-0000-0000-000000e2e001",
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

describe("Payment Intent E2E: Allow, Deny, Replay", () => {
  let server: ReturnType<typeof import("node:http").createServer> | null = null;
  let baseUrl = "";

  beforeAll(async () => {
    const mockTransaction = {
      id: "00000000-0000-0000-0000-000000e2e100",
      reference_id: "E2E-ORDER-001",
      account_id: "00000000-0000-0000-0000-000000000001",
      merchant_id: "00000000-0000-0000-0000-000000000002",
      amount_cents: 2500,
      currency: "SGD",
      status: "queued",
      requires_approval: false,
      approved_by_user_id: null,
      approval_timestamp: null,
      rejection_reason: null,
      failure_reason: null,
      created_at: new Date("2026-05-02T10:00:00Z"),
      updated_at: new Date("2026-05-02T10:00:00Z"),
    };

    createTransactionMock.mockResolvedValue(mockTransaction);
    policyDecisionMock.mockResolvedValue({
      allowed: true,
      reason_code: "delegation_grant_allowed",
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });
    paymentIntentState.store.clear();

    const appModule = await import("../../src/api/app");
    const app = appModule.default;

    server = app.listen(0);

    await new Promise<void>((resolve) => {
      const address = server?.address();
      if (address && typeof address === "object") {
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      } else {
        server?.once("listening", async () => {
          const listeningAddress = server?.address();
          if (listeningAddress && typeof listeningAddress === "object") {
            baseUrl = `http://127.0.0.1:${listeningAddress.port}`;
          }
          resolve();
        });
      }
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      if (!server) resolve();
    });
  });

  beforeEach(() => {
    createTransactionMock.mockClear();
    policyDecisionMock.mockClear();
    paymentIntentState.store.clear();
  });

  it("ALLOW: accepts a valid payment intent with matching delegation grant", async () => {
    policyDecisionMock.mockResolvedValueOnce({
      allowed: true,
      reason_code: "delegation_grant_allowed",
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    const response = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "e2e-allow-001",
        correlation_id: "e2e-allow-corr-001",
        principal: {
          principal_id: "agent-e2e-allow",
          principal_type: "app_agent",
        },
        delegation_grant_id: "00000000-0000-0000-0000-000000000123",
        reference_id: "E2E-ALLOW-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
      }),
    });

    expect(response.status).toBe(202);

    const payload = (await response.json()) as {
      success: boolean;
      data: {
        payment_intent: { status: string; delegation_grant_id: string };
        transaction: { status: string };
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.payment_intent.status).toBe("queued");
    expect(payload.data.transaction.status).toBe("queued");
    expect(createTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("DENY: rejects a payment intent that fails delegation policy", async () => {
    policyDecisionMock.mockResolvedValueOnce({
      allowed: false,
      reason_code: "delegation_grant_required",
      delegation_grant_id: null,
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    const response = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "e2e-deny-001",
        correlation_id: "e2e-deny-corr-001",
        principal: {
          principal_id: "agent-e2e-deny",
          principal_type: "app_agent",
        },
        reference_id: "E2E-DENY-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
      }),
    });

    expect(response.status).toBe(403);

    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string };
    };

    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("DELEGATION_POLICY_DENIED");
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("REPLAY: returns same result without re-evaluating policy for identical requests", async () => {
    policyDecisionMock.mockResolvedValueOnce({
      allowed: true,
      reason_code: "delegation_grant_allowed",
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    const payload = {
      idempotency_key: "e2e-replay-001",
      correlation_id: "e2e-replay-corr-001",
      principal: {
        principal_id: "agent-e2e-replay",
        principal_type: "app_agent",
      },
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      reference_id: "E2E-REPLAY-001",
      account_id: "00000000-0000-0000-0000-000000000001",
      merchant_id: "00000000-0000-0000-0000-000000000002",
      amount_cents: 2500,
      currency: "SGD",
    };

    // First request
    const firstResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(firstResponse.status).toBe(202);
    expect(policyDecisionMock).toHaveBeenCalledTimes(1);
    expect(createTransactionMock).toHaveBeenCalledTimes(1);

    // Replay: same request
    const replayResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(replayResponse.status).toBe(202);

    // Policy should NOT be re-evaluated; transaction should NOT be created again
    expect(policyDecisionMock).toHaveBeenCalledTimes(1);
    expect(createTransactionMock).toHaveBeenCalledTimes(1);

    const replayPayload = (await replayResponse.json()) as {
      data: { payment_intent: { idempotency_key: string } };
    };

    expect(replayPayload.data.payment_intent.idempotency_key).toBe(payload.idempotency_key);
  });
});
