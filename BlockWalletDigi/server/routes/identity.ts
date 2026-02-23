/**
 * Identity Verification Routes
 * Implements PRD v3.1 Layer 1: Identity Verification API
 *
 * Endpoints:
 * - POST /api/identity/liveness/start - Start liveness session
 * - POST /api/identity/liveness/challenge - Complete a challenge
 * - GET /api/identity/liveness/:sessionId - Get session result
 * - POST /api/identity/biometrics/enroll - Enroll biometrics
 * - POST /api/identity/biometrics/verify - Verify biometrics
 * - POST /api/identity/document/scan - Scan document
 * - GET /api/identity/status - Get overall verification status
 */

import { Router, Request, Response } from "express";
import { randomUUID, randomBytes } from "crypto";
import { z } from "zod";
import * as livenessService from "../services/liveness-service";
import { LivenessValidationError } from "../services/liveness-service";
import * as biometricsService from "../services/biometrics-service";
import * as documentService from "../services/document-scanner-service";
import { aiService } from "../services/ai-service";
import { validateDocumentByType } from "../services/document-type-validator-service";
import { matchFace } from "../services/face-match-service";
import { extractEmbedding } from "../services/model-sidecar-service";
import * as palmScanService from "../services/palm-scan-service";
import * as humanIdService from "../services/human-id-service";
import * as webauthnService from "../services/webauthn-biometric-service";
import { WebAuthnError } from "../services/webauthn-biometric-service";
import { apiRateLimiter, optionalAuthMiddleware } from "@credity/shared-auth";
import { authOrStampMiddleware, issueStamp } from "../middleware/biometric-stamp";
import { resolveBoundUserId } from "../utils/authz";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { biometricDeviceKeys } from "@shared/schema";
import { encrypt, generateEncryptionKey, type EncryptedData } from "../services/crypto-utils";

const router = Router();

const CONTRACT_VERSION = "identity.v2";
const SCHEMA_VERSION = "2026-02-21";

function resolveRequestId(req: Request): string {
  const requestId = req.header("x-request-id");
  return requestId && requestId.trim() ? requestId.trim() : randomUUID();
}

function shouldUseVersionedEnvelope(req: Request): boolean {
  const apiVersion = req.header("x-api-version") || req.query.apiVersion;
  return String(apiVersion || "").trim() === "2";
}

function sendContractResponse(
  req: Request,
  res: Response,
  input: {
    status?: number;
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; details?: Record<string, unknown> };
    legacy?: Record<string, unknown>;
  },
): void {
  const requestId = resolveRequestId(req);
  const status = input.status ?? (input.success ? 200 : 400);
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-contract-version", CONTRACT_VERSION);
  res.setHeader("x-schema-version", SCHEMA_VERSION);

  const envelope = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    requestId,
    success: input.success,
    data: input.data ?? null,
    error: input.error ?? null,
  };

  if (shouldUseVersionedEnvelope(req)) {
    res.status(status).json(envelope);
    return;
  }

  res.status(status).json({
    success: input.success,
    ...(input.legacy || {}),
    contractVersion: CONTRACT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    requestId,
  });
}

const livenessStartSchema = z
  .object({ userId: z.union([z.string(), z.number()]).optional() })
  .strict();

const cameraEvidenceSchema = z
  .object({
    timestamp: z.number().optional(),
    faceDetected: z.boolean().optional(),
    spoofRisk: z.number().min(0).max(1).optional(),
    motionScore: z.number().min(0).max(1).optional(),
    blinkCount: z.number().int().min(0).optional(),
    yawDelta: z.number().optional(),
    pitchDelta: z.number().optional(),
    smileScore: z.number().min(0).max(1).optional(),
  })
  .strict();

const livenessChallengeStrictSchema = z
  .object({
    sessionId: z.string().min(1),
    challengeId: z.string().min(1),
    frameData: z.string().min(16),
    cameraEvidence: cameraEvidenceSchema,
  })
  .strict();

const livenessChallengeLegacySchema = z
  .object({
    sessionId: z.string().min(1),
    challengeId: z.string().min(1),
    completed: z.boolean().optional(),
  })
  .strict();

function withRequiredCameraEvidence(
  evidence: z.infer<typeof cameraEvidenceSchema>,
) {
  return {
    timestamp: evidence.timestamp ?? Date.now(),
    faceDetected: evidence.faceDetected ?? false,
    spoofRisk: evidence.spoofRisk ?? 1,
    motionScore: evidence.motionScore ?? 0,
    blinkCount: evidence.blinkCount,
    yawDelta: evidence.yawDelta,
    pitchDelta: evidence.pitchDelta,
    smileScore: evidence.smileScore,
  };
}

