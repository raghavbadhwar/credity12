import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { registerRoutes } from '../server/routes';
import { errorHandler } from '../server/middleware/error-handler';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);
app.use(errorHandler);

const ISSUER_API_KEY = 'test-api-key';

describe('Issuer Authentication Security', () => {
  it('should reject registration with a weak password', async () => {
    const weakPassword = '123';
    const username = `weak_user_${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-API-Key', ISSUER_API_KEY)
      .send({
        username,
        email: `${username}@example.com`,
        password: weakPassword,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should allow registration with a strong password', async () => {
    const strongPassword = 'StrongPass123!';
    const username = `strong_user_${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-API-Key', ISSUER_API_KEY)
      .send({
        username,
        email: `${username}@example.com`,
        password: strongPassword,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.tokens).toBeDefined();
  });
});
