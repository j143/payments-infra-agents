# ADR 0001: A2A Interoperability + AMP-Style Payment Trust Boundary

## Status
Accepted

## Date
2026-05-02

## Context
The system currently provides payment orchestration primitives:
- transaction intake and approval gating,
- async queue and worker execution,
- partner API invocation with shadow logging,
- reconciliation and circuit breaker controls.

The next roadmap requires support for both:
- A2A-style agent interoperability (communication and request exchange), and
- AMP-style payment trust and settlement controls (delegation, policy, and auditability).

These concerns must be integrated without allowing protocol-level communication to bypass payment safety and compliance checks.

## Decision
Adopt a dual-layer protocol architecture with explicit boundaries:

1. Interoperability Layer (A2A Adapter)
- Purpose: handle agent-originated requests and interoperability concerns.
- Responsibilities: normalize payloads, validate contract shape, attach idempotency/correlation metadata.
- Non-responsibilities: direct settlement authorization.

2. Payment Trust Layer (AMP-Style Policy)
- Purpose: evaluate whether a payment intent is authorized.
- Responsibilities: validate delegation grants, enforce policy scopes/limits/time windows, produce allow or deny decisions.
- Non-responsibilities: partner network communication.

3. Settlement Execution Layer (Existing Core)
- Purpose: perform payment execution and reliability workflows.
- Responsibilities: queueing, retries, partner API calls, reconciliation, circuit breaker, lifecycle state updates.
- Non-responsibilities: interpreting external agent protocol semantics.

Mandatory invariant:
- No agent request can enqueue or execute settlement work unless the payment trust layer returns allow.

## Canonical Domain Contracts
The implementation will introduce canonical models used across both frameworks:
- AgentPrincipal: who initiates or requests the action.
- DelegationGrant: what authority is delegated, by whom, and under what constraints.
- PaymentIntent: requested payment operation and context.
- PolicyDecision: allow or deny with reason code and evidence references.

## Security and Risk Constraints
- Deny by default when delegation is absent, expired, revoked, or out of scope.
- Require idempotency key on agent-originated payment requests.
- Preserve end-to-end correlation ID for traceability.
- Record decision evidence that links request -> policy decision -> settlement outcome.

## Consequences
Positive:
- Clear separation of concerns between communication protocol and payment authorization.
- Compatible with multiple external agent protocols while keeping payment controls centralized.
- Auditable control surface for operations and regulatory inquiries.

Tradeoffs:
- Additional service and data model complexity.
- Requires schema/version discipline across boundaries.

## Implementation Notes
- Related roadmap: AGENTIC_FRAMEWORKS_EXECUTION_PLAN.md
- Related issue: https://github.com/j143/payments-infra-agents/issues/1
- Next issue after this ADR: https://github.com/j143/payments-infra-agents/issues/2
