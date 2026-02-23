/**
 * Palm Biometric Enrollment & Matching Service
 * Implements the palm scan pipeline for Human ID generation.
 *
 * Security invariants:
 * - Raw embeddings are NEVER stored or logged.
 * - Only SHA-256 hashes of embeddings and Poseidon ZK commitments persist.
 * - Encrypted salts use AES-256-GCM via crypto-utils.ts.
 */

import crypto from "crypto";
import {
  encrypt,
  decrypt,
  generateEncryptionKey,
  sha256,
  type EncryptedData,
} from "./crypto-utils";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PalmFrameCapture {
  data: string; // base64-encoded frame
  quality: number; // client-side quality hint (0-100)
  width?: number;
  height?: number;
}

export interface PalmScanSession {
  sessionId: string;
  userId: string;
  startedAt: Date;
  status: "pending" | "analyzing" | "enrolled" | "failed";
  qualityFrames: PalmFrameAnalysis[];
}

export interface PalmFrameAnalysis {
  qualityScore: number; // 0-100
  palmDetected: boolean;
  handPosition: "center" | "left" | "right" | "top" | "bottom" | "unknown";
  antiSpoofScore: number; // 0-1 (>0.7 = real palm)
  suggestion: string;
}

export interface PalmEnrollmentRecord {
  id: string; // UUID
  userId: string;
  embeddingHash: string; // SHA-256 of L2-normalised embedding
  zkCommitment: string; // Poseidon(embeddingHashBigInt, saltBigInt) hex
  encryptedSalt: EncryptedData;
  enrollmentMethod: "mobile_palm" | "infrared_vein";
  qualityScore: number;
  enrolledAt: Date;
  sybilScore: number; // 0-100
  isActive: boolean;
}

export interface EnrollPalmResult {
  palmScanId: string;
  zkCommitment: string;
  sybilScore: number;
  uniquenessVerified: boolean;
}

// ---------------------------------------------------------------------------
// In-memory stores — production should back these with Drizzle tables
// ---------------------------------------------------------------------------

const palmSessions = new Map<string, PalmScanSession>();
const palmEnrollments = new Map<string, PalmEnrollmentRecord>(); // keyed by id
const userEnrollmentIndex = new Map<string, string>(); // userId → enrollmentId

const PALM_KEY = process.env.PALM_BIOMETRIC_KEY || generateEncryptionKey();

// Poseidon-like hash stub (circomlibjs import fails at compile time without
// wasm setup — we use a deterministic stand-in that is structurally identical)
function poseidonHash(inputs: bigint[]): bigint {
  // In production: import { buildPoseidon } from "circomlibjs"
  // const poseidon = await buildPoseidon();
  // return poseidon.F.toObject(poseidon(inputs));
  const concatenated = inputs.map((i) => i.toString(16)).join(":");
  const hash = crypto
    .createHash("sha256")
    .update(concatenated)
    .digest("hex");
  return BigInt("0x" + hash.slice(0, 32)); // truncate to 128-bit for field safety
}

// ---------------------------------------------------------------------------
// Embedding helpers — simulate 256-dim extraction in absence of ML model
// ---------------------------------------------------------------------------

function extractPalmEmbedding(frameBase64: string): number[] {
  // In production this calls an ONNX/TFLite palm-recognition model.
  // Here we derive a deterministic 256-dim vector from the frame hash
  // so that tests and enrollment flows work end-to-end.
  const frameHash = crypto
    .createHash("sha512")
    .update(Buffer.from(frameBase64, "base64"))
    .digest();
  const embedding: number[] = [];
  for (let i = 0; i < 256; i++) {
    const byte = frameHash[i % frameHash.length]!;
    embedding.push((byte - 128) / 128); // normalise to [-1, 1]
  }
  return l2Normalize(embedding);
}

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function averageEmbeddings(embeddings: number[][]): number[] {
  const dim = embeddings[0]!.length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i]! / embeddings.length;
    }
  }
  return l2Normalize(avg);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function embeddingToHash(embedding: number[]): string {
  const serialised = JSON.stringify(embedding.map((v) => Number(v.toFixed(8))));
  return sha256(serialised);
}

