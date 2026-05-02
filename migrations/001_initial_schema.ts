/**
 * Database Schema Migration
 * Phase 1: The Plumbing
 * 
 * This creates the core tables for:
 * - Transaction ledger (DEBIT/CREDIT)
 * - Shadow logs (raw Partner API requests/responses)
 * - Human verification queue
 * - Mandate rules (Phase 3+)
 */

export const schema = `
-- Transactions Table (Core Ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Ledger entries
  account_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
  
  -- Status flow
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- pending -> requires_approval (if >$500) -> approved/rejected -> processing -> completed/failed
  
  -- Human-in-the-loop
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by_user_id UUID,
  approval_timestamp TIMESTAMP,
  rejection_reason TEXT,
  
  -- Audit trail
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_amount CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_requires_approval ON transactions(requires_approval);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Shadow Ledger (the "Black Box")
-- Every partner API call is logged here BEFORE processing
CREATE TABLE IF NOT EXISTS shadow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  
  -- API call metadata
  partner_name VARCHAR(100) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  
  -- Raw request/response (BLOB)
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  response_status_code INT,
  
  -- Error handling
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_retry_count CHECK (retry_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shadow_logs_transaction ON shadow_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_partner ON shadow_logs(partner_name);
CREATE INDEX IF NOT EXISTS idx_shadow_logs_error ON shadow_logs(error_message) WHERE error_message IS NOT NULL;

-- Verification Queue (Manual reconciliation)
CREATE TABLE IF NOT EXISTS verification_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  
  -- Task state
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- pending -> in_progress -> verified/discrepancy_found
  
  -- Discrepancy tracking
  discrepancy_type VARCHAR(100),
  -- zombie_transaction: money left bank, didn't update app
  -- missing_reconciliation: record in DB but not in bank CSV
  -- amount_mismatch: different amounts
  -- timing_mismatch: timestamp discrepancy
  
  assigned_to_user_id UUID,
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tasks_transaction ON verification_tasks(transaction_id);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_status ON verification_tasks(status);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_assigned ON verification_tasks(assigned_to_user_id);

-- Accounts (simplified for Phase 1)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  -- "business", "escrow", etc.
  
  balance_cents BIGINT NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_merchant ON accounts(merchant_id);

-- Circuit Breaker (Fraud detection basics)
-- Prevents duplicate payments to same vendor in short window
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID,
  vendor_id UUID NOT NULL,
  
  event_type VARCHAR(50) NOT NULL,
  -- "duplicate_attempt", "threshold_exceeded"
  
  triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_vendor ON circuit_breaker_events(vendor_id);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_resolved ON circuit_breaker_events(resolved_at) WHERE resolved_at IS NULL;
`;
