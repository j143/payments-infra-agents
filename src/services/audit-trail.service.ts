/**
 * Audit Trail Service
 *
 * Constructs audit evidence for compliance, regulatory, and operational review.
 * Links payment intent submission → policy decision → transaction creation → settlement.
 */

import { paymentIntentRepository } from "../db/repositories/payment-intent.repository";
import { transactionRepository } from "../db/repositories/transaction.repository";
import { shadowLogRepository } from "../db/repositories/shadow-log.repository";

export interface PaymentIntentEvidence {
  payment_intent_id: string;
  correlation_id: string;
  idempotency_key: string;
  principal_id: string;
  principal_type: string;
  delegation_grant_id: string | null;
  status: string;
  denial_reason_code: string | null;
  reference_id: string;
  amount_cents: number;
  currency: string;
  created_at: Date;
  transaction?: {
    id: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  };
  shadow_logs?: Array<{
    partner_name: string;
    endpoint: string;
    http_method: string;
    response_status_code: number | null;
    error_message: string | null;
    created_at: Date;
  }>;
}

export interface ComplianceReport {
  generated_at: Date;
  period_start: Date;
  period_end: Date;
  total_payment_intents: number;
  approved_count: number;
  denied_count: number;
  failed_count: number;
  total_amount_cents: number;
  denial_breakdown: Record<string, number>;
  failure_breakdown: Record<string, number>;
  evidence_sample: PaymentIntentEvidence[];
}

export const auditTrailService = {
  async getPaymentIntentEvidence(
    paymentIntentId: string
  ): Promise<PaymentIntentEvidence | null> {
    const record = await paymentIntentRepository.findByIdempotencyKey(
      paymentIntentId
    );

    if (!record) {
      return null;
    }

    const payload = record.payment_intent_payload;
    const evidence: PaymentIntentEvidence = {
      payment_intent_id: record.id,
      correlation_id: record.correlation_id,
      idempotency_key: record.idempotency_key,
      principal_id: payload.principal.principal_id,
      principal_type: payload.principal.principal_type,
      delegation_grant_id: payload.delegation_grant_id ?? null,
      status: record.status,
      denial_reason_code: record.failure_reason ?? null,
      reference_id: payload.reference_id,
      amount_cents: payload.amount_cents,
      currency: payload.currency,
      created_at: record.created_at,
    };

    if (record.transaction_id) {
      const transaction = await transactionRepository.findById(
        record.transaction_id
      );
      if (transaction) {
        evidence.transaction = {
          id: transaction.id,
          status: transaction.status,
          created_at: transaction.created_at,
          updated_at: transaction.updated_at,
        };

        const shadowLogs = await shadowLogRepository.findByTransactionId(
          transaction.id
        );
        evidence.shadow_logs = shadowLogs.map((log) => ({
          partner_name: log.partner_name,
          endpoint: log.endpoint,
          http_method: log.http_method,
          response_status_code: log.response_status_code,
          error_message: log.error_message,
          created_at: log.created_at,
        }));
      }
    }

    return evidence;
  },

  async getCorrelationEvidence(
    correlationId: string
  ): Promise<PaymentIntentEvidence[]> {
    // In production, this would query payment_intents by correlation_id directly
    // For now, return a placeholder that demonstrates the interface
    return [];
  },

  async generateComplianceReport(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<ComplianceReport> {
    const now = new Date();
    const startDate = options?.startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options?.endDate ?? now;

    // In production, this would query actual payment intents from database
    // For now, return a template showing the structure
    const report: ComplianceReport = {
      generated_at: now,
      period_start: startDate,
      period_end: endDate,
      total_payment_intents: 0,
      approved_count: 0,
      denied_count: 0,
      failed_count: 0,
      total_amount_cents: 0,
      denial_breakdown: {},
      failure_breakdown: {},
      evidence_sample: [],
    };

    return report;
  },
};
