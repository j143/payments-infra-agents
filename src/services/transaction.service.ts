/**
 * Transaction Service
 * 
 * Core business logic for transaction processing.
 * This is where the "Human-in-the-Loop" threshold logic lives.
 */

import { transactionRepository } from "../db/repositories/transaction.repository";
import { shadowLogRepository } from "../db/repositories/shadow-log.repository";
import { jobQueueService } from "./job-queue.service";
import { CreateTransactionRequest, Transaction, ApplicationError, ErrorCode } from "../types";

const HUMAN_APPROVAL_THRESHOLD_CENTS =
  parseInt(process.env.HUMAN_APPROVAL_THRESHOLD || "50000") || 50000;

export const transactionService = {
  /**
   * Create a new transaction with automatic approval threshold check
   * 
   * Returns:
   * - If amount < threshold: Transaction immediately marked as 'approved'
   * - If amount >= threshold: Transaction marked as 'requires_approval'
   */
  async createTransaction(
    request: CreateTransactionRequest
  ): Promise<Transaction> {
    // Create transaction in queued state by default
    const transaction = await transactionRepository.createWithStatus(
      request,
      request.amount_cents >= HUMAN_APPROVAL_THRESHOLD_CENTS
        ? "requires_approval"
        : "queued"
    );

    // Check if requires human approval
    if (transaction.amount_cents >= HUMAN_APPROVAL_THRESHOLD_CENTS) {
      return transaction;
    }

    await jobQueueService.enqueueTransaction(transaction.id);

    return transaction;
  },

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    const transaction = await transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new ApplicationError(
        ErrorCode.TRANSACTION_NOT_FOUND,
        `Transaction ${transactionId} not found`,
        404
      );
    }
    return transaction;
  },

  /**
   * Get transactions requiring approval (for the approval queue)
   */
  async getPendingApprovals(): Promise<Transaction[]> {
    return transactionRepository.findPendingApproval();
  },

  /**
   * Approve a transaction
   */
  async approveTransaction(
    transactionId: string,
    userId: string
  ): Promise<Transaction> {
    const transaction = await this.getTransaction(transactionId);

    if (transaction.status !== "requires_approval") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Cannot approve transaction in status ${transaction.status}`,
        400
      );
    }

    const updated = await transactionRepository.updateStatus(
      transactionId,
      "approved",
      {
        approved_by_user_id: userId,
        approval_timestamp: new Date(),
      }
    );

    if (!updated) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        "Failed to approve transaction",
        500
      );
    }

    await jobQueueService.enqueueTransaction(transactionId);

    return updated;
  },

  /**
   * Reject a transaction
   */
  async rejectTransaction(
    transactionId: string,
    reason: string
  ): Promise<Transaction> {
    const transaction = await this.getTransaction(transactionId);

    if (transaction.status !== "requires_approval") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Cannot reject transaction in status ${transaction.status}`,
        400
      );
    }

    const updated = await transactionRepository.updateStatus(
      transactionId,
      "rejected",
      {
        rejection_reason: reason,
      }
    );

    if (!updated) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        "Failed to reject transaction",
        500
      );
    }

    return updated;
  },

  /**
   * Get transaction with its full audit trail (shadow logs)
   */
  async getTransactionWithAudit(transactionId: string) {
    const transaction = await this.getTransaction(transactionId);
    const shadowLogs = await shadowLogRepository.findByTransactionId(
      transactionId
    );

    return {
      transaction,
      shadowLogs,
    };
  },
};
