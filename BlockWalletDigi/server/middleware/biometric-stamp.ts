/**
 * biometric-stamp.ts
 *
 * Device-bound HMAC stamp for biometric operations when the Bearer JWT is
 * expired/absent (e.g., cold-start re-enrollment on mobile).
 *
 * Auth chain: Bearer JWT  →  x-biometric-stamp  →  401
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { verifyAccessToken } from "../services/auth-service";
import { getDb } from "../db";
import { biometricDeviceKeys } from "@shared/schema";
import {
  decrypt,
  generateEncryptionKey,
  type EncryptedData,
} from "../services/crypto-utils";

// ── Stamp payload ───────────────────────────────────────────────────────────

interface BiometricStamp {
  userId: number;
  deviceId: string;
  nonce: string;     // crypto.randomUUID()
  issuedAt: number;  // Unix ms
  hmac: string;      // HMAC-SHA256(deviceSecret, `${userId}:${deviceId}:${nonce}:${issuedAt}`)
}

// ── Constants ───────────────────────────────────────────────────────────────

const STAMP_TTL_MS   = 5  * 60 * 1_000;  // 5 minutes
const NONCE_TTL_MS   = 10 * 60 * 1_000;  // 10 minutes (cleanup window)

// AES-256-GCM key used to decrypt device secrets stored in biometric_device_keys
const BIOMETRIC_KEY: string =
  process.env.BIOMETRIC_DEVICE_SECRET_KEY || generateEncryptionKey();

// ── Nonce replay protection ─────────────────────────────────────────────────

/** Consumed nonces → timestamp of consumption (for TTL cleanup). */
const consumedNonces = new Map<string, number>();

// Purge nonces that are definitely outside the stamp TTL window every 10 min.
const _cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - NONCE_TTL_MS;
  for (const [nonce, ts] of consumedNonces) {
    if (ts < cutoff) consumedNonces.delete(nonce);
  }
}, NONCE_TTL_MS);

// Allow the interval to be unref'd so it doesn't keep the process alive in tests.
if (_cleanupInterval.unref) _cleanupInterval.unref();

// ── Device-secret resolver (injected by startup / route setup) ──────────────

/**
 * Resolver that maps (userId, deviceId) → plaintext device secret.
 * Must be registered before any stamp verification is attempted.
 * Returns `null` when the device key is not found or has been revoked.
 */
type SecretResolver = (
  userId: number,
  deviceId: string,
) => Promise<string | null> | string | null;

let _secretResolver: SecretResolver | null = null;

/**
 * Register the function used to look up a device's secret.
 * Typically called once during server initialisation with a DB query.
 *
 * @example
 * registerSecretResolver(async (userId, deviceId) => {
 *   const row = await db.query.biometricDeviceKeys.findFirst({
 *     where: and(eq(t.userId, userId), eq(t.deviceId, deviceId), isNull(t.revokedAt)),
 *   });
 *   if (!row) return null;
 *   return decrypt(row.deviceSecretEnc, MASTER_KEY);
 * });
 */
export function registerSecretResolver(fn: SecretResolver): void {
  _secretResolver = fn;
}

// ── issueStamp ──────────────────────────────────────────────────────────────

/**
 * Create a new biometric stamp for a device and return the base64url-encoded
 * header value.  `deviceSecret` is the plaintext AES-encrypted key stored in
 * `biometric_device_keys.device_secret_enc`.
 */
export function issueStamp(
  userId: number,
  deviceId: string,
  deviceSecret: string,
): string {
  const nonce    = randomUUID();
  const issuedAt = Date.now();
  const message  = `${userId}:${deviceId}:${nonce}:${issuedAt}`;

  const hmac = createHmac("sha256", deviceSecret)
    .update(message)
    .digest("hex");

  const stamp: BiometricStamp = { userId, deviceId, nonce, issuedAt, hmac };
  return Buffer.from(JSON.stringify(stamp)).toString("base64url");
}

// ── verifyStamp ─────────────────────────────────────────────────────────────

/**
 * Decode and fully validate a biometric stamp.
 *
 * Checks (in order):
 *  1. Base64url decode + JSON parse
 *  2. `issuedAt` within STAMP_TTL_MS of now
 *  3. Nonce not previously seen (replay protection)
 *  4. HMAC-SHA256 matches stored device secret (constant-time comparison)
 *
 * @throws {Error} with a descriptive STAMP_* code on any failure.
 * @returns `{ userId, deviceId }` on success.
 */
