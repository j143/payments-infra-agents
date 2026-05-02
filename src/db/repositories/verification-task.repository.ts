/**
 * Verification Task Repository
 * 
 * Manages manual reconciliation queue for detecting zombie transactions.
 */

import { sql } from "../connection";
import {
  VerificationTask,
  DiscrepancyType,
  ApplicationError,
  ErrorCode,
} from "../../types";

export const verificationTaskRepository = {
  /**
   * Create a new verification task
   */
  async create(
    transactionId: string,
    discrepancyType: DiscrepancyType | null = null
  ): Promise<VerificationTask> {
    try {
      const result = await sql`
        INSERT INTO verification_tasks (
          transaction_id,
          status,
          discrepancy_type
        ) VALUES (
          ${transactionId},
          'pending',
          ${discrepancyType ?? null}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create verification task",
          500
        );
      }

      return this.rowToVerificationTask(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create verification task: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get verification task by ID
   */
  async findById(id: string): Promise<VerificationTask | null> {
    try {
      const result = await sql`
        SELECT * FROM verification_tasks WHERE id = ${id}
      `;

      if (!result[0]) return null;
      return this.rowToVerificationTask(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch verification task: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get all pending verification tasks
   */
  async findPending(): Promise<VerificationTask[]> {
    try {
      const results = await sql`
        SELECT * FROM verification_tasks 
        WHERE status = 'pending'
        ORDER BY created_at ASC
      `;

      return results.map((row) => this.rowToVerificationTask(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch pending tasks: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get verification tasks for a transaction
   */
  async findByTransactionId(transactionId: string): Promise<VerificationTask[]> {
    try {
      const results = await sql`
        SELECT * FROM verification_tasks 
        WHERE transaction_id = ${transactionId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToVerificationTask(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch verification tasks: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Assign task to a user
   */
  async assignToUser(id: string, userId: string): Promise<VerificationTask | null> {
    try {
      const result = await sql`
        UPDATE verification_tasks 
        SET 
          assigned_to_user_id = ${userId},
          status = 'in_progress',
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToVerificationTask(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to assign task: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Mark task as verified
   */
  async markVerified(id: string, notes?: string): Promise<VerificationTask | null> {
    try {
      const result = await sql`
        UPDATE verification_tasks 
        SET 
          status = 'verified',
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToVerificationTask(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark task verified: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Mark task as discrepancy found
   */
  async markDiscrepancy(
    id: string,
    discrepancyType: DiscrepancyType,
    notes?: string
  ): Promise<VerificationTask | null> {
    try {
      const result = await sql`
        UPDATE verification_tasks 
        SET 
          status = 'discrepancy_found',
          discrepancy_type = ${discrepancyType},
          notes = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToVerificationTask(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark discrepancy: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get all confirmed zombie transactions
   */
  async findZombieTransactions(): Promise<VerificationTask[]> {
    try {
      const results = await sql`
        SELECT * FROM verification_tasks 
        WHERE discrepancy_type = 'zombie_transaction'
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToVerificationTask(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch zombie transactions: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Helper to convert database row to VerificationTask type
   */
  rowToVerificationTask(row: any): VerificationTask {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      status: row.status,
      discrepancy_type: row.discrepancy_type,
      assigned_to_user_id: row.assigned_to_user_id,
      notes: row.notes,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
