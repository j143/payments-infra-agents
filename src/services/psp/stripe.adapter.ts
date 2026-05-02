/**
 * Stripe PSP Adapter (scaffold)
 *
 * Minimal adapter surface for creating/capturing/refunding payments
 * and for handling webhook events. Expand per `docs/stripe-integration-plan.md`.
 */

import Stripe from "stripe";

const apiKey = process.env.STRIPE_API_KEY || "";
const stripe = apiKey ? new Stripe(apiKey, { apiVersion: "2024-11-08" }) : null;

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
  // TODO: map Stripe events to internal domain events and persist to audit_trail
  // This is a scaffold that should be expanded with transaction/ledger updates.
  switch (event.type) {
    case "payment_intent.succeeded":
      // handle success
      break;
    case "payment_intent.payment_failed":
      // handle failure
      break;
    case "charge.refunded":
      // handle refunded
      break;
    default:
      // noop for now
      break;
  }

  return { handled: true, type: event.type };
}

export default {
  createPaymentIntent,
  capturePayment,
  refundPayment,
  retrievePayment,
  handleWebhookEvent,
};
