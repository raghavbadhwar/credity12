import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { verifyAccessToken } from "@credverse/shared-auth";

// Simple in-memory rate limiter for MVP
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 1000; // 1000 requests per minute

function readOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function resolveApiKeyTenant(keyHeader: string): Promise<{ tenantId: string; keyHash: string; error?: string }> {
    const keyHash = keyHeader;
    const apiKey = await storage.getApiKey(keyHash);
    if (!apiKey) {
        return { tenantId: "", keyHash, error: "Invalid API Key" };
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        return { tenantId: "", keyHash, error: "API Key expired" };
    }

    return { tenantId: apiKey.tenantId, keyHash };
}

function enforceApiRateLimit(keyHash: string): { allowed: boolean; error?: string } {
    const now = Date.now();
    const limitData = rateLimitMap.get(keyHash) || { count: 0, lastReset: now };

    if (now - limitData.lastReset > RATE_LIMIT_WINDOW) {
        limitData.count = 0;
        limitData.lastReset = now;
    }

    limitData.count++;
    rateLimitMap.set(keyHash, limitData);

    if (limitData.count > RATE_LIMIT_MAX) {
        return { allowed: false, error: "Rate limit exceeded" };
    }

    return { allowed: true };
}

export async function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
    const apiKeyHeader = req.headers["x-api-key"];

    if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
        return res.status(401).json({ message: "Missing or invalid API Key", code: "AUTH_UNAUTHORIZED" });
    }

    const resolved = await resolveApiKeyTenant(apiKeyHeader);
    if (resolved.error) {
        return res.status(401).json({ message: resolved.error, code: "AUTH_UNAUTHORIZED" });
    }

    const rate = enforceApiRateLimit(resolved.keyHash);
    if (!rate.allowed) {
        return res.status(429).json({ message: rate.error, code: "AUTH_RATE_LIMITED" });
    }

    (req as any).tenantId = resolved.tenantId;
    next();
}

/**
 * Allow either API key auth or JWT auth for mobile/app flows.
 * For JWT auth in non-production, tenantId may be provided via request body/query.
 */
export async function apiKeyOrAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader && typeof apiKeyHeader === "string") {
        const resolved = await resolveApiKeyTenant(apiKeyHeader);
        if (resolved.error) {
            return res.status(401).json({ message: resolved.error, code: "AUTH_UNAUTHORIZED" });
        }

        const rate = enforceApiRateLimit(resolved.keyHash);
        if (!rate.allowed) {
            return res.status(429).json({ message: rate.error, code: "AUTH_RATE_LIMITED" });
        }

        (req as any).tenantId = resolved.tenantId;
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing or invalid API Key", code: "AUTH_UNAUTHORIZED" });
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (!payload) {
        return res.status(401).json({ message: "Invalid or expired token", code: "AUTH_UNAUTHORIZED" });
    }

    (req as any).user = payload;
    const bodyTenantId = readOptionalString((req as any).body?.tenantId);
    const queryTenantId = readOptionalString((req as any).query?.tenantId);
    const tokenTenantId = readOptionalString((payload as any).tenantId);
    const tenantId =
        tokenTenantId
        || (process.env.NODE_ENV !== "production" ? bodyTenantId || queryTenantId : undefined)
        || String(payload.userId);

    (req as any).tenantId = tenantId;
    next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    // TODO: Integrate with Passport.js or similar for real user sessions
    // For now, we'll assume if tenantId is present (via API key), it's "authenticated" for API access
    // Or if it's a browser session, we'd check req.session
    if ((req as any).tenantId || (req as any).user) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized", code: "AUTH_UNAUTHORIZED" });
}
