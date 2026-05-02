/**
 * Stripe PSP Adapter (scaffold)
 *
 * Minimal adapter surface for creating/capturing/refunding payments
 * and for handling webhook events. Expand per `docs/stripe-integration-plan.md`.
 */

import Stripe from "stripe";
import { transactionRepository } from "../../db/repositories/transaction.repository";
import { shadowLogRepository } from "../../db/repositories/shadow-log.repository";

const apiKey = process.env.STRIPE_API_KEY || "";
const stripe = apiKey ? new Stripe(apiKey, { apiVersion: "2022-11-15" }) : null;

export async function createPaymentIntent(params: {
  amount_cents: number;
  currency: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}) {
  if (!stripe) throw new Error("Stripe not configured (STRIPE_API_KEY missing)");

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: params.amount_cents,
      currency: params.currency,
      metadata: params.metadata,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );

  return paymentIntent;
}

export async function capturePayment(paymentIntentId: string) {
  if (!stripe) throw new Error("Stripe not configured (STRIPE_API_KEY missing)");
  return stripe.paymentIntents.capture(paymentIntentId);
}

export async function refundPayment(chargeId: string, amount_cents?: number) {
  if (!stripe) throw new Error("Stripe not configured (STRIPE_API_KEY missing)");
  return stripe.refunds.create({ charge: chargeId, amount: amount_cents });
}

export async function retrievePayment(paymentIntentId: string) {
  if (!stripe) throw new Error("Stripe not configured (STRIPE_API_KEY missing)");
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function handleWebhookEvent(event: Stripe.Event) {
  // Map Stripe webhook events to internal transactions and shadow logs
  const obj: any = (event.data && (event.data as any).object) || {};

  // Try to locate internal transaction from metadata (we set transaction_id in metadata)
  const transactionId = obj?.metadata?.transaction_id || obj?.metadata?.reference_id;

  // If transaction exists, create a shadow log entry for this webhook
  let shadow = null;
  if (transactionId) {
    try {
      const tx = await transactionRepository.findById(transactionId);
      if (tx) {
        shadow = await shadowLogRepository.create({
          transaction_id: tx.id,
          partner_name: "stripe",
          endpoint: "/webhooks/stripe",
          http_method: "POST",
          request_payload: event,
        });
      }
    } catch (err) {
      // ignore shadow logging errors to avoid blocking webhook processing
    }
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        if (transactionId) {
          await transactionRepository.updateStatus(transactionId, "completed");
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const reason = obj?.last_payment_error?.message || "payment_failed";
        if (transactionId) {
          await transactionRepository.updateStatus(transactionId, "failed", {
            failure_reason: reason,
          });
        }
        break;
      }
      case "charge.refunded": {
        const reason = "refunded";
        if (transactionId) {
          await transactionRepository.updateStatus(transactionId, "failed", {
            failure_reason: reason,
          });
        }
        break;
      }
      default: {
        // unsupported event type for now; noop
        break;
      }
    }

    if (shadow) {
      await shadowLogRepository.updateWithResponse(shadow.id, {
        response_payload: { handled: true, type: event.type },
        response_status_code: 200,
      });
    }

    return { handled: true, type: event.type };
  } catch (err) {
    if (shadow) {
      await shadowLogRepository.updateWithResponse(shadow.id, {
        response_payload: {},
        response_status_code: 500,
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

export default {
  createPaymentIntent,
  capturePayment,
  refundPayment,
  retrievePayment,
  handleWebhookEvent,
};
