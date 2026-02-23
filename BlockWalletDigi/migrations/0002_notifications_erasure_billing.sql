ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "razorpay_order_id" text,
  ADD COLUMN IF NOT EXISTS "razorpay_payment_id" text;

CREATE TABLE IF NOT EXISTS "device_push_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "token" text NOT NULL,
  "device_type" varchar(20) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "device_push_tokens_token_unique" UNIQUE ("token")
);

CREATE INDEX IF NOT EXISTS "device_push_tokens_user_idx" ON "device_push_tokens" ("user_id");

CREATE TABLE IF NOT EXISTS "erasure_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hashed_user_ref" text NOT NULL,
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp NOT NULL DEFAULT now(),
  "fields_erased" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reason" text,
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "erasure_audit_log_hashed_user_ref_idx" ON "erasure_audit_log" ("hashed_user_ref");
