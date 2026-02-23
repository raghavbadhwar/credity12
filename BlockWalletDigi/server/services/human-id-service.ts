/**
 * Human ID Service
 * Mints Sybil-resistant, privacy-preserving digital identity tokens
 * backed by palm biometric ZK commitments.
 *
 * Flow: enrollPalm → mintHumanId → VC issued → on-chain anchor
 */

import crypto from "crypto";
import {
  encrypt,
  decrypt,
  sha256,
  sign,
  generateEd25519KeyPair,
  generateEncryptionKey,
  type EncryptedData,
} from "./crypto-utils";
import { didService } from "./did-service";
import type { DIDKeyPair } from "./did-service";
import {
  getEnrollmentRecord,
  getUserEnrollment,
  type PalmEnrollmentRecord,
} from "./palm-scan-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HumanIdRecord {
  humanIdHash: string; // SHA-256(humanIdToken) — public anchor
  userId: string;
  palmScanId: string;
  zkCommitment: string; // Poseidon commitment from palm enrollment
  vcJws: string; // Signed Verifiable Credential (compact JWS)
  ipfsCid: string | null; // IPFS CID of the VC (null until pinned)
  txHash: string | null; // Blockchain anchor tx hash
  chainId: number;
  contractAddress: string;
  status: "pending" | "active" | "revoked" | "expired";
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  metadata: {
    enrollmentMethod: string;
    qualityScore: number;
    sybilScore: number;
    version: string;
  };
}

export interface MintHumanIdResult {
  humanIdHash: string;
  vcJws: string;
  ipfsCid: string | null;
  expiresAt: Date;
  status: "pending";
}

export interface HumanIdVerification {
  valid: boolean;
  humanIdHash: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date;
  issuer: string;
}

// ---------------------------------------------------------------------------
// Storage — in-memory (drizzle table in Task 4)
// ---------------------------------------------------------------------------

const humanIdRecords = new Map<string, HumanIdRecord>(); // keyed by humanIdHash
const userHumanIdIndex = new Map<string, string>(); // userId → humanIdHash
const commitmentIndex = new Map<string, string>(); // zkCommitment → humanIdHash

// Issuer DID keypair (generated once per process)
let issuerKeyPair: DIDKeyPair | null = null;

const HUMAN_ID_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const CONTRACT_ADDRESS =
  process.env.HUMAN_ID_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000";
const CHAIN_ID = parseInt(process.env.POLYGON_CHAIN_ID || "80002", 10); // Polygon Amoy

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getIssuerKeyPair(): Promise<DIDKeyPair> {
  if (issuerKeyPair) return issuerKeyPair;
  issuerKeyPair = await didService.createDID();
  return issuerKeyPair;
}

