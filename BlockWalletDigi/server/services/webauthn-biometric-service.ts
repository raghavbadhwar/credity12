/**
 * WebAuthn Biometric Service
 * Agent 3 — Fingerprint + Face ID paths to Human ID
 *
 * Uses FIDO2 / WebAuthn for platform authenticators (Secure Enclave, TEE, TPM).
 * The raw biometric (fingerprint/face geometry) never leaves the device.
 * The server stores only the COSE-encoded credential public key (encrypted)
 * and a Poseidon ZK commitment for on-chain anchoring.
 *
 * NOTE: Firefox on iOS does NOT support WebAuthn platform authenticators.
 * Tested with: Safari iOS, Chrome Android, Safari macOS (Touch ID), Chrome/Edge Windows (Hello).
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";
import { buildPoseidon } from "circomlibjs";
import { randomBytes, createHash, randomUUID } from "crypto";
import {
  encrypt,
  decrypt,
  generateEncryptionKey,
  type EncryptedData,
} from "./crypto-utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type BiometricMethod = "fingerprint" | "face_id" | "passkey_platform";

export type WebAuthnBiometricEnrollmentMethod =
  | "fingerprint_webauthn"
  | "face_id_webauthn"
  | "passkey_platform";

export interface WebAuthnEnrollmentRecord {
  id: string;
  userId: string;
  credentialId: string;
  encryptedCredentialPublicKey: EncryptedData;
  credentialPublicKeyHash: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  biometricMethod: BiometricMethod;
  zkCommitment: string;
  encryptedSalt: EncryptedData;
  userAgent: string;
  enrolledAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
}

export interface BiometricRegistrationChallenge {
  challengeId: string;
  userId: string;
  challenge: string;
  rpId: string;
  expiresAt: Date;
  type: "registration" | "authentication";
}

export interface StartEnrollmentResult {
  challengeId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}

export interface CompleteEnrollmentResult {
  enrollmentId: string;
  zkCommitment: string;
  credentialPublicKeyHash: string;
  biometricMethod: BiometricMethod;
  backedUp: boolean;
}

export interface StartAuthenticationResult {
  challengeId: string;
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}

export interface CompleteAuthenticationResult {
  verified: boolean;
  enrollmentId: string;
  zkCommitment: string;
  biometricMethod: BiometricMethod;
}

// ── Validation Error ───────────────────────────────────────────────────────

export class WebAuthnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "WebAuthnError";
  }
}

// ── RP Config ──────────────────────────────────────────────────────────────

function getRpId(): string {
  return process.env.WEBAUTHN_RP_ID || "localhost";
}

function getRpName(): string {
  return process.env.WEBAUTHN_RP_NAME || "Credity Wallet";
}

function getOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || "http://localhost:5000";
}

// ── In-memory stores (same pattern as biometrics-service.ts / liveness-service.ts) ──

const challenges = new Map<string, BiometricRegistrationChallenge>();
const enrollments = new Map<string, WebAuthnEnrollmentRecord>();

// Indexes for fast lookups
const credentialIdIndex = new Map<string, string>(); // credentialId → enrollmentId
const credentialHashIndex = new Map<string, string>(); // credPubKeyHash → enrollmentId
const zkCommitmentIndex = new Map<string, string>(); // zkCommitment → enrollmentId
const userEnrollmentsIndex = new Map<string, Set<string>>(); // userId → Set<enrollmentId>

const encryptionKey =
  process.env.BIOMETRIC_TEMPLATE_KEY || generateEncryptionKey();

// ── Helpers ────────────────────────────────────────────────────────────────

function encryptBuffer(buffer: Buffer): EncryptedData {
  return encrypt(buffer.toString("base64"), encryptionKey);
}

function decryptToBuffer(encrypted: EncryptedData): Buffer {
  const b64 = decrypt(encrypted, encryptionKey);
  return Buffer.from(b64, "base64");
}

function encryptString(value: string): EncryptedData {
  return encrypt(value, encryptionKey);
}

function serializeEncrypted(data: EncryptedData): string {
  return JSON.stringify(data);
}

function deserializeEncrypted(raw: string): EncryptedData {
  return JSON.parse(raw) as EncryptedData;
}

function getUserEnrollments(userId: string): WebAuthnEnrollmentRecord[] {
  const ids = userEnrollmentsIndex.get(userId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => enrollments.get(id))
    .filter((e): e is WebAuthnEnrollmentRecord => e !== undefined && e.isActive);
}

// Check if user already has a Human ID (query humanIds in-memory store from human-id-service)
// NOTE: In production this queries the DB. We check via the exported humanIds store pattern.
// For now, we'll accept a function reference passed in or do a lazy check.
let humanIdChecker: ((userId: string) => boolean) | null = null;

export function setHumanIdChecker(fn: (userId: string) => boolean): void {
  humanIdChecker = fn;
}

function userHasHumanId(userId: string): boolean {
  if (humanIdChecker) return humanIdChecker(userId);
  return false; // Default: no human ID exists
}

// ── Core Methods ───────────────────────────────────────────────────────────

/**
 * Start enrollment — generates WebAuthn registration options.
 * HARD CONSTRAINT: authenticatorAttachment='platform', userVerification='required'
 */
