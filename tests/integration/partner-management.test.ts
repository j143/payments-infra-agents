/**
 * Integration Test: Partner Management (Door-Knocker Workflow)
 *
 * Validates the complete partner onboarding and lifecycle management:
 * 1. Partner onboarding (discovery phase)
 * 2. Status transitions through pipeline
 * 3. Health checks and monitoring
 * 4. Activation and suspension
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { setupTestDatabase, clearDatabase } from "../setup";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("Partner Management (Door-Knocker)", () => {
  setupTestDatabase();

  let partnerRepository:
    | typeof import("../../src/db/repositories/partner.repository").partnerRepository
    | null = null;
  let partnerService:
    | typeof import("../../src/services/partner.service").partnerService
    | null = null;

  beforeAll(async () => {
    if (!hasDatabase) {
      return;
    }

    const partnerRepositoryModule = await import(
      "../../src/db/repositories/partner.repository"
    );
    partnerRepository = partnerRepositoryModule.partnerRepository;

    const partnerServiceModule = await import(
      "../../src/services/partner.service"
    );
    partnerService = partnerServiceModule.partnerService;
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe("Partner Onboarding Pipeline", () => {
    it("should onboard a new partner in discovery status", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Singapore Bank Ltd",
        entity_type: "bank",
        api_base_url: "https://api.sgbank.com",
        api_key: "test-key-123",
        primary_contact_name: "Alice Chen",
        primary_contact_email: "alice@sgbank.com",
        primary_contact_phone: "+65-6234-5678",
      });

      expect(partner.name).toBe("Singapore Bank Ltd");
      expect(partner.status).toBe("discovery");
      expect(partner.entity_type).toBe("bank");
      expect(partner.api_version).toBe("v1");
      expect(partner.rate_limit_per_minute).toBe(1000);
      expect(partner.consecutive_failures).toBe(0);
    });

    it("should prevent duplicate partner names", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      const first = await partnerService.onboardPartner({
        name: "Unique Bank",
        entity_type: "bank",
        api_base_url: "https://api.uniquebank.com",
        api_key: "key-1",
      });

      expect(first).toBeDefined();

      try {
        await partnerService.onboardPartner({
          name: "Unique Bank",
          entity_type: "bank",
          api_base_url: "https://api.uniquebank.com",
          api_key: "key-2",
        });
        expect.fail("Should have thrown error for duplicate name");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain("already exists");
      }
    });

    it("should transition partner through onboarding stages", async () => {
      if (!partnerService || !partnerRepository) {
        expect(true).toBe(true);
        return;
      }

      // Create partner
      const partner = await partnerService.onboardPartner({
        name: "Test Bank",
        entity_type: "bank",
        api_base_url: "https://api.testbank.com",
        api_key: "test-key",
      });

      expect(partner.status).toBe("discovery");

      // Transition: discovery → negotiation
      let updated = await partnerService.transitionStatus(partner.id, "negotiation");
      expect(updated.status).toBe("negotiation");

      // Transition: negotiation → onboarding
      updated = await partnerService.transitionStatus(partner.id, "onboarding");
      expect(updated.status).toBe("onboarding");

      // Transition: onboarding → testing
      updated = await partnerService.transitionStatus(partner.id, "testing");
      expect(updated.status).toBe("testing");

      // Transition: testing → live (activate)
      const active = await partnerService.activatePartner(partner.id);
      expect(active.status).toBe("live");
    });

    it("should enforce valid state transitions", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Restricted Bank",
        entity_type: "bank",
        api_base_url: "https://api.restrictedbank.com",
        api_key: "test-key",
      });

      // Cannot jump from discovery to live directly
      try {
        await partnerService.transitionStatus(partner.id, "live");
        expect.fail("Should not allow direct jump to live");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain("Cannot transition");
      }
    });
  });

  describe("Partner Suspension & Resumption", () => {
    it("should suspend a live partner", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      // Create and activate partner
      const partner = await partnerService.onboardPartner({
        name: "Suspendable Bank",
        entity_type: "bank",
        api_base_url: "https://api.suspendable.com",
        api_key: "test-key",
      });

      let updated = await partnerService.transitionStatus(partner.id, "negotiation");
      updated = await partnerService.transitionStatus(updated.id, "onboarding");
      updated = await partnerService.transitionStatus(updated.id, "testing");
      updated = await partnerService.activatePartner(updated.id);

      expect(updated.status).toBe("live");

      // Now suspend
      const suspended = await partnerService.suspendPartner(
        updated.id,
        "API rate limit exceeded"
      );

      expect(suspended.status).toBe("suspended");
      expect(suspended.notes).toContain("Suspended: API rate limit exceeded");
    });

    it("should resume a suspended partner", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      // Create and activate, then suspend
      const partner = await partnerService.onboardPartner({
        name: "Resumable Bank",
        entity_type: "bank",
        api_base_url: "https://api.resumable.com",
        api_key: "test-key",
      });

      let updated = await partnerService.transitionStatus(partner.id, "negotiation");
      updated = await partnerService.transitionStatus(updated.id, "onboarding");
      updated = await partnerService.transitionStatus(updated.id, "testing");
      updated = await partnerService.activatePartner(updated.id);
      updated = await partnerService.suspendPartner(updated.id, "Testing");

      expect(updated.status).toBe("suspended");

      // Resume
      const resumed = await partnerService.resumePartner(updated.id);
      expect(resumed.status).toBe("live");
    });

    it("should not allow suspension of non-live/non-testing partner", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Early Partner",
        entity_type: "bank",
        api_base_url: "https://api.earlypartner.com",
        api_key: "test-key",
      });

      try {
        await partnerService.suspendPartner(partner.id);
        expect.fail("Should not allow suspension in discovery status");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain("Cannot suspend");
      }
    });
  });

  describe("Partner Activity Tracking", () => {
    it("should update health check status", async () => {
      if (!partnerService || !partnerRepository) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Tracked Bank",
        entity_type: "bank",
        api_base_url: "https://api.trackedbank.com",
        api_key: "test-key",
      });

      // Simulate health check failure
      const afterFailure = await partnerRepository.updateHealthCheck(
        partner.id,
        false
      );

      expect(afterFailure.consecutive_failures).toBe(1);
      expect(afterFailure.last_health_check_at).toBeDefined();

      // Simulate health check success
      const afterSuccess = await partnerRepository.updateHealthCheck(
        partner.id,
        true,
        new Date()
      );

      expect(afterSuccess.consecutive_failures).toBe(0);
      expect(afterSuccess.last_successful_transaction_at).toBeDefined();
    });

    it("should track multiple consecutive failures", async () => {
      if (!partnerService || !partnerRepository) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Failing Bank",
        entity_type: "bank",
        api_base_url: "https://api.failingbank.com",
        api_key: "test-key",
      });

      let updated = partner;
      for (let i = 0; i < 3; i++) {
        updated = await partnerRepository.updateHealthCheck(updated.id, false);
      }

      expect(updated.consecutive_failures).toBe(3);

      // Success resets counter
      updated = await partnerRepository.updateHealthCheck(updated.id, true);
      expect(updated.consecutive_failures).toBe(0);
    });
  });

  describe("Partner Discovery Utilities", () => {
    it("should get all partners by status", async () => {
      if (!partnerService || !partnerRepository) {
        expect(true).toBe(true);
        return;
      }

      // Create multiple partners in different statuses
      const p1 = await partnerService.onboardPartner({
        name: "Discovery Partner",
        entity_type: "bank",
        api_base_url: "https://api1.com",
        api_key: "key1",
      });

      const p2 = await partnerService.onboardPartner({
        name: "Live Partner",
        entity_type: "bank",
        api_base_url: "https://api2.com",
        api_key: "key2",
      });

      // Transition p2 to live
      let p2Updated = await partnerService.transitionStatus(p2.id, "negotiation");
      p2Updated = await partnerService.transitionStatus(p2Updated.id, "onboarding");
      p2Updated = await partnerService.transitionStatus(p2Updated.id, "testing");
      await partnerService.activatePartner(p2Updated.id);

      // Get active partners
      const active = await partnerService.getActivePartners();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("Live Partner");

      // Get discovery partners
      const discovery = await partnerRepository.findByStatus("discovery");
      expect(discovery).toHaveLength(1);
      expect(discovery[0].name).toBe("Discovery Partner");
    });

    it("should identify partners needing attention", async () => {
      if (!partnerService || !partnerRepository) {
        expect(true).toBe(true);
        return;
      }

      // Create a partner and mark it for attention
      const partner = await partnerService.onboardPartner({
        name: "Problem Partner",
        entity_type: "bank",
        api_base_url: "https://api.problempartner.com",
        api_key: "test-key",
      });

      // Make it live first
      let p = await partnerService.transitionStatus(partner.id, "negotiation");
      p = await partnerService.transitionStatus(p.id, "onboarding");
      p = await partnerService.transitionStatus(p.id, "testing");
      p = await partnerService.activatePartner(p.id);

      // Add multiple failures to trigger attention flag
      for (let i = 0; i < 3; i++) {
        p = await partnerRepository.updateHealthCheck(p.id, false);
      }

      const needingAttention = await partnerService.getAttentionRequired();
      expect(needingAttention.length).toBeGreaterThan(0);
      expect(needingAttention.some((x) => x.id === p.id)).toBe(true);
    });
  });

  describe("Partner Contact Management", () => {
    it("should update partner contact information", async () => {
      if (!partnerService) {
        expect(true).toBe(true);
        return;
      }

      const partner = await partnerService.onboardPartner({
        name: "Contact Partner",
        entity_type: "bank",
        api_base_url: "https://api.contactpartner.com",
        api_key: "test-key",
        primary_contact_name: "John Doe",
        primary_contact_email: "john@oldmail.com",
      });

      const updated = await partnerService.updateContact(partner.id, {
        name: "Jane Smith",
        email: "jane@newmail.com",
        phone: "+65-9876-5432",
      });

      expect(updated.primary_contact_name).toBe("Jane Smith");
      expect(updated.primary_contact_email).toBe("jane@newmail.com");
      expect(updated.primary_contact_phone).toBe("+65-9876-5432");
    });
  });
});
