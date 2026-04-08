import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";

describe("Exercise Equipment Endpoints", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // PATCH /api/admin/exercises/:exerciseId — equipment field
  // ---------------------------------------------------------------
  describe("PATCH /api/admin/exercises/:exerciseId — equipment", () => {
    it("accepts valid equipment enum value", async () => {
      // First, create an exercise to update
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/exercises",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exercise: "Test Equipment Exercise",
          category: "empuje",
          pattern: "horizontal",
          route: "PLPU",
          effort: "CON",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);

      // PATCH with equipment
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/exercises/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { equipment: "barras" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.equipment).toBe("barras");
    });

    it("accepts null to clear equipment", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/exercises",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exercise: "Test Clear Equipment",
          category: "traccion",
          pattern: "vertical",
          route: "OAP",
          effort: "CON",
        },
      });
      const created = JSON.parse(createRes.body);

      // Set equipment first
      await app.inject({
        method: "PATCH",
        url: `/api/admin/exercises/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { equipment: "anillas" },
      });

      // Clear it
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/exercises/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { equipment: null },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.equipment).toBeNull();
    });

    it("rejects invalid equipment enum value", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/admin/exercises/1",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { equipment: "invalid_value" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/admin/exercises/bulk-update-equipment
  // ---------------------------------------------------------------
  describe("POST /api/admin/exercises/bulk-update-equipment", () => {
    it("bulk updates equipment for multiple exercises", async () => {
      // Create two exercises
      const ex1 = await app.inject({
        method: "POST",
        url: "/api/admin/exercises",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exercise: "Bulk Test 1",
          category: "piernas",
          pattern: "squat",
          route: "SU",
          effort: "CON",
        },
      });
      const ex2 = await app.inject({
        method: "POST",
        url: "/api/admin/exercises",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exercise: "Bulk Test 2",
          category: "piernas",
          pattern: "squat",
          route: "SS",
          effort: "CON",
        },
      });

      const id1 = JSON.parse(ex1.body).id;
      const id2 = JSON.parse(ex2.body).id;

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/exercises/bulk-update-equipment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exerciseIds: [id1, id2],
          equipment: "ninguno",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.updatedCount).toBe(2);
    });

    it("rejects empty exerciseIds array", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/exercises/bulk-update-equipment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exerciseIds: [],
          equipment: "barras",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid equipment enum value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/exercises/bulk-update-equipment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exerciseIds: [1],
          equipment: "invalid_value",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 0 updatedCount for nonexistent exercise IDs", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/exercises/bulk-update-equipment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          exerciseIds: [999998, 999999],
          equipment: "cajon",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.updatedCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/exercises — equipment filter
  // ---------------------------------------------------------------
  describe("GET /api/admin/exercises — equipment filter", () => {
    it("accepts equipment filter parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/exercises?equipment=ninguno",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("exercises");
      expect(body).toHaveProperty("total");
    });

    it("accepts equipment=empty filter for untagged exercises", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/exercises?equipment=empty",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("exercises");
    });
  });
});