export async function startEnrollment(
  userId: string,
  biometricMethod: BiometricMethod,
  userAgent: string,
): Promise<StartEnrollmentResult> {
  if (!userId) {
    throw new WebAuthnError("INVALID_USER_ID", "userId is required");
  }

  // 1. Check if user already has an active enrollment with the same method
  const existing = getUserEnrollments(userId);
  const sameMethod = existing.find((e) => e.biometricMethod === biometricMethod);
  if (sameMethod) {
    throw new WebAuthnError(
      "ALREADY_ENROLLED_THIS_METHOD",
      `User already has an active ${biometricMethod} enrollment`,
    );
  }

  // 2. Check if user already has a Human ID (cannot re-enroll after minting)
  if (userHasHumanId(userId)) {
    throw new WebAuthnError(
      "HUMAN_ID_ALREADY_EXISTS",
      "Cannot enroll new biometric after Human ID has been minted",
    );
  }

  // 3. Load existing credential IDs for exclusion
  const excludeCredentials = existing.map((e) => ({
    id: Uint8Array.from(Buffer.from(e.credentialId, "base64")),
    type: "public-key" as const,
    transports: e.transports as AuthenticatorTransport[],
  }));

  // 4. Generate registration options
  // HARD CONSTRAINT: authenticatorAttachment: 'platform' only — no cross-platform (USB/NFC) keys
  // HARD CONSTRAINT: userVerification: 'required' — biometric MUST be verified
  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userName: userId,
    userID: userId,
    timeout: 180_000,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      requireResidentKey: true,
      userVerification: "required",
    },
    supportedAlgorithmIDs: [-7, -257], // ES256 (Apple/Android) + RS256 (Windows)
  });

  // 5. Store challenge with 3-minute TTL
  const challengeId = randomUUID();
  const challengeRecord: BiometricRegistrationChallenge = {
    challengeId,
    userId,
    challenge: options.challenge,
    rpId: getRpId(),
    expiresAt: new Date(Date.now() + 3 * 60 * 1000),
    type: "registration",
  };
  challenges.set(challengeId, challengeRecord);

  // Auto-cleanup expired challenge
  setTimeout(() => challenges.delete(challengeId), 3 * 60 * 1000 + 5000);

  return { challengeId, options };
}

/**
 * Complete enrollment — verifies the registration response and stores the credential.
 * HARD CONSTRAINTS:
 * - requireUserVerification: true
 * - credentialPublicKey stored encrypted (AES-256-GCM)
 * - credential_public_key_hash globally unique
 * - zkCommitment globally unique
 */
