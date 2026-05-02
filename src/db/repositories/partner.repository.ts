/**
 * Partner Repository
 *
 * Manages partner integrations, API credentials, and health tracking.
 */

import { sql } from "../connection";
import {
  ApplicationError,
  CreatePartnerRequest,
  ErrorCode,
  Partner,
  UpdatePartnerRequest,
  PartnerStatus,
} from "../../types";

export const partnerRepository = {
  async create(request: CreatePartnerRequest): Promise<Partner> {
    try {
      const result = await sql`
        INSERT INTO partners (
          name,
          entity_type,
          status,
          api_base_url,
          api_key,
          api_secret,
          api_version,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          rate_limit_per_minute,
          webhook_signing_key,
          status_page_url,
          notes,
          internal_owner_user_id
        ) VALUES (
          ${request.name},
          ${request.entity_type},
          ${request.status || "discovery"},
          ${request.api_base_url},
          ${request.api_key},
          ${request.api_secret || null},
          ${request.api_version || "v1"},
          ${request.primary_contact_name || null},
          ${request.primary_contact_email || null},
          ${request.primary_contact_phone || null},
          ${request.rate_limit_per_minute || 1000},
          ${request.webhook_signing_key || null},
          ${request.status_page_url || null},
          ${request.notes || null},
          ${request.internal_owner_user_id || null}
        )
        RETURNING *
      `;

      return this.rowToPartner(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create partner: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findById(partnerId: string): Promise<Partner | null> {
    try {
      const result = await sql`
        SELECT * FROM partners WHERE id = ${partnerId} LIMIT 1
      `;
      return result[0] ? this.rowToPartner(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch partner: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findByName(name: string): Promise<Partner | null> {
    try {
      const result = await sql`
        SELECT * FROM partners WHERE name = ${name} LIMIT 1
      `;
      return result[0] ? this.rowToPartner(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch partner by name: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findAll(): Promise<Partner[]> {
    try {
      const results = await sql`
        SELECT * FROM partners
        ORDER BY name ASC
      `;
      return results.map((row) => this.rowToPartner(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch partners: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findByStatus(status: PartnerStatus): Promise<Partner[]> {
    try {
      const results = await sql`
        SELECT * FROM partners
        WHERE status = ${status}
        ORDER BY name ASC
      `;
      return results.map((row) => this.rowToPartner(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch partners by status: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async update(partnerId: string, request: UpdatePartnerRequest): Promise<Partner> {
    try {
      const result = await sql`
        UPDATE partners
        SET
          name = CASE WHEN ${request.name !== undefined} THEN ${request.name ?? null} ELSE name END,
          status = CASE WHEN ${request.status !== undefined} THEN ${request.status ?? null} ELSE status END,
          api_base_url = CASE WHEN ${request.api_base_url !== undefined} THEN ${request.api_base_url ?? null} ELSE api_base_url END,
          api_key = CASE WHEN ${request.api_key !== undefined} THEN ${request.api_key ?? null} ELSE api_key END,
          api_secret = CASE WHEN ${request.api_secret !== undefined} THEN ${request.api_secret ?? null} ELSE api_secret END,
          api_version = CASE WHEN ${request.api_version !== undefined} THEN ${request.api_version ?? null} ELSE api_version END,
          primary_contact_name = CASE WHEN ${request.primary_contact_name !== undefined} THEN ${request.primary_contact_name ?? null} ELSE primary_contact_name END,
          primary_contact_email = CASE WHEN ${request.primary_contact_email !== undefined} THEN ${request.primary_contact_email ?? null} ELSE primary_contact_email END,
          primary_contact_phone = CASE WHEN ${request.primary_contact_phone !== undefined} THEN ${request.primary_contact_phone ?? null} ELSE primary_contact_phone END,
          rate_limit_per_minute = CASE WHEN ${request.rate_limit_per_minute !== undefined} THEN ${request.rate_limit_per_minute ?? null} ELSE rate_limit_per_minute END,
          webhook_signing_key = CASE WHEN ${request.webhook_signing_key !== undefined} THEN ${request.webhook_signing_key ?? null} ELSE webhook_signing_key END,
          status_page_url = CASE WHEN ${request.status_page_url !== undefined} THEN ${request.status_page_url ?? null} ELSE status_page_url END,
          notes = CASE WHEN ${request.notes !== undefined} THEN ${request.notes ?? null} ELSE notes END,
          internal_owner_user_id = CASE WHEN ${request.internal_owner_user_id !== undefined} THEN ${request.internal_owner_user_id ?? null} ELSE internal_owner_user_id END,
          updated_at = NOW()
        WHERE id = ${partnerId}
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.PARTNER_NOT_FOUND,
          `Partner ${partnerId} not found`,
          404
        );
      }

      return this.rowToPartner(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to update partner: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async updateHealthCheck(
    partnerId: string,
    success: boolean,
    lastSuccessfulTime?: Date
  ): Promise<Partner> {
    try {
      const result = await sql`
        UPDATE partners
        SET
          last_health_check_at = NOW(),
          last_successful_transaction_at = CASE WHEN ${lastSuccessfulTime !== undefined} THEN ${lastSuccessfulTime ?? null} ELSE last_successful_transaction_at END,
          consecutive_failures = CASE WHEN ${success} THEN 0 ELSE consecutive_failures + 1 END,
          updated_at = NOW()
        WHERE id = ${partnerId}
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.PARTNER_NOT_FOUND,
          `Partner ${partnerId} not found`,
          404
        );
      }

      return this.rowToPartner(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to update partner health: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async delete(partnerId: string): Promise<void> {
    try {
      await sql`DELETE FROM partners WHERE id = ${partnerId}`;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to delete partner: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  rowToPartner(row: any): Partner {
    return {
      id: row.id,
      name: row.name,
      entity_type: row.entity_type,
      status: row.status,
      api_base_url: row.api_base_url,
      api_key: row.api_key,
      api_secret: row.api_secret,
      api_version: row.api_version,
      primary_contact_name: row.primary_contact_name,
      primary_contact_email: row.primary_contact_email,
      primary_contact_phone: row.primary_contact_phone,
      rate_limit_per_minute:
        typeof row.rate_limit_per_minute === "string"
          ? Number(row.rate_limit_per_minute)
          : row.rate_limit_per_minute,
      webhook_signing_key: row.webhook_signing_key,
      last_health_check_at: row.last_health_check_at
        ? new Date(row.last_health_check_at)
        : null,
      last_successful_transaction_at: row.last_successful_transaction_at
        ? new Date(row.last_successful_transaction_at)
        : null,
      consecutive_failures:
        typeof row.consecutive_failures === "string"
          ? Number(row.consecutive_failures)
          : row.consecutive_failures,
      status_page_url: row.status_page_url,
      notes: row.notes,
      internal_owner_user_id: row.internal_owner_user_id,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
