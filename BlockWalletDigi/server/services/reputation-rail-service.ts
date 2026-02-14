import { createHash, randomUUID } from 'crypto';

export type ReputationCategory =
    | 'transport'
    | 'accommodation'
    | 'delivery'
    | 'employment'
    | 'finance'
    | 'social'
    | 'identity';

export interface ReputationEventInput {
    event_id?: string;
    user_id: number;
    platform_id: string;
    category: ReputationCategory;
    signal_type: string;
    score: number;
    occurred_at?: string;
    metadata?: Record<string, unknown>;
}

export interface ReputationEventRecord {
    id: string;
    event_id: string;
    user_id: number;
    platform_id: string;
    category: ReputationCategory;
    signal_type: string;
    score: number;
    occurred_at: string;
    metadata: Record<string, unknown>;
    created_at: string;
    dedupe_key: string;
}

export interface ReputationCategoryBreakdown {
    category: ReputationCategory;
    weight: number;
    score: number;
    weighted_score: number;
    event_count: number;
}

export interface ReputationScoreSnapshot {
    user_id: number;
    score: number; // 0-1000
    event_count: number;
    category_breakdown: ReputationCategoryBreakdown[];
    computed_at: string;
}

export interface SafeDateBreakdown {
    identity_verified_points: number;
    liveness_points: number;
    background_clean_points: number;
    cross_platform_reputation_points: number;
    social_validation_points: number;
    harassment_free_points: number;
}

export interface SafeDateScoreSnapshot {
    user_id: number;
    score: number; // 0-100
    breakdown: SafeDateBreakdown;
    computed_at: string;
    reason_codes: string[];
}

export interface SafeDateInputs {
    identityVerified: boolean;
    livenessVerified: boolean;
    backgroundFlags: number;
    endorsementCount: number;
    harassmentReports: number;
}

interface UpsertResult {
    accepted: boolean;
    duplicate: boolean;
    event: ReputationEventRecord;
}

const CATEGORY_WEIGHTS: Record<ReputationCategory, number> = {
    transport: 15,
    accommodation: 15,
    delivery: 10,
    employment: 20,
    finance: 15,
    social: 10,
    identity: 15,
};

const CATEGORY_LIST = Object.keys(CATEGORY_WEIGHTS) as ReputationCategory[];

const HALF_LIFE_DAYS = 180;
const MAX_EVENT_AGE_DAYS = 365;

const HARASSMENT_SIGNALS = new Set<string>(['harassment_report', 'abuse_report']);
const SEVERE_BACKGROUND_SIGNALS = new Set<string>([
    'fraud_report',
    'chargeback_fraud',
    'policy_ban',
    'criminal_flag',
]);
const SOCIAL_VALIDATION_SIGNALS = new Set<string>([
    'endorsement',
    'positive_feedback',
    'verified_reference',
]);

const byUser = new Map<number, ReputationEventRecord[]>();
const byDedupe = new Map<string, ReputationEventRecord>();

function toIsoDate(input?: string): string {
    if (!input) return new Date().toISOString();
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid occurred_at date');
    }
    return date.toISOString();
}

function validateInput(input: ReputationEventInput): void {
    if (!Number.isInteger(input.user_id) || input.user_id <= 0) {
        throw new Error('user_id must be a positive integer');
    }
    if (!input.platform_id || input.platform_id.trim().length < 2) {
        throw new Error('platform_id is required');
    }
    if (!CATEGORY_LIST.includes(input.category)) {
        throw new Error(`Unsupported category: ${input.category}`);
    }
    if (!input.signal_type || input.signal_type.trim().length < 2) {
        throw new Error('signal_type is required');
    }
    if (typeof input.score !== 'number' || Number.isNaN(input.score) || input.score < 0 || input.score > 100) {
        throw new Error('score must be a number between 0 and 100');
    }
}

function dedupeKeyFor(input: ReputationEventInput, occurredAtIso: string): string {
    if (input.event_id) {
        return `${input.user_id}:${input.event_id}`;
    }

    const normalizedPlatformId = input.platform_id.trim().toLowerCase();
    const normalizedSignalType = input.signal_type.trim().toLowerCase();
    const metadata = JSON.stringify(input.metadata || {});
    const digest = createHash('sha256')
        .update(
            `${input.user_id}|${normalizedPlatformId}|${input.category}|${normalizedSignalType}|${input.score}|${occurredAtIso}|${metadata}`,
            'utf8',
        )
        .digest('hex');
    return `${input.user_id}:${digest}`;
}

function decayMultiplier(occurredAtIso: string): number {
    const now = Date.now();
    const occurred = new Date(occurredAtIso).getTime();
    const ageDays = Math.max(0, (now - occurred) / (1000 * 60 * 60 * 24));
    if (ageDays > MAX_EVENT_AGE_DAYS) return 0;
    const halfLives = ageDays / HALF_LIFE_DAYS;
    return Math.pow(0.5, halfLives);
}