export async function verifyStamp(
  stampB64: string,
): Promise<{ userId: number; deviceId: string }> {
  // ── 1. Decode ─────────────────────────────────────────────────────────────
  let stamp: BiometricStamp;
  try {
    const json = Buffer.from(stampB64, "base64url").toString("utf8");
    stamp = JSON.parse(json) as BiometricStamp;
  } catch {
    throw new Error("STAMP_DECODE_ERROR: invalid stamp encoding");
  }

  if (
    typeof stamp.userId   !== "number" ||
    typeof stamp.deviceId !== "string" ||
    typeof stamp.nonce    !== "string" ||
    typeof stamp.issuedAt !== "number" ||
    typeof stamp.hmac     !== "string"
  ) {
    throw new Error("STAMP_DECODE_ERROR: missing required stamp fields");
  }

  // ── 2. TTL ────────────────────────────────────────────────────────────────
  if (Date.now() - stamp.issuedAt > STAMP_TTL_MS) {
    throw new Error("STAMP_EXPIRED: stamp is older than 5 minutes");
  }

  // ── 3. Nonce replay ───────────────────────────────────────────────────────
  if (consumedNonces.has(stamp.nonce)) {
    throw new Error("STAMP_REPLAY: nonce has already been consumed");
  }

  // ── 4. HMAC ───────────────────────────────────────────────────────────────
  // Use registered resolver when provided; otherwise query biometric_device_keys directly.
  let deviceSecret: string | null = null;
  if (_secretResolver) {
    deviceSecret = await _secretResolver(stamp.userId, stamp.deviceId);
  } else {
    const db = getDb();
    if (!db) throw new Error("[biometric-stamp] Database not available");
    const rows = await db
      .select()
      .from(biometricDeviceKeys)
      .where(
        and(
          eq(biometricDeviceKeys.userId, stamp.userId),
          eq(biometricDeviceKeys.deviceId, stamp.deviceId),
          isNull(biometricDeviceKeys.revokedAt),
        ),
      )
      .limit(1);
    if (rows.length) {
      deviceSecret = decrypt(
        rows[0].deviceSecretEnc as unknown as EncryptedData,
        BIOMETRIC_KEY,
      );
      // Fire-and-forget: update last_used_at timestamp
      db.update(biometricDeviceKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(biometricDeviceKeys.id, rows[0].id))
        .catch((err: unknown) =>
          console.error("[biometric-stamp] last_used_at update failed:", err),
        );
    }
  }

  if (!deviceSecret) {
    throw new Error(
      "STAMP_UNKNOWN_DEVICE: no active device key found for this (userId, deviceId) pair",
    );
  }

  const message  = `${stamp.userId}:${stamp.deviceId}:${stamp.nonce}:${stamp.issuedAt}`;
  const expected = createHmac("sha256", deviceSecret)
    .update(message)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks.
  const receivedBuf = Buffer.from(stamp.hmac.padEnd(expected.length, "0"), "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    throw new Error("STAMP_INVALID_HMAC: HMAC signature mismatch");
  }

  // Consume nonce *after* all checks pass.
  consumedNonces.set(stamp.nonce, Date.now());

  return { userId: stamp.userId, deviceId: stamp.deviceId };
}

// ── authOrStampMiddleware ───────────────────────────────────────────────────

/**
 * Express middleware that accepts either:
 *   1. `Authorization: Bearer <jwt>` — validated via shared-auth's verifyAccessToken
 *   2. `x-biometric-stamp: <base64url>` — validated via verifyStamp above
 *
 * On success, sets `req.user` so downstream handlers can call `resolveBoundUserId`.
 * Returns 401 when neither credential is present or both fail validation.
 */
export async function authOrStampMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // ── Path 1: Bearer JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token   = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({ error: "Invalid or expired Bearer token" });
      return;
    }

    // verifyAccessToken returns TokenPayload; cast to the shape expected by
    // downstream helpers (resolveBoundUserId reads req.user.userId or req.user.id).
    (req as Request & { user?: unknown }).user = payload;
    next();
    return;
  }

  // ── Path 2: x-biometric-stamp header ─────────────────────────────────────
  const stampHeader = req.headers["x-biometric-stamp"];
  if (stampHeader && typeof stampHeader === "string") {
    try {
      const { userId } = await verifyStamp(stampHeader);

      // Populate req.user with the full TokenPayload shape consumed by authz helpers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).user = {
        userId,
        username: `device:${userId}`,
        role:     "holder",
        type:     "access" as const,
      };

      next();
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stamp verification failed";
      res.status(401).json({ error: message });
      return;
    }
  }

  // ── Path 3: No credentials ────────────────────────────────────────────────
  res.status(401).json({
    error: "Authentication required: provide Authorization: Bearer <token> or x-biometric-stamp header",
  });
}
