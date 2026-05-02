/**
 * Circuit Breaker Service
 * 
 * Prevents duplicate payments and threshold violations.
 * Currently simple: prevents same vendor payment twice in 10 minutes.
 */

import { sql } from "../db/connection";
import { ApplicationError, ErrorCode } from "../types";

const CIRCUIT_BREAKER_WINDOW_MINUTES =
  parseInt(process.env.CIRCUIT_BREAKER_WINDOW_MINUTES || "10") || 10;

export const circuitBreakerService = {
  /**
   * Check if a mandate should be blocked
   * 
   * Returns:
   * - true: Transaction can proceed
   * - false: Circuit breaker open, transaction blocked
   */
  async canProceed(vendorId: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM circuit_breaker_events
        WHERE vendor_id = ${vendorId}
          AND event_type = 'duplicate_attempt'
          AND resolved_at IS NULL
          AND triggered_at > NOW() - INTERVAL '${CIRCUIT_BREAKER_WINDOW_MINUTES} minutes'
      `;

      return result.length === 0;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to check circuit breaker: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Record a breach
   */
  async recordBreach(
    vendorId: string,
    eventType: "duplicate_attempt" | "threshold_exceeded"
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO circuit_breaker_events (
          vendor_id,
          event_type,
          triggered_at
        ) VALUES (
          ${vendorId},
          ${eventType},
          NOW()
        )
      `;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to record circuit breaker event: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Resolve a breach (manual intervention)
   */
  async resolve(vendorId: string): Promise<void> {
    try {
      await sql`
        UPDATE circuit_breaker_events
        SET resolved_at = NOW()
        WHERE vendor_id = ${vendorId}
          AND resolved_at IS NULL
      `;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to resolve circuit breaker: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },
};
