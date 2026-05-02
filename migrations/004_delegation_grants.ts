export const schema = `
-- Delegation grants for agent-authorized payments
CREATE TABLE IF NOT EXISTS delegation_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_principal_id VARCHAR(255) NOT NULL,
  grantee_principal_id VARCHAR(255) NOT NULL,
  max_amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  allowed_merchant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  policy_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  revoked_at TIMESTAMP,
  revocation_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_delegation_amount CHECK (max_amount_cents > 0),
  CONSTRAINT valid_delegation_status CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT valid_delegation_window CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_delegation_grants_grantee
  ON delegation_grants(grantee_principal_id);

CREATE INDEX IF NOT EXISTS idx_delegation_grants_grantor
  ON delegation_grants(grantor_principal_id);

CREATE INDEX IF NOT EXISTS idx_delegation_grants_status
  ON delegation_grants(status);

CREATE INDEX IF NOT EXISTS idx_delegation_grants_validity
  ON delegation_grants(valid_from, valid_until);

-- Revocation events for delegation grants
CREATE TABLE IF NOT EXISTS delegation_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_grant_id UUID NOT NULL REFERENCES delegation_grants(id) ON DELETE CASCADE,
  revoked_by_principal_id VARCHAR(255) NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT one_revocation_per_grant UNIQUE (delegation_grant_id)
);

CREATE INDEX IF NOT EXISTS idx_delegation_revocations_grant
  ON delegation_revocations(delegation_grant_id);

CREATE INDEX IF NOT EXISTS idx_delegation_revocations_principal
  ON delegation_revocations(revoked_by_principal_id);
`;
