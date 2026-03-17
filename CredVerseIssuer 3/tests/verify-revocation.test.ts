import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';
import { relayerService } from '../server/services/relayer';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);

function buildJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'EdDSA', typ: 'JWT' };
  return [
    Buffer.from(JSON.stringify(header)).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signed-segment',
  ].join('.');
}

describe('public verify revocation resolution', () => {
  const previousRequireBlockchain = process.env.REQUIRE_BLOCKCHAIN;
  const previousAllowRevocationFailOpen = process.env.ALLOW_REVOCATION_FAIL_OPEN;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousRequireBlockchain === undefined) {
      delete process.env.REQUIRE_BLOCKCHAIN;
    } else {
      process.env.REQUIRE_BLOCKCHAIN = previousRequireBlockchain;
    }
    if (previousAllowRevocationFailOpen === undefined) {
      delete process.env.ALLOW_REVOCATION_FAIL_OPEN;
    } else {
      process.env.ALLOW_REVOCATION_FAIL_OPEN = previousAllowRevocationFailOpen;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    vi.restoreAllMocks();
  });

  it('allows verify endpoint without API key when vc query is provided', async () => {
    const runId = `public-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const vcJwt = buildJwt({
      iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn3Zua2F72',
      sub: 'did:key:z6MkrKQXf2v8a1e6r3k4p9x7y2m5n8w1q4t7u9i2o5p8r1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      runId,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
      },
    });

    await storage.createCredential({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'template-1',
      issuerId: 'issuer-1',
      recipient: { email: 'verify-public@credverse.test' },
      credentialData: { scenario: 'verify-public-route' },
      vcJwt,
    } as any);

    const res = await request(app).get(`/api/v1/verify?vc=${encodeURIComponent(vcJwt)}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('resolves credential id from stored vcJwt when jwt has no jti/id', async () => {
    const runId = `revocation-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const vcJwt = buildJwt({
      iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn3Zua2F72',
      sub: 'did:key:z6MkrKQXf2v8a1e6r3k4p9x7y2m5n8w1q4t7u9i2o5p8r1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      runId,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
      },
    });

    const created = await storage.createCredential({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'template-1',
      issuerId: 'issuer-1',
      recipient: { email: 'verify-test@credverse.test' },
      credentialData: { scenario: 'verify-revocation-test' },
      vcJwt,
    } as any);

    const beforeRevoke = await request(app)
      .get(`/api/v1/verify?vc=${encodeURIComponent(vcJwt)}`);
    expect(beforeRevoke.status).toBe(200);
    expect(beforeRevoke.body.revocation_status).toBe('active');
    expect(beforeRevoke.body.valid).toBe(true);

    await storage.revokeCredential(created.id);

    const afterRevoke = await request(app)
      .get(`/api/v1/verify?vc=${encodeURIComponent(vcJwt)}`);
    expect(afterRevoke.status).toBe(200);
    expect(afterRevoke.body.revoked).toBe(true);
    expect(afterRevoke.body.revocation_status).toBe('revoked');
    expect(afterRevoke.body.valid).toBe(false);
  });

  it('returns unknown revocation state when blockchain is required and on-chain check is unavailable', async () => {
    process.env.REQUIRE_BLOCKCHAIN = 'true';
    vi.spyOn(relayerService, 'isRevoked').mockResolvedValue(null);

    const runId = `revocation-required-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const vcJwt = buildJwt({
      iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn3Zua2F72',
      sub: 'did:key:z6MkrKQXf2v8a1e6r3k4p9x7y2m5n8w1q4t7u9i2o5p8r1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      runId,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
      },
    });

    await storage.createCredential({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'template-1',
      issuerId: 'issuer-1',
      recipient: { email: 'verify-required-chain@credverse.test' },
      credentialData: { scenario: 'verify-required-chain' },
      vcJwt,
    } as any);

    const response = await request(app).get(`/api/v1/verify?vc=${encodeURIComponent(vcJwt)}`);
    expect(response.status).toBe(200);
    expect(response.body.revocation_status).toBe('unknown');
    expect(response.body.valid).toBe(false);
  });

  it('defaults to unknown revocation state in production when chain status is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_BLOCKCHAIN;
    delete process.env.ALLOW_REVOCATION_FAIL_OPEN;
    vi.spyOn(relayerService, 'isRevoked').mockResolvedValue(null);

    const created = await storage.createCredential({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'template-1',
      issuerId: 'issuer-1',
      recipient: { email: 'verify-production-required-chain@credverse.test' },
      credentialData: { scenario: 'verify-production-required-chain' },
      vcJwt: 'dummy',
    } as any);

    const response = await request(app).get(`/api/v1/verify/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body.revocation_status).toBe('unknown');
    expect(response.body.valid).toBe(false);
  });

  it('supports explicit fail-open override for production compatibility', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_REVOCATION_FAIL_OPEN = 'true';
    delete process.env.REQUIRE_BLOCKCHAIN;
    vi.spyOn(relayerService, 'isRevoked').mockResolvedValue(null);

    const created = await storage.createCredential({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'template-1',
      issuerId: 'issuer-1',
      recipient: { email: 'verify-production-fail-open@credverse.test' },
      credentialData: { scenario: 'verify-production-fail-open' },
      vcJwt: 'dummy',
    } as any);

    const response = await request(app).get(`/api/v1/verify/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body.revocation_status).toBe('active');
    expect(response.body.valid).toBe(true);
  });
});
