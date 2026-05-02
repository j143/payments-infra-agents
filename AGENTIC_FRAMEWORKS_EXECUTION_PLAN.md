# Google A2A + Ant AMP Integration Execution Plan

## Goal
Build a dual-layer architecture where:
- Google A2A-style interfaces handle agent interoperability.
- Ant AMP-style controls handle payment delegation, policy, and settlement safeguards.
- Existing payment orchestration continues to execute money movement reliably.

## Execution Status
- In progress: Issue #1 (ADR boundary definition)
- Next up: Issue #2 (canonical domain types)

## Current Baseline (Already Implemented)
- Transaction intake, approval flow, and async worker execution.
- Partner API adapter with shadow logging.
- Circuit breaker and verification task workflows.
- Partner onboarding and health-check lifecycle.

## Target Architecture
1. Interoperability Layer (A2A Adapter)
- Agent-facing ingress and request normalization.
- Capability registration and negotiation scaffolding.
- Correlation and idempotency propagation.

2. Payment Trust Layer (AMP-Style Delegation)
- Delegation grants (who can pay, how much, where, when).
- Policy decision point before queueing settlement jobs.
- Revocation checks and deny-by-default behavior.

3. Settlement Execution Layer (Existing Core)
- Queue, worker, retries, partner API calls, reconciliation.
- Extended lifecycle states for intent -> authorization -> settlement.

4. Control Plane
- Audit evidence chain from agent request to settlement outcome.
- Operational metrics, failure playbooks, and compliance exports.

## Delivery Phases

### Phase 1: Foundations
- Canonical schemas for Agent Principal, Delegation Grant, Payment Intent.
- Architecture decision record for A2A + AMP boundary.
- Threat model for replay, impersonation, and unauthorized delegation.

Exit criteria:
- Shared schema package compiles and validates inputs.
- Endpoint contracts are documented and testable.

### Phase 2: A2A Adapter
- Add API surface for agent-originated payment intents.
- Translate A2A-style payloads into canonical internal intent objects.
- Add strict idempotency key + correlation ID handling.

Exit criteria:
- Integration test proves request -> normalized intent -> response path.
- Duplicate request replay does not create duplicate transactions.

### Phase 3: Delegation and Policy Engine
- Add persistence for delegation grants and revocations.
- Enforce policy checks before enqueueing transaction jobs.
- Add reasoned denial responses and audit records.

Exit criteria:
- Unauthorized or out-of-scope intents are denied.
- Allowed intents continue into normal queue flow.

### Phase 4: Settlement Extensions
- Add settlement instruction and outcome mapping.
- Add micro-payment mode flags (batch/netting-ready hooks).
- Normalize partner acknowledgments into internal lifecycle events.

Exit criteria:
- End-to-end tests validate canonical lifecycle transitions.
- Settlement outcomes are queryable and auditable.

### Phase 5: Compliance and Operability
- Tamper-evident event trail linking request, policy decision, and partner response.
- Dashboards/queries for regulator and operations review.
- Failure-mode runbooks (timeouts, retries, revocations-in-flight).

Exit criteria:
- Audit report can explain why a payment was allowed/denied.
- On-call can reconstruct a full transaction timeline quickly.

## Proposed GitHub Issue Sequence
1. #1 ADR: Define A2A and AMP boundary with canonical payment intent model.
2. #2 Add canonical domain types: AgentPrincipal, DelegationGrant, PaymentIntent.
3. #3 Create migrations and repositories for delegation grants and revocations.
4. #4 Add A2A adapter API route with request validation.
5. #5 Implement idempotency and correlation handling for A2A flow.
6. #6 Implement delegation policy decision service.
7. #7 Wire policy gate into transaction creation and queueing path.
8. #8 Add settlement outcome model and lifecycle mapping.
9. #9 Add end-to-end tests for allow, deny, and replay scenarios.
10. #10 Add observability and compliance evidence endpoints.

## Issue Links
- #1 https://github.com/j143/payments-infra-agents/issues/1
- #2 https://github.com/j143/payments-infra-agents/issues/2
- #3 https://github.com/j143/payments-infra-agents/issues/3
- #4 https://github.com/j143/payments-infra-agents/issues/4
- #5 https://github.com/j143/payments-infra-agents/issues/5
- #6 https://github.com/j143/payments-infra-agents/issues/6
- #7 https://github.com/j143/payments-infra-agents/issues/7
- #8 https://github.com/j143/payments-infra-agents/issues/8
- #9 https://github.com/j143/payments-infra-agents/issues/9
- #10 https://github.com/j143/payments-infra-agents/issues/10

## Working Mode
- Execute one issue at a time, smallest vertical slice first.
- Merge behind feature flags where behavior could affect current APIs.
- Keep human approval controls intact during all phases.
