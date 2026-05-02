/**
 * Delegation Revocation Repository
 *
 * Stores immutable revocation events for delegation grants.
 */

import { sql } from "../connection";
import {
  ApplicationError,
  CreateDelegationRevocationRequest,
  DelegationRevocation,
  ErrorCode,
} from "../../types";

export const delegationRevocationRepository = {
  async create(
    request: CreateDelegationRevocationRequest
  ): Promise<DelegationRevocation> {
    try {
      const result = await sql`
        INSERT INTO delegation_revocations (
          delegation_grant_id,
          revoked_by_principal_id,
          reason,
          metadata
        ) VALUES (
          ${request.delegation_grant_id},
          ${request.revoked_by_principal_id},
          ${request.reason ?? null},
          ${JSON.stringify(request.metadata || {})}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create delegation revocation",
          500
        );
      }

      return this.rowToDelegationRevocation(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create delegation revocation: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findByGrantId(
    delegationGrantId: string
  ): Promise<DelegationRevocation | null> {
    try {
      const result = await sql`
        SELECT *
        FROM delegation_revocations
        WHERE delegation_grant_id = ${delegationGrantId}
        LIMIT 1
      `;

      return result[0] ? this.rowToDelegationRevocation(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch delegation revocation: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findByRevokedByPrincipal(
    principalId: string
  ): Promise<DelegationRevocation[]> {
    try {
      const results = await sql`
        SELECT *
        FROM delegation_revocations
        WHERE revoked_by_principal_id = ${principalId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToDelegationRevocation(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch revocations by principal: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  rowToDelegationRevocation(row: any): DelegationRevocation {
    return {
      id: row.id,
      delegation_grant_id: row.delegation_grant_id,
      revoked_by_principal_id: row.revoked_by_principal_id,
      reason: row.reason,
      metadata:
        typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      created_at: new Date(row.created_at),
    };
  },
};
