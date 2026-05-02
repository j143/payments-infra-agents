/**
 * Agentic Payment Service
 *
 * Normalizes agent-originated payment intents into internal transaction requests.
 */

import { randomUUID } from "node:crypto";
import {
  ApplicationError,
  CreatePaymentIntentRequest,
  CreatePaymentIntentRequestSchema,
  CreateTransactionRequest,
  ErrorCode,
  PaymentIntent,
  PaymentIntentStatus,
  Transaction,
} from "../types";
import { paymentIntentRepository } from "../db/repositories/payment-intent.repository";
import { transactionService } from "./transaction.service";

export interface AgentPaymentIntentResult {
  payment_intent: PaymentIntent;
  transaction: Transaction;
}

export function validateCreatePaymentIntentRequest(
  input: unknown
): CreatePaymentIntentRequest {
  const parsed = CreatePaymentIntentRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ApplicationError(
      ErrorCode.VALIDATION_FAILED,
      "Zod validation failed for create payment intent request",
      400,
      { issues: parsed.error.issues }
    );
  }

  return parsed.data;
}

export function mapPaymentIntentToTransactionRequest(
  request: CreatePaymentIntentRequest
): CreateTransactionRequest {
  return {
    reference_id: request.reference_id,
    account_id: request.account_id,
    merchant_id: request.merchant_id,
    amount_cents: request.amount_cents,
    currency: request.currency,
  };
}

export function fingerprintPaymentIntentRequest(
  request: CreatePaymentIntentRequest
): string {
  return JSON.stringify({
    idempotency_key: request.idempotency_key,
    correlation_id: request.correlation_id,
    principal: request.principal,
    delegation_grant_id: request.delegation_grant_id ?? null,
    reference_id: request.reference_id,
    account_id: request.account_id,
    merchant_id: request.merchant_id,
    amount_cents: request.amount_cents,
    currency: request.currency,
    category: request.category ?? null,
    metadata: request.metadata ?? {},
  });
}

export function buildPaymentIntent(
  request: CreatePaymentIntentRequest,
  options?: {
    id?: string;
    now?: Date;
    status?: PaymentIntentStatus;
    denial_reason_code?: string | null;
  }
): PaymentIntent {
  const timestamp = options?.now ?? new Date();

  return {
    id: options?.id ?? randomUUID(),
    idempotency_key: request.idempotency_key,
    correlation_id: request.correlation_id,
    principal: request.principal,
    delegation_grant_id: request.delegation_grant_id ?? null,
    reference_id: request.reference_id,
    account_id: request.account_id,
    merchant_id: request.merchant_id,
    amount_cents: request.amount_cents,
    currency: request.currency,
    category: request.category,
    status: options?.status ?? "received",
    denial_reason_code: options?.denial_reason_code ?? null,
    metadata: request.metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function submitAgentPaymentIntent(
  request: CreatePaymentIntentRequest
): Promise<AgentPaymentIntentResult> {
  const requestFingerprint = fingerprintPaymentIntentRequest(request);
  const existing = await paymentIntentRepository.findByIdempotencyKey(
    request.idempotency_key
  );

  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      throw new ApplicationError(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        `Idempotency key ${request.idempotency_key} was already used with a different request`,
        409
      );
    }

    const paymentIntent = buildPaymentIntent(request, {
      id: existing.id,
      now: existing.updated_at,
      status: existing.status as PaymentIntentStatus,
      denial_reason_code: existing.failure_reason,
    });

    if (existing.transaction_id) {
      const transaction = await transactionService.getTransaction(
        existing.transaction_id
      );

      return {
        payment_intent: {
          ...paymentIntent,
          status: "queued",
        },
        transaction,
      };
    }

    if (existing.status === "processing" || existing.status === "received") {
      throw new ApplicationError(
        ErrorCode.PAYMENT_INTENT_IN_PROGRESS,
        `Payment intent ${request.idempotency_key} is still being processed`,
        409,
        {
          idempotency_key: request.idempotency_key,
          correlation_id: existing.correlation_id,
        }
      );
    }

    throw new ApplicationError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      `Payment intent ${request.idempotency_key} cannot be replayed in status ${existing.status}`,
      409
    );
  }

  const receivedIntent = buildPaymentIntent(request);
  const createdIntent = await paymentIntentRepository.createReceivedIntent({
    idempotency_key: request.idempotency_key,
    correlation_id: request.correlation_id,
    request_fingerprint: requestFingerprint,
    payment_intent_payload: receivedIntent,
  });

  await paymentIntentRepository.markProcessing(createdIntent.id);

  try {
    const transaction = await transactionService.createTransaction(
      mapPaymentIntentToTransactionRequest(request)
    );

    await paymentIntentRepository.markQueued(createdIntent.id, transaction.id);

    return {
      payment_intent: {
        ...receivedIntent,
        id: createdIntent.id,
        status: "queued",
      },
      transaction,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : "unknown error";
    await paymentIntentRepository.markFailed(createdIntent.id, failureReason);
    throw error;
  }
}
