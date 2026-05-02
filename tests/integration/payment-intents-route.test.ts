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
    getTransaction: vi.fn(async (transactionId: string) => ({
      id: transactionId,
      reference_id: "ORDER-HTTP-001",
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
    })),
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

describe("payment-intents route", () => {
  let server: ReturnType<typeof import("node:http").createServer> | null = null;
  let baseUrl = "";

  beforeAll(async () => {
    const mockTransaction = {
      id: "00000000-0000-0000-0000-000000000777",
      reference_id: "ORDER-HTTP-001",
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
        server?.once("listening", () => {
          const listeningAddress = server?.address();
          if (listeningAddress && typeof listeningAddress === "object") {
            baseUrl = `http://127.0.0.1:${listeningAddress.port}`;
          }
          resolve();
        });
      }
    });
  });

  beforeEach(() => {
    createTransactionMock.mockClear();
    policyDecisionMock.mockClear();
    paymentIntentState.store.clear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      if (!server) {
        resolve();
      }
    });
  });

  it("creates a payment intent and normalizes the request", async () => {
    const response = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "idem-http-1",
        correlation_id: "corr-http-1",
        principal: {
          principal_id: "agent-http-1",
          principal_type: "app_agent",
        },
        delegation_grant_id: "00000000-0000-0000-0000-000000000123",
        reference_id: "ORDER-HTTP-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
        metadata: { source: "test" },
      }),
    });

    expect(response.status).toBe(202);

    const payload = (await response.json()) as {
      success: boolean;
      data: {
        payment_intent: {
          idempotency_key: string;
          correlation_id: string;
          status: string;
        };
        transaction: { reference_id: string; status: string };
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.payment_intent.idempotency_key).toBe("idem-http-1");
    expect(payload.data.payment_intent.correlation_id).toBe("corr-http-1");
    expect(payload.data.payment_intent.status).toBe("queued");
    expect(payload.data.transaction.reference_id).toBe("ORDER-HTTP-001");
    expect(payload.data.transaction.status).toBe("queued");
    expect(createTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("replays an identical idempotent request without creating a second transaction", async () => {
    const payload = {
      idempotency_key: "idem-http-2",
      correlation_id: "corr-http-2",
      principal: {
        principal_id: "agent-http-2",
        principal_type: "app_agent",
      },
      delegation_grant_id: "00000000-0000-0000-0000-000000000123",
      reference_id: "ORDER-HTTP-002",
      account_id: "00000000-0000-0000-0000-000000000001",
      merchant_id: "00000000-0000-0000-0000-000000000002",
      amount_cents: 2500,
      currency: "SGD",
      metadata: { source: "test" },
    };

    const firstResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(firstResponse.status).toBe(202);

    const secondResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(secondResponse.status).toBe(202);

    const secondBody = (await secondResponse.json()) as {
      data: { transaction: { id: string }; payment_intent: { status: string } };
    };

    expect(secondBody.data.payment_intent.status).toBe("queued");
    expect(createTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a different payload using the same idempotency key", async () => {
    const firstResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "idem-http-3",
        correlation_id: "corr-http-3",
        principal: {
          principal_id: "agent-http-3",
          principal_type: "app_agent",
        },
        delegation_grant_id: "00000000-0000-0000-0000-000000000123",
        reference_id: "ORDER-HTTP-003",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
        metadata: { source: "test" },
      }),
    });

    expect(firstResponse.status).toBe(202);

    const conflictResponse = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "idem-http-3",
        correlation_id: "corr-http-3",
        principal: {
          principal_id: "agent-http-3",
          principal_type: "app_agent",
        },
        delegation_grant_id: "00000000-0000-0000-0000-000000000123",
        reference_id: "ORDER-HTTP-999",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 9999,
        currency: "SGD",
        metadata: { source: "test" },
      }),
    });

    expect(conflictResponse.status).toBe(409);

    const conflictPayload = (await conflictResponse.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(conflictPayload.success).toBe(false);
    expect(conflictPayload.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("denies payment intents that fail delegation policy", async () => {
    policyDecisionMock.mockResolvedValueOnce({
      allowed: false,
      reason_code: "delegation_grant_required",
      delegation_grant_id: null,
      evaluated_at: new Date("2026-05-02T10:00:00Z"),
      evidence: {},
    });

    const response = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "idem-http-4",
        correlation_id: "corr-http-4",
        principal: {
          principal_id: "agent-http-4",
          principal_type: "app_agent",
        },
        reference_id: "ORDER-HTTP-004",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
        metadata: { source: "test" },
      }),
    });

    expect(response.status).toBe(403);

    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; details?: { policy_decision?: { reason_code: string } } };
    };

    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("DELEGATION_POLICY_DENIED");
    expect(payload.error.details?.policy_decision?.reason_code).toBe(
      "delegation_grant_required"
    );
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid payment intent payloads", async () => {
    const response = await fetch(`${baseUrl}/api/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        correlation_id: "corr-http-2",
        principal: {
          principal_id: "agent-http-2",
          principal_type: "app_agent",
        },
        reference_id: "ORDER-HTTP-002",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 2500,
        currency: "SGD",
      }),
    });

    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
  });
});
