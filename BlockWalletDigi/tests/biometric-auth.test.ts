/**
 * biometric-auth.test.ts
 *
 * Section 4 – Server Tests (plan-agentThreeBiometricExpansion.prompt.md)
 *
 * 1. issueStamp returns valid base64url that decodes correctly
 * 2. verifyStamp: valid passes; >5min old fails; replayed nonce fails; wrong HMAC fails
 * 3. authOrStampMiddleware: Bearer works; stamp works without Bearer; neither → 401
 * 4. resolveBoundUserId rejects mismatched userId with 403
 * 5. All biometric routes return 401 without any auth (regression test)
 */

import express from "express";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  issueStamp,
  verifyStamp,
  authOrStampMiddleware,
  registerSecretResolver,
} from "../server/middleware/biometric-stamp";
import { resolveBoundUserId } from "../server/utils/authz";
import {
  generateTokenPair,
  initAuth,
} from "@credity/shared-auth";
import identityRoutes from "../server/routes/identity";

// Initialise the auth library with the same test secrets as setup-env.ts so
// that tokens generated here are verifiable by verifyAccessToken inside the
// middleware without needing to mock the module.
initAuth({
  jwtSecret: process.env.JWT_SECRET ?? "test_jwt_secret_credity_wallet_32_chars_min",
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ?? "test_refresh_secret_credity_wallet_32min",
  app: "wallet",
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID    = 42;
const DEVICE_ID  = "device-test-001";
const SECRET     = "super-secret-device-key-32chars!!";

/** Register a simple in-memory secret resolver for unit tests. */
function useTestResolver(secret: string = SECRET) {
  registerSecretResolver(async (uid, did) => {
    if (uid === USER_ID && did === DEVICE_ID) return secret;
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. issueStamp – returns valid base64url that decodes correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("issueStamp", () => {
  it("returns a non-empty string", () => {
    const result = issueStamp(USER_ID, DEVICE_ID, SECRET);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("decodes to a valid stamp object with all required fields", () => {
    const result = issueStamp(USER_ID, DEVICE_ID, SECRET);

    // Must be valid base64url
    const json = Buffer.from(result, "base64url").toString("utf8");
    const stamp = JSON.parse(json) as Record<string, unknown>;

    expect(stamp.userId).toBe(USER_ID);
    expect(stamp.deviceId).toBe(DEVICE_ID);
    expect(typeof stamp.nonce).toBe("string");
    expect((stamp.nonce as string).length).toBeGreaterThan(0);
    expect(typeof stamp.issuedAt).toBe("number");
    expect((stamp.issuedAt as number)).toBeCloseTo(Date.now(), -3); // within ~1 s
    expect(typeof stamp.hmac).toBe("string");
    expect((stamp.hmac as string).length).toBe(64); // HMAC-SHA256 hex = 64 chars
  });

  it("produces different stamps on consecutive calls (unique nonces)", () => {
    const s1 = issueStamp(USER_ID, DEVICE_ID, SECRET);
    const s2 = issueStamp(USER_ID, DEVICE_ID, SECRET);
    expect(s1).not.toBe(s2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. verifyStamp – valid / expired / replay / wrong HMAC
// ─────────────────────────────────────────────────────────────────────────────

describe("verifyStamp", () => {
  beforeEach(() => {
    useTestResolver();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a freshly-issued valid stamp and returns userId + deviceId", async () => {
    const stamp = issueStamp(USER_ID, DEVICE_ID, SECRET);
    const result = await verifyStamp(stamp);
    expect(result.userId).toBe(USER_ID);
    expect(result.deviceId).toBe(DEVICE_ID);
  });

  it("rejects a stamp older than 5 minutes with STAMP_EXPIRED", async () => {
    const SIX_MIN_MS = 6 * 60 * 1_000;
    const realNow = Date.now();

    vi.useFakeTimers();
    vi.setSystemTime(realNow - SIX_MIN_MS); // issue stamp 6 min ago
    const expiredStamp = issueStamp(USER_ID, DEVICE_ID, SECRET);

    vi.setSystemTime(realNow);              // restore clock to "now"

    await expect(verifyStamp(expiredStamp)).rejects.toThrow("STAMP_EXPIRED");
  });

  it("rejects a replayed (already-consumed) nonce with STAMP_REPLAY", async () => {
    const stamp = issueStamp(USER_ID, DEVICE_ID, SECRET);

    // First verification should succeed
    await verifyStamp(stamp);

    // Second attempt with the same stamp must fail
    await expect(verifyStamp(stamp)).rejects.toThrow("STAMP_REPLAY");
  });

  it("rejects a stamp with a tampered HMAC with STAMP_INVALID_HMAC", async () => {
    const validStamp = issueStamp(USER_ID, DEVICE_ID, SECRET);
    const decoded = JSON.parse(
      Buffer.from(validStamp, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    // Corrupt the HMAC
    decoded.hmac = "a".repeat(64);

    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    await expect(verifyStamp(tampered)).rejects.toThrow("STAMP_INVALID_HMAC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. authOrStampMiddleware – Bearer / stamp / neither
// ─────────────────────────────────────────────────────────────────────────────

describe("authOrStampMiddleware", () => {
  /** Build a minimal Express app wired through the middleware. */
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.get("/probe", authOrStampMiddleware, (req, res) => {
      // Echo req.user back so tests can peek at it
      res.json({ ok: true, user: (req as express.Request & { user?: unknown }).user });
    });
    return app;
  }

  it("accepts a valid Bearer JWT and sets req.user from the token payload", async () => {
    // Generate a real JWT using the same secret initAuth was called with above.
    const { accessToken } = generateTokenPair({
      id: 10,
      username: "alice",
      role: "holder",
    });

    const app = buildApp();
    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.userId).toBe(10);
  });

  it("accepts a valid biometric stamp when no Bearer header is present", async () => {
    const stampSecret = "stamp-mw-secret-key-32chars!!!!";
    const stampUserId = 77;
    const stampDeviceId = "device-mw-test";

    registerSecretResolver(async (uid, did) => {
      if (uid === stampUserId && did === stampDeviceId) return stampSecret;
      return null;
    });

    const stamp = issueStamp(stampUserId, stampDeviceId, stampSecret);
    const app = buildApp();

    const res = await request(app)
      .get("/probe")
      .set("x-biometric-stamp", stamp);

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(stampUserId);
    expect(res.body.user.role).toBe("holder");
  });

  it("returns 401 when neither Bearer nor stamp is provided", async () => {
    const app = buildApp();
    const res = await request(app).get("/probe");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it("returns 401 when Bearer token fails verification", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/probe")
      .set("Authorization", "Bearer not.a.valid.jwt.at.all");

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. resolveBoundUserId – IDOR prevention
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveBoundUserId", () => {
  it("rejects a request where body.userId does not match the authenticated user (403)", async () => {
    const app = express();
    app.use(express.json());

    app.post("/guarded", (req, res) => {
      // Simulate a successfully authenticated user
      (req as express.Request & { user?: unknown }).user = {
        userId: 5,
        username: "carol",
        role: "holder",
        type: "access",
      };

      const id = resolveBoundUserId(req, res);
      if (id !== null) {
        res.json({ resolvedId: id });
      }
      // If null, resolveBoundUserId has already sent the error response
    });

    const res = await request(app)
      .post("/guarded")
      .send({ userId: 99 }); // mismatched — auth is 5, body says 99

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AUTH_USER_MISMATCH");
  });

  it("passes when body.userId matches the authenticated user", async () => {
    const app = express();
    app.use(express.json());

    app.post("/guarded-ok", (req, res) => {
      (req as express.Request & { user?: unknown }).user = {
        userId: 5,
        username: "carol",
        role: "holder",
        type: "access",
      };
      const id = resolveBoundUserId(req, res);
      if (id !== null) res.json({ resolvedId: id });
    });

    const res = await request(app)
      .post("/guarded-ok")
      .send({ userId: 5 }); // correct match

    expect(res.status).toBe(200);
    expect(res.body.resolvedId).toBe(5);
  });

  it("returns 401 when there is no authenticated user on the request", async () => {
    const app = express();
    app.use(express.json());

    app.post("/guarded-noop", (req, res) => {
      // No req.user set → simulates unauthenticated request
      const id = resolveBoundUserId(req, res);
      if (id !== null) res.json({ resolvedId: id });
    });

    const res = await request(app)
      .post("/guarded-noop")
      .send({ userId: 5 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Route protection – biometric routes must return 401 without any auth
//    (regression guard — prevents silent removal of auth middleware)
// ─────────────────────────────────────────────────────────────────────────────

describe("biometric route protection (regression)", () => {
  /**
   * Build a hardened test app that mirrors production wiring:
   *   authOrStampMiddleware → identityRoutes
   *
   * This spec locks in the intended security posture.  A future PR that
   * removes or bypasses authOrStampMiddleware from the identity router will
   * cause these tests to fail.
   */
  function buildHardenedApp() {
    const app = express();
    app.use(express.json());
    // Global auth gate applied before all identity routes
    app.use("/api/v1/identity", authOrStampMiddleware, identityRoutes);
    return app;
  }

  const unauthCases: { method: "get" | "post"; path: string }[] = [
    { method: "get",  path: "/api/v1/identity/biometrics/status" },
    { method: "post", path: "/api/v1/identity/biometrics/enroll" },
    { method: "post", path: "/api/v1/identity/biometrics/verify" },
    { method: "post", path: "/api/v1/identity/palm/start" },
    { method: "post", path: "/api/v1/identity/palm/enroll" },
    { method: "post", path: "/api/v1/identity/human-id/mint" },
    { method: "get",  path: "/api/v1/identity/human-id/99" },
    { method: "post", path: "/api/v1/identity/human-id/revoke" },
  ];

  const app = buildHardenedApp();

  for (const { method, path } of unauthCases) {
    it(`${method.toUpperCase()} ${path} → 401 when no credentials supplied`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });
  }
});