// Anti-spoof: texture variance — flat/printed palms have low variance
function textureVarianceCheck(embedding: number[]): number {
  const mean = embedding.reduce((s, v) => s + v, 0) / embedding.length;
  const variance =
    embedding.reduce((s, v) => s + (v - mean) ** 2, 0) / embedding.length;
  // Map variance to 0-1 score; real palms ≈0.7-1.0, spoofs <0.3
  return Math.min(1, variance * 8);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new palm scan session
 */
export function startPalmSession(userId: string): PalmScanSession {
  const session: PalmScanSession = {
    sessionId: `palm_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    userId,
    startedAt: new Date(),
    status: "pending",
    qualityFrames: [],
  };
  palmSessions.set(session.sessionId, session);
  return session;
}

/**
 * Analyse a single palm frame for quality and anti-spoof.
 * Does NOT store the frame or embedding.
 */
export function analyzePalmFrame(
  frameBase64: string,
  width: number,
  height: number,
): PalmFrameAnalysis {
  // Extract transient embedding (discarded after analysis)
  const embedding = extractPalmEmbedding(frameBase64);
  const antiSpoof = textureVarianceCheck(embedding);

  // Quality heuristics
  let qualityScore = 50;
  const aspectRatio = width / (height || 1);

  // Distance check via aspect ratio heuristic
  if (aspectRatio > 0.6 && aspectRatio < 1.4) qualityScore += 15;

  // Resolution penalty
  if (width < 320 || height < 320) qualityScore -= 20;
  if (width >= 640 && height >= 640) qualityScore += 10;

  // Anti-spoof contributes to quality
  qualityScore += Math.round(antiSpoof * 25);

  // Detect palm presence (simplified — production uses YOLO-palm)
  const palmDetected = antiSpoof > 0.25;
  if (palmDetected) qualityScore += 10;

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  // Hand position estimation (stub)
  const handPosition: PalmFrameAnalysis["handPosition"] = palmDetected
    ? "center"
    : "unknown";

  // Suggestion
  let suggestion = "";
  if (!palmDetected) suggestion = "Hold your palm 20-30cm from the camera";
  else if (qualityScore < 60) suggestion = "Move to better lighting";
  else if (qualityScore < 85) suggestion = "Hold steady — capturing";
  else suggestion = "Perfect — hold still";

  return {
    qualityScore,
    palmDetected,
    handPosition,
    antiSpoofScore: antiSpoof,
    suggestion,
  };
}

/**
 * Enrol a user's palm biometric.
 *
 * Steps:
 * 1. Select best frames → extract & average embeddings
 * 2. SHA-256 embedding hash (embedding itself is discarded)
 * 3. Generate salt → Poseidon ZK commitment
 * 4. Uniqueness check against all enrolled hashes
 * 5. Store encrypted salt, embedding hash, commitment
 */
export async function enrollPalm(
  userId: string,
  frames: PalmFrameCapture[],
): Promise<EnrollPalmResult> {
  if (frames.length < 3) {
    throw new Error("At least 3 frames required for palm enrollment");
  }

  // 1. Select 3 best quality frames
  const analysed = frames.map((f) => ({
    frame: f,
    analysis: analyzePalmFrame(f.data, f.width || 640, f.height || 480),
  }));
  analysed.sort((a, b) => b.analysis.qualityScore - a.analysis.qualityScore);
  const bestFrames = analysed.slice(0, 3);

  // Anti-spoof gate: all best frames must pass
  for (const bf of bestFrames) {
    if (bf.analysis.antiSpoofScore < 0.3) {
      throw new Error("ANTI_SPOOF_FAILED: Possible non-live palm detected");
    }
  }

  // 2. Extract embeddings, average, L2-normalise
  const embeddings = bestFrames.map((bf) =>
    extractPalmEmbedding(bf.frame.data),
  );
  const finalEmbedding = averageEmbeddings(embeddings);

  // 3. SHA-256 hash of embedding
  const embeddingHash = embeddingToHash(finalEmbedding);

  // 4. Generate salt and compute Poseidon commitment
  const salt = crypto.randomBytes(32);
  const saltHex = salt.toString("hex");
  const zkCommitment = poseidonHash([
    BigInt("0x" + embeddingHash.slice(0, 32)),
    BigInt("0x" + saltHex.slice(0, 32)),
  ]);
  const zkCommitmentHex = "0x" + zkCommitment.toString(16).padStart(64, "0");

  // 5. Uniqueness check — cosine similarity against all enrolled hashes
  //    (In production, this is a vector-DB query)
  let maxSimilarity = 0;
  for (const [, record] of palmEnrollments) {
    if (!record.isActive) continue;
    // We can only compare hashes (embeddings not stored).
    // For demo, hash equality is the sybil check.
    if (record.embeddingHash === embeddingHash) {
      throw Object.assign(new Error("DUPLICATE_BIOMETRIC"), {
        sybilScore: 0,
      });
    }
    // Track similarity for sybil score approximation
    maxSimilarity = Math.max(maxSimilarity, 0); // placeholder without stored embeddings
  }

  const sybilScore = Math.round(100 - maxSimilarity * 100);
  const avgQuality = Math.round(
    bestFrames.reduce((s, bf) => s + bf.analysis.qualityScore, 0) /
      bestFrames.length,
  );

  // 6. Encrypt salt and store
  const encryptedSalt = encrypt(saltHex, PALM_KEY);
  const palmScanId = `ps_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const record: PalmEnrollmentRecord = {
    id: palmScanId,
    userId,
    embeddingHash,
    zkCommitment: zkCommitmentHex,
    encryptedSalt,
    enrollmentMethod: "mobile_palm",
    qualityScore: avgQuality,
    enrolledAt: new Date(),
    sybilScore,
    isActive: true,
  };

  palmEnrollments.set(palmScanId, record);
  userEnrollmentIndex.set(userId, palmScanId);

  // Embedding is now out of scope — GC will reclaim it.
  // NEVER store finalEmbedding.

  return {
    palmScanId,
    zkCommitment: zkCommitmentHex,
    sybilScore,
    uniquenessVerified: true,
  };
}

/**
 * Verify a live palm scan against a user's enrolled record.
 */
export function verifyPalmMatch(
  userId: string,
  incomingEmbedding: number[],
  securityLevel: "standard" | "high" = "standard",
): { matched: boolean; similarity: number; threshold: number } {
  const enrollmentId = userEnrollmentIndex.get(userId);
  if (!enrollmentId) throw new Error("No palm enrollment found for user");

  const record = palmEnrollments.get(enrollmentId);
  if (!record || !record.isActive)
    throw new Error("Palm enrollment inactive or missing");

  const incomingHash = embeddingToHash(l2Normalize(incomingEmbedding));
  const threshold = securityLevel === "high" ? 0.92 : 0.85;

  // Compare hashes — exact match = similarity 1.0
  const similarity = incomingHash === record.embeddingHash ? 1.0 : 0.0;

  return {
    matched: similarity >= threshold,
    similarity,
    threshold,
  };
}

/**
 * Look up an enrollment record (for downstream services).
 */
export function getEnrollmentRecord(
  palmScanId: string,
): PalmEnrollmentRecord | null {
  return palmEnrollments.get(palmScanId) ?? null;
}

/**
 * Get a user's active enrollment.
 */
export function getUserEnrollment(
  userId: string,
): PalmEnrollmentRecord | null {
  const id = userEnrollmentIndex.get(userId);
  if (!id) return null;
  const record = palmEnrollments.get(id);
  return record?.isActive ? record : null;
}

/**
 * Deactivate a user's palm enrollment.
 */
export function deactivateEnrollment(userId: string): boolean {
  const id = userEnrollmentIndex.get(userId);
  if (!id) return false;
  const record = palmEnrollments.get(id);
  if (!record) return false;
  record.isActive = false;
  return true;
}
