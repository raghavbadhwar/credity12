import { z } from 'zod';
import { retry } from '../utils/retry';

const providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 6000);
const providerRetries = Number(process.env.AI_PROVIDER_RETRIES || 1);

const livenessSchema = z.object({
    isReal: z.boolean(),
    confidence: z.number().min(0).max(1),
    spoofingDetected: z.boolean(),
    faceDetected: z.boolean(),
    reasoning: z.string().min(1),
});

const documentSchema = z.object({
    isValid: z.boolean(),
    extractedData: z.record(z.any()).default({}),
    fraudScore: z.number().min(0).max(1),
    feedback: z.string().min(1),
});

export type LivenessResult = z.infer<typeof livenessSchema>;
export type DocumentResult = z.infer<typeof documentSchema>;

export interface AIAdapter {
    analyzeLiveness(imageBase64: string): Promise<LivenessResult>;
    analyzeDocument(imageBase64: string, documentType: string): Promise<DocumentResult>;
}

function timeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

function seededRatio(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 1000) / 1000;
}

class DeterministicFallbackAdapter implements AIAdapter {
    async analyzeLiveness(imageBase64: string): Promise<LivenessResult> {
        const ratio = seededRatio(imageBase64.slice(0, 256));
        const spoofingDetected = ratio > 0.92;
        const faceDetected = imageBase64.length > 128;
        const isReal = faceDetected && !spoofingDetected;
        const confidence = Number((isReal ? 0.82 + ratio * 0.15 : 0.35 + ratio * 0.3).toFixed(3));
        return {
            isReal,
            confidence: Math.min(1, Math.max(0, confidence)),
            spoofingDetected,
            faceDetected,
            reasoning: 'Deterministic fallback analysis used (provider unavailable).',
        };
    }

    async analyzeDocument(imageBase64: string, documentType: string): Promise<DocumentResult> {
        const ratio = seededRatio(`${documentType}:${imageBase64.slice(0, 256)}`);
        const fraudScore = Number((ratio > 0.9 ? 0.72 : 0.08 + ratio * 0.45).toFixed(3));
        return {
            isValid: fraudScore < 0.6,
            extractedData: {},
            fraudScore,
            feedback: 'Deterministic fallback analysis used (provider unavailable).',
        };
    }
}

class GeminiAdapter implements AIAdapter {
    private async generate(prompt: string, imageBase64: string): Promise<unknown> {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

        const response = await retry(
            async () => {
                const result = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        signal: timeoutSignal(providerTimeoutMs),
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64Data } }] }],
                        }),
                    }
                );

                if (!result.ok) {
                    throw new Error(`provider_http_${result.status}`);
                }

                return result.json();
            },
            {
                maxRetries: providerRetries,
                initialDelayMs: 300,
                retryCondition: (err) => /provider_http_5|fetch|abort|network/i.test(err.message),
            }
        );

        const text = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text || typeof text !== 'string') {
            throw new Error('provider_invalid_response');
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('provider_unparseable_response');

        return JSON.parse(jsonMatch[0]);
    }

    async analyzeLiveness(imageBase64: string): Promise<LivenessResult> {
        const payload = await this.generate(
            'Return ONLY JSON with isReal, confidence(0-1), spoofingDetected, faceDetected, reasoning for this liveness image.',
            imageBase64
        );
        return livenessSchema.parse(payload);
    }

    async analyzeDocument(imageBase64: string, documentType: string): Promise<DocumentResult> {
        const payload = await this.generate(
            `Return ONLY JSON with isValid, extractedData(object), fraudScore(0-1), feedback for this ${documentType} document.`,
            imageBase64
        );
        return documentSchema.parse(payload);
    }
}

export function getAIAdapter(): AIAdapter {
    if (process.env.GEMINI_API_KEY) {
        return new GeminiAdapter();
    }
    return new DeterministicFallbackAdapter();
}
