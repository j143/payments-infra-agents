/**
 * Shadow Log Repository
 * 
 * Manages the "Black Box" - raw Partner API request/response logs.
 * This is critical for debugging when partners deny receiving payments.
 */

import { sql } from "../connection";
import {
  ShadowLog,
  CreateShadowLogRequest,
  ApplicationError,
  ErrorCode,
} from "../../types";

export const shadowLogRepository = {
  /**
   * Create a new shadow log entry
   * This is called BEFORE processing the partner API response
   */
  async create(request: CreateShadowLogRequest): Promise<ShadowLog> {
    try {
      const result = await sql`
        INSERT INTO shadow_logs (
          transaction_id,
          partner_name,
          endpoint,
          http_method,
          request_payload,
          retry_count
        ) VALUES (
          ${request.transaction_id},
          ${request.partner_name},
          ${request.endpoint},
          ${request.http_method},
          ${JSON.stringify(request.request_payload)},
          0
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create shadow log",
          500
        );
      }

      return this.rowToShadowLog(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create shadow log: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Update shadow log with partner response
   */
  async updateWithResponse(
    id: string,
    response: {
      response_payload: Record<string, unknown>;
      response_status_code: number;
      error_message?: string;
    }
  ): Promise<ShadowLog | null> {
    try {
      const result = await sql`
        UPDATE shadow_logs 
        SET 
          response_payload = ${JSON.stringify(response.response_payload)},
          response_status_code = ${response.response_status_code},
          error_message = ${response.error_message || null}
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToShadowLog(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to update shadow log: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get shadow logs for a transaction
   */
  async findByTransactionId(transactionId: string): Promise<ShadowLog[]> {
    try {
      const results = await sql`
        SELECT * FROM shadow_logs 
        WHERE transaction_id = ${transactionId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToShadowLog(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch shadow logs: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get shadow logs with errors (for debugging)
   */
  async findErrors(limit: number = 100): Promise<ShadowLog[]> {
    try {
      const results = await sql`
        SELECT * FROM shadow_logs 
        WHERE error_message IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return results.map((row) => this.rowToShadowLog(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch error logs: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Helper to convert database row to ShadowLog type
   */
  private rowToShadowLog(row: any): ShadowLog {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      partner_name: row.partner_name,
      endpoint: row.endpoint,
      http_method: row.http_method,
      request_payload:
        typeof row.request_payload === "string"
          ? JSON.parse(row.request_payload)
          : row.request_payload,
      response_payload:
        row.response_payload && typeof row.response_payload === "string"
          ? JSON.parse(row.response_payload)
          : row.response_payload,
      response_status_code: row.response_status_code,
      error_message: row.error_message,
      retry_count: row.retry_count,
      created_at: new Date(row.created_at),
    };
  },
};
