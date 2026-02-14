import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uuid, decimal, varchar } from "drizzle-orm/pg-core";
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
