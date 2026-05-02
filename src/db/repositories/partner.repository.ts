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
      // Build dynamic update query
      const updates: string[] = [];
      const params: unknown[] = [];

      if (request.name !== undefined) {
        updates.push("name = ?");
        params.push(request.name);
      }
      if (request.status !== undefined) {
        updates.push("status = ?");
        params.push(request.status);
      }
      if (request.api_base_url !== undefined) {
        updates.push("api_base_url = ?");
        params.push(request.api_base_url);
      }
      if (request.api_key !== undefined) {
        updates.push("api_key = ?");
        params.push(request.api_key);
      }
      if (request.api_secret !== undefined) {
        updates.push("api_secret = ?");
        params.push(request.api_secret);
      }
      if (request.api_version !== undefined) {
        updates.push("api_version = ?");
        params.push(request.api_version);
      }
      if (request.primary_contact_name !== undefined) {
        updates.push("primary_contact_name = ?");
        params.push(request.primary_contact_name);
      }
      if (request.primary_contact_email !== undefined) {
        updates.push("primary_contact_email = ?");
        params.push(request.primary_contact_email);
      }
      if (request.primary_contact_phone !== undefined) {
        updates.push("primary_contact_phone = ?");
        params.push(request.primary_contact_phone);
      }
      if (request.rate_limit_per_minute !== undefined) {
        updates.push("rate_limit_per_minute = ?");
        params.push(request.rate_limit_per_minute);
      }
      if (request.webhook_signing_key !== undefined) {
        updates.push("webhook_signing_key = ?");
        params.push(request.webhook_signing_key);
      }
      if (request.status_page_url !== undefined) {
        updates.push("status_page_url = ?");
        params.push(request.status_page_url);
      }
      if (request.notes !== undefined) {
        updates.push("notes = ?");
        params.push(request.notes);
      }
      if (request.internal_owner_user_id !== undefined) {
        updates.push("internal_owner_user_id = ?");
        params.push(request.internal_owner_user_id);
      }

      updates.push("updated_at = NOW()");

      if (updates.length === 1) {
        // Only updated_at was modified, still need to return
        const result = await sql`
          UPDATE partners
          SET updated_at = NOW()
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
      }

      // Use template literal with actual values since postgres npm client handles binding
      const result = await sql`
        UPDATE partners
        SET
          name = ${request.name !== undefined ? request.name : sql`name`},
          status = ${request.status !== undefined ? request.status : sql`status`},
          api_base_url = ${request.api_base_url !== undefined ? request.api_base_url : sql`api_base_url`},
          api_key = ${request.api_key !== undefined ? request.api_key : sql`api_key`},
          api_secret = ${request.api_secret !== undefined ? request.api_secret : sql`api_secret`},
          api_version = ${request.api_version !== undefined ? request.api_version : sql`api_version`},
          primary_contact_name = ${
            request.primary_contact_name !== undefined
              ? request.primary_contact_name
              : sql`primary_contact_name`
          },
          primary_contact_email = ${
            request.primary_contact_email !== undefined
              ? request.primary_contact_email
              : sql`primary_contact_email`
          },
          primary_contact_phone = ${
            request.primary_contact_phone !== undefined
              ? request.primary_contact_phone
              : sql`primary_contact_phone`
          },
          rate_limit_per_minute = ${
            request.rate_limit_per_minute !== undefined
              ? request.rate_limit_per_minute
              : sql`rate_limit_per_minute`
          },
          webhook_signing_key = ${
            request.webhook_signing_key !== undefined
              ? request.webhook_signing_key
              : sql`webhook_signing_key`
          },
          status_page_url = ${
            request.status_page_url !== undefined
              ? request.status_page_url
              : sql`status_page_url`
          },
          notes = ${
            request.notes !== undefined
              ? request.notes
              : sql`notes`
          },
          internal_owner_user_id = ${
            request.internal_owner_user_id !== undefined
              ? request.internal_owner_user_id
              : sql`internal_owner_user_id`
          },
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
          last_successful_transaction_at = ${lastSuccessfulTime || sql`last_successful_transaction_at`},
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