export function upsertReputationEvent(input: ReputationEventInput): UpsertResult {
    validateInput(input);
    const occurredAtIso = toIsoDate(input.occurred_at);
    const dedupeKey = dedupeKeyFor(input, occurredAtIso);
    const existing = byDedupe.get(dedupeKey);
    if (existing) {
        return { accepted: false, duplicate: true, event: existing };
    }

    const event: ReputationEventRecord = {
        id: randomUUID(),
        event_id: input.event_id || randomUUID(),
        user_id: input.user_id,
        platform_id: input.platform_id.trim().toLowerCase(),
        category: input.category,
        signal_type: input.signal_type.trim().toLowerCase(),
        score: Math.round(input.score),
        occurred_at: occurredAtIso,
        metadata: input.metadata || {},
        created_at: new Date().toISOString(),
        dedupe_key: dedupeKey,
    };

    const current = byUser.get(event.user_id) || [];
    current.push(event);
    byUser.set(event.user_id, current);
    byDedupe.set(dedupeKey, event);

    return { accepted: true, duplicate: false, event };
}

export function listReputationEvents(userId: number, category?: ReputationCategory): ReputationEventRecord[] {
    const all = byUser.get(userId) || [];
    const filtered = category ? all.filter((event) => event.category === category) : all;
    return [...filtered].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function calculateReputationScore(userId: number): ReputationScoreSnapshot {
    const events = listReputationEvents(userId);
    const breakdown: ReputationCategoryBreakdown[] = CATEGORY_LIST.map((category) => {
        const categoryEvents = events.filter((event) => event.category === category);
        let weightedNumerator = 0;
        let weightedDenominator = 0;

        for (const event of categoryEvents) {
            const decay = decayMultiplier(event.occurred_at);
            if (decay <= 0) continue;
            weightedNumerator += event.score * decay;
            weightedDenominator += decay;
        }

        const score = weightedDenominator > 0 ? Math.round(weightedNumerator / weightedDenominator) : 0;
        const weight = CATEGORY_WEIGHTS[category];
        const weightedScore = Math.round((score * weight) / 100);

        return {
            category,
            weight,
            score,
            weighted_score: weightedScore,
            event_count: categoryEvents.length,
        };
    });

    const score100 = breakdown.reduce((sum, entry) => sum + entry.weighted_score, 0);
    const score1000 = Math.max(0, Math.min(1000, Math.round(score100 * 10)));

    return {
        user_id: userId,
        score: score1000,
        event_count: events.length,
        category_breakdown: breakdown,
        computed_at: new Date().toISOString(),
    };
}

export function deriveSafeDateInputs(userId: number): Omit<SafeDateInputs, 'identityVerified' | 'livenessVerified'> {
    const events = listReputationEvents(userId);
    let backgroundFlags = 0;
    let endorsementCount = 0;
    let harassmentReports = 0;

    for (const event of events) {
        if (SEVERE_BACKGROUND_SIGNALS.has(event.signal_type)) {
            backgroundFlags += 1;
        }
        if (SOCIAL_VALIDATION_SIGNALS.has(event.signal_type)) {
            endorsementCount += 1;
        }
        if (HARASSMENT_SIGNALS.has(event.signal_type)) {
            harassmentReports += 1;
        }
    }

    return { backgroundFlags, endorsementCount, harassmentReports };
}

export function calculateSafeDateScore(
    userId: number,
    reputationScore: ReputationScoreSnapshot,
    inputs: SafeDateInputs,
): SafeDateScoreSnapshot {
    const reasonCodes: string[] = [];

    const identityPoints = inputs.identityVerified ? 25 : 0;
    const livenessPoints = inputs.livenessVerified ? 15 : 0;
    const backgroundPoints =
        inputs.backgroundFlags === 0 ? 20 : Math.max(0, 20 - Math.min(inputs.backgroundFlags * 10, 20));
    const crossPlatformPoints = Math.round((reputationScore.score / 1000) * 20);
    const socialValidationPoints = Math.min(inputs.endorsementCount * 2, 10);
    const harassmentFreePoints =
        inputs.harassmentReports === 0 ? 10 : Math.max(0, 10 - Math.min(inputs.harassmentReports * 5, 10));

    if (!inputs.identityVerified) reasonCodes.push('identity_not_verified');
    if (!inputs.livenessVerified) reasonCodes.push('liveness_not_verified');
    if (inputs.backgroundFlags > 0) reasonCodes.push('background_flags_present');
    if (inputs.harassmentReports > 0) reasonCodes.push('harassment_reports_present');
    if (socialValidationPoints < 4) reasonCodes.push('low_social_validation');

    const score = Math.max(
        0,
        Math.min(
            100,
            identityPoints +
                livenessPoints +
                backgroundPoints +
                crossPlatformPoints +
                socialValidationPoints +
                harassmentFreePoints,
        ),
    );

    return {
        user_id: userId,
        score,
        breakdown: {
            identity_verified_points: identityPoints,
            liveness_points: livenessPoints,
            background_clean_points: backgroundPoints,
            cross_platform_reputation_points: crossPlatformPoints,
            social_validation_points: socialValidationPoints,
            harassment_free_points: harassmentFreePoints,
        },
        computed_at: new Date().toISOString(),
        reason_codes: reasonCodes,
    };
}

export function resetReputationRailStore(): void {
    byUser.clear();
    byDedupe.clear();
}
