/**
 * Payment Intent Repository
 *
 * Persists agent-originated payment intent submissions for idempotency and replay.
 */

import { sql } from "../connection";
import { ApplicationError, ErrorCode, PaymentIntent } from "../../types";

export interface PaymentIntentRecord {
  id: string;
  idempotency_key: string;
  correlation_id: string;
  request_fingerprint: string;
  payment_intent_payload: PaymentIntent;
  transaction_id: string | null;
  status: "received" | "processing" | "queued" | "settled" | "failed";
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export const paymentIntentRepository = {
  async findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<PaymentIntentRecord | null> {
    try {
      const result = await sql`
        SELECT *
        FROM payment_intents
        WHERE idempotency_key = ${idempotencyKey}
        LIMIT 1
      `;

      return result[0] ? this.rowToPaymentIntentRecord(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch payment intent by idempotency key: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async createReceivedIntent(request: {
    idempotency_key: string;
    correlation_id: string;
    request_fingerprint: string;
    payment_intent_payload: PaymentIntent;
  }): Promise<PaymentIntentRecord> {
    try {
      const result = await sql`
        INSERT INTO payment_intents (
          idempotency_key,
          correlation_id,
          request_fingerprint,
          payment_intent_payload,
          status
        ) VALUES (
          ${request.idempotency_key},
          ${request.correlation_id},
          ${request.request_fingerprint},
          ${JSON.stringify(request.payment_intent_payload)},
          'received'
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create payment intent",
          500
        );
      }

      return this.rowToPaymentIntentRecord(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create payment intent: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async markProcessing(id: string): Promise<PaymentIntentRecord | null> {
    try {
      const result = await sql`
        UPDATE payment_intents
        SET status = 'processing', updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return result[0] ? this.rowToPaymentIntentRecord(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark payment intent processing: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async markQueued(
    id: string,
    transactionId: string
  ): Promise<PaymentIntentRecord | null> {
    try {
      const result = await sql`
        UPDATE payment_intents
        SET
          status = 'queued',
          transaction_id = ${transactionId},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return result[0] ? this.rowToPaymentIntentRecord(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark payment intent queued: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async markFailed(id: string, failureReason: string): Promise<PaymentIntentRecord | null> {
    try {
      const result = await sql`
        UPDATE payment_intents
        SET
          status = 'failed',
          failure_reason = ${failureReason},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return result[0] ? this.rowToPaymentIntentRecord(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to mark payment intent failed: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  rowToPaymentIntentRecord(row: any): PaymentIntentRecord {
    return {
      id: row.id,
      idempotency_key: row.idempotency_key,
      correlation_id: row.correlation_id,
      request_fingerprint: row.request_fingerprint,
      payment_intent_payload:
        typeof row.payment_intent_payload === "string"
          ? JSON.parse(row.payment_intent_payload)
          : row.payment_intent_payload,
      transaction_id: row.transaction_id,
      status: row.status,
      failure_reason: row.failure_reason,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
