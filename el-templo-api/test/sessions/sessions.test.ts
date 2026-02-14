import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, getAuthToken, registerUser } from '../helpers';

describe('Session Routes', () => {
  let app: FastifyInstance;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register a member for session tests
    await registerUser(app, {
      email: 'session-member@test.com',
      password: 'password123',
      branchId: 1,
    });
    memberToken = await getAuthToken(app, 'session-member@test.com', 'password123');
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/sessions/daily
  // ---------------------------------------------------------------
  describe('GET /api/sessions/daily', () => {
    it('returns 401 without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/daily?date=2026-02-10',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid date format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/daily?date=invalid',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for Sunday (no sessions)', async () => {
      // 2026-02-15 is a Sunday
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/daily?date=2026-02-15',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Sunday');
    });

    it('returns 404 when no approved session exists for member', async () => {
      // No sessions generated/approved in test DB, so any weekday returns 404
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/daily?date=2026-02-10',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/sessions/weekly
  // ---------------------------------------------------------------
  describe('GET /api/sessions/weekly', () => {
    it('returns 401 without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/weekly?weekStart=2026-02-09',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns week sessions map (all null when no approved sessions)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/weekly?weekStart=2026-02-09',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('sessions');

      // All days should be null since no sessions are approved
      const sessions = body.sessions;
      expect(typeof sessions).toBe('object');

      // Sunday should be null
      expect(sessions['2026-02-15']).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // POST /api/sessions/complete
  // ---------------------------------------------------------------
  describe('POST /api/sessions/complete', () => {
    it('returns 401 without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/complete',
        payload: {
          dayId: 'W1-lunes-alfa',
          date: '2026-02-10',
          startedAt: new Date().toISOString(),
          blocksCompleted: ['INITIUM', 'NUCLEUS'],
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('records a completed session successfully', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/complete',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: 'W1-lunes-alfa',
          date: '2026-02-10',
          startedAt: new Date().toISOString(),
          rpe: 7,
          notes: 'Good workout',
          blocksCompleted: ['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'ATHLOS'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.completedSessionId).toBeGreaterThan(0);
      expect(body.totalDaysTrained).toBe(1);
    });

    it('upserts when completing same dayId again', async () => {
      // Complete the same day again (should update, not duplicate)
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/complete',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: 'W1-lunes-alfa',
          date: '2026-02-10',
          startedAt: new Date().toISOString(),
          rpe: 8,
          notes: 'Updated RPE',
          blocksCompleted: ['INITIUM', 'NUCLEUS', 'DEUTEROS_1', 'ATHLOS'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      // Still 1 unique day trained (same date)
      expect(body.totalDaysTrained).toBe(1);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/complete',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          // Missing dayId, date, startedAt, blocksCompleted
          rpe: 5,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