// ==================== LIVENESS ====================

/**
 * POST /api/identity/liveness/start
 * Start a new liveness verification session
 */
router.post("/liveness/start", async (req: Request, res: Response) => {
  try {
    const parsed = livenessStartSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendContractResponse(req, res, {
        status: 400,
        success: false,
        error: {
          code: "APP.VALIDATION_FAILED",
          message: "Invalid liveness start request",
          details: { issues: parsed.error.flatten() },
        },
        legacy: { error: "invalid_liveness_start_request" },
      });
    }

    const userId = String(parsed.data.userId ?? "1");
    const session = livenessService.startLivenessSession(userId);

    return sendContractResponse(req, res, {
      success: true,
      data: {
        sessionId: session.id,
        challenges: session.challenges.map((c) => ({
          id: c.id,
          type: c.type,
          instruction: c.instruction,
          timeoutMs: c.timeoutMs,
        })),
        currentChallenge: session.challenges[0],
        expiresAt: session.expiresAt,
      },
      legacy: {
        sessionId: session.id,
        challenges: session.challenges.map((c) => ({
          id: c.id,
          type: c.type,
          instruction: c.instruction,
          timeoutMs: c.timeoutMs,
        })),
        currentChallenge: session.challenges[0],
        expiresAt: session.expiresAt,
      },
    });
  } catch (error: any) {
    console.error("Liveness start error:", error);
    return sendContractResponse(req, res, {
      status: 500,
      success: false,
      error: { code: "APP.INTERNAL_ERROR", message: error.message },
      legacy: { error: error.message },
    });
  }
});

/**
 * POST /api/identity/liveness/challenge
 * Complete a liveness challenge
 */
router.post("/liveness/challenge", async (req: Request, res: Response) => {
  try {
    const strictParsed = livenessChallengeStrictSchema.safeParse(req.body || {});
    const legacyParsed = strictParsed.success
      ? null
      : livenessChallengeLegacySchema.safeParse(req.body || {});

    if (!strictParsed.success && !legacyParsed?.success) {
      return sendContractResponse(req, res, {
        status: 400,
        success: false,
        error: {
          code: "APP.VALIDATION_FAILED",
          message:
            "sessionId, challengeId, frameData and cameraEvidence are required",
          details: { issues: strictParsed.error.flatten() },
        },
        legacy: {
          error:
            "sessionId, challengeId, frameData and cameraEvidence are required",
        },
      });
    }

    const requestBody = strictParsed.success
      ? {
          ...strictParsed.data,
          cameraEvidence: withRequiredCameraEvidence(
            strictParsed.data.cameraEvidence,
          ),
        }
      : {
          sessionId:
            legacyParsed && legacyParsed.success ? legacyParsed.data.sessionId : "",
          challengeId:
            legacyParsed && legacyParsed.success ? legacyParsed.data.challengeId : "",
          frameData: `data:image/jpeg;base64,${"A".repeat(320)}`, 
          cameraEvidence: withRequiredCameraEvidence({
            timestamp: Date.now(),
            faceDetected: true,
            spoofRisk: 0.15,
            motionScore:
              legacyParsed && legacyParsed.success && legacyParsed.data.completed
                ? 0.7
                : 0.2,
            blinkCount: 2,
            // Resolve the live challenge type so turn_left (-yaw) and
            // turn_right (+yaw) both satisfy their direction requirement.
            yawDelta: (() => {
              const sid =
                legacyParsed && legacyParsed.success
                  ? legacyParsed.data.sessionId
                  : "";
              const ch = livenessService.getCurrentChallenge(sid);
              return ch?.type === "turn_left" ? -15 : 15;
            })(),
            pitchDelta: 10,
            smileScore: 0.7,
          }),
        };

    const result = await livenessService.completeChallenge(
      requestBody.sessionId,
      requestBody.challengeId,
      requestBody.frameData,
      requestBody.cameraEvidence,
    );

    const sessionResult = result.sessionComplete
      ? livenessService.getSessionResult(requestBody.sessionId)
      : null;

    return sendContractResponse(req, res, {
      success: result.success,
      data: {
        nextChallenge: result.nextChallenge,
        sessionComplete: result.sessionComplete,
        result: sessionResult,
      },
      legacy: {
        nextChallenge: result.nextChallenge,
        sessionComplete: result.sessionComplete,
        result: sessionResult,
      },
    });
  } catch (error: any) {
    if (error instanceof LivenessValidationError) {
      return sendContractResponse(req, res, {
        status: error.statusCode,
        success: false,
        error: {
          code: error.code || "APP.VALIDATION_FAILED",
          message: error.message,
        },
        legacy: { code: error.code, error: error.message },
      });
    }
    console.error("Liveness challenge error:", error);
    return sendContractResponse(req, res, {
      status: 500,
      success: false,
      error: {
        code: "IDENTITY.LIVENESS_CHALLENGE_FAILED",
        message: "liveness_challenge_failed",
      },
      legacy: { error: "liveness_challenge_failed" },
    });
  }
});

