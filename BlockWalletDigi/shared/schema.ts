import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  decimal,
  varchar,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  did: text("did"),
  name: text("name"),
  email: text("email"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  phoneNumber: text("phone_number"),
  phoneVerified: boolean("phone_verified").default(false),
  emailVerified: boolean("email_verified").default(false),
});

export const credentials = pgTable("credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // Foreign key to users
  type: jsonb("type").notNull(), // Array of types, e.g., ["VerifiableCredential", "UniversityDegree"]
  issuer: text("issuer").notNull(),
  issuanceDate: timestamp("issuance_date").notNull(),
  data: jsonb("data").notNull(), // The credential subject data
  jwt: text("jwt"), // The raw VC-JWT
  isArchived: boolean("is_archived").default(false),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // "receive", "share", "connect"
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  identifier: text("identifier").notNull(), // email or phone number
  code: text("code").notNull(), // bcrypt-hashed 6-digit code
  purpose: varchar("purpose", { length: 30 }).notNull(), // email_verify | phone_verify | password_reset
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deviceFingerprints = pgTable("device_fingerprints", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
});

// Claims table - PRD v3.1 Feature 2
export const claims = pgTable("claims", {
  id: serial("id").primaryKey(),
  claimantUserId: integer("claimant_user_id").notNull(),
  platformId: varchar("platform_id", { length: 255 }),
  claimType: varchar("claim_type", { length: 50 }), // insurance_auto, refund_request, age_verification
  claimAmount: decimal("claim_amount", { precision: 12, scale: 2 }),
  description: text("description"),
  timeline: jsonb("timeline"), // Array of {event, time, location}
  evidenceIds: jsonb("evidence_ids"), // Array of evidence IDs
  identityScore: integer("identity_score"),
  integrityScore: integer("integrity_score"),
  authenticityScore: integer("authenticity_score"),
  trustScore: integer("trust_score"),
  recommendation: varchar("recommendation", { length: 20 }), // approve, review, investigate, reject
  redFlags: jsonb("red_flags"),
  aiAnalysis: jsonb("ai_analysis"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Evidence table - PRD v3.1 Layer 3
export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  claimId: integer("claim_id"),
  mediaType: varchar("media_type", { length: 20 }), // image, video, document
  storageUrl: text("storage_url"),
  authenticityScore: integer("authenticity_score"),
  isAiGenerated: boolean("is_ai_generated"),
  manipulationDetected: boolean("manipulation_detected"),
  metadata: jsonb("metadata"), // EXIF data
  blockchainHash: varchar("blockchain_hash", { length: 66 }),
  analysisData: jsonb("analysis_data"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  analyzedAt: timestamp("analyzed_at"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  did: true,
  name: true,
  email: true,
  bio: true,
  avatarUrl: true,
  phoneNumber: true,
  phoneVerified: true,
  emailVerified: true,
});

export const insertCredentialSchema = createInsertSchema(credentials).pick({
  userId: true,
  type: true,
  issuer: true,
  issuanceDate: true,
  data: true,
  jwt: true,
  isArchived: true,
});

export const insertActivitySchema = createInsertSchema(activities).pick({
  userId: true,
  type: true,
  description: true,
});

export const insertClaimSchema = createInsertSchema(claims).pick({
  claimantUserId: true,
  platformId: true,
  claimType: true,
  claimAmount: true,
  description: true,
  timeline: true,
  evidenceIds: true,
});

export const insertEvidenceSchema = createInsertSchema(evidence).pick({
  userId: true,
  claimId: true,
  mediaType: true,
  storageUrl: true,
  metadata: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Credential = typeof credentials.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidence.$inferSelect;

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

export type DeviceFingerprint = typeof deviceFingerprints.$inferSelect;
export type InsertDeviceFingerprint = typeof deviceFingerprints.$inferInsert;

// ── Billing tables (Agent 6 — PRD §16.3, §16.4, §22.x) ────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  plan: varchar("plan", { length: 50 }).notNull(),
  // "safedate_premium" | "workscore_pro" | "gig_pro" | "smb_employer" | "free"
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // "active" | "cancelled" | "past_due" | "trialing"
  razorpaySubscriptionId: text("razorpay_subscription_id").unique(),
  razorpayCustomerId: text("razorpay_customer_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const apiUsage = pgTable("api_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  platformApiKey: text("platform_api_key"), // for platform (B2B) usage
  endpoint: text("endpoint").notNull(),
  month: varchar("month", { length: 7 }).notNull(), // "2026-02"
  count: integer("count").notNull().default(0),
  lastRecordedAt: timestamp("last_recorded_at").defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).pick({
  userId: true,
  plan: true,
  status: true,
  razorpaySubscriptionId: true,
  razorpayCustomerId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).pick({
  userId: true,
  platformApiKey: true,
  endpoint: true,
  month: true,
  count: true,
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = typeof apiUsage.$inferInsert;

export const devicePushTokens = pgTable("device_push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  deviceType: varchar("device_type", { length: 20 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const erasureAuditLog = pgTable("erasure_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  hashedUserRef: text("hashed_user_ref").notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
  fieldsErased: jsonb("fields_erased").notNull().default([]),
  reason: text("reason"),
  metadata: jsonb("metadata"),
});

export type DevicePushToken = typeof devicePushTokens.$inferSelect;
export type InsertDevicePushToken = typeof devicePushTokens.$inferInsert;

export type ErasureAuditEntry = typeof erasureAuditLog.$inferSelect;
export type InsertErasureAuditEntry = typeof erasureAuditLog.$inferInsert;

// ── Platform OAuth connections (Agent 5 — PRD §5.7, §5.8) ─────────────────────

export const platformConnections = pgTable("platform_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  platformId: varchar("platform_id", { length: 100 }).notNull(), // "uber" | "linkedin" | "swiggy"
  platformName: text("platform_name").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending|active|revoked
  oauthAccessToken: text("oauth_access_token"), // encrypted
  oauthRefreshToken: text("oauth_refresh_token"), // encrypted
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PlatformConnection = typeof platformConnections.$inferSelect;
export type InsertPlatformConnection = typeof platformConnections.$inferInsert;

// ── Reputation tables (Agent 3 — PRD §3.3, §7.6, §17.3) ───────────────────────

export const reputationEvents = pgTable("reputation_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  eventId: text("event_id").notNull().unique(), // SHA-256 hash (dedup key)
  platform: text("platform").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // identity/collaboration/etc
  signalType: text("signal_type").notNull(),
  score: integer("score").notNull(), // 0 to 100
  weight: integer("weight").notNull(),
  decayFactor: decimal("decay_factor", { precision: 5, scale: 4 }),
  metadata: jsonb("metadata"),
  eventDate: timestamp("event_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reputationScores = pgTable("reputation_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(), // one row per user
  rawScore: integer("raw_score").notNull().default(500),
  normalizedScore: integer("normalized_score").notNull().default(500),
  categoryBreakdown: jsonb("category_breakdown"), // { identity: 120, collaboration: 80, ... }
  eventCount: integer("event_count").notNull().default(0),
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const safeDateScores = pgTable("safedate_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(), // one row per user
  score: integer("score").notNull().default(50), // 0-100
  trustLevel: varchar("trust_level", { length: 20 }),
  inputs: jsonb("inputs"), // raw SafeDate factor inputs
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export type ReputationEvent = typeof reputationEvents.$inferSelect;
export type NewReputationEvent = typeof reputationEvents.$inferInsert;

export type ReputationScore = typeof reputationScores.$inferSelect;
export type NewReputationScore = typeof reputationScores.$inferInsert;

export type SafeDateScore = typeof safeDateScores.$inferSelect;
export type NewSafeDateScore = typeof safeDateScores.$inferInsert;

// ---------------------------------------------------------------------------
// Palm Biometric Enrollments
// ---------------------------------------------------------------------------

export const palmScanEnrollments = pgTable("palm_scan_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  embeddingHash: varchar("embedding_hash", { length: 128 }).notNull(),
  zkCommitment: varchar("zk_commitment", { length: 128 }).notNull().unique(),
  encryptedSalt: jsonb("encrypted_salt").notNull(), // { ciphertext, iv, authTag }
  enrollmentMethod: varchar("enrollment_method", { length: 32 }).notNull().default("mobile_palm"),
  qualityScore: integer("quality_score").notNull().default(0),
  sybilScore: integer("sybil_score").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  deactivatedAt: timestamp("deactivated_at"),
});

export type PalmScanEnrollment = typeof palmScanEnrollments.$inferSelect;
export type NewPalmScanEnrollment = typeof palmScanEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// Human IDs
// ---------------------------------------------------------------------------

export const humanIds = pgTable("human_ids", {
  id: serial("id").primaryKey(),
  humanIdHash: varchar("human_id_hash", { length: 128 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  palmScanId: integer("palm_scan_id").notNull(),
  zkCommitment: varchar("zk_commitment", { length: 128 }).notNull(),
  vcJws: text("vc_jws").notNull(),
  ipfsCid: varchar("ipfs_cid", { length: 128 }),
  txHash: varchar("tx_hash", { length: 128 }),
  chainId: integer("chain_id").notNull().default(80002),
  contractAddress: varchar("contract_address", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  issuedAt: timestamp("issued_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  metadata: jsonb("metadata"),
});

export type HumanId = typeof humanIds.$inferSelect;
export type NewHumanId = typeof humanIds.$inferInsert;

// ---------------------------------------------------------------------------
// WebAuthn Biometric Challenges  (Agent 3)
// ---------------------------------------------------------------------------

export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: serial("id").primaryKey(),
  challengeId: varchar("challenge_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  challenge: text("challenge").notNull(),
  rpId: varchar("rp_id", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'registration' | 'authentication'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type WebAuthnChallenge = typeof webauthnChallenges.$inferSelect;
export type NewWebAuthnChallenge = typeof webauthnChallenges.$inferInsert;

// ---------------------------------------------------------------------------
// WebAuthn Biometric Enrollments  (Agent 3)
// ---------------------------------------------------------------------------

export const webauthnEnrollments = pgTable("webauthn_enrollments", {
  id: serial("id").primaryKey(),
  enrollmentId: varchar("enrollment_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  credentialId: varchar("credential_id", { length: 512 }).notNull().unique(),
  encryptedCredentialPublicKey: text("encrypted_credential_public_key").notNull(),
  credentialPublicKeyHash: varchar("credential_public_key_hash", { length: 128 }).notNull().unique(),
  counter: integer("counter").notNull().default(0),
  deviceType: varchar("device_type", { length: 50 }).notNull(),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: jsonb("transports").notNull().default(["internal"]),
  biometricMethod: varchar("biometric_method", { length: 30 }).notNull(), // 'fingerprint' | 'face_id' | 'passkey_platform'
  zkCommitment: varchar("zk_commitment", { length: 128 }).notNull().unique(),
  encryptedSalt: text("encrypted_salt").notNull(),
  userAgent: text("user_agent"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export type WebAuthnEnrollment = typeof webauthnEnrollments.$inferSelect;
export type NewWebAuthnEnrollment = typeof webauthnEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// Biometric Device Keys  (Agent 3 — Stamp Fallback Auth)
// ---------------------------------------------------------------------------

export const biometricDeviceKeys = pgTable(
  "biometric_device_keys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    deviceSecretEnc: jsonb("device_secret_enc").notNull(), // AES-256-GCM encrypted { ciphertext, iv, authTag }
    createdAt: timestamp("created_at").defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => ({
    userDeviceUniq: unique().on(t.userId, t.deviceId),
  }),
);

export type BiometricDeviceKey = typeof biometricDeviceKeys.$inferSelect;
export type NewBiometricDeviceKey = typeof biometricDeviceKeys.$inferInsert;
