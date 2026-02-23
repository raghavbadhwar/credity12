-- Migration: 0003_biometric_device_keys
-- Adds the biometric_device_keys table used by the stamp-fallback auth (Agent 3)
-- Each row binds a (user_id, device_id) pair to an AES-256-GCM encrypted device secret.
-- The secret is used to verify HMAC stamps when a Bearer JWT is unavailable (cold-start re-enrollment).

CREATE TABLE IF NOT EXISTS "biometric_device_keys" (
  "id"                SERIAL        PRIMARY KEY,
  "user_id"           INTEGER       NOT NULL,
  "device_id"         VARCHAR(128)  NOT NULL,
  "device_secret_enc" JSONB         NOT NULL,  -- { ciphertext, iv, authTag } (AES-256-GCM)
  "created_at"        TIMESTAMP     DEFAULT NOW(),
  "last_used_at"      TIMESTAMP,
  "revoked_at"        TIMESTAMP,
  CONSTRAINT "biometric_device_keys_user_device_unique" UNIQUE ("user_id", "device_id")
);

CREATE INDEX IF NOT EXISTS "biometric_device_keys_user_idx"
  ON "biometric_device_keys" ("user_id");
