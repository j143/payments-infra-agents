/**
 * Partner Service
 *
 * Business logic for managing partner integrations, onboarding, and health monitoring.
 */

import { ApplicationError, ErrorCode, Partner, PartnerStatus, UpdatePartnerRequest } from "../types";
import { partnerRepository } from "../db/repositories/partner.repository";

export const partnerService = {
  /**
   * Onboard a new partner
   * Starts in "discovery" status and requires status transitions through negotiation → onboarding → testing → live
   */
  async onboardPartner(request: {
    name: string;
    entity_type: "bank" | "payment_network" | "clearing" | "settlement";
    api_base_url: string;
    api_key: string;
    api_secret?: string;
    primary_contact_name?: string;
    primary_contact_email?: string;
    primary_contact_phone?: string;
    internal_owner_user_id?: string;
  }): Promise<Partner> {
    // Check if partner already exists
    const existing = await partnerRepository.findByName(request.name);
    if (existing) {
      throw new ApplicationError(
        ErrorCode.PARTNER_ALREADY_EXISTS,
        `Partner ${request.name} already exists`,
        409,
        { partner_id: existing.id }
      );
    }

    return partnerRepository.create({
      ...request,
      status: "discovery",
      api_version: "v1",
      rate_limit_per_minute: 1000,
    });
  },

  /**
   * Transition partner status through the onboarding pipeline
   * discovery → negotiation → onboarding → testing → live
   */
  async transitionStatus(
    partnerId: string,
    newStatus: PartnerStatus
  ): Promise<Partner> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      throw new ApplicationError(
        ErrorCode.PARTNER_NOT_FOUND,
        `Partner ${partnerId} not found`,
        404
      );
    }

    // Validate state transitions
    const validTransitions: Record<PartnerStatus, PartnerStatus[]> = {
      discovery: ["negotiation", "offboarded"],
      negotiation: ["onboarding", "discovery"],
      onboarding: ["testing", "negotiation"],
      testing: ["live", "onboarding", "suspended"],
      live: ["suspended", "offboarded"],
      suspended: ["live", "offboarded"],
      offboarded: [], // Final state
    };

    const allowed = validTransitions[partner.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Cannot transition from ${partner.status} to ${newStatus}`,
        400,
        { current_status: partner.status, requested_status: newStatus }
      );
    }

    return partnerRepository.update(partnerId, { status: newStatus });
  },

  /**
   * Activate a partner for live use
   * Can only move from testing → live
   */
  async activatePartner(partnerId: string): Promise<Partner> {
    return this.transitionStatus(partnerId, "live");
  },

  /**
   * Suspend a partner temporarily
   * Can suspend from live or testing status
   */
  async suspendPartner(partnerId: string, reason?: string): Promise<Partner> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      throw new ApplicationError(
        ErrorCode.PARTNER_NOT_FOUND,
        `Partner ${partnerId} not found`,
        404
      );
    }

    if (!["live", "testing"].includes(partner.status)) {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Cannot suspend partner in ${partner.status} status`,
        400
      );
    }

    const notes = reason
      ? `${partner.notes ? `${partner.notes}\n` : ""}Suspended: ${reason}`
      : partner.notes;

    return partnerRepository.update(partnerId, {
      status: "suspended",
      notes,
    });
  },

  /**
   * Resume a suspended partner
   */
  async resumePartner(partnerId: string): Promise<Partner> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      throw new ApplicationError(
        ErrorCode.PARTNER_NOT_FOUND,
        `Partner ${partnerId} not found`,
        404
      );
    }

    if (partner.status !== "suspended") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Partner is not suspended (current status: ${partner.status})`,
        400
      );
    }

    return partnerRepository.update(partnerId, { status: "live" });
  },

  /**
   * Perform health check on partner API
   * Returns updated partner with health metrics
   */
  async performHealthCheck(partnerId: string): Promise<{
    partner: Partner;
    healthy: boolean;
    error?: string;
  }> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      throw new ApplicationError(
        ErrorCode.PARTNER_NOT_FOUND,
        `Partner ${partnerId} not found`,
        404
      );
    }

    if (partner.status !== "live") {
      return {
        partner,
        healthy: false,
        error: `Partner not in live status (current: ${partner.status})`,
      };
    }

    try {
      // Perform actual health check (simple GET request)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${partner.api_base_url}/health`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${partner.api_key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const success = response.ok;
      const updatedPartner = await partnerRepository.updateHealthCheck(
        partnerId,
        success,
        success ? new Date() : undefined
      );

      return {
        partner: updatedPartner,
        healthy: success,
        error: success ? undefined : `Health check returned ${response.status}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "unknown error";
      const updatedPartner = await partnerRepository.updateHealthCheck(
        partnerId,
        false
      );

      return {
        partner: updatedPartner,
        healthy: false,
        error: `Failed to reach partner: ${errorMessage}`,
      };
    }
  },

  /**
   * Check if partner is healthy and active
   * Returns true if live status and no recent consecutive failures
   */
  async isActive(partnerId: string): Promise<boolean> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      return false;
    }

    return partner.status === "live" && partner.consecutive_failures < 3;
  },

  /**
   * Get all active partners (live status)
   */
  async getActivePartners(): Promise<Partner[]> {
    return partnerRepository.findByStatus("live");
  },

  /**
   * Get all partners in a specific stage of onboarding
   */
  async getPartnersInStage(stage: PartnerStatus): Promise<Partner[]> {
    return partnerRepository.findByStatus(stage);
  },

  /**
   * Get partner details (excluding sensitive credentials)
   */
  async getPartnerPublic(partnerId: string): Promise<Partial<Partner> | null> {
    const partner = await partnerRepository.findById(partnerId);
    if (!partner) {
      return null;
    }

    // Exclude sensitive fields
    const { api_key, api_secret, webhook_signing_key, ...publicPartner } = partner;
    return publicPartner;
  },

  /**
   * Update partner contact information
   */
  async updateContact(
    partnerId: string,
    contact: {
      name?: string;
      email?: string;
      phone?: string;
    }
  ): Promise<Partner> {
    return partnerRepository.update(partnerId, {
      primary_contact_name: contact.name,
      primary_contact_email: contact.email,
      primary_contact_phone: contact.phone,
    });
  },

  /**
   * Get partners needing immediate attention
   * (many consecutive failures, health checks needed, etc.)
   */
  async getAttentionRequired(): Promise<Partner[]> {
    const allPartners = await partnerRepository.findAll();
    return allPartners.filter((p) => {
      // Partner needs attention if:
      // 1. Suspended
      if (p.status === "suspended") return true;
      // 2. Many consecutive failures
      if (p.consecutive_failures >= 3) return true;
      // 3. Last health check very old (more than 1 day)
      if (p.last_health_check_at) {
        const hoursSinceCheck =
          (Date.now() - p.last_health_check_at.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCheck > 24) return true;
      }

      return false;
    });
  },
};