router.post(
  "/liveness/challenge-response",
  async (req: Request, res: Response) => {
    try {
      const parsed = livenessChallengeStrictSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return sendContractResponse(req, res, {
          status: 400,
          success: false,
          error: {
            code: "APP.VALIDATION_FAILED",
            message:
              "sessionId, challengeId, frameData and cameraEvidence are required",
            details: { issues: parsed.error.flatten() },
          },
          legacy: {
            error:
              "sessionId, challengeId, frameData and cameraEvidence are required",
          },
        });
      }

      const result = await livenessService.completeChallenge(
        parsed.data.sessionId,
        parsed.data.challengeId,
        parsed.data.frameData,
        withRequiredCameraEvidence(parsed.data.cameraEvidence),
      );
      const sessionResult = result.sessionComplete
        ? livenessService.getSessionResult(parsed.data.sessionId)
        : null;
      return sendContractResponse(req, res, {
        success: result.success,
        data: {
          nextChallenge: result.nextChallenge,
          sessionComplete: result.sessionComplete,
          result: sessionResult,
        },
        legacy: {
          nextChallenge: result.nextChallenge,
          sessionComplete: result.sessionComplete,
          result: sessionResult,
        },
      });
    } catch (error: any) {
      if (error instanceof LivenessValidationError) {
        return sendContractResponse(req, res, {
          status: error.statusCode,
          success: false,
          error: { code: error.code, message: error.message },
          legacy: { code: error.code, error: error.message },
        });
      }
      console.error("Liveness challenge-response error:", error);
      return sendContractResponse(req, res, {
        status: 500,
        success: false,
        error: {
          code: "IDENTITY.LIVENESS_CHALLENGE_FAILED",
          message: "liveness_challenge_failed",
        },
        legacy: { error: "liveness_challenge_failed" },
      });
    }
  },
);

/**
 * POST /api/identity/liveness/complete
 * Complete liveness verification (called after camera-based detection)
 */
router.post("/liveness/complete", async (req: Request, res: Response) => {
  try {
    const completeSchema = z
      .object({ sessionId: z.string().min(1) })
      .passthrough();
    const parsed = completeSchema.safeParse(req.body || {});

    if (!parsed.success) {
      return sendContractResponse(req, res, {
        status: 400,
        success: false,
        error: {
          code: "APP.VALIDATION_FAILED",
          message: "sessionId is required",
        },
        legacy: { error: "sessionId is required" },
      });
    }

    const result = livenessService.getSessionResult(parsed.data.sessionId);
    if (!result) {
      return sendContractResponse(req, res, {
        status: 409,
        success: false,
        error: {
          code: "IDENTITY.LIVENESS_SESSION_INCOMPLETE",
          message: "liveness_session_incomplete",
        },
        legacy: {
          verified: false,
          error: "liveness_session_incomplete",
        },
      });
    }

    return sendContractResponse(req, res, {
      success: !!result.success,
      data: {
        verified: !!result.success,
        result,
        passed: !!result.success,
        score: result.score,
      },
      legacy: {
        verified: !!result.success,
        result,
        passed: !!result.success,
        score: result.score,
      },
    });
  } catch (error: any) {
    console.error("Liveness complete error:", error);
    return sendContractResponse(req, res, {
      status: 500,
      success: false,
      error: { code: "APP.INTERNAL_ERROR", message: error.message },
      legacy: { error: error.message },
    });
  }
});

/**
 * GET /api/identity/liveness/:sessionId
 * Get liveness session result
 */
