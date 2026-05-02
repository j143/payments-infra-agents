export const schema = `
-- Payment intents for agent-originated requests
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  correlation_id VARCHAR(255) NOT NULL,
  request_fingerprint TEXT NOT NULL,
  payment_intent_payload JSONB NOT NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_payment_intent_status CHECK (status IN ('received', 'processing', 'queued', 'settled', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_correlation_id
  ON payment_intents(correlation_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_transaction_id
  ON payment_intents(transaction_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON payment_intents(status);
`;
