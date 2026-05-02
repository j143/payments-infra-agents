/**
 * Settlement Service
 *
 * Normalizes partner processing results into a canonical settlement outcome.
 */

import { randomUUID } from "node:crypto";
import {
  CreateSettlementOutcomeRequest,
  SettlementLifecycleStage,
  SettlementOutcome,
  Transaction,
  TransactionStatus,
} from "../types";
import { PartnerAPIResponse } from "./partner-api.adapter";

export function mapTransactionStatusToSettlementLifecycle(
  status: TransactionStatus
): SettlementLifecycleStage {
  switch (status) {
    case "processing":
      return "submitted";
    case "completed":
      return "settled";
    case "failed":
      return "failed";
    case "queued":
    case "pending":
    case "requires_approval":
    case "approved":
    case "rejected":
    default:
      return "initiated";
  }
}

function extractSettlementReferenceId(
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload) {
    return null;
  }

  const candidate =
    payload.settlement_reference_id ??
    payload.settlement_id ??
    payload.reference_id ??
    payload.id;

  return typeof candidate === "string" ? candidate : null;
}

export function buildSettlementOutcome(
  transaction: Transaction,
  options: {
    partnerName: string;
    partnerEndpoint: string;
    partnerResponse?: PartnerAPIResponse | null;
    transactionStatus?: TransactionStatus;
    settlementReferenceId?: string | null;
    failureReason?: string | null;
    occurredAt?: Date;
  }
): SettlementOutcome {
  const occurredAt = options.occurredAt ?? new Date();
  const transactionStatus = options.transactionStatus ?? transaction.status;
  const partnerResponse = options.partnerResponse ?? null;
  const settlementReferenceId =
    options.settlementReferenceId ??
    extractSettlementReferenceId(partnerResponse?.payload);

  return {
    id: randomUUID(),
    transaction_id: transaction.id,
    transaction_status: transactionStatus,
    lifecycle_stage: mapTransactionStatusToSettlementLifecycle(
      transactionStatus
    ),
    partner_name: options.partnerName,
    partner_endpoint: options.partnerEndpoint,
    partner_response_status_code: partnerResponse?.status ?? null,
    partner_response_payload: partnerResponse?.payload ?? null,
    settlement_reference_id: settlementReferenceId,
    failure_reason: options.failureReason ?? null,
    occurred_at: occurredAt,
    created_at: occurredAt,
    updated_at: occurredAt,
  };
}

export function validateCreateSettlementOutcomeRequest(
  input: unknown
): CreateSettlementOutcomeRequest {
  return input as CreateSettlementOutcomeRequest;
}