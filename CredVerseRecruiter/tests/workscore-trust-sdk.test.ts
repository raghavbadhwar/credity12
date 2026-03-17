import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServer } from 'http';

const verifyMock = vi.fn();
vi.mock('@credverse/trust', () => ({
  CredVerse: class CredVerseMock {
    verify = verifyMock;
  },
}));

import { registerRoutes } from '../server/routes';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);

describe('workscore trust-sdk integration', () => {
  afterEach(() => {
    verifyMock.mockReset();
    delete process.env.WORKSCORE_TRUST_SDK_ENABLED;
    delete process.env.TRUST_SDK_BASE_URL;
    delete process.env.TRUST_SDK_API_KEY;
  });

  it('overrides score/decision from trust-sdk when enabled', async () => {
    process.env.WORKSCORE_TRUST_SDK_ENABLED = 'true';
    process.env.TRUST_SDK_BASE_URL = 'https://trust.credverse.test';
    process.env.TRUST_SDK_API_KEY = 'api-key';
    verifyMock.mockResolvedValue({
      score: 92,
      recommendation: 'APPROVE',
      confidence: 'HIGH',
      zkProof: { status: 'generated' },
    });

    const res = await request(app)
      .post('/api/workscore/evaluate')
      .send({
        components: {
          identity: 0.2,
          education: 0.2,
          employment: 0.2,
          reputation: 0.2,
          skills: 0.2,
          crossTrust: 0.2,
        },
        context: {
          subjectDid: 'did:key:z6Mkholdertrustsdk',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(920);
    expect(res.body.decision).toBe('HIRE_FAST');
    expect(res.body.trust_sdk.recommendation).toBe('APPROVE');
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectDid: 'did:key:z6Mkholdertrustsdk',
        vertical: 'HIRING',
      }),
    );
  });
});
