import express from "express";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import identityRoutes from "../server/routes/identity";
import { __unsafeTemplateRecordForTests } from "../server/services/biometrics-service";
import {
  issueStamp,
  registerSecretResolver,
} from "../server/middleware/biometric-stamp";

// ─── Auth setup ──────────────────────────────────────────────────────────────
// Routes now require a biometric stamp (authOrStampMiddleware + resolveBoundUserId).
// Register a static test resolver and helper to mint per-user stamps.
const TEST_DEVICE_ID = "enc-workflow-device";
const TEST_SECRET    = "enc-workflow-secret-32chars-padded!";

beforeAll(() => {
  registerSecretResolver(async (uid, did) => {
    if (did === TEST_DEVICE_ID) return TEST_SECRET;
    return null;
  });
});

/** Mint a fresh stamp scoped to `userId` for use as X-Biometric-Stamp. */
function stampFor(userId: number): string {
  return issueStamp(userId, TEST_DEVICE_ID, TEST_SECRET);
}

// Numeric user IDs for these integration tests (resolveBoundUserId requires
// positive integers).
const USER_1 = 901;
const USER_2 = 902;
// ─────────────────────────────────────────────────────────────────────────────

const previousAllowClientIngest = process.env.ALLOW_CLIENT_EMBEDDING_INGEST;
beforeAll(() => {
  process.env.ALLOW_CLIENT_EMBEDDING_INGEST = "true";
});
afterAll(() => {
  if (previousAllowClientIngest === undefined)
    delete process.env.ALLOW_CLIENT_EMBEDDING_INGEST;
  else process.env.ALLOW_CLIENT_EMBEDDING_INGEST = previousAllowClientIngest;
});

describe("biometric encrypted template + embedding verification workflow", () => {
  it("stores encrypted template metadata and verifies live embedding", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/identity", identityRoutes);

    const embedding = [0.2, 0.1, 0.6, 0.4, 0.11, 0.22, 0.33, 0.44];
    const enroll = await request(app)
      .post("/api/v1/identity/biometrics/enroll")
      .set("X-Biometric-Stamp", stampFor(USER_1))
      .send({
        userId: USER_1,
        type: "face_id",
        deviceId: TEST_DEVICE_ID,
        faceEmbedding: embedding,
      });

    expect(enroll.status).toBe(200);
    expect(enroll.body.enrollment.metadata.algorithm).toBe("face_embedding_v1");

    const stored = __unsafeTemplateRecordForTests(String(USER_1));
    expect(stored).toBeTruthy();
    expect(stored?.encryptedTemplate.ciphertext).toBeTruthy();
    expect(stored?.encryptedTemplate.ciphertext).not.toContain("[0.2,0.1");

    const verify = await request(app)
      .post("/api/v1/identity/biometrics/verify")
      .set("X-Biometric-Stamp", stampFor(USER_1))
      .send({
        userId: USER_1,
        challengeId: "c-1",
        liveFaceEmbedding: [0.201, 0.101, 0.599, 0.401, 0.11, 0.22, 0.33, 0.44],
        antiSpoof: { liveSpoofRisk: 0.1, liveFaceDetected: true },
      });

    expect(verify.status).toBe(200);
    expect(verify.body.verified).toBe(true);
    expect(verify.body.result.confidence).toBeGreaterThan(0.95);
  });

  it("fails verification when anti-spoof check fails", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/identity", identityRoutes);

    await request(app)
      .post("/api/v1/identity/biometrics/enroll")
      .set("X-Biometric-Stamp", stampFor(USER_2))
      .send({
        userId: USER_2,
        type: "face_id",
        faceEmbedding: [0.4, 0.2, 0.5, 0.1],
      });

    const verify = await request(app)
      .post("/api/v1/identity/biometrics/verify")
      .set("X-Biometric-Stamp", stampFor(USER_2))
      .send({
        userId: USER_2,
        challengeId: "c-2",
        liveFaceEmbedding: [0.4, 0.2, 0.5, 0.1],
        antiSpoof: { liveSpoofRisk: 0.91, liveFaceDetected: true },
      });

    expect(verify.status).toBe(400);
    expect(String(verify.body.error)).toContain("anti_spoof_check_failed");
  });
});
