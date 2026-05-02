/**
 * Job Queue Service
 *
 * Coordinates async transaction processing.
 */

import { ApplicationError, ErrorCode, JobQueueItem } from "../types";
import { jobQueueRepository } from "../db/repositories/job-queue.repository";
import { transactionRepository } from "../db/repositories/transaction.repository";
import { partnerApiAdapter } from "./partner-api.adapter";

const PARTNER_NAME = process.env.PARTNER_NAME || "mock-partner";
const PARTNER_ENDPOINT = process.env.PARTNER_API_ENDPOINT || "/payments";

export const jobQueueService = {
  async enqueueTransaction(transactionId: string): Promise<JobQueueItem> {
    return jobQueueRepository.create({
      transaction_id: transactionId,
      job_type: "process_transaction",
      payload: {
        source: "transaction-service",
      },
    });
  },

  async processNextJob(workerId: string): Promise<JobQueueItem | null> {
    const job = await jobQueueRepository.claimNext(workerId);
    if (!job) {
      return null;
    }

    try {
      if (job.job_type === "process_transaction") {
        await this.processTransaction(job);
      }

      return jobQueueRepository.complete(job.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "unknown error";
      await jobQueueRepository.fail(job.id, errorMessage);

      if (error instanceof ApplicationError) {
        throw error;
      }

      throw new ApplicationError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to process job: ${errorMessage}`,
        500
      );
    }
  },

  async processTransaction(job: JobQueueItem): Promise<void> {
    const transaction = await transactionRepository.findById(job.transaction_id);

    if (!transaction) {
      throw new ApplicationError(
        ErrorCode.TRANSACTION_NOT_FOUND,
        `Transaction ${job.transaction_id} not found`,
        404
      );
    }

    await transactionRepository.updateStatus(transaction.id, "processing");

    try {
      await partnerApiAdapter.call({
        transactionId: transaction.id,
        partnerName: PARTNER_NAME,
        endpoint: PARTNER_ENDPOINT,
        method: "POST",
        requestPayload: {
          reference_id: transaction.reference_id,
          account_id: transaction.account_id,
          merchant_id: transaction.merchant_id,
          amount_cents: transaction.amount_cents,
          currency: transaction.currency,
        },
      });

      await transactionRepository.updateStatus(transaction.id, "completed");
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "unknown error";

      await transactionRepository.updateStatus(transaction.id, "failed", {
        failure_reason: failureReason,
      });

      throw error;
    }
  },
};