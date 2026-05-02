/**
 * Core Domain Types
 * 
 * These are the fundamental data structures that AI agents will work with.
 * All other code builds on top of these types.
 */

import { z } from "zod";

// ============================================
// Transaction Domain
// ============================================

export const TransactionStatusSchema = z.enum([
  "queued",
  "pending",
  "requires_approval",
  "approved",
  "rejected",
  "processing",
  "completed",
  "failed",
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  reference_id: z.string(),
  account_id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  status: TransactionStatusSchema,
  requires_approval: z.boolean(),
  approved_by_user_id: z.string().uuid().nullable(),
  approval_timestamp: z.date().nullable(),
  rejection_reason: z.string().nullable(),
  failure_reason: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionRequestSchema = z.object({
  reference_id: z.string().min(1),
  account_id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
});
export type CreateTransactionRequest = z.infer<
  typeof CreateTransactionRequestSchema
>;

// ============================================
// Job Queue Domain (Async Processing)
// ============================================

export const JobQueueStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);
export type JobQueueStatus = z.infer<typeof JobQueueStatusSchema>;

export const JobTypeSchema = z.enum(["process_transaction"]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobQueueItemSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  job_type: JobTypeSchema,
  status: JobQueueStatusSchema,
  payload: z.record(z.any()),
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  available_at: z.date(),
  locked_at: z.date().nullable(),
  locked_by: z.string().nullable(),
  last_error: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type JobQueueItem = z.infer<typeof JobQueueItemSchema>;

export const CreateJobQueueItemRequestSchema = z.object({
  transaction_id: z.string().uuid(),
  job_type: JobTypeSchema,
  payload: z.record(z.any()).default({}),
  available_at: z.date().optional(),
  max_attempts: z.number().int().positive().optional(),
});
export type CreateJobQueueItemRequest = z.infer<
  typeof CreateJobQueueItemRequestSchema
>;

// ============================================
// Shadow Log Domain (The "Black Box")
// ============================================

export const ShadowLogSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  partner_name: z.string(),
  endpoint: z.string(),
  http_method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  request_payload: z.record(z.any()),
  response_payload: z.record(z.any()).nullable(),
  response_status_code: z.number().int().nullable(),
  error_message: z.string().nullable(),
  retry_count: z.number().int().nonnegative(),
  created_at: z.date(),
});
export type ShadowLog = z.infer<typeof ShadowLogSchema>;

export const CreateShadowLogRequestSchema = z.object({
  transaction_id: z.string().uuid(),
  partner_name: z.string(),
  endpoint: z.string(),
  http_method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  request_payload: z.record(z.any()),
});
export type CreateShadowLogRequest = z.infer<
  typeof CreateShadowLogRequestSchema
>;

// ============================================
// Verification Task Domain
// ============================================

export const DiscrepancyTypeSchema = z.enum([
  "zombie_transaction",
  "missing_reconciliation",
  "amount_mismatch",
  "timing_mismatch",
]);
export type DiscrepancyType = z.infer<typeof DiscrepancyTypeSchema>;

export const VerificationTaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "verified",
  "discrepancy_found",
]);
export type VerificationTaskStatus = z.infer<
  typeof VerificationTaskStatusSchema
>;

export const VerificationTaskSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  status: VerificationTaskStatusSchema,
  discrepancy_type: DiscrepancyTypeSchema.nullable(),
  assigned_to_user_id: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type VerificationTask = z.infer<typeof VerificationTaskSchema>;

// ============================================
// Circuit Breaker Domain
// ============================================

export const CircuitBreakerEventTypeSchema = z.enum([
  "duplicate_attempt",
  "threshold_exceeded",
]);
export type CircuitBreakerEventType = z.infer<
  typeof CircuitBreakerEventTypeSchema
>;

export const CircuitBreakerEventSchema = z.object({
  id: z.string().uuid(),
  mandate_id: z.string().uuid().nullable(),
  vendor_id: z.string().uuid(),
  event_type: CircuitBreakerEventTypeSchema,
  triggered_at: z.date(),
  resolved_at: z.date().nullable(),
});
export type CircuitBreakerEvent = z.infer<typeof CircuitBreakerEventSchema>;

// ============================================
// Account Domain
// ============================================

