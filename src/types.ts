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
// Error Domain
// ============================================

export enum ErrorCode {
  // Validation errors
  INVALID_INPUT = "INVALID_INPUT",
  VALIDATION_FAILED = "VALIDATION_FAILED",

  // Transaction errors
  TRANSACTION_NOT_FOUND = "TRANSACTION_NOT_FOUND",
  DUPLICATE_TRANSACTION = "DUPLICATE_TRANSACTION",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",

  // Verification errors
  VERIFICATION_TASK_NOT_FOUND = "VERIFICATION_TASK_NOT_FOUND",

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
