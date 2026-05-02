# Stripe Integration Implementation Plan

## Summary
Add a first-class PSP integration for Stripe covering: adapter/SDK layer, secure webhooks, idempotency, retries, reconciliation, dispute handling, testing (sandbox and integration tests), and rollout documentation.

## Goals
- Accept authorizations and captures from Stripe
- Process webhooks reliably and idempotently
- Provide reconciliation mappings and dispute handling flows
- Provide developer-facing docs and sandbox tests

## High-level tasks
1. Adapter scaffold
   - `src/services/psp/stripe.adapter.ts` exposes: `createPaymentIntent`, `capturePayment`, `refundPayment`, `retrievePayment`, `handleWebhookEvent`
   - Use official `stripe` npm package (add to `package.json` if missing)
2. Webhook handling
   - Route: `src/api/routes/webhooks/stripe.ts` mounted at `/api/webhooks/stripe`
   - Signature verification using `STRIPE_WEBHOOK_SECRET`
   - Validate and map events to internal `verification-task` / `transaction` flows
   - Persist raw event into `shadow_log` and `audit_trail` for compliance evidence
3. Idempotency & retries
   - Use Stripe idempotency keys for outgoing requests
   - Ensure incoming webhook handling is idempotent (dedupe by `event.id`) and uses DB transactions/outbox when mutating state
4. Transaction service changes
   - Add hooks in `transaction.service.ts` to call `stripe.adapter` for payments
   - Add idempotency and compensating actions for failures (refund/void)
5. Testing
   - Add `tests/integration/stripe` E2E tests using Stripe test keys and webhook signing
   - Use `stripe listen` or `stripe-mock` approaches in CI where feasible
6. Reconciliation & disputes
   - Map Stripe charge/settlement IDs to internal `transactions` and `ledger` entries
   - Create a reconciliation job to match Stripe payouts to internal settlements
   - Implement dispute lifecycle handling and update `audit_trail` and `shadow_log`
7. Security & secrets
   - Use `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_SIGNING_VERSION` in env
   - Rotate keys and document HSM/secret storage requirements
8. Observability & Docs
   - Add logs, metrics, and traces around adapter calls
   - Document integration steps in `docs/stripe-integration-plan.md` and `README.md`

## Environment variables
- `STRIPE_API_KEY` (secret)
- `STRIPE_WEBHOOK_SECRET` (secret)
- `STRIPE_ACCOUNT_ID` (optional, for Connect)

## Milestones (suggested)
- M1: Adapter scaffold + basic create/capture flows (local unit tests)
- M2: Webhook route + signature verification + idempotency (integration tests)
- M3: Reconciliation & dispute flows + docs
- M4: Production rollout checklist + secrets + monitoring

## Acceptance criteria
- Tests demonstrating successful auth → capture → settlement flows in sandbox
- Webhook events are verified and processed idempotently
- Reconciliation job can match a sample payout to transactions
- Audit trail records webhook payloads for compliance

## Quick commands (local)

Install Stripe SDK:

```bash
cd /workspaces/payments-infra-agents
npm install stripe
```

Run tests (specific to Stripe tests later):

```bash
npm test -- tests/integration/stripe
```

---

Created by automation to start the Stripe integration work.
