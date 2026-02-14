import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import * as livenessService from '../services/liveness-service';
import * as documentService from '../services/document-scanner-service';
import {
    calculateReputationScore,
    calculateSafeDateScore,
    deriveSafeDateInputs,
    listReputationEvents,
    ReputationCategory,
    ReputationEventInput,
    upsertReputationEvent,
} from '../services/reputation-rail-service';

const router = Router();

const ALLOWED_CATEGORIES: ReputationCategory[] = [
    'transport',
    'accommodation',
    'delivery',
    'employment',
    'finance',
    'social',
    'identity',
];

function parseUserId(rawValue: unknown): number {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('userId must be a positive integer');
    }
    return parsed;
}

function getAllowedPlatforms(): Set<string> {
    const raw = process.env.REPUTATION_PLATFORM_ALLOWLIST || '';
    return new Set(
        raw
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
    );
}

async function buildSafeDateSnapshot(userId: number) {
    const reputationScore = calculateReputationScore(userId);
    const user = await storage.getUser(userId);
    const liveness = livenessService.getUserLivenessStatus(String(userId));
    const documentStatus = documentService.getDocumentVerificationStatus(String(userId));
    const dynamicInputs = deriveSafeDateInputs(userId);

    const safeDate = calculateSafeDateScore(userId, reputationScore, {
        identityVerified: Boolean(user?.did) || documentStatus.verified,
        livenessVerified: liveness.verified,
        ...dynamicInputs,
    });

    return {
        reputationScore,
        safeDate,
    };
}

/**
 * GET /api/reputation/events
 * List reputation events for a user.
 */
router.get('/events', async (req: Request, res: Response) => {
    try {
        const userId = parseUserId(req.query.userId || 1);
        const categoryRaw = req.query.category ? String(req.query.category) : undefined;
        const category =
            categoryRaw && ALLOWED_CATEGORIES.includes(categoryRaw as ReputationCategory)
                ? (categoryRaw as ReputationCategory)
                : undefined;
        const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));

        const events = listReputationEvents(userId, category).slice(0, limit);
        return res.json({
            success: true,
            events,
            count: events.length,
        });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: error?.message || 'Failed to list reputation events',
        });
    }
});

/**
 * POST /api/reputation/events
 * Ingest a platform-signed reputation event.
 */
router.post('/events', async (req: Request, res: Response) => {
    try {
        const requiredApiKey = process.env.REPUTATION_WRITE_API_KEY;
        if (requiredApiKey) {
            const suppliedApiKey = String(req.header('x-api-key') || req.header('X-API-Key') || '');
            if (!suppliedApiKey || suppliedApiKey !== requiredApiKey) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid platform write API key',
                });
            }
        }

        const body = req.body as ReputationEventInput;
        const platformId = String(body?.platform_id || '').trim().toLowerCase();
        const allowedPlatforms = getAllowedPlatforms();
        if (allowedPlatforms.size > 0 && !allowedPlatforms.has(platformId)) {
            return res.status(403).json({
                success: false,
                error: 'Platform is not allowlisted for reputation writes',
            });
        }

        const result = upsertReputationEvent({
            ...body,
            platform_id: platformId,
        });

        const { reputationScore, safeDate } = await buildSafeDateSnapshot(result.event.user_id);
        const statusCode = result.duplicate ? 200 : 201;

        return res.status(statusCode).json({
            success: true,
            duplicate: result.duplicate,
            event: result.event,
            reputation: reputationScore,
            safe_date: safeDate,
        });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: error?.message || 'Failed to ingest reputation event',
        });
    }
});

/**
 * GET /api/reputation/score
 * Calculate and return the user reputation rail score.
 */
router.get('/score', async (req: Request, res: Response) => {
    try {
        const userId = parseUserId(req.query.userId || 1);
        const reputationScore = calculateReputationScore(userId);

        return res.json({
            success: true,
            reputation: reputationScore,
        });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: error?.message || 'Failed to calculate reputation score',
        });
    }
});

/**
 * GET /api/reputation/safedate
 * Calculate and return SafeDate score from trust + behavior signals.
 */
router.get('/safedate', async (req: Request, res: Response) => {
    try {
        const userId = parseUserId(req.query.userId || 1);
        const { safeDate } = await buildSafeDateSnapshot(userId);

        return res.json({
            success: true,
            safe_date: safeDate,
        });
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            error: error?.message || 'Failed to calculate SafeDate score',
        });
    }
});

export default router;
