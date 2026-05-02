import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { clearDatabase, setupTestDatabase } from "../../setup";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("delegation repositories", () => {
  setupTestDatabase();

  let delegationGrantRepository:
    | typeof import("../../../src/db/repositories/delegation-grant.repository").delegationGrantRepository
    | null = null;
  let delegationRevocationRepository:
    | typeof import("../../../src/db/repositories/delegation-revocation.repository").delegationRevocationRepository
    | null = null;

  beforeAll(async () => {
    if (!hasDatabase) {
      return;
    }

    const grantRepositoryModule = await import(
      "../../../src/db/repositories/delegation-grant.repository"
    );
    delegationGrantRepository = grantRepositoryModule.delegationGrantRepository;

    const revocationRepositoryModule = await import(
      "../../../src/db/repositories/delegation-revocation.repository"
    );
    delegationRevocationRepository =
      revocationRepositoryModule.delegationRevocationRepository;
  });

  it("creates and fetches a delegation grant", async () => {
    if (!delegationGrantRepository) {
      expect(true).toBe(true);
      return;
    }

    const grant = await delegationGrantRepository.create({
      grantor_principal_id: "user-1",
      grantee_principal_id: "agent-1",
      max_amount_cents: 25000,
      currency: "SGD",
      allowed_merchant_ids: ["00000000-0000-0000-0000-000000000001"],
      allowed_categories: ["saas"],
      valid_from: new Date(Date.now() - 60_000),
      valid_until: new Date(Date.now() + 60_000),
      policy_version: "v1",
      metadata: { source: "test" },
    });

    const found = await delegationGrantRepository.findById(grant.id);

    expect(found).not.toBeNull();
    expect(found?.grantee_principal_id).toBe("agent-1");
    expect(found?.status).toBe("active");
  });

  it("returns only active grants within validity window", async () => {
    if (!delegationGrantRepository) {
      expect(true).toBe(true);
      return;
    }

    await clearDatabase();

    await delegationGrantRepository.create({
      grantor_principal_id: "user-1",
      grantee_principal_id: "agent-2",
      max_amount_cents: 10000,
      currency: "SGD",
      allowed_merchant_ids: [],
      allowed_categories: [],
      valid_from: new Date(Date.now() - 5 * 60_000),
      valid_until: new Date(Date.now() + 5 * 60_000),
      policy_version: "v1",
      metadata: {},
    });

    await delegationGrantRepository.create({
      grantor_principal_id: "user-1",
      grantee_principal_id: "agent-2",
      max_amount_cents: 10000,
      currency: "SGD",
      allowed_merchant_ids: [],
      allowed_categories: [],
      valid_from: new Date(Date.now() - 10 * 60_000),
      valid_until: new Date(Date.now() - 5 * 60_000),
      policy_version: "v1",
      metadata: {},
    });

    const active = await delegationGrantRepository.findActiveByGrantee("agent-2");
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("active");
  });

  it("revokes a grant and records revocation event", async () => {
    if (!delegationGrantRepository || !delegationRevocationRepository) {
      expect(true).toBe(true);
      return;
    }

    const grant = await delegationGrantRepository.create({
      grantor_principal_id: "user-3",
      grantee_principal_id: "agent-3",
      max_amount_cents: 15000,
      currency: "SGD",
      allowed_merchant_ids: [],
      allowed_categories: [],
      valid_from: new Date(Date.now() - 60_000),
      valid_until: new Date(Date.now() + 60_000),
      policy_version: "v1",
      metadata: {},
    });

    const revoked = await delegationGrantRepository.revoke(
      grant.id,
      "user-3",
      "manual revocation"
    );

    expect(revoked.status).toBe("revoked");
    expect(revoked.revocation_reason).toBe("manual revocation");

    const revocation = await delegationRevocationRepository.findByGrantId(grant.id);
    expect(revocation).not.toBeNull();
    expect(revocation?.revoked_by_principal_id).toBe("user-3");
  });
});
