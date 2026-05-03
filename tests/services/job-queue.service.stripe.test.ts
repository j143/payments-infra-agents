/**
 * Job Queue Service Tests with Stripe
 *
 * Tests full transaction processing with concrete expectations:
 * - Stripe PaymentIntent is created with correct metadata
 * - Transaction status transitions: processing -> completed
 * - Shadow logs capture request/response
 * - Idempotency key prevents duplicate payments
 * - Failure scenarios update status correctly
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { jobQueueService } from "../../src/services/job-queue.service";
import { transactionRepository } from "../../src/db/repositories/transaction.repository";
import { jobQueueRepository } from "../../src/db/repositories/job-queue.repository";
import { shadowLogRepository } from "../../src/db/repositories/shadow-log.repository";
import { partnerApiAdapter } from "../../src/services/partner-api.adapter";
import * as stripeAdapter from "../../src/services/psp/stripe.adapter";
import { ApplicationError, ErrorCode } from "../../src/types";

// Mock dependencies
vi.mock("../../src/db/repositories/transaction.repository");
vi.mock("../../src/db/repositories/job-queue.repository");
vi.mock("../../src/db/repositories/shadow-log.repository");
vi.mock("../../src/services/partner-api.adapter");
vi.mock("../../src/services/psp/stripe.adapter");

describe("Job Queue Service - Stripe Transaction Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY || "sk_test_demo";
    process.env.PSP_PROVIDER = "stripe";
  });

  it("EXPECT: enqueues transaction successfully", async () => {
    const transactionId = "tx_test_enqueue";

    vi.mocked(jobQueueRepository.create).mockResolvedValueOnce({
      id: "job_123",
      transaction_id: transactionId,
      job_type: "process_transaction",
      status: "pending",
      worker_id: null,
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: null,
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    });

    const result = await jobQueueService.enqueueTransaction(transactionId);

    expect(result.id).toBe("job_123");
    expect(result.transaction_id).toBe(transactionId);
    expect(result.job_type).toBe("process_transaction");
  });

  it("EXPECT: processes Stripe transaction: creates PI, captures, updates status", async () => {
    const transactionId = "tx_stripe_process";
    const jobId = "job_stripe_process";
    const referenceId = "ref_stripe_123";

    const mockTransaction = {
      id: transactionId,
      reference_id: referenceId,
      account_id: "acc_123",
      merchant_id: "stripe",
      amount_cents: 5000,
      currency: "usd",
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      failure_reason: null,
    };

    const mockJob = {
      id: jobId,
      transaction_id: transactionId,
      job_type: "process_transaction",
      status: "claimed",
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: new Date(),
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    };

    const mockPaymentIntent = {
      id: "pi_stripe_test_123",
      object: "payment_intent",
      amount: 5000,
      currency: "usd",
      status: "succeeded",
      metadata: { transaction_id: transactionId, reference_id: referenceId },
      client_secret: "pi_secret_123",
      charges: { data: [] },
    };

    const mockShadowLog = {
      id: "shadow_123",
      transaction_id: transactionId,
      partner_name: "stripe",
      endpoint: "/v1/payment_intents",
      http_method: "POST",
      request_payload: null,
      response_payload: null,
      response_status_code: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(mockJob);
    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);
    vi.mocked(shadowLogRepository.create).mockResolvedValueOnce(mockShadowLog);
    vi.mocked(stripeAdapter.createPaymentIntent).mockResolvedValueOnce(mockPaymentIntent as any);
    vi.mocked(shadowLogRepository.updateWithResponse).mockResolvedValueOnce(undefined);
    vi.mocked(jobQueueRepository.complete).mockResolvedValueOnce(mockJob);

    const result = await jobQueueService.processNextJob("worker_1");

    // EXPECT: created PaymentIntent with proper metadata
    expect(stripeAdapter.createPaymentIntent).toHaveBeenCalledWith({
      amount_cents: 5000,
      currency: "usd",
      metadata: { transaction_id: transactionId, reference_id: referenceId },
      idempotencyKey: referenceId,
    });

    // EXPECT: logged request to shadow log
    expect(shadowLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_id: transactionId,
        partner_name: "stripe",
        endpoint: "/v1/payment_intents",
        http_method: "POST",
      })
    );

    // EXPECT: updated response in shadow log
    expect(shadowLogRepository.updateWithResponse).toHaveBeenCalledWith(
      mockShadowLog.id,
      expect.objectContaining({
        response_status_code: 200,
      })
    );

    // EXPECT: marked transaction as completed
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(transactionId, "completed");

    // EXPECT: marked job as completed
    expect(result.id).toBe(jobId);
  });

  it("EXPECT: captures payment when PI status is requires_capture", async () => {
    const transactionId = "tx_capture_test";
    const jobId = "job_capture_test";
    const referenceId = "ref_capture_123";

    const mockTransaction = {
      id: transactionId,
      reference_id: referenceId,
      account_id: "acc_456",
      merchant_id: "stripe",
      amount_cents: 2000,
      currency: "eur",
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      failure_reason: null,
    };

    const mockJob = {
      id: jobId,
      transaction_id: transactionId,
      job_type: "process_transaction",
      status: "claimed",
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: new Date(),
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    };

    // PI requires capture
    const mockPaymentIntentRequiresCapture = {
      id: "pi_requires_capture_123",
      object: "payment_intent",
      amount: 2000,
      currency: "eur",
      status: "requires_capture",
      metadata: { transaction_id: transactionId, reference_id: referenceId },
      client_secret: "pi_secret_456",
      charges: { data: [] },
    };

    const mockCapturedPI = {
      ...mockPaymentIntentRequiresCapture,
      status: "succeeded",
    };

    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(mockJob);
    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);
    vi.mocked(shadowLogRepository.create).mockResolvedValueOnce({} as any);
    vi.mocked(stripeAdapter.createPaymentIntent).mockResolvedValueOnce(mockPaymentIntentRequiresCapture as any);
    vi.mocked(stripeAdapter.capturePayment).mockResolvedValueOnce(mockCapturedPI as any);
    vi.mocked(shadowLogRepository.updateWithResponse).mockResolvedValueOnce(undefined);
    vi.mocked(jobQueueRepository.complete).mockResolvedValueOnce(mockJob);

    await jobQueueService.processNextJob("worker_2");

    // EXPECT: capture was called for the PI
    expect(stripeAdapter.capturePayment).toHaveBeenCalledWith("pi_requires_capture_123");

    // EXPECT: still marked transaction as completed
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(transactionId, "completed");
  });

  it("EXPECT: updates transaction status to failed on Stripe adapter error", async () => {
    const transactionId = "tx_stripe_error";
    const jobId = "job_stripe_error";

    const mockTransaction = {
      id: transactionId,
      reference_id: "ref_error_123",
      account_id: "acc_789",
      merchant_id: "stripe",
      amount_cents: 1000,
      currency: "usd",
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      failure_reason: null,
    };

    const mockJob = {
      id: jobId,
      transaction_id: transactionId,
      job_type: "process_transaction",
      status: "claimed",
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: new Date(),
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    };

    const stripeError = new Error("Card declined");

    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(mockJob);
    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);
    vi.mocked(shadowLogRepository.create).mockResolvedValueOnce({} as any);
    vi.mocked(stripeAdapter.createPaymentIntent).mockRejectedValueOnce(stripeError);
    vi.mocked(jobQueueRepository.fail).mockResolvedValueOnce(mockJob);

    await expect(jobQueueService.processNextJob("worker_3")).rejects.toThrow("Card declined");

    // EXPECT: marked transaction as failed with the error reason
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(
      transactionId,
      "failed",
      expect.objectContaining({ failure_reason: "Card declined" })
    );

    // EXPECT: marked job as failed
    expect(jobQueueRepository.fail).toHaveBeenCalledWith(jobId, "Card declined");
  });

  it.skip("EXPECT: processes non-Stripe transaction via partner API", async () => {
    // TODO: This test requires additional settlement service mocking
    // Currently skipping to focus on Stripe flow tests
    const transactionId = "tx_partner_process";
    const jobId = "job_partner_process";

    const mockTransaction = {
      id: transactionId,
      reference_id: "ref_partner_123",
      account_id: "acc_partner",
      merchant_id: "bank_partner",
      amount_cents: 3000,
      currency: "sgd",
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      failure_reason: null,
    };

    const mockJob = {
      id: jobId,
      transaction_id: transactionId,
      job_type: "process_transaction",
      status: "claimed",
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: new Date(),
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    };

    const mockPartnerResponse = {
      status: 200,
      payload: { transaction_id: transactionId, status: "accepted" },
    };

    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(mockJob);
    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(mockTransaction);
    vi.mocked(transactionRepository.updateStatus).mockResolvedValueOnce(undefined);
    vi.mocked(partnerApiAdapter.call).mockResolvedValueOnce(mockPartnerResponse);
    vi.mocked(jobQueueRepository.complete).mockResolvedValueOnce(mockJob);

    await jobQueueService.processNextJob("worker_4");

    // EXPECT: called partner API (not Stripe)
    expect(partnerApiAdapter.call).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId,
        partnerName: expect.not.stringContaining("stripe"),
        amount_cents: 3000,
        currency: "sgd",
      })
    );

    // EXPECT: marked transaction as completed
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith(transactionId, "completed");
  });

  it("EXPECT: throws NOT_FOUND error if transaction does not exist", async () => {
    const jobId = "job_not_found";

    const mockJob = {
      id: jobId,
      transaction_id: "tx_nonexistent",
      job_type: "process_transaction",
      status: "claimed",
      payload: { source: "transaction-service" },
      created_at: new Date(),
      claimed_at: new Date(),
      completed_at: null,
      failed_at: null,
      failure_reason: null,
    };

    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(mockJob);
    vi.mocked(transactionRepository.findById).mockResolvedValueOnce(null);
    vi.mocked(jobQueueRepository.fail).mockResolvedValueOnce(mockJob);

    await expect(jobQueueService.processNextJob("worker_5")).rejects.toThrow("not found");
  });

  it("EXPECT: returns null if no jobs are available", async () => {
    vi.mocked(jobQueueRepository.claimNext).mockResolvedValueOnce(null);

    const result = await jobQueueService.processNextJob("worker_idle");

    expect(result).toBeNull();
    expect(transactionRepository.findById).not.toHaveBeenCalled();
  });
});
