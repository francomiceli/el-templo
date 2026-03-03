import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken } from "../helpers";
import { appWaitlist } from "../../src/db/schema/app-waitlist";
import { labsInquiries } from "../../src/db/schema/labs-inquiries";

describe("App Landing Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const validWaitlist = {
    nombre: "Maria Test",
    email: "maria@example.com",
    moduloInteres: "olympic-academy,labs",
    ciudadPais: "Buenos Aires, Argentina",
  };

  const validLabsInquiry = {
    nombre: "Carlos Gym",
    email: "carlos@example.com",
    telefono: "+5492235551234",
    nombreGimnasio: "Fitness Center MDQ",
    ciudadPais: "Mar del Plata, Argentina",
    cantidadSocios: "50-200",
    sistemaActual: "excel",
    mensaje: "Quiero migrar a Labs.",
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterEach(async () => {
    // Clean up test data
    await app.db
      .delete(appWaitlist)
      .where(eq(appWaitlist.email, "maria@example.com"));
    await app.db
      .delete(labsInquiries)
      .where(eq(labsInquiries.email, "carlos@example.com"));
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // POST /api/app/waitlist — Public
  // ---------------------------------------------------------------
  describe("POST /api/app/waitlist", () => {
    it("returns 201 with valid waitlist entry", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload: validWaitlist,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("message", "Registro exitoso");
      expect(body).toHaveProperty("whatsappUrl", "https://wa.link/ci8dpl");
    });

    it("returns 201 with optional ciudadPais omitted", async () => {
      const { ciudadPais: _omitted, ...payload } = validWaitlist;

      const res = await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload,
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when nombre is missing", async () => {
      const { nombre: _omitted, ...payload } = validWaitlist;

      const res = await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when email is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload: { ...validWaitlist, email: "notanemail" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("stores waitlist entry in database", async () => {
      await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload: validWaitlist,
      });

      const rows = await app.db
        .select()
        .from(appWaitlist)
        .where(eq(appWaitlist.email, "maria@example.com"));

      expect(rows).toHaveLength(1);
      expect(rows[0].nombre).toBe("Maria Test");
      expect(rows[0].moduloInteres).toBe("olympic-academy,labs");
      expect(rows[0].ciudadPais).toBe("Buenos Aires, Argentina");
      expect(rows[0].status).toBe("new");
    });

    it("returns 400 when moduloInteres is missing", async () => {
      const { moduloInteres: _omitted, ...payload } = validWaitlist;

      const res = await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/app/labs-inquiry — Public
  // ---------------------------------------------------------------
  describe("POST /api/app/labs-inquiry", () => {
    it("returns 201 with valid labs inquiry", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: validLabsInquiry,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("message", "Consulta enviada");
      expect(body).toHaveProperty("whatsappUrl", "https://wa.link/ci8dpl");
    });

    it("returns 400 when nombre is missing", async () => {
      const { nombre: _omitted, ...payload } = validLabsInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when email is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: { ...validLabsInquiry, email: "notanemail" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when cantidadSocios has invalid enum", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: { ...validLabsInquiry, cantidadSocios: "invalid" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when sistemaActual has invalid enum", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: { ...validLabsInquiry, sistemaActual: "invalid" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("stores labs inquiry in database", async () => {
      await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: validLabsInquiry,
      });

      const rows = await app.db
        .select()
        .from(labsInquiries)
        .where(eq(labsInquiries.email, "carlos@example.com"));

      expect(rows).toHaveLength(1);
      expect(rows[0].nombre).toBe("Carlos Gym");
      expect(rows[0].nombreGimnasio).toBe("Fitness Center MDQ");
      expect(rows[0].cantidadSocios).toBe("50-200");
      expect(rows[0].sistemaActual).toBe("excel");
      expect(rows[0].mensaje).toBe("Quiero migrar a Labs.");
      expect(rows[0].status).toBe("new");
    });

    it("accepts optional mensaje omitted", async () => {
      const { mensaje: _omitted, ...payload } = validLabsInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload,
      });

      expect(res.statusCode).toBe(201);
    });

    it("rejects mensaje over 500 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: { ...validLabsInquiry, mensaje: "x".repeat(501) },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // Admin endpoints
  // ---------------------------------------------------------------
  describe("Admin endpoints", () => {
    it("GET /admin/waitlist returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/app/admin/waitlist",
      });

      expect(res.statusCode).not.toBe(200);
    });

    it("GET /admin/waitlist returns entries for admin", async () => {
      // Insert a test entry
      await app.inject({
        method: "POST",
        url: "/api/app/waitlist",
        payload: validWaitlist,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/app/admin/waitlist",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /admin/labs-inquiries returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/app/admin/labs-inquiries",
      });

      expect(res.statusCode).not.toBe(200);
    });

    it("GET /admin/labs-inquiries returns entries for admin", async () => {
      // Insert a test entry
      await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: validLabsInquiry,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/app/admin/labs-inquiries",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it("PATCH /admin/labs-inquiries/:id/status updates status", async () => {
      // Create an inquiry first
      await app.inject({
        method: "POST",
        url: "/api/app/labs-inquiry",
        payload: validLabsInquiry,
      });

      const [inquiry] = await app.db
        .select()
        .from(labsInquiries)
        .where(eq(labsInquiries.email, "carlos@example.com"));

      const res = await app.inject({
        method: "PATCH",
        url: `/api/app/admin/labs-inquiries/${inquiry.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "contacted" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify in DB
      const [updated] = await app.db
        .select()
        .from(labsInquiries)
        .where(eq(labsInquiries.id, inquiry.id));
      expect(updated.status).toBe("contacted");
    });
  });
});
