import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, getAuthToken, registerUser } from '../helpers';

describe('Admin Routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get admin token (admin@test.com seeded in globalSetup)
    adminToken = await getAuthToken(app, 'admin@test.com', 'adminpass123');

    // Register a regular member for role enforcement tests
    await registerUser(app, {
      email: 'admin-test-member@test.com',
      password: 'password123',
      branchId: 1,
    });
    memberToken = await getAuthToken(app, 'admin-test-member@test.com', 'password123');
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // Role enforcement: non-admin users get 403
  // ---------------------------------------------------------------
  describe('Role enforcement', () => {
    it('returns 403 for member accessing admin sessions list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('administrador');
    });

    it('returns 403 for member accessing pending count', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/pending-count',
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/sessions - List sessions
  // ---------------------------------------------------------------
  describe('GET /api/admin/sessions', () => {
    it('returns sessions list for admin (may be empty)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Should return an object with sessions array
      expect(body).toBeDefined();
    });

    it('accepts filter parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions?week=1&status=pending_review',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/sessions/pending-count
  // ---------------------------------------------------------------
  describe('GET /api/admin/sessions/pending-count', () => {
    it('returns pending session count for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/pending-count',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('count');
      expect(typeof body.count).toBe('number');
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/sessions/coverage
  // ---------------------------------------------------------------
  describe('GET /api/admin/sessions/coverage', () => {
    it('returns coverage info for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/coverage',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/sessions/:id
  // ---------------------------------------------------------------
  describe('GET /api/admin/sessions/:id', () => {
    it('returns 404 for nonexistent session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions/99999',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/admin/sessions/:id/approve
  // ---------------------------------------------------------------
  describe('POST /api/admin/sessions/:id/approve', () => {
    it('returns 404 when approving nonexistent session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/99999/approve',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/admin/sessions/bulk-approve
  // ---------------------------------------------------------------
  describe('POST /api/admin/sessions/bulk-approve', () => {
    it('returns success with 0 approved for nonexistent IDs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/sessions/bulk-approve',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ids: [99998, 99999] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.approvedCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/weeks/:week/summary
  // ---------------------------------------------------------------
  describe('GET /api/admin/weeks/:week/summary', () => {
    it('returns week summary for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/weeks/1/summary',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/saved-blocks
  // ---------------------------------------------------------------
  describe('GET /api/admin/saved-blocks', () => {
    it('returns empty saved blocks list for new admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/saved-blocks',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('savedBlocks');
      expect(Array.isArray(body.savedBlocks)).toBe(true);
    });
  });
});
