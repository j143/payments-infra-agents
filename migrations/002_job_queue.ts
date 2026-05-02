export const schema = `
-- Job queue for async transaction processing
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  job_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMP NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMP,
  locked_by VARCHAR(255),
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_attempts CHECK (attempts >= 0),
  CONSTRAINT valid_max_attempts CHECK (max_attempts > 0)
);

CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_available_at ON job_queue(available_at);
CREATE INDEX idx_job_queue_transaction ON job_queue(transaction_id);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;
`;