function generateHumanIdToken(): string {
  return `hid_${Date.now()}_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Create a W3C Verifiable Credential (compact JWS) for the Human ID.
 */
async function issueHumanIdVC(
  subjectDID: string,
  humanIdHash: string,
  zkCommitment: string,
  enrollment: PalmEnrollmentRecord,
  expiresAt: Date,
): Promise<string> {
  const keyPair = await getIssuerKeyPair();

  const vcPayload = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://credity.io/schemas/human-id/v1",
    ],
    type: ["VerifiableCredential", "HumanIDCredential"],
    issuer: keyPair.did,
    issuanceDate: new Date().toISOString(),
    expirationDate: expiresAt.toISOString(),
    credentialSubject: {
      id: subjectDID,
      humanIdHash,
      zkCommitment,
      enrollmentMethod: enrollment.enrollmentMethod,
      qualityScore: enrollment.qualityScore,
      sybilScore: enrollment.sybilScore,
      issuedAt: new Date().toISOString(),
    },
    credentialSchema: {
      id: "https://credity.io/schemas/human-id/v1/schema.json",
      type: "JsonSchema",
    },
  };

  // Sign with issuer DID
  const presentation = await didService.createPresentation(
    [vcPayload],
    keyPair,
    "https://credity.io",
    crypto.randomBytes(16).toString("hex"),
  );

  // For compact transport, encode the VC payload as a signed JWS-like token
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "vc+jwt" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(vcPayload)).toString("base64url");
  const signatureData = `${header}.${payload}`;

  // Use did-service sign
  const sig = await didService.signWithDID(signatureData, keyPair);
  return `${signatureData}.${Buffer.from(sig, "hex").toString("base64url")}`;
}

/**
 * Stub: Pin VC payload to IPFS.
 * In production, this calls Pinata / web3.storage.
 */
async function pinToIpfs(vcJws: string): Promise<string | null> {
  // Return a deterministic CID-like hash for now
  const cidHash = sha256(vcJws);
  return `bafybeig${cidHash.slice(0, 44)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mint a new Human ID for a user who has completed palm enrollment.
 */
export async function mintHumanId(
  userId: string,
  subjectDID: string,
): Promise<MintHumanIdResult> {
  // Guard: one Human ID per user
  if (userHumanIdIndex.has(userId)) {
    const existing = humanIdRecords.get(userHumanIdIndex.get(userId)!);
    if (existing && existing.status === "active") {
      throw new Error("USER_ALREADY_HAS_ACTIVE_HUMAN_ID");
    }
  }

  // Guard: palm enrollment must exist
  const enrollment = getUserEnrollment(userId);
  if (!enrollment) {
    throw new Error("PALM_ENROLLMENT_REQUIRED");
  }

  // Guard: commitment uniqueness (prevents re-mint from different users)
  if (commitmentIndex.has(enrollment.zkCommitment)) {
    throw new Error("COMMITMENT_ALREADY_REGISTERED");
  }

  const humanIdToken = generateHumanIdToken();
  const humanIdHash = sha256(humanIdToken);
  const expiresAt = new Date(Date.now() + HUMAN_ID_EXPIRY_MS);

  // Issue VC
  const vcJws = await issueHumanIdVC(
    subjectDID,
    humanIdHash,
    enrollment.zkCommitment,
    enrollment,
    expiresAt,
  );

  // Pin to IPFS
  const ipfsCid = await pinToIpfs(vcJws);

  // Store record
  const record: HumanIdRecord = {
    humanIdHash,
    userId,
    palmScanId: enrollment.id,
    zkCommitment: enrollment.zkCommitment,
    vcJws,
    ipfsCid,
    txHash: null, // Set by blockchain anchor job
    chainId: CHAIN_ID,
    contractAddress: CONTRACT_ADDRESS,
    status: "pending", // Becomes "active" after on-chain confirmation
    issuedAt: new Date(),
    expiresAt,
    revokedAt: null,
    metadata: {
      enrollmentMethod: enrollment.enrollmentMethod,
      qualityScore: enrollment.qualityScore,
      sybilScore: enrollment.sybilScore,
      version: "1.0.0",
    },
  };

  humanIdRecords.set(humanIdHash, record);
  userHumanIdIndex.set(userId, humanIdHash);
  commitmentIndex.set(enrollment.zkCommitment, humanIdHash);

  return {
    humanIdHash,
    vcJws,
    ipfsCid,
    expiresAt,
    status: "pending",
  };
}

/**
 * Get a user's Human ID record.
 */
export function getHumanId(userId: string): HumanIdRecord | null {
  const hash = userHumanIdIndex.get(userId);
  if (!hash) return null;
  return humanIdRecords.get(hash) ?? null;
}

/**
 * Get a Human ID by its hash.
 */
export function getHumanIdByHash(humanIdHash: string): HumanIdRecord | null {
  return humanIdRecords.get(humanIdHash) ?? null;
}

/**
 * Look up Human ID by ZK commitment.
 */
export function getHumanIdByCommitment(
  zkCommitment: string,
): HumanIdRecord | null {
  const hash = commitmentIndex.get(zkCommitment);
  if (!hash) return null;
  return humanIdRecords.get(hash) ?? null;
}

/**
 * Revoke a Human ID.
 */
export function revokeHumanId(
  userId: string,
  reason?: string,
): { revoked: boolean; humanIdHash: string } {
  const hash = userHumanIdIndex.get(userId);
  if (!hash) throw new Error("NO_HUMAN_ID_FOUND");

  const record = humanIdRecords.get(hash);
  if (!record) throw new Error("NO_HUMAN_ID_FOUND");

  if (record.status === "revoked") {
    return { revoked: true, humanIdHash: hash };
  }

  record.status = "revoked";
  record.revokedAt = new Date();

  return { revoked: true, humanIdHash: hash };
}

/**
 * Activate a Human ID after on-chain confirmation.
 */
export function activateHumanId(
  humanIdHash: string,
  txHash: string,
): boolean {
  const record = humanIdRecords.get(humanIdHash);
  if (!record) return false;
  record.txHash = txHash;
  record.status = "active";
  return true;
}

/**
 * Verify a Human ID's validity.
 */
export function verifyHumanId(humanIdHash: string): HumanIdVerification {
  const record = humanIdRecords.get(humanIdHash);
  if (!record) {
    return {
      valid: false,
      humanIdHash,
      status: "not_found",
      issuedAt: new Date(0),
      expiresAt: new Date(0),
      issuer: "",
    };
  }

  const now = new Date();
  const isExpired = now > record.expiresAt;
  const isActive = record.status === "active";

  return {
    valid: isActive && !isExpired,
    humanIdHash,
    status: isExpired ? "expired" : record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    issuer: CONTRACT_ADDRESS,
  };
}
