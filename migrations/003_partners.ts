export const schema = `
-- Partners table (Door-Knocker Integration)
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  entity_type VARCHAR(50) NOT NULL,
  
  -- Status in the onboarding pipeline
  status VARCHAR(50) NOT NULL DEFAULT 'discovery',
  
  -- API Integration Details
  api_base_url VARCHAR(2048) NOT NULL,
  api_key TEXT NOT NULL,  -- Should be encrypted at rest
  api_secret TEXT,        -- Should be encrypted at rest
  api_version VARCHAR(50) DEFAULT 'v1',
  
  -- Contact Information
  primary_contact_name VARCHAR(255),
  primary_contact_email VARCHAR(255),
  primary_contact_phone VARCHAR(20),
  
  -- API Rate Limiting
  rate_limit_per_minute INT DEFAULT 1000,
  
  -- Webhook Security
  webhook_signing_key TEXT,
  
  -- Health & Monitoring
  last_health_check_at TIMESTAMP,
  last_successful_transaction_at TIMESTAMP,
  consecutive_failures INT DEFAULT 0,
  status_page_url VARCHAR(2048),
  
  -- Metadata & Ownership
  notes TEXT,
  internal_owner_user_id UUID,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('discovery', 'negotiation', 'onboarding', 'testing', 'live', 'suspended', 'offboarded')),
  CONSTRAINT valid_entity_type CHECK (entity_type IN ('bank', 'payment_network', 'clearing', 'settlement')),
  CONSTRAINT valid_rate_limit CHECK (rate_limit_per_minute > 0),
  CONSTRAINT valid_consecutive_failures CHECK (consecutive_failures >= 0)
);

-- Indices for common queries
CREATE INDEX idx_partners_status ON partners(status);
CREATE INDEX idx_partners_entity_type ON partners(entity_type);
CREATE INDEX idx_partners_internal_owner ON partners(internal_owner_user_id);
CREATE INDEX idx_partners_last_health_check ON partners(last_health_check_at);
CREATE INDEX idx_partners_consecutive_failures ON partners(consecutive_failures);
`;