export async function completeEnrollment(
  challengeId: string,
  registrationResponse: RegistrationResponseJSON,
  biometricMethod: BiometricMethod,
  userAgent: string,
): Promise<CompleteEnrollmentResult> {
  // 1. Load and validate challenge
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    throw new WebAuthnError("CHALLENGE_NOT_FOUND", "Challenge not found or expired", 404);
  }
  if (challenge.type !== "registration") {
    throw new WebAuthnError("INVALID_CHALLENGE_TYPE", "Expected registration challenge");
  }
  if (Date.now() > challenge.expiresAt.getTime()) {
    challenges.delete(challengeId);
    throw new WebAuthnError("CHALLENGE_EXPIRED", "Challenge has expired", 410);
  }

  // 2. Verify registration response
  // HARD CONSTRAINT: requireUserVerification: true — biometric was actually verified
  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge: challenge.challenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError(
      "VERIFICATION_FAILED",
      "WebAuthn registration verification failed",
    );
  }

  // 3. Extract registration info
  const {
    credentialID,
    credentialPublicKey,
    credentialDeviceType,
    credentialBackedUp,
    counter,
  } = verification.registrationInfo;

  // credentialID is a Uint8Array in v9, convert to base64url
  const credentialIdB64 = Buffer.from(credentialID).toString("base64url");

  // 4. Uniqueness check: SHA-256(credentialPublicKey)
  // HARD CONSTRAINT: credential_public_key_hash must be globally unique
  const credentialPublicKeyHash = createHash("sha256")
    .update(Buffer.from(credentialPublicKey))
    .digest("hex");

  if (credentialHashIndex.has(credentialPublicKeyHash)) {
    throw new WebAuthnError(
      "CREDENTIAL_ALREADY_REGISTERED",
      "This device credential is already linked to a Credity account",
    );
  }

  // 5. ZK commitment: poseidon([credPubKeyHash, salt])
  const poseidon = await buildPoseidon();
  const salt = randomBytes(32);
  const commitment = poseidon([
    BigInt("0x" + credentialPublicKeyHash),
    BigInt("0x" + salt.toString("hex")),
  ]);
  const zkCommitment =
    "0x" + poseidon.F.toString(commitment, 16).padStart(64, "0");

  // HARD CONSTRAINT: zkCommitment must be globally unique
  if (zkCommitmentIndex.has(zkCommitment)) {
    throw new WebAuthnError(
      "ZK_COMMITMENT_COLLISION",
      "ZK commitment collision — please retry enrollment",
    );
  }

  // 6. Encrypt the raw credentialPublicKey (Buffer) using AES-256-GCM
  // HARD CONSTRAINT: Never store the raw credentialPublicKey buffer unencrypted
  const encryptedCredentialPublicKey = encryptBuffer(
    Buffer.from(credentialPublicKey),
  );

  // 7. Encrypt the salt using AES-256-GCM
  const encryptedSalt = encryptString(salt.toString("hex"));

  // 8. Create enrollment record
  const enrollmentId = randomUUID();
  const record: WebAuthnEnrollmentRecord = {
    id: enrollmentId,
    userId: challenge.userId,
    credentialId: credentialIdB64,
    encryptedCredentialPublicKey,
    credentialPublicKeyHash,
    counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: ["internal"], // Platform authenticators use 'internal' transport
    biometricMethod,
    zkCommitment,
    encryptedSalt,
    userAgent,
    enrolledAt: new Date(),
    lastUsedAt: null,
    isActive: true,
  };

  // Store enrollment + update indexes
  enrollments.set(enrollmentId, record);
  credentialIdIndex.set(credentialIdB64, enrollmentId);
  credentialHashIndex.set(credentialPublicKeyHash, enrollmentId);
  zkCommitmentIndex.set(zkCommitment, enrollmentId);
  if (!userEnrollmentsIndex.has(challenge.userId)) {
    userEnrollmentsIndex.set(challenge.userId, new Set());
  }
  userEnrollmentsIndex.get(challenge.userId)!.add(enrollmentId);

  // 9. Delete challenge
  challenges.delete(challengeId);

  // 10. Return result
  return {
    enrollmentId,
    zkCommitment,
    credentialPublicKeyHash,
    biometricMethod,
    backedUp: credentialBackedUp,
  };
}

