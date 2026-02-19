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

describe('Recruiter Authentication Security', () => {
  it('should reject registration with a weak password', async () => {
    const weakPassword = '123';
    const username = `weak_user_${Date.now()}`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password: weakPassword,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should allow registration with a strong password', async () => {
    const strongPassword = 'StrongPass123!';
    const username = `strong_user_${Date.now()}`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password: strongPassword,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.tokens).toBeDefined();
  });
});
