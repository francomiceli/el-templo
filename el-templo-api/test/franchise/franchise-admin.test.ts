import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import { franchiseApplications } from "../../src/db/schema/franchise-applications";

describe("Franchise Admin Routes", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let memberToken: string;

  const TEST_EMAIL_PREFIX = "fran-admin-test";

  const makeApplication = (overrides: Record<string, string> = {}) => ({
    nombre: "Maria Garcia",
    email: `${TEST_EMAIL_PREFIX}-${Date.now()}@example.com`,
    telefono: "+5492235559999",
    ciudadPais: "Buenos Aires, Argentina",
    modelo: "activa",
    experiencia: "fitness",
    capital: "entre_50k_100k",
    origen: "instagram",
    mensaje: "Quiero abrir un Templo.",
    status: "new" as string,
    ...overrides,
  });

  async function insertApplication(
    overrides: Record<string, string> = {},
  ): Promise<number> {
    const data = makeApplication(overrides);
    const result = await app.db.insert(franchiseApplications).values({
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      ciudadPais: data.ciudadPais,
      modelo: data.modelo,
      experiencia: data.experiencia,
      capital: data.capital,
      origen: data.origen,
      mensaje: data.mensaje,
    });
    return result[0].insertId;
  }

  beforeAll(async () => {
    app = await createTestApp();
    // admin@test.com is seeded as superadmin in globalSetup
    superadminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    // Register a regular member for role guard tests
    await registerUser(app, {
      email: "fran-admin-member@test.com",
      password: "password123",
      firstName: "Regular",
      lastName: "Member",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "fran-admin-member@test.com",
      "password123",
    );
  });

  beforeEach(async () => {
    // Clean up all test applications
    await app.db
      .delete(franchiseApplications)
      .where(eq(franchiseApplications.nombre, "Maria Garcia"));
    // Also clean up by partial email match using SQL LIKE
    await app.db.execute(
      `DELETE FROM franchise_applications WHERE email LIKE '${TEST_EMAIL_PREFIX}%'`,
    );
  });

  afterAll(async () => {
    // Final cleanup
    await app.db.execute(
      `DELETE FROM franchise_applications WHERE email LIKE '${TEST_EMAIL_PREFIX}%'`,
    );
    await app.db.execute(
      `DELETE FROM users WHERE email = 'fran-admin-member@test.com'`,
    );
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/franchise/admin/applications — List
  // ---------------------------------------------------------------
  describe("GET /api/franchise/admin/applications", () => {
    it("returns paginated list of applications", async () => {
      await insertApplication({ email: `${TEST_EMAIL_PREFIX}-1@example.com` });
      await insertApplication({ email: `${TEST_EMAIL_PREFIX}-2@example.com` });
      await insertApplication({ email: `${TEST_EMAIL_PREFIX}-3@example.com` });

      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications",
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("applications");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("totalPages");
      expect(Array.isArray(body.applications)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(3);

      // Verify application fields
      const app1 = body.applications[0];
      expect(app1).toHaveProperty("id");
      expect(app1).toHaveProperty("nombre");
      expect(app1).toHaveProperty("email");
      expect(app1).toHaveProperty("status");
      expect(app1).toHaveProperty("createdAt");
    });

    it("filters by status", async () => {
      await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-new@example.com`,
      });
      // Insert and update one to 'contacted'
      const contactedId = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-contacted@example.com`,
      });
      await app.db
        .update(franchiseApplications)
        .set({ status: "contacted" })
        .where(eq(franchiseApplications.id, contactedId));

      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications?status=contacted",
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.applications.length).toBeGreaterThanOrEqual(1);
      expect(
        body.applications.every(
          (a: { status: string }) => a.status === "contacted",
        ),
      ).toBe(true);
    });

    it("searches by nombre, email, or ciudadPais", async () => {
      await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-ba@example.com`,
        ciudadPais: "Buenos Aires, Argentina",
      });
      await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-bcn@example.com`,
        ciudadPais: "Barcelona, Espana",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications?search=Buenos",
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.applications.length).toBeGreaterThanOrEqual(1);
      expect(
        body.applications.every((a: { ciudadPais: string }) =>
          a.ciudadPais.includes("Buenos"),
        ),
      ).toBe(true);
    });

    it("paginates correctly", async () => {
      // Insert 5 applications
      for (let i = 0; i < 5; i++) {
        await insertApplication({
          email: `${TEST_EMAIL_PREFIX}-page-${i}@example.com`,
        });
      }

      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications?limit=2&page=2",
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.applications.length).toBe(2);
      expect(body.page).toBe(2);
      expect(body.total).toBeGreaterThanOrEqual(5);
      expect(body.totalPages).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/franchise/admin/applications/:id — Detail
  // ---------------------------------------------------------------
  describe("GET /api/franchise/admin/applications/:id", () => {
    it("returns full application detail including new columns", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-detail@example.com`,
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(id);
      expect(body.nombre).toBe("Maria Garcia");
      expect(body).toHaveProperty("notes");
      expect(body).toHaveProperty("aiStrategy");
      expect(body).toHaveProperty("aiOutreach");
      expect(body).toHaveProperty("aiFollowup");
      expect(body).toHaveProperty("aiNegotiation");
      // New columns should be null initially
      expect(body.notes).toBeNull();
      expect(body.aiStrategy).toBeNull();
    });

    it("returns 404 for nonexistent application", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications/99999",
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Aplicacion no encontrada");
    });
  });

  // ---------------------------------------------------------------
  // PATCH /api/franchise/admin/applications/:id — Update
  // ---------------------------------------------------------------
  describe("PATCH /api/franchise/admin/applications/:id", () => {
    it("updates status", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-update-status@example.com`,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "contacted" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("contacted");
    });

    it("updates notes", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-update-notes@example.com`,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { notes: "Llamar manana a las 10hs" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notes).toBe("Llamar manana a las 10hs");
    });

    it("updates both status and notes simultaneously", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-update-both@example.com`,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "negotiating", notes: "En negociacion activa" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("negotiating");
      expect(body.notes).toBe("En negociacion activa");
    });

    it("allows free-form status transitions (any to any)", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-free-trans@example.com`,
      });

      // new -> closed (skip intermediate states)
      const res = await app.inject({
        method: "PATCH",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "closed" },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("closed");

      // closed -> new (reverse transition)
      const res2 = await app.inject({
        method: "PATCH",
        url: `/api/franchise/admin/applications/${id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "new" },
      });

      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).status).toBe("new");
    });

    it("returns 404 for nonexistent application", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/franchise/admin/applications/99999",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "contacted" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/franchise/admin/applications/:id/generate — AI Agent
  // ---------------------------------------------------------------
  describe("POST /api/franchise/admin/applications/:id/generate", () => {
    it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
      const id = await insertApplication({
        email: `${TEST_EMAIL_PREFIX}-ai@example.com`,
      });

      // Save and remove the env var
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const res = await app.inject({
          method: "POST",
          url: `/api/franchise/admin/applications/${id}/generate`,
          headers: { authorization: `Bearer ${superadminToken}` },
          payload: { agentType: "strategy" },
        });

        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.error).toContain("ANTHROPIC_API_KEY");
      } finally {
        // Restore env var
        if (originalKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      }
    });

    it("returns 404 for nonexistent application", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/admin/applications/99999/generate",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { agentType: "strategy" },
      });

      // Will be 503 (no API key) or 404, depends on env - check API key first
      if (process.env.ANTHROPIC_API_KEY) {
        expect(res.statusCode).toBe(404);
      } else {
        expect(res.statusCode).toBe(503);
      }
    });
  });

  // ---------------------------------------------------------------
  // Auth guard — 401 without token
  // ---------------------------------------------------------------
  describe("Auth guard — 401 without token", () => {
    it("GET /admin/applications returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications",
      });
      expect(res.statusCode).toBe(401);
    });

    it("GET /admin/applications/:id returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications/1",
      });
      expect(res.statusCode).toBe(401);
    });

    it("PATCH /admin/applications/:id returns 401 without auth", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/franchise/admin/applications/1",
        payload: { status: "contacted" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /admin/applications/:id/generate returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/admin/applications/1/generate",
        payload: { agentType: "strategy" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // Role guard — 403 for non-superadmin
  // ---------------------------------------------------------------
  describe("Role guard — 403 for non-superadmin", () => {
    it("GET /admin/applications returns 403 for member", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /admin/applications/:id returns 403 for member", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/franchise/admin/applications/1",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("PATCH /admin/applications/:id returns 403 for member", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/franchise/admin/applications/1",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { status: "contacted" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /admin/applications/:id/generate returns 403 for member", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/admin/applications/1/generate",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { agentType: "strategy" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
