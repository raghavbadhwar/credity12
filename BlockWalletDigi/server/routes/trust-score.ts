/**
 * Trust Score API Routes
 * Provides endpoints for trust score calculation and improvement suggestions
 */

import { Router, Request, Response } from 'express';
import {
    calculateTrustScore,
    generateImprovementSuggestions,
    getScoreHistory,
    UserTrustData,
    ImprovementSuggestion
} from '../services/trust-score-service';

const router = Router();

/**
 * GET /api/trust-score
 * Get the current trust score with full breakdown
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;

        // Build user trust data from various sources
        // In production, this would aggregate from database
        const userData = await getUserTrustData(userId);
        const breakdown = calculateTrustScore(userData);
        const suggestions = generateImprovementSuggestions(userData, breakdown);
        const history = getScoreHistory(userId);

        res.json({
            success: true,
            score: breakdown.totalScore,
            level: breakdown.level,
            levelLabel: breakdown.levelLabel,
            breakdown: {
                identity: {
                    ...breakdown.identity,
                    percentage: 40,
                    maxPoints: 40
                },
                activity: {
                    ...breakdown.activity,
                    percentage: 30,
                    maxPoints: 30
                },
                reputation: {
                    ...breakdown.reputation,
                    percentage: 30,
                    maxPoints: 30
                }
            },
            suggestions: suggestions.slice(0, 5), // Top 5 suggestions
            history: history.slice(-7), // Last 7 days
            lastUpdated: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Trust score error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate trust score'
        });
    }
});

/**
 * GET /api/trust-score/breakdown
 * Get detailed breakdown of trust score components
 */
router.get('/breakdown', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;
        const userData = await getUserTrustData(userId);
        const breakdown = calculateTrustScore(userData);

        res.json({
            success: true,
            breakdown,
            rawData: {
                documentsVerified: userData.documentVerified,
                livenessCompleted: userData.livenessVerified,
                biometricsEnabled: userData.biometricsSetup,
                digilockerConnected: userData.digilockerConnected,
                totalCredentials: userData.totalCredentials,
                totalVerifications: userData.totalVerifications,
                platformConnections: userData.platformConnectionCount,
                lastActivity: userData.lastActivityDate
            }
        });
    } catch (error: any) {
        console.error('Trust score breakdown error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get score breakdown'
        });
    }
});

/**
 * GET /api/trust-score/suggestions
 * Get all improvement suggestions
 */
router.get('/suggestions', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;
        const userData = await getUserTrustData(userId);
        const breakdown = calculateTrustScore(userData);
        const suggestions = generateImprovementSuggestions(userData, breakdown);

        const quickWins = suggestions.filter((s: ImprovementSuggestion) => s.category === 'quick_win');
        const longTerm = suggestions.filter((s: ImprovementSuggestion) => s.category === 'long_term');

        res.json({
            success: true,
            quickWins,
            longTerm,
            potentialPoints: suggestions.reduce((sum: number, s: ImprovementSuggestion) => sum + s.points, 0)
        });
    } catch (error: any) {
        console.error('Trust score suggestions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suggestions'
        });
    }
});

/**
 * GET /api/trust-score/history
 * Get historical trust score data
 */
router.get('/history', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;
        const days = parseInt(req.query.days as string) || 30;
        const history = getScoreHistory(userId);

        res.json({
            success: true,
            history: history.slice(-days),
            trend: calculateTrend(history)
        });
    } catch (error: any) {
        console.error('Trust score history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get score history'
        });
    }
});

/**
 * Calculate score trend (up, down, stable)
 */
function calculateTrend(history: { date: string; score: number }[]): string {
    if (history.length < 7) return 'stable';

    const recent = history.slice(-7);
    const older = history.slice(-14, -7);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff > 3) return 'up';
    if (diff < -3) return 'down';
    return 'stable';
}

/**
 * Build user trust data from storage/database
 * In production, this would query multiple tables
 */
import * as livenessService from '../services/liveness-service';
import * as biometricsService from '../services/biometrics-service';
import * as documentService from '../services/document-scanner-service';

/**
 * Build user trust data from storage/database
 * In production, this would query multiple tables
 */
async function getUserTrustData(userId: number): Promise<UserTrustData> {
    // Fetch real status from services
    const livenessStatus = livenessService.getUserLivenessStatus(userId.toString());
    const biometricsStatus = biometricsService.getBiometricStatus(userId.toString());
    const documentStatus = documentService.getDocumentVerificationStatus(userId.toString());

    // In production, aggregate from: users, credentials, verifications, connections tables

    return {
        userId,
        // Identity (Real Data)
        livenessVerified: livenessStatus.verified,
        documentVerified: documentStatus.verified,
        biometricsSetup: biometricsStatus.enrolled,
        digilockerConnected: documentStatus.documentCount > 0, // Assume connected if docs exist

        // Activity (Mock for now, easy to hook up later)
        totalCredentials: documentStatus.documentCount + 3, // Base + Verified Docs
        totalVerifications: 5,
        platformConnectionCount: 2,
        lastActivityDate: new Date(),

        // Reputation (Mock)
        suspiciousActivityFlags: 0,
        endorsementCount: 0,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0
    };
}

export default router;
