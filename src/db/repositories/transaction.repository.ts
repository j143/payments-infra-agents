/**
 * Transaction Repository
 * 
 * All database operations for transactions are here.
 * Provides a clear interface for transaction CRUD operations.
 */

import { sql } from "../connection";
import {
  Transaction,
  TransactionStatus,
  CreateTransactionRequest,
  ApplicationError,
  ErrorCode,
} from "../../types";

export const transactionRepository = {
  /**
   * Create a new transaction
   * Always logs to shadow_logs first (before processing)
   */
  async create(request: CreateTransactionRequest): Promise<Transaction> {
    return this.createWithStatus(request, "queued");
  },

  /**
   * Create a transaction in a specific status
   */
  async createWithStatus(
    request: CreateTransactionRequest,
    status: TransactionStatus
  ): Promise<Transaction> {
    try {
      const result = await sql`
        INSERT INTO transactions (
          reference_id,
          account_id,
          merchant_id,
          amount_cents,
          currency,
          status
        ) VALUES (
          ${request.reference_id},
          ${request.account_id},
          ${request.merchant_id},
          ${request.amount_cents},
          ${request.currency},
          ${status}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create transaction",
          500
        );
      }

      return this.rowToTransaction(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      if (
        error instanceof Error &&
        error.message.includes("duplicate key")
      ) {
        throw new ApplicationError(
          ErrorCode.DUPLICATE_TRANSACTION,
          `Transaction with reference_id already exists`,
          409
        );
      }
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create transaction: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get transaction by ID
   */
  async findById(id: string): Promise<Transaction | null> {
    try {
      const result = await sql`
        SELECT * FROM transactions WHERE id = ${id}
      `;

      if (!result[0]) return null;
      return this.rowToTransaction(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch transaction: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get all transactions for an account
   */
  async findByAccountId(accountId: string): Promise<Transaction[]> {
    try {
      const results = await sql`
        SELECT * FROM transactions 
        WHERE account_id = ${accountId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToTransaction(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch transactions: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get transactions requiring approval
   */
  async findPendingApproval(): Promise<Transaction[]> {
    try {
      const results = await sql`
        SELECT * FROM transactions 
        WHERE requires_approval = true AND status = 'requires_approval'
        ORDER BY created_at ASC
      `;

      return results.map((row) => this.rowToTransaction(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch pending approvals: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Update transaction status
   */
  async updateStatus(
    id: string,
    status: TransactionStatus,
    updates?: {
      approved_by_user_id?: string;
      approval_timestamp?: Date;
      rejection_reason?: string;
      failure_reason?: string;
    }
  ): Promise<Transaction | null> {
    try {
      const result = await sql`
        UPDATE transactions 
        SET 
          status = ${status},
          approved_by_user_id = COALESCE(${updates?.approved_by_user_id ?? null}, approved_by_user_id),
          approval_timestamp = COALESCE(${updates?.approval_timestamp ?? null}, approval_timestamp),
          rejection_reason = COALESCE(${updates?.rejection_reason ?? null}, rejection_reason),
          failure_reason = COALESCE(${updates?.failure_reason ?? null}, failure_reason),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToTransaction(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to update transaction: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Mark transaction as requiring approval
   */
  async markForApproval(id: string): Promise<Transaction | null> {
    try {
      const result = await sql`
        UPDATE transactions 
        SET 
          requires_approval = true,
          status = 'requires_approval',
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToTransaction(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark transaction for approval: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Helper to convert database row to Transaction type
   */
  rowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      reference_id: row.reference_id,
      account_id: row.account_id,
      merchant_id: row.merchant_id,
      amount_cents:
        typeof row.amount_cents === "string"
          ? Number(row.amount_cents)
          : row.amount_cents,
      currency: row.currency,
      status: row.status,
      requires_approval: row.requires_approval,
      approved_by_user_id: row.approved_by_user_id,
      approval_timestamp: row.approval_timestamp
        ? new Date(row.approval_timestamp)
        : null,
      rejection_reason: row.rejection_reason,
      failure_reason: row.failure_reason,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
