/**
 * Delegation Grant Repository
 *
 * Manages delegated payment authority between principals.
 */

import { sql } from "../connection";
import {
  ApplicationError,
  CreateDelegationGrantRequest,
  DelegationGrant,
  ErrorCode,
} from "../../types";
import { delegationRevocationRepository } from "./delegation-revocation.repository";

export const delegationGrantRepository = {
  async create(request: CreateDelegationGrantRequest): Promise<DelegationGrant> {
    try {
      const result = await sql`
        INSERT INTO delegation_grants (
          grantor_principal_id,
          grantee_principal_id,
          max_amount_cents,
          currency,
          allowed_merchant_ids,
          allowed_categories,
          valid_from,
          valid_until,
          status,
          policy_version,
          metadata
        ) VALUES (
          ${request.grantor_principal_id},
          ${request.grantee_principal_id},
          ${request.max_amount_cents},
          ${request.currency},
          ${JSON.stringify(request.allowed_merchant_ids || [])},
          ${JSON.stringify(request.allowed_categories || [])},
          ${request.valid_from},
          ${request.valid_until},
          'active',
          ${request.policy_version || "v1"},
          ${JSON.stringify(request.metadata || {})}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create delegation grant",
          500
        );
      }

      return this.rowToDelegationGrant(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create delegation grant: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findById(id: string): Promise<DelegationGrant | null> {
    try {
      const result = await sql`
        SELECT * FROM delegation_grants WHERE id = ${id} LIMIT 1
      `;

      return result[0] ? this.rowToDelegationGrant(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch delegation grant: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findActiveByGrantee(
    granteePrincipalId: string,
    now: Date = new Date()
  ): Promise<DelegationGrant[]> {
    try {
      const results = await sql`
        SELECT *
        FROM delegation_grants
        WHERE grantee_principal_id = ${granteePrincipalId}
          AND status = 'active'
          AND valid_from <= ${now}
          AND valid_until >= ${now}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToDelegationGrant(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch active delegation grants: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async revoke(
    id: string,
    revokedByPrincipalId: string,
    reason?: string
  ): Promise<DelegationGrant> {
    try {
      return await sql.begin(async (tx: any) => {
        const existing = await tx`
          SELECT * FROM delegation_grants WHERE id = ${id} LIMIT 1
        `;

        if (!existing[0]) {
          throw new ApplicationError(
            ErrorCode.INVALID_INPUT,
            `Delegation grant ${id} not found`,
            404
          );
        }

        const updated = await tx`
          UPDATE delegation_grants
          SET
            status = 'revoked',
            revoked_at = NOW(),
            revocation_reason = ${reason ?? null},
            updated_at = NOW()
          WHERE id = ${id}
            AND status <> 'revoked'
          RETURNING *
        `;

        const row = updated[0] ?? existing[0];

        const existingRevocation = await tx`
          SELECT id
          FROM delegation_revocations
          WHERE delegation_grant_id = ${id}
          LIMIT 1
        `;

        if (!existingRevocation[0]) {
          await tx`
            INSERT INTO delegation_revocations (
              delegation_grant_id,
              revoked_by_principal_id,
              reason,
              metadata
            ) VALUES (
              ${id},
              ${revokedByPrincipalId},
              ${reason ?? null},
              '{}'::jsonb
            )
          `;
        }

        return this.rowToDelegationGrant(row);
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to revoke delegation grant: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async markExpired(now: Date = new Date()): Promise<number> {
    try {
      const result = await sql`
        UPDATE delegation_grants
        SET
          status = 'expired',
          updated_at = NOW()
        WHERE status = 'active'
          AND valid_until < ${now}
      `;

      return result.count;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark grants expired: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  rowToDelegationGrant(row: any): DelegationGrant {
    return {
      id: row.id,
      grantor_principal_id: row.grantor_principal_id,
      grantee_principal_id: row.grantee_principal_id,
      max_amount_cents:
        typeof row.max_amount_cents === "string"
          ? Number(row.max_amount_cents)
          : row.max_amount_cents,
      currency: row.currency,
      allowed_merchant_ids:
        typeof row.allowed_merchant_ids === "string"
          ? JSON.parse(row.allowed_merchant_ids)
          : row.allowed_merchant_ids,
      allowed_categories:
        typeof row.allowed_categories === "string"
          ? JSON.parse(row.allowed_categories)
          : row.allowed_categories,
      valid_from: new Date(row.valid_from),
      valid_until: new Date(row.valid_until),
      status: row.status,
      policy_version: row.policy_version,
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
      revocation_reason: row.revocation_reason,
      metadata:
        typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
