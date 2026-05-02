import { describe, expect, it } from "vitest";
import {
  AgentPrincipalSchema,
  CreateDelegationGrantRequestSchema,
  CreatePaymentIntentRequestSchema,
  PolicyDecisionSchema,
} from "../../src/types";

describe("agentic domain types", () => {
  it("validates a canonical agent principal", () => {
    const parsed = AgentPrincipalSchema.parse({
      principal_id: "agent-123",
      principal_type: "app_agent",
      metadata: { tenant: "merchant-abc" },
    });

    expect(parsed.principal_id).toBe("agent-123");
    expect(parsed.principal_type).toBe("app_agent");
  });

  it("validates delegation grant request", () => {
    const parsed = CreateDelegationGrantRequestSchema.parse({
      grantor_principal_id: "user-1",
      grantee_principal_id: "agent-1",
      max_amount_cents: 50000,
      currency: "SGD",
      allowed_merchant_ids: ["00000000-0000-0000-0000-000000000001"],
      valid_from: new Date("2026-05-01T00:00:00Z"),
      valid_until: new Date("2026-06-01T00:00:00Z"),
    });

    expect(parsed.max_amount_cents).toBe(50000);
    expect(parsed.currency).toBe("SGD");
  });

  it("validates create payment intent request", () => {
    const parsed = CreatePaymentIntentRequestSchema.parse({
      idempotency_key: "idem-1",
      correlation_id: "corr-1",
      principal: {
        principal_id: "agent-xyz",
        principal_type: "merchant_agent",
      },
      reference_id: "ORDER-AMP-001",
      account_id: "00000000-0000-0000-0000-000000000002",
      merchant_id: "00000000-0000-0000-0000-000000000003",
      amount_cents: 199,
      currency: "SGD",
    });

    expect(parsed.idempotency_key).toBe("idem-1");
    expect(parsed.principal.principal_type).toBe("merchant_agent");
  });

  it("rejects invalid payment intent with missing idempotency key", () => {
    const result = CreatePaymentIntentRequestSchema.safeParse({
      idempotency_key: "",
      correlation_id: "corr-1",
      principal: {
        principal_id: "agent-xyz",
        principal_type: "service_agent",
      },
      reference_id: "ORDER-AMP-002",
      account_id: "00000000-0000-0000-0000-000000000002",
      merchant_id: "00000000-0000-0000-0000-000000000003",
      amount_cents: 100,
      currency: "SGD",
    });

    expect(result.success).toBe(false);
  });

  it("validates policy decision payload", () => {
    const parsed = PolicyDecisionSchema.parse({
      allowed: false,
      reason_code: "DELEGATION_MISSING",
      delegation_grant_id: null,
      evaluated_at: new Date(),
      evidence: { check: "deny-by-default" },
    });

    expect(parsed.allowed).toBe(false);
    expect(parsed.reason_code).toBe("DELEGATION_MISSING");
  });
});