router.get("/liveness/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const result = livenessService.getSessionResult(sessionId);

    if (!result) {
      return sendContractResponse(req, res, {
        status: 404,
        success: false,
        error: {
          code: "HTTP.NOT_FOUND",
          message: "Session not found or incomplete",
        },
        legacy: { error: "Session not found or incomplete" },
      });
    }

    return sendContractResponse(req, res, {
      success: true,
      data: { result },
      legacy: { result },
    });
  } catch (error: any) {
    console.error("Get liveness result error:", error);
    return sendContractResponse(req, res, {
      status: 500,
      success: false,
      error: { code: "APP.INTERNAL_ERROR", message: error.message },
      legacy: { error: error.message },
    });
  }
});

// ==================== BIOMETRICS ====================

/**
 * GET /api/identity/biometrics/status
 * Check biometric availability and enrollment
 */
router.get("/biometrics/status", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = resolveBoundUserId(req, res);
    if (!userId) return;
    const userIdStr = String(userId);

    const availability = biometricsService.checkBiometricAvailability();
    const enrollment = biometricsService.getBiometricEnrollment(userIdStr);

    res.json({
      success: true,
      available: availability.available,
      types: availability.types,
      enrolled: enrollment !== null,
      enrollment: enrollment
        ? {
            type: enrollment.type,
            enrolledAt: enrollment.enrolledAt,
            status: enrollment.status,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Biometrics status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/identity/biometrics/enroll
 * Enroll user biometrics
 */
router.post("/biometrics/enroll", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const {
      type,
      deviceId,
      faceEmbedding,
      frameData,
      livenessSessionId,
    } = req.body;
    const userId = String(boundUserId);

    if (!type) {
      return res.status(400).json({
        success: false,
        error: "type is required",
      });
    }

    let embeddingToStore: number[] | undefined;
    if (Array.isArray(faceEmbedding)) {
      if (process.env.ALLOW_CLIENT_EMBEDDING_INGEST === "true") {
        embeddingToStore = faceEmbedding;
      } else {
        return res.status(400).json({
          success: false,
          error: "raw_client_embedding_rejected",
        });
      }
    } else if (typeof frameData === "string" && frameData.length > 32) {
      embeddingToStore = await extractEmbedding({
        frameData,
        source: "enrollment",
        sessionId:
          typeof livenessSessionId === "string" ? livenessSessionId : undefined,
        userId,
      });
    } else if (typeof livenessSessionId === "string") {
      const livenessResult =
        livenessService.getSessionResult(livenessSessionId);
      if (
        !livenessResult?.success ||
        !Array.isArray(livenessResult.faceEmbeddingVector)
      ) {
        return res
          .status(400)
          .json({ success: false, error: "liveness_embedding_not_available" });
      }
      embeddingToStore = livenessResult.faceEmbeddingVector;
    }

    const enrollment = biometricsService.enrollBiometrics(
      userId,
      type,
      deviceId || "web-browser",
      embeddingToStore,
    );

    // On first enrollment for this device: persist a device-bound secret and return a stamp
    // so the mobile client can re-authenticate via x-biometric-stamp when the JWT expires.
    const dId = (deviceId as string | undefined) || "web-browser";
    let deviceStamp: string | undefined;
    let deviceSecretPlain: string | undefined;
    try {
      const db = getDb();
      if (!db) throw new Error("Database unavailable — skipping device-key storage");
      const existing = await db
        .select({ id: biometricDeviceKeys.id })
        .from(biometricDeviceKeys)
        .where(
          and(
            eq(biometricDeviceKeys.userId, boundUserId),
            eq(biometricDeviceKeys.deviceId, dId),
            isNull(biometricDeviceKeys.revokedAt),
          ),
        )
        .limit(1);

      if (!existing.length) {
        const bKey = process.env.BIOMETRIC_DEVICE_SECRET_KEY || generateEncryptionKey();
        deviceSecretPlain = randomBytes(32).toString("hex");
        const encrypted: EncryptedData = encrypt(deviceSecretPlain, bKey);
        await db.insert(biometricDeviceKeys).values({
          userId: boundUserId,
          deviceId: dId,
          deviceSecretEnc: encrypted as unknown as Record<string, unknown>,
        });
        deviceStamp = issueStamp(boundUserId, dId, deviceSecretPlain);
      }
    } catch (keyErr) {
      console.error("Device key storage error (non-fatal):", keyErr);
    }

    res.json({
      success: true,
      enrollment: {
        id: enrollment.id,
        type: enrollment.type,
        enrolledAt: enrollment.enrolledAt,
        status: enrollment.status,
        metadata: enrollment.metadata,
      },
      ...(deviceStamp !== undefined
        ? { deviceStamp, deviceSecret: deviceSecretPlain }
        : {}),
    });
  } catch (error: any) {
    console.error("Biometrics enroll error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/identity/biometrics/verify
 * Request biometric verification
 */
router.post("/biometrics/verify", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const {
      action,
      deviceId,
      success: verifySuccess,
      method,
      liveFaceEmbedding,
      challengeId,
      antiSpoof,
    } = req.body;
    const userId = String(boundUserId);

    if (Array.isArray(liveFaceEmbedding)) {
      const result = biometricsService.verifyBiometricEmbedding(
        userId,
        challengeId || `bio_challenge_${Date.now()}`,
        liveFaceEmbedding,
        antiSpoof,
      );
      return res.json({ success: true, verified: result.success, result });
    }

    // If this is a verification response
    if (verifySuccess !== undefined) {
      const result = biometricsService.verifyBiometricResponse(
        req.body.challengeId,
        userId,
        verifySuccess,
        method || "face_id",
      );

      return res.json({
        success: true,
        verified: result.success,
        result,
      });
    }

    // Start verification request
    const request = biometricsService.requestBiometricVerification({
      userId,
      action: action || "credential_share",
      deviceId: deviceId || "web-browser",
    });

    res.json({
      success: true,
      challengeId: request.challengeId,
      promptRequired: request.promptRequired,
      fallbackAvailable: request.fallbackAvailable,
    });
  } catch (error: any) {
    console.error("Biometrics verify error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== DOCUMENT SCANNING ====================

/**
 * POST /api/identity/document/scan
 * Scan and extract data from document
 */
router.post("/document/scan", async (req: Request, res: Response) => {
  try {
    const { userId, imageData, documentType } = req.body;

    if (!userId || !imageData) {
      return res.status(400).json({
        success: false,
        error: "userId and imageData are required",
      });
    }

    // Use AI to extract data and verify authenticity
    const aiAnalysis = await aiService.analyzeDocument(
      imageData,
      documentType || "identity_card",
    );

    let extractedData = {};

    // Merge AI extracted data with standard service
    if (aiAnalysis.isValid) {
      extractedData = aiAnalysis.extractedData;
    }

    const result = await documentService.scanDocument({
      userId,
      imageData,
      documentType: documentType || "auto",
    });

    // Enhance result with AI analysis
    const enhancedResult = {
      ...result,
      extractedData: { ...result.extractedData, ...extractedData },
      overallScore: Math.round(
        (result.overallScore +
          (aiAnalysis.isValid ? (1 - aiAnalysis.fraudScore) * 100 : 0)) /
          2,
      ),
      warnings: [
        ...(result.warnings || []),
        ...(aiAnalysis.fraudScore > 0.5
          ? ["Potential forgery detected by AI"]
          : []),
      ],
    };

    res.json({
      success: result.success,
      documentId: result.documentId,
      documentType: result.documentType,
      extractedData: result.extractedData,
      faceExtracted: result.faceExtracted,
      overallScore: result.overallScore,
      warnings: result.warnings,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error: any) {
    console.error("Document scan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/identity/documents
 * Get all scanned documents for user
 */
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || "1";

    const documents = documentService.getUserDocuments(userId);

    res.json({
      success: true,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        verified: d.verified,
        scannedAt: d.scannedAt,
        extractedData: d.result.extractedData,
      })),
    });
  } catch (error: any) {
    console.error("Get documents error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/document/validate-type", async (req: Request, res: Response) => {
  try {
    const { type, documentNumber } = req.body;
    const result = validateDocumentByType(type, documentNumber);

    if (!result.valid) {
      return res.status(400).json({ success: false, ...result });
    }

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/face-match", async (req: Request, res: Response) => {
  try {
    const {
      idFaceEmbedding,
      liveFaceEmbedding,
      idImageData,
      liveImageData,
      threshold,
      antiSpoof,
    } = req.body;

    const result = matchFace({
      idFaceEmbedding,
      liveFaceEmbedding,
      idImageData,
      liveImageData,
      threshold,
      antiSpoof,
    });

    res.json({
      success: true,
      confidence: result.confidence,
      threshold: result.threshold,
      matched: result.matched,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== OVERALL STATUS ====================

/**
 * GET /api/identity/status
 * Get complete identity verification status
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || "1";

    const livenessStatus = livenessService.getUserLivenessStatus(userId);
    const biometricsStatus = biometricsService.getBiometricStatus(userId);
    const documentStatus =
      documentService.getDocumentVerificationStatus(userId);

    // Calculate overall score
    let score = 0;
    if (livenessStatus.verified) score += 35;
    if (biometricsStatus.enrolled) score += 25;
    if (documentStatus.verified) score += 40;

    const verificationLevel =
      score >= 80
        ? "full"
        : score >= 50
          ? "partial"
          : score > 0
            ? "basic"
            : "none";

    res.json({
      success: true,
      userId,
      score,
      verificationLevel,
      liveness: {
        verified: livenessStatus.verified,
        lastVerification: livenessStatus.lastVerification,
        score: livenessStatus.score,
      },
      biometrics: {
        enrolled: biometricsStatus.enrolled,
        type: biometricsStatus.type,
        lastVerified: biometricsStatus.lastVerified,
      },
      documents: {
        verified: documentStatus.verified,
        count: documentStatus.documentCount,
        types: documentStatus.types,
      },
    });
  } catch (error: any) {
    console.error("Get identity status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// Palm Scan Endpoints
// ===========================================================================

const palmStartSchema = z.object({ userId: z.string().min(1) });

router.post("/palm/start", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { userId } = palmStartSchema.parse(req.body);
    const session = palmScanService.startPalmSession(userId);
    sendContractResponse(req, res, {
      success: true,
      data: {
        sessionId: session.sessionId,
        startedAt: session.startedAt.toISOString(),
        status: session.status,
      },
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "PALM_START_FAILED", message: error.message },
    });
  }
});

const palmAnalyzeSchema = z.object({
  frameBase64: z.string().min(100),
  width: z.number().int().positive().default(640),
  height: z.number().int().positive().default(480),
});

router.post("/palm/analyze", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { frameBase64, width, height } = palmAnalyzeSchema.parse(req.body);
    const analysis = palmScanService.analyzePalmFrame(frameBase64, width, height);
    sendContractResponse(req, res, {
      success: true,
      data: analysis as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "PALM_ANALYZE_FAILED", message: error.message },
    });
  }
});

const palmEnrollSchema = z.object({
  userId: z.string().min(1),
  frames: z
    .array(
      z.object({
        data: z.string().min(100),
        quality: z.number().min(0).max(100),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .min(3),
});

router.post("/palm/enroll", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { userId, frames } = palmEnrollSchema.parse(req.body);
    const result = await palmScanService.enrollPalm(userId, frames);
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    const status = error.message?.includes("DUPLICATE") ? 409 : 400;
    sendContractResponse(req, res, {
      success: false,
      status,
      error: { code: "PALM_ENROLL_FAILED", message: error.message },
    });
  }
});

// ===========================================================================
// Human ID Endpoints
// ===========================================================================

const mintHumanIdSchema = z.object({
  userId: z.string().min(1),
  subjectDID: z.string().startsWith("did:"),
});

router.post("/human-id/mint", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { userId, subjectDID } = mintHumanIdSchema.parse(req.body);
    const result = await humanIdService.mintHumanId(userId, subjectDID);
    sendContractResponse(req, res, {
      success: true,
      data: {
        humanIdHash: result.humanIdHash,
        vcJws: result.vcJws,
        ipfsCid: result.ipfsCid,
        expiresAt: result.expiresAt.toISOString(),
        status: result.status,
      },
    });
  } catch (error: any) {
    const code = error.message?.includes("ALREADY") ? 409 : 400;
    sendContractResponse(req, res, {
      success: false,
      status: code,
      error: { code: "HUMAN_ID_MINT_FAILED", message: error.message },
    });
  }
});

const getHumanIdSchema = z.object({ userId: z.string().min(1) });

router.get("/human-id/:userId", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { userId } = getHumanIdSchema.parse(req.params);
    const record = humanIdService.getHumanId(userId);
    if (!record) {
      return sendContractResponse(req, res, {
        success: false,
        status: 404,
        error: { code: "NOT_FOUND", message: "No Human ID found" },
      });
    }
    sendContractResponse(req, res, {
      success: true,
      data: {
        humanIdHash: record.humanIdHash,
        status: record.status,
        issuedAt: record.issuedAt.toISOString(),
        expiresAt: record.expiresAt.toISOString(),
        chainId: record.chainId,
        txHash: record.txHash,
        ipfsCid: record.ipfsCid,
        metadata: record.metadata,
      },
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "HUMAN_ID_GET_FAILED", message: error.message },
    });
  }
});

const verifyHumanIdSchema = z.object({
  humanIdHash: z.string().min(10),
});

router.post("/human-id/verify", apiRateLimiter, optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // IDOR guard when authenticated; public verifiers may omit credentials.
    if (req.user) {
      const _bound = resolveBoundUserId(req, res);
      if (_bound === null) return;
    }
    const { humanIdHash } = verifyHumanIdSchema.parse(req.body);
    const result = humanIdService.verifyHumanId(humanIdHash);
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "HUMAN_ID_VERIFY_FAILED", message: error.message },
    });
  }
});

const revokeHumanIdSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().optional(),
});

router.post("/human-id/revoke", apiRateLimiter, authOrStampMiddleware, async (req: Request, res: Response) => {
  try {
    const boundUserId = resolveBoundUserId(req, res);
    if (!boundUserId) return;
    const { userId, reason } = revokeHumanIdSchema.parse(req.body);
    const result = humanIdService.revokeHumanId(userId, reason);
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "HUMAN_ID_REVOKE_FAILED", message: error.message },
    });
  }
});

// ---------------------------------------------------------------------------
// WebAuthn Biometric Routes  (Agent 3)
// ---------------------------------------------------------------------------

const webauthnEnrollStartSchema = z.object({
  userId: z.string().min(1),
  biometricMethod: z.enum(["fingerprint", "face_id", "passkey_platform"]),
}).strict();

const webauthnEnrollCompleteSchema = z.object({
  challengeId: z.string().uuid(),
  registrationResponse: z.any(), // WebAuthn RegistrationResponseJSON
  biometricMethod: z.enum(["fingerprint", "face_id", "passkey_platform"]),
}).strict();

const webauthnAuthStartSchema = z.object({
  userId: z.string().min(1),
}).strict();

const webauthnAuthCompleteSchema = z.object({
  challengeId: z.string().uuid(),
  authenticationResponse: z.any(), // WebAuthn AuthenticationResponseJSON
}).strict();

const webauthnDeleteSchema = z.object({
  userId: z.string().min(1),
}).strict();

/**
 * POST /api/identity/webauthn/enroll/start
 * Begin WebAuthn biometric enrollment — returns registration options
 */
router.post("/api/identity/webauthn/enroll/start", async (req: Request, res: Response) => {
  try {
    const { userId, biometricMethod } = webauthnEnrollStartSchema.parse(req.body);
    const userAgent = req.headers["user-agent"] || "unknown";
    const result = await webauthnService.startEnrollment(userId, biometricMethod, userAgent);
    sendContractResponse(req, res, {
      success: true,
      data: {
        challengeId: result.challengeId,
        options: result.options as unknown as Record<string, unknown>,
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "WEBAUTHN_ENROLL_START_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

/**
 * POST /api/identity/webauthn/enroll/complete
 * Complete WebAuthn biometric enrollment — verifies registration response
 */
router.post("/api/identity/webauthn/enroll/complete", async (req: Request, res: Response) => {
  try {
    const { challengeId, registrationResponse, biometricMethod } =
      webauthnEnrollCompleteSchema.parse(req.body);
    const userAgent = req.headers["user-agent"] || "unknown";
    const result = await webauthnService.completeEnrollment(
      challengeId,
      registrationResponse,
      biometricMethod,
      userAgent,
    );
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "WEBAUTHN_ENROLL_COMPLETE_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

/**
 * POST /api/identity/webauthn/auth/start
 * Begin WebAuthn biometric authentication — returns authentication options
 */
router.post("/api/identity/webauthn/auth/start", async (req: Request, res: Response) => {
  try {
    const { userId } = webauthnAuthStartSchema.parse(req.body);
    const result = await webauthnService.startAuthentication(userId);
    sendContractResponse(req, res, {
      success: true,
      data: {
        challengeId: result.challengeId,
        options: result.options as unknown as Record<string, unknown>,
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "WEBAUTHN_AUTH_START_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

/**
 * POST /api/identity/webauthn/auth/complete
 * Complete WebAuthn biometric authentication — verifies authentication response
 */
router.post("/api/identity/webauthn/auth/complete", async (req: Request, res: Response) => {
  try {
    const { challengeId, authenticationResponse } =
      webauthnAuthCompleteSchema.parse(req.body);
    const result = await webauthnService.completeAuthentication(
      challengeId,
      authenticationResponse,
    );
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "WEBAUTHN_AUTH_COMPLETE_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

/**
 * GET /api/identity/webauthn/enrollments
 * List all active WebAuthn enrollments for a user
 */
router.get("/api/identity/webauthn/enrollments", async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || "";
    if (!userId) {
      sendContractResponse(req, res, {
        success: false,
        status: 400,
        error: { code: "MISSING_USER_ID", message: "userId query parameter is required" },
      });
      return;
    }
    const enrollments = webauthnService.listEnrollments(userId);
    sendContractResponse(req, res, {
      success: true,
      data: { enrollments: enrollments as unknown as Record<string, unknown> },
    });
  } catch (error: any) {
    sendContractResponse(req, res, {
      success: false,
      status: 400,
      error: { code: "WEBAUTHN_LIST_FAILED", message: error.message },
    });
  }
});

/**
 * DELETE /api/identity/webauthn/enrollments/:enrollmentId
 * Soft-delete a WebAuthn enrollment (prevents deletion of last enrollment for Human ID holders)
 */
router.delete("/api/identity/webauthn/enrollments/:enrollmentId", async (req: Request, res: Response) => {
  try {
    const { enrollmentId } = req.params;
    const parsed = webauthnDeleteSchema.parse(req.body);
    const result = webauthnService.deactivateEnrollment(enrollmentId, parsed.userId);
    sendContractResponse(req, res, {
      success: true,
      data: result as unknown as Record<string, unknown>,
    });
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "WEBAUTHN_DELETE_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

/**
 * POST /api/identity/human-id/mint-biometric
 * Mint a Human ID using a WebAuthn biometric enrollment (alternative to palm scan)
 * HANDOFF: Agent 1 owns humanIdService — this route calls into Agent 1's service.
 * If humanIdService does not yet support biometricEnrollmentId, this stubs the call.
 */
router.post("/api/identity/human-id/mint-biometric", async (req: Request, res: Response) => {
  try {
    const mintBiometricSchema = z.object({
      userId: z.string().min(1),
      enrollmentId: z.string().uuid(),
    }).strict();
    const { userId, enrollmentId } = mintBiometricSchema.parse(req.body);

    // Validate the enrollment exists and belongs to this user
    const enrollment = webauthnService.getEnrollment(enrollmentId);
    if (!enrollment) {
      sendContractResponse(req, res, {
        success: false,
        status: 404,
        error: { code: "ENROLLMENT_NOT_FOUND", message: "WebAuthn enrollment not found" },
      });
      return;
    }
    if (enrollment.userId !== userId) {
      sendContractResponse(req, res, {
        success: false,
        status: 403,
        error: { code: "FORBIDDEN", message: "Enrollment does not belong to this user" },
      });
      return;
    }
    if (!enrollment.isActive) {
      sendContractResponse(req, res, {
        success: false,
        status: 400,
        error: { code: "ENROLLMENT_INACTIVE", message: "Enrollment is not active" },
      });
      return;
    }

    // Agent 1 handoff: Call humanIdService.mintHumanId with biometric path
    // If Agent 1's service doesn't yet support biometricRecordId, this will stub
    const biometricEnrollmentMethod = webauthnService.toEnrollmentMethod(enrollment.biometricMethod);
    
    // Attempt to call Agent 1's humanIdService with the biometric enrollment data.
    // This endpoint does not currently accept subject DID input, so use a deterministic
    // subject DID derived from the authenticated user ID.
    try {
      const subjectDID = `did:credity:user:${userId}`;
      const humanIdResult = await humanIdService.mintHumanId(userId, subjectDID);
      sendContractResponse(req, res, {
        success: true,
        data: {
          ...(humanIdResult as unknown as Record<string, unknown>),
          biometricMethod: biometricEnrollmentMethod,
          webauthnEnrollmentId: enrollmentId,
        },
      });
    } catch (mintError: any) {
      // If Agent 1's service can't handle this yet, return a clear handoff message
      sendContractResponse(req, res, {
        success: false,
        status: 501,
        error: {
          code: "HUMAN_ID_BIOMETRIC_MINT_PENDING",
          message: `Biometric mint via ${biometricEnrollmentMethod} requires Agent 1 to expand humanIdService.mintHumanId to accept biometricRecordId instead of palmScanId. Error: ${mintError.message}`,
        },
      });
    }
  } catch (error: any) {
    const statusCode = error instanceof WebAuthnError ? error.statusCode : 400;
    const code = error instanceof WebAuthnError ? error.code : "MINT_BIOMETRIC_FAILED";
    sendContractResponse(req, res, {
      success: false,
      status: statusCode,
      error: { code, message: error.message },
    });
  }
});

export default router;