/**
 * Start authentication — generates WebAuthn authentication options.
 * Used to re-verify biometric to authorize VP presentation (not for Human ID minting).
 */
export async function startAuthentication(
  userId: string,
): Promise<StartAuthenticationResult> {
  const userCredentials = getUserEnrollments(userId);
  if (userCredentials.length === 0) {
    throw new WebAuthnError(
      "NO_ENROLLMENTS",
      "No active biometric enrollments found for this user",
      404,
    );
  }

  // HARD CONSTRAINT: userVerification: 'required'
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    timeout: 120_000,
    userVerification: "required",
    allowCredentials: userCredentials.map((c) => ({
      id: Uint8Array.from(Buffer.from(c.credentialId, "base64")),
      type: "public-key" as const,
      transports: c.transports as AuthenticatorTransport[],
    })),
  });

  const challengeId = randomUUID();
  const challengeRecord: BiometricRegistrationChallenge = {
    challengeId,
    userId,
    challenge: options.challenge,
    rpId: getRpId(),
    expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    type: "authentication",
  };
  challenges.set(challengeId, challengeRecord);
  setTimeout(() => challenges.delete(challengeId), 2 * 60 * 1000 + 5000);

  return { challengeId, options };
}

/**
 * Complete authentication — verifies the authentication response.
 * HARD CONSTRAINTS:
 * - requireUserVerification: true
 * - Counter check mandatory: counter <= stored → COUNTER_REPLAY_ATTACK (cloned device)
 */