export const AccountTypeSchema = z.enum(["business", "escrow", "settlement"]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  account_type: AccountTypeSchema,
  balance_cents: z.number().int(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Account = z.infer<typeof AccountSchema>;

// ============================================
// Partner Domain (Door-Knocker Integration)
// ============================================

export const PartnerStatusSchema = z.enum([
  "discovery",      // Initial contact phase
  "negotiation",    // Discussing terms
  "onboarding",     // Waiting for API credentials
  "testing",        // Sandbox integration
  "live",           // Production active
  "suspended",      // Temporarily inactive
  "offboarded",     // Permanently removed
]);
export type PartnerStatus = z.infer<typeof PartnerStatusSchema>;

export const PartnerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  entity_type: z.enum(["bank", "payment_network", "clearing", "settlement"]),
  status: PartnerStatusSchema,
  
  // API Integration Details
  api_base_url: z.string().url(),
  api_key: z.string().min(1),           // Encrypted in database
  api_secret: z.string().min(1).nullable(),  // Encrypted if present
  api_version: z.string().default("v1"),
  
  // Contact Information
  primary_contact_name: z.string().max(255).nullable(),
  primary_contact_email: z.string().email().nullable(),
  primary_contact_phone: z.string().max(20).nullable(),
  
  // Integration Details
  rate_limit_per_minute: z.number().int().positive().default(1000),
  webhook_signing_key: z.string().nullable(),
  
  // Health & Monitoring
  last_health_check_at: z.date().nullable(),
  last_successful_transaction_at: z.date().nullable(),
  consecutive_failures: z.number().int().nonnegative().default(0),
  status_page_url: z.string().url().nullable(),
  
  // Metadata
  notes: z.string().nullable(),
  internal_owner_user_id: z.string().uuid().nullable(),  // Who "owns" this partnership
  created_at: z.date(),
  updated_at: z.date(),
});
export type Partner = z.infer<typeof PartnerSchema>;

export const CreatePartnerRequestSchema = z.object({
  name: z.string().min(1).max(255),
  entity_type: z.enum(["bank", "payment_network", "clearing", "settlement"]),
  status: PartnerStatusSchema.default("discovery"),
  api_base_url: z.string().url(),
  api_key: z.string().min(1),
  api_secret: z.string().min(1).optional(),
  api_version: z.string().default("v1"),
  primary_contact_name: z.string().max(255).optional(),
  primary_contact_email: z.string().email().optional(),
  primary_contact_phone: z.string().max(20).optional(),
  rate_limit_per_minute: z.number().int().positive().default(1000),
  webhook_signing_key: z.string().optional(),
  status_page_url: z.string().url().optional(),
  notes: z.string().optional(),
  internal_owner_user_id: z.string().uuid().optional(),
});
export type CreatePartnerRequest = z.infer<typeof CreatePartnerRequestSchema>;

export const UpdatePartnerRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: PartnerStatusSchema.optional(),
  api_base_url: z.string().url().optional(),
  api_key: z.string().min(1).optional(),
  api_secret: z.string().min(1).optional().nullable(),
  api_version: z.string().optional(),
  primary_contact_name: z.string().max(255).optional().nullable(),
  primary_contact_email: z.string().email().optional().nullable(),
  primary_contact_phone: z.string().max(20).optional().nullable(),
  rate_limit_per_minute: z.number().int().positive().optional(),
  webhook_signing_key: z.string().optional().nullable(),
  status_page_url: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  internal_owner_user_id: z.string().uuid().optional().nullable(),
});
export type UpdatePartnerRequest = z.infer<typeof UpdatePartnerRequestSchema>;

// ============================================
// Agentic Payment Domain (A2A + AMP Bridge)
// ============================================

export const AgentPrincipalTypeSchema = z.enum([
  "human",
  "app_agent",
  "merchant_agent",
  "service_agent",
]);
export type AgentPrincipalType = z.infer<typeof AgentPrincipalTypeSchema>;

export const AgentPrincipalSchema = z.object({
  principal_id: z.string().min(1),
  principal_type: AgentPrincipalTypeSchema,
  wallet_id: z.string().optional(),
  organization_id: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});
export type AgentPrincipal = z.infer<typeof AgentPrincipalSchema>;

export const DelegationStatusSchema = z.enum([
  "active",
  "revoked",
  "expired",
]);
export type DelegationStatus = z.infer<typeof DelegationStatusSchema>;

