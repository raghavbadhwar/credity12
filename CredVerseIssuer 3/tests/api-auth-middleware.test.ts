import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiKey = vi.fn();
const getUser = vi.fn();
const verifyAccessToken = vi.fn();

vi.mock('../server/storage', () => ({
  storage: {
    getApiKey,
    getUser,
  },
}));

vi.mock('@credverse/shared-auth', () => ({
  verifyAccessToken,
}));

describe('issuer api auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid x-api-key and sets tenant context', async () => {
    getApiKey.mockResolvedValue({ tenantId: 'tenant-1', expiresAt: null });

    const { apiKeyMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyMiddleware, (req, res) => {
      res.json({ tenantId: (req as any).tenantId });
    });

    const res = await request(app).get('/check').set('x-api-key', 'valid-key');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-1');
  });

  it('accepts valid bearer token and resolves tenant from token tenantId', async () => {
    verifyAccessToken.mockReturnValue({ userId: 'u-1', username: 'u', role: 'issuer', tenantId: 'tenant-token' });
    getUser.mockResolvedValue({ id: 'u-1', tenantId: 'tenant-token' });

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (req, res) => {
      res.json({ tenantId: (req as any).tenantId, userId: (req as any).user?.userId });
    });

    const res = await request(app).get('/check').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tenantId: 'tenant-token', userId: 'u-1' });
  });

  it('accepts valid bearer token and deterministically derives tenant from stored user', async () => {
    verifyAccessToken.mockReturnValue({ userId: 99, username: 'u', role: 'issuer' });
    getUser.mockResolvedValue({ id: '99', tenantId: 'tenant-from-user' });

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (req, res) => {
      res.json({ tenantId: (req as any).tenantId, userId: (req as any).user?.userId });
    });

    const res = await request(app).get('/check').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tenantId: 'tenant-from-user', userId: 99 });
  });

  it('rejects bearer token when tenant cannot be derived deterministically', async () => {
    verifyAccessToken.mockReturnValue({ userId: 99, username: 'u', role: 'issuer' });
    getUser.mockResolvedValue({ id: '99', tenantId: null });

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(app).get('/check').set('Authorization', 'Bearer token');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
      message: 'Unable to derive tenant from authenticated identity',
    });
  });

  it('rejects bearer token when token tenant mismatches persisted user tenant', async () => {
    verifyAccessToken.mockReturnValue({ userId: 'u-1', username: 'u', role: 'issuer', tenantId: 'tenant-a' });
    getUser.mockResolvedValue({ id: 'u-1', tenantId: 'tenant-b' });

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(app).get('/check').set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'AUTH_TENANT_MISMATCH',
      message: 'Authenticated tenant mismatch',
    });
  });

  it('prioritizes api key auth when both headers are present', async () => {
    verifyAccessToken.mockReturnValue({ userId: 'u-1', username: 'u', role: 'issuer', tenantId: 'tenant-token' });
    getApiKey.mockResolvedValue(null);

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(app)
      .get('/check')
      .set('x-api-key', 'invalid-key')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'AUTH_UNAUTHORIZED', message: 'Invalid API Key' });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects invalid auth when neither api key nor bearer token is valid', async () => {
    verifyAccessToken.mockReturnValue(null);

    const { apiKeyOrAuthMiddleware } = await import('../server/auth');
    const app = express();
    app.get('/check', apiKeyOrAuthMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(app).get('/check').set('Authorization', 'Bearer bad');
    expect(res.status).toBe(401);
  });
});