export async function completeAuthentication(
  challengeId: string,
  authenticationResponse: AuthenticationResponseJSON,
): Promise<CompleteAuthenticationResult> {
  // 1. Load challenge
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    throw new WebAuthnError("CHALLENGE_NOT_FOUND", "Challenge not found or expired", 404);
  }
  if (challenge.type !== "authentication") {
    throw new WebAuthnError("INVALID_CHALLENGE_TYPE", "Expected authentication challenge");
  }
  if (Date.now() > challenge.expiresAt.getTime()) {
    challenges.delete(challengeId);
    throw new WebAuthnError("CHALLENGE_EXPIRED", "Challenge has expired", 410);
  }

  // 2. Find enrollment matching the credential ID from the response
  const responseCredentialId = authenticationResponse.id;
  const enrollmentId = credentialIdIndex.get(responseCredentialId);
  if (!enrollmentId) {
    throw new WebAuthnError(
      "CREDENTIAL_NOT_FOUND",
      "No enrollment found for this credential",
      404,
    );
  }
  const enrollment = enrollments.get(enrollmentId);
  if (!enrollment || !enrollment.isActive) {
    throw new WebAuthnError(
      "ENROLLMENT_INACTIVE",
      "Enrollment is not active",
    );
  }

  // Verify the enrollment belongs to the same user as the challenge
  if (enrollment.userId !== challenge.userId) {
    throw new WebAuthnError(
      "USER_MISMATCH",
      "Credential does not belong to the authenticating user",
      403,
    );
  }

  // 3. Decrypt stored credentialPublicKey
  const credentialPublicKey = decryptToBuffer(enrollment.encryptedCredentialPublicKey);

  // 4. Verify authentication response
  // HARD CONSTRAINT: requireUserVerification: true
  const verification = await verifyAuthenticationResponse({
    response: authenticationResponse,
    expectedChallenge: challenge.challenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpId(),
    authenticator: {
      credentialID: Buffer.from(enrollment.credentialId, "base64url"),
      credentialPublicKey: new Uint8Array(credentialPublicKey),
      counter: enrollment.counter,
      transports: enrollment.transports as AuthenticatorTransport[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new WebAuthnError(
      "AUTHENTICATION_FAILED",
      "WebAuthn authentication verification failed",
    );
  }

  // 5. HARD CONSTRAINT: Counter replay check
  // If counter <= stored counter → throw COUNTER_REPLAY_ATTACK (cloned device detected)
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter <= enrollment.counter && newCounter !== 0) {
    // Counter of 0 is allowed for authenticators that don't implement counters
    throw new WebAuthnError(
      "COUNTER_REPLAY_ATTACK",
      "Signature counter indicates possible cloned device — authentication rejected",
      403,
    );
  }

  // 6. Update counter and lastUsedAt
  enrollment.counter = newCounter;
  enrollment.lastUsedAt = new Date();

  // 7. Delete challenge
  challenges.delete(challengeId);

  return {
    verified: true,
    enrollmentId: enrollment.id,
    zkCommitment: enrollment.zkCommitment,
    biometricMethod: enrollment.biometricMethod,
  };
}

/**
 * Get enrollment by ID. Used by API routes for mint-biometric.
 */
export function getEnrollment(enrollmentId: string): WebAuthnEnrollmentRecord | null {
  return enrollments.get(enrollmentId) ?? null;
}

/**
 * Get enrollment by ZK commitment.
 * Used by human-id-service.ts (Agent 1) when minting via WebAuthn biometric path.
 */
export function getEnrollmentByZkCommitment(
  zkCommitment: string,
): WebAuthnEnrollmentRecord | null {
  const enrollmentId = zkCommitmentIndex.get(zkCommitment);
  if (!enrollmentId) return null;
  return enrollments.get(enrollmentId) ?? null;
}

/**
 * List all enrollments for a user (for management UI).
 */
export function listEnrollments(userId: string): Array<{
  id: string;
  credentialId: string;
  biometricMethod: BiometricMethod;
  enrolledAt: Date;
  lastUsedAt: Date | null;
  backedUp: boolean;
  deviceType: string;
}> {
  return getUserEnrollments(userId).map((e) => ({
    id: e.id,
    credentialId: e.credentialId,
    biometricMethod: e.biometricMethod,
    enrolledAt: e.enrolledAt,
    lastUsedAt: e.lastUsedAt,
    backedUp: e.backedUp,
    deviceType: e.deviceType,
  }));
}

/**
 * Soft-delete an enrollment.
 * Blocks deletion if this is the last enrollment for a user who has a Human ID.
 */
export function deactivateEnrollment(
  enrollmentId: string,
  userId: string,
): { deleted: boolean } {
  const enrollment = enrollments.get(enrollmentId);
  if (!enrollment) {
    throw new WebAuthnError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404);
  }
  if (enrollment.userId !== userId) {
    throw new WebAuthnError("FORBIDDEN", "Enrollment does not belong to this user", 403);
  }
  if (!enrollment.isActive) {
    throw new WebAuthnError("ALREADY_DEACTIVATED", "Enrollment is already deactivated");
  }

  // If user has a Human ID and this is the only active enrollment, block deletion
  const activeEnrollments = getUserEnrollments(userId);
  if (activeEnrollments.length <= 1 && userHasHumanId(userId)) {
    throw new WebAuthnError(
      "LAST_BIOMETRIC_FOR_HUMAN_ID",
      "Cannot remove the last biometric enrollment when a Human ID exists",
    );
  }

  // Soft delete
  enrollment.isActive = false;

  return { deleted: true };
}

/**
 * Map BiometricMethod to WebAuthnBiometricEnrollmentMethod for Human ID minting.
 */
export function toEnrollmentMethod(
  method: BiometricMethod,
): WebAuthnBiometricEnrollmentMethod {
  switch (method) {
    case "fingerprint":
      return "fingerprint_webauthn";
    case "face_id":
      return "face_id_webauthn";
    case "passkey_platform":
      return "passkey_platform";
  }
}
