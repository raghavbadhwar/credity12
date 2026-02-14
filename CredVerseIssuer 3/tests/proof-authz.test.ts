import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { registerRoutes } from '../server/routes';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);

async function loginAs(role: string): Promise<string> {
  const username = `proof_${role}_${Date.now()}`;
  const password = 'ProofAuth123!';

  const register = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, password, role, tenantId: '550e8400-e29b-41d4-a716-446655440000' });
  expect(register.status).toBe(201);

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });
  expect(login.status).toBe(200);

  return login.body?.tokens?.accessToken as string;
}

describe('issuer proof route authz', () => {
  it('returns explicit unauthorized code when missing credentials', async () => {
    const res = await request(app)
      .post('/api/v1/proofs/generate')
      .send({ credential_id: 'cred_missing', format: 'sd-jwt-vc' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns explicit forbidden code for non-issuer JWT role', async () => {
    const token = await loginAs('user');

    const res = await request(app)
      .post('/api/v1/proofs/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ credential_id: 'cred_missing', format: 'sd-jwt-vc' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROOF_FORBIDDEN');
  });

  it('allows authorized API key flow to reach business validation', async () => {
    const res = await request(app)
      .post('/api/v1/proofs/generate')
      .set('X-API-Key', 'test-api-key')
      .send({ credential_id: 'cred_missing', format: 'sd-jwt-vc' });

    expect([202, 404]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
