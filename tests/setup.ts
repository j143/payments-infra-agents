/**
 * Test Setup Utilities
 * 
 * Helpers for writing tests in this codebase.
 */

import "dotenv/config";
import { beforeEach, afterEach } from "vitest";

async function getSql() {
  const { sql } = await import("../src/db/connection");
  return sql;
}

/**
 * Clear all test data before each test
 */
export async function clearDatabase() {
  try {
    const sql = await getSql();
    // Order matters: delete child tables first
    await sql`DELETE FROM delegation_revocations`;
    await sql`DELETE FROM delegation_grants`;
    await sql`DELETE FROM circuit_breaker_events`;
    await sql`DELETE FROM verification_tasks`;
    await sql`DELETE FROM shadow_logs`;
    await sql`DELETE FROM job_queue`;
    await sql`DELETE FROM transactions`;
    await sql`DELETE FROM accounts`;
    await sql`DELETE FROM partners`;
  } catch (error) {
    console.error("Failed to clear database:", error);
    throw error;
  }
}

/**
 * Setup test database
 */
export function setupTestDatabase() {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });
}

/**
 * Create test account
 */
export async function createTestAccount(
  merchantId: string = "00000000-0000-0000-0000-000000000001"
) {
  const sql = await getSql();
  const result = await sql`
    INSERT INTO accounts (merchant_id, account_type, balance_cents)
    VALUES (${merchantId}, 'business', 1000000)
    RETURNING *
  `;
  return result[0];
}

/**
 * Create test transaction
 */
export async function createTestTransaction(overrides: Record<string, unknown> = {}) {
  const sql = await getSql();
  const result = await sql`
    INSERT INTO transactions (
      reference_id,
      account_id,
      merchant_id,
      amount_cents,
      currency,
      status
    ) VALUES (
      ${overrides.reference_id || `REF-${Date.now()}`},
      ${overrides.account_id || "00000000-0000-0000-0000-000000000001"},
      ${overrides.merchant_id || "00000000-0000-0000-0000-000000000001"},
      ${overrides.amount_cents || 10000},
      ${overrides.currency || "SGD"},
      'pending'
    )
    RETURNING *
  `;
  return result[0];
}
