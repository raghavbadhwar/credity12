CREATE TABLE "palm_scan_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"embedding_hash" varchar(128) NOT NULL,
	"zk_commitment" varchar(128) NOT NULL,
	"encrypted_salt" jsonb NOT NULL,
	"enrollment_method" varchar(32) DEFAULT 'mobile_palm' NOT NULL,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"sybil_score" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"enrolled_at" timestamp DEFAULT now(),
	"deactivated_at" timestamp,
	CONSTRAINT "palm_scan_enrollments_zk_commitment_unique" UNIQUE("zk_commitment")
);
--> statement-breakpoint
CREATE TABLE "human_ids" (
	"id" serial PRIMARY KEY NOT NULL,
	"human_id_hash" varchar(128) NOT NULL,
	"user_id" integer NOT NULL,
	"palm_scan_id" integer NOT NULL,
	"zk_commitment" varchar(128) NOT NULL,
	"vc_jws" text NOT NULL,
	"ipfs_cid" varchar(128),
	"tx_hash" varchar(128),
	"chain_id" integer DEFAULT 80002 NOT NULL,
	"contract_address" varchar(64),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"metadata" jsonb,
	CONSTRAINT "human_ids_human_id_hash_unique" UNIQUE("human_id_hash")
);
--> statement-breakpoint
CREATE INDEX "palm_enrollments_user_idx" ON "palm_scan_enrollments" ("user_id");
--> statement-breakpoint
CREATE INDEX "human_ids_user_idx" ON "human_ids" ("user_id");
--> statement-breakpoint
CREATE INDEX "human_ids_commitment_idx" ON "human_ids" ("zk_commitment");
