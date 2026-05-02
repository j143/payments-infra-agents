/**
 * Delegation Policy Service
 *
 * Evaluates whether a payment intent is authorized by an active delegation grant.
 */

import {
  CreatePaymentIntentRequest,
  DelegationGrant,
  DelegationRevocation,
  PolicyDecision,
} from "../types";
import { delegationGrantRepository } from "../db/repositories/delegation-grant.repository";
import { delegationRevocationRepository } from "../db/repositories/delegation-revocation.repository";

export interface DelegationPolicyDependencies {
  findDelegationGrantById(id: string): Promise<DelegationGrant | null>;
  findDelegationRevocationByGrantId(
    delegationGrantId: string
  ): Promise<DelegationRevocation | null>;
}

export interface DelegationPolicyEvaluationOptions {
  now?: Date;
  revocation?: DelegationRevocation | null;
}

const defaultDependencies: DelegationPolicyDependencies = {
  findDelegationGrantById(id: string) {
    return delegationGrantRepository.findById(id);
  },
  findDelegationRevocationByGrantId(delegationGrantId: string) {
    return delegationRevocationRepository.findByGrantId(delegationGrantId);
  },
};

function buildDecision(
  allowed: boolean,
  reasonCode: string,
  delegationGrantId: string | null,
  evaluatedAt: Date,
  evidence: Record<string, unknown>
): PolicyDecision {
  return {
    allowed,
    reason_code: reasonCode,
    delegation_grant_id: delegationGrantId,
    evaluated_at: evaluatedAt,
    evidence,
  };
}

export function evaluateDelegationPolicyAgainstGrant(
  request: CreatePaymentIntentRequest,
  grant: DelegationGrant,
  options: DelegationPolicyEvaluationOptions = {}
): PolicyDecision {
  const evaluatedAt = options.now ?? new Date();
  const revocation = options.revocation ?? null;
  const evidence = {
    request_principal_id: request.principal.principal_id,
    grant_grantee_principal_id: grant.grantee_principal_id,
    grant_status: grant.status,
    request_amount_cents: request.amount_cents,
    grant_max_amount_cents: grant.max_amount_cents,
    request_currency: request.currency,
    grant_currency: grant.currency,
    request_merchant_id: request.merchant_id,
    allowed_merchant_ids: grant.allowed_merchant_ids,
    request_category: request.category ?? null,
    allowed_categories: grant.allowed_categories,
    valid_from: grant.valid_from,
    valid_until: grant.valid_until,
    revoked: Boolean(revocation),
  };

  if (revocation || grant.status === "revoked") {
    return buildDecision(
      false,
      "delegation_grant_revoked",
      grant.id,
      evaluatedAt,
      {
        ...evidence,
        revocation,
      }
    );
  }

  if (grant.status === "expired" || evaluatedAt > grant.valid_until) {
    return buildDecision(
      false,
      "delegation_grant_expired",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (evaluatedAt < grant.valid_from) {
    return buildDecision(
      false,
      "delegation_grant_not_yet_valid",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (grant.status !== "active") {
    return buildDecision(
      false,
      "delegation_grant_inactive",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (grant.grantee_principal_id !== request.principal.principal_id) {
    return buildDecision(
      false,
      "delegation_principal_mismatch",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (request.amount_cents > grant.max_amount_cents) {
    return buildDecision(
      false,
      "delegation_amount_exceeded",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (request.currency.toUpperCase() !== grant.currency.toUpperCase()) {
    return buildDecision(
      false,
      "delegation_currency_mismatch",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (
    grant.allowed_merchant_ids.length > 0 &&
    !grant.allowed_merchant_ids.includes(request.merchant_id)
  ) {
    return buildDecision(
      false,
      "delegation_merchant_not_allowed",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  if (
    grant.allowed_categories.length > 0 &&
    (!request.category || !grant.allowed_categories.includes(request.category))
  ) {
    return buildDecision(
      false,
      "delegation_category_not_allowed",
      grant.id,
      evaluatedAt,
      evidence
    );
  }

  return buildDecision(true, "delegation_grant_allowed", grant.id, evaluatedAt, {
    ...evidence,
    matched_grant_id: grant.id,
  });
}

export function createDelegationPolicyService(
  dependencies: DelegationPolicyDependencies = defaultDependencies
) {
  return {
    async decideDelegationPolicy(
      request: CreatePaymentIntentRequest,
      now: Date = new Date()
    ): Promise<PolicyDecision> {
      if (!request.delegation_grant_id) {
        return buildDecision(false, "delegation_grant_required", null, now, {
          request_principal_id: request.principal.principal_id,
          request_amount_cents: request.amount_cents,
          request_currency: request.currency,
          request_merchant_id: request.merchant_id,
          request_category: request.category ?? null,
        });
      }

      const grant = await dependencies.findDelegationGrantById(
        request.delegation_grant_id
      );

      if (!grant) {
        return buildDecision(false, "delegation_grant_not_found", null, now, {
          delegation_grant_id: request.delegation_grant_id,
          request_principal_id: request.principal.principal_id,
        });
      }

      const revocation = await dependencies.findDelegationRevocationByGrantId(
        grant.id
      );

      return evaluateDelegationPolicyAgainstGrant(request, grant, {
        now,
        revocation,
      });
    },
  };
}

export const delegationPolicyService = createDelegationPolicyService();