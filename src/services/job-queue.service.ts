/**
 * Job Queue Service
 *
 * Coordinates async transaction processing.
 */

import { ApplicationError, ErrorCode, JobQueueItem } from "../types";
import { jobQueueRepository } from "../db/repositories/job-queue.repository";
import { transactionRepository } from "../db/repositories/transaction.repository";
import { partnerApiAdapter } from "./partner-api.adapter";
import { shadowLogRepository } from "../db/repositories/shadow-log.repository";
import * as stripeAdapter from "./psp/stripe.adapter";
import { logger } from "../api/middleware/logger";
import { buildSettlementOutcome } from "./settlement.service";

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

    // Support Stripe as first PSP integration if configured
    const useStripe = (process.env.PSP_PROVIDER || "").toLowerCase() === "stripe" || transaction.merchant_id === "stripe";

    try {
      if (useStripe) {
        // Log request to shadow log
        const shadow = await shadowLogRepository.create({
          transaction_id: transaction.id,
          partner_name: "stripe",
          endpoint: "/v1/payment_intents",
          http_method: "POST",
          request_payload: {
            reference_id: transaction.reference_id,
            amount_cents: transaction.amount_cents,
            currency: transaction.currency,
          },
        });

        // Use transaction.reference_id as idempotency key
        const idempotencyKey = transaction.reference_id;

        const pi = await stripeAdapter.createPaymentIntent({
          amount_cents: transaction.amount_cents,
          currency: transaction.currency,
          metadata: { transaction_id: transaction.id, reference_id: transaction.reference_id },
          idempotencyKey,
        });

        await shadowLogRepository.updateWithResponse(shadow.id, {
          response_payload: pi as any,
          response_status_code: 200,
        });

        // If payment intent requires capture or is succeeded, handle accordingly
        if ((pi as any).status === "requires_capture") {
          await stripeAdapter.capturePayment((pi as any).id);
        }

        await transactionRepository.updateStatus(transaction.id, "completed");

        const settlementOutcome = buildSettlementOutcome(transaction, {
          partnerName: "stripe",
          partnerEndpoint: "/v1/payment_intents",
          partnerResponse: { status: 200, payload: pi as unknown as Record<string, unknown> },
          transactionStatus: "completed",
        });

        logger.debug("Settlement outcome mapped (stripe)", {
          settlementOutcome,
        });
      } else {
        const partnerResponse = await partnerApiAdapter.call({
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

        const settlementOutcome = buildSettlementOutcome(transaction, {
          partnerName: PARTNER_NAME,
          partnerEndpoint: PARTNER_ENDPOINT,
          partnerResponse,
          transactionStatus: "completed",
        });

        logger.debug("Settlement outcome mapped", {
          settlementOutcome,
        });
      }
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "unknown error";

      await transactionRepository.updateStatus(transaction.id, "failed", {
        failure_reason: failureReason,
      });

      const settlementOutcome = buildSettlementOutcome(transaction, {
        partnerName: useStripe ? "stripe" : PARTNER_NAME,
        partnerEndpoint: useStripe ? "/v1/payment_intents" : PARTNER_ENDPOINT,
        transactionStatus: "failed",
        failureReason,
      });

      logger.debug("Settlement outcome mapped", {
        settlementOutcome,
      });

      throw error;
    }
  },
};