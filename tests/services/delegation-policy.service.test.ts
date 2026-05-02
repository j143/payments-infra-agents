import { describe, expect, it } from "vitest";
import {
  createDelegationPolicyService,
  evaluateDelegationPolicyAgainstGrant,
} from "../../src/services/delegation-policy.service";
import { validateCreatePaymentIntentRequest } from "../../src/services/agentic-payment.service";

describe("delegation-policy.service", () => {
  const now = new Date("2026-05-02T10:00:00Z");
  const request = validateCreatePaymentIntentRequest({
    idempotency_key: "idem-policy-001",
    correlation_id: "corr-policy-001",
    principal: {
      principal_id: "agent-1",
      principal_type: "app_agent",
    },
    delegation_grant_id: "00000000-0000-0000-0000-000000000123",
    reference_id: "ORDER-POLICY-001",
    account_id: "00000000-0000-0000-0000-000000000001",
    merchant_id: "00000000-0000-0000-0000-000000000002",
    amount_cents: 1200,
    currency: "SGD",
    category: "saas",
    metadata: {},
  });

  const grant = {
    id: "00000000-0000-0000-0000-000000000123",
    grantor_principal_id: "merchant-owner-1",
    grantee_principal_id: "agent-1",
    max_amount_cents: 2000,
    currency: "SGD",
    allowed_merchant_ids: ["00000000-0000-0000-0000-000000000002"],
    allowed_categories: ["saas"],
    valid_from: new Date("2026-05-02T09:00:00Z"),
    valid_until: new Date("2026-05-02T11:00:00Z"),
    status: "active",
    policy_version: "v1",
    revoked_at: null,
    revocation_reason: null,
    metadata: {},
    created_at: new Date("2026-05-02T09:00:00Z"),
    updated_at: new Date("2026-05-02T09:00:00Z"),
  };

  it("allows a request that satisfies the delegation grant", () => {
    const decision = evaluateDelegationPolicyAgainstGrant(request, grant, {
      now,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason_code: "delegation_grant_allowed",
      delegation_grant_id: grant.id,
      evaluated_at: now,
    });
  });

  it("denies a request when the amount exceeds the grant", () => {
    const decision = evaluateDelegationPolicyAgainstGrant(
      {
        ...request,
        amount_cents: 2500,
      },
      grant,
      { now }
    );

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "delegation_amount_exceeded",
      delegation_grant_id: grant.id,
    });
  });

  it("denies a request when the service cannot find the grant", async () => {
    const service = createDelegationPolicyService({
      async findDelegationGrantById() {
        return null;
      },
      async findDelegationRevocationByGrantId() {
        return null;
      },
    });

    const decision = await service.decideDelegationPolicy(request, now);

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "delegation_grant_not_found",
      delegation_grant_id: null,
    });
  });

  it("denies a request when the grant has been revoked", async () => {
    const service = createDelegationPolicyService({
      async findDelegationGrantById() {
        return grant;
      },
      async findDelegationRevocationByGrantId() {
        return {
          id: "00000000-0000-0000-0000-000000000124",
          delegation_grant_id: grant.id,
          revoked_by_principal_id: "merchant-owner-1",
          reason: "manual revoke",
          metadata: {},
          created_at: now,
        };
      },
    });

    const decision = await service.decideDelegationPolicy(request, now);

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "delegation_grant_revoked",
      delegation_grant_id: grant.id,
    });
  });
});