export const DelegationGrantSchema = z.object({
  id: z.string().uuid(),
  grantor_principal_id: z.string().min(1),
  grantee_principal_id: z.string().min(1),
  max_amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  allowed_merchant_ids: z.array(z.string().uuid()).default([]),
  allowed_categories: z.array(z.string().min(1)).default([]),
  valid_from: z.date(),
  valid_until: z.date(),
  status: DelegationStatusSchema,
  policy_version: z.string().default("v1"),
  revoked_at: z.date().nullable(),
  revocation_reason: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  created_at: z.date(),
  updated_at: z.date(),
});
export type DelegationGrant = z.infer<typeof DelegationGrantSchema>;

export const CreateDelegationGrantRequestSchema = z.object({
  grantor_principal_id: z.string().min(1),
  grantee_principal_id: z.string().min(1),
  max_amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  allowed_merchant_ids: z.array(z.string().uuid()).default([]),
  allowed_categories: z.array(z.string().min(1)).default([]),
  valid_from: z.date(),
  valid_until: z.date(),
  policy_version: z.string().default("v1"),
  metadata: z.record(z.any()).default({}),
});
export type CreateDelegationGrantRequest = z.infer<
  typeof CreateDelegationGrantRequestSchema
>;

export const DelegationRevocationSchema = z.object({
  id: z.string().uuid(),
  delegation_grant_id: z.string().uuid(),
  revoked_by_principal_id: z.string().min(1),
  reason: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  created_at: z.date(),
});
export type DelegationRevocation = z.infer<typeof DelegationRevocationSchema>;

export const CreateDelegationRevocationRequestSchema = z.object({
  delegation_grant_id: z.string().uuid(),
  revoked_by_principal_id: z.string().min(1),
  reason: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});
export type CreateDelegationRevocationRequest = z.infer<
  typeof CreateDelegationRevocationRequestSchema
>;

export const PaymentIntentStatusSchema = z.enum([
  "received",
  "authorized",
  "denied",
  "queued",
  "processing",
  "settled",
  "failed",
]);
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatusSchema>;

export const PaymentIntentSchema = z.object({
  id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  correlation_id: z.string().min(1),
  principal: AgentPrincipalSchema,
  delegation_grant_id: z.string().uuid().nullable(),
  reference_id: z.string().min(1),
  account_id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  category: z.string().min(1).optional(),
  status: PaymentIntentStatusSchema,
  denial_reason_code: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  created_at: z.date(),
  updated_at: z.date(),
});
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

export const CreatePaymentIntentRequestSchema = z.object({
  idempotency_key: z.string().min(1),
  correlation_id: z.string().min(1),
  principal: AgentPrincipalSchema,
  delegation_grant_id: z.string().uuid().optional(),
  reference_id: z.string().min(1),
  account_id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3),
  category: z.string().min(1).optional(),
  metadata: z.record(z.any()).default({}),
});
export type CreatePaymentIntentRequest = z.infer<
  typeof CreatePaymentIntentRequestSchema
>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason_code: z.string().min(1),
  delegation_grant_id: z.string().uuid().nullable(),
  evaluated_at: z.date(),
  evidence: z.record(z.any()).default({}),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ============================================
// Error Domain
// ============================================

export enum ErrorCode {
  // Validation errors
  INVALID_INPUT = "INVALID_INPUT",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
  PAYMENT_INTENT_IN_PROGRESS = "PAYMENT_INTENT_IN_PROGRESS",
  DELEGATION_POLICY_DENIED = "DELEGATION_POLICY_DENIED",

  // Transaction errors
  TRANSACTION_NOT_FOUND = "TRANSACTION_NOT_FOUND",
  DUPLICATE_TRANSACTION = "DUPLICATE_TRANSACTION",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",

  // Verification errors
  VERIFICATION_TASK_NOT_FOUND = "VERIFICATION_TASK_NOT_FOUND",

  // Partner errors
  PARTNER_NOT_FOUND = "PARTNER_NOT_FOUND",
  PARTNER_ALREADY_EXISTS = "PARTNER_ALREADY_EXISTS",
  PARTNER_INACTIVE = "PARTNER_INACTIVE",
  PARTNER_HEALTH_CHECK_FAILED = "PARTNER_HEALTH_CHECK_FAILED",

  // Partner API errors
  PARTNER_API_ERROR = "PARTNER_API_ERROR",
  PARTNER_API_TIMEOUT = "PARTNER_API_TIMEOUT",

  // Circuit breaker
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",

  // Database errors
  DATABASE_ERROR = "DATABASE_ERROR",

  // Internal errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class ApplicationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
