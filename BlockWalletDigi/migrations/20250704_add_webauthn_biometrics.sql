-- Agent 3: WebAuthn Biometric Enrollment tables
-- Supports Fingerprint + Face ID paths to Human ID via FIDO2/WebAuthn

-- Challenge store (ephemeral, could also be cleaned with pg_cron)
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id SERIAL PRIMARY KEY,
  challenge_id VARCHAR(64) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  challenge TEXT NOT NULL,
  rp_id VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

-- Enrollment store (persistent, encrypted cred public keys)
CREATE TABLE IF NOT EXISTS webauthn_enrollments (
  id SERIAL PRIMARY KEY,
  enrollment_id VARCHAR(64) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  encrypted_credential_public_key TEXT NOT NULL,
  credential_public_key_hash VARCHAR(128) NOT NULL UNIQUE,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type VARCHAR(50) NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports JSONB NOT NULL DEFAULT '["internal"]',
  biometric_method VARCHAR(30) NOT NULL CHECK (biometric_method IN ('fingerprint', 'face_id', 'passkey_platform')),
  zk_commitment VARCHAR(128) NOT NULL UNIQUE,
  encrypted_salt TEXT NOT NULL,
  user_agent TEXT,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Lookup indexes
CREATE INDEX idx_webauthn_enrollments_user ON webauthn_enrollments(user_id);
CREATE INDEX idx_webauthn_enrollments_active ON webauthn_enrollments(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_webauthn_enrollments_zk ON webauthn_enrollments(zk_commitment);
CREATE INDEX idx_webauthn_enrollments_method ON webauthn_enrollments(user_id, biometric_method);

-- Cleanup job: delete expired challenges (run with pg_cron or application-level scheduler)
-- DELETE FROM webauthn_challenges WHERE expires_at < NOW();
