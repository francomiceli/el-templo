import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken } from "../helpers";
import { academyInquiries } from "../../src/db/schema/academy-inquiries";

describe("Academy Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const validInquiry = {
    nombre: "Juan Perez",
    email: "juan@example.com",
    telefono: "+5492235551234",
    ciudadPais: "Mar del Plata, Argentina",
    nivelInteres: "nivel-1-trainer",
    modalidad: "presencial",
    experiencia: "calistenia",
    alumnoElTemplo: "si",
    origen: "instagram",
    mensaje: "Me interesa la proxima edicion.",
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterEach(async () => {
    await app.db
      .delete(academyInquiries)
      .where(eq(academyInquiries.email, "juan@example.com"));
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // POST /api/academy/inquire — Public
  // ---------------------------------------------------------------
  describe("POST /api/academy/inquire", () => {
    it("returns 201 with valid inquiry", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: validInquiry,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("whatsappUrl", "https://wa.link/ci8dpl");
      expect(body.message).toContain("Consulta recibida");
    });

    it("returns 400 when nombre is missing", async () => {
      const { nombre: _omitted, ...payload } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when email is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: { ...validInquiry, email: "not-an-email" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when required select field is missing", async () => {
      const { nivelInteres: _omitted, ...payload } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when nivelInteres has invalid enum value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: { ...validInquiry, nivelInteres: "invalid" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("stores inquiry in database", async () => {
      await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: validInquiry,
      });

      const rows = await app.db
        .select()
        .from(academyInquiries)
        .where(eq(academyInquiries.email, "juan@example.com"));

      expect(rows).toHaveLength(1);
      expect(rows[0].nombre).toBe("Juan Perez");
      expect(rows[0].telefono).toBe("+5492235551234");
      expect(rows[0].ciudadPais).toBe("Mar del Plata, Argentina");
      expect(rows[0].nivelInteres).toBe("nivel-1-trainer");
      expect(rows[0].modalidad).toBe("presencial");
      expect(rows[0].experiencia).toBe("calistenia");
      expect(rows[0].alumnoElTemplo).toBe("si");
      expect(rows[0].origen).toBe("instagram");
      expect(rows[0].mensaje).toBe("Me interesa la proxima edicion.");
      expect(rows[0].status).toBe("new");
    });

    it("accepts optional mensaje field", async () => {
      const { mensaje: _omitted, ...payloadWithoutMensaje } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: payloadWithoutMensaje,
      });

      expect(res.statusCode).toBe(201);
    });

    it("rejects mensaje over 500 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: { ...validInquiry, mensaje: "x".repeat(501) },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/academy/admin/inquiries — Admin only
  // ---------------------------------------------------------------
  describe("GET /api/academy/admin/inquiries", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/academy/admin/inquiries",
      });

      expect(res.statusCode).not.toBe(200);
    });

    it("returns inquiries for admin user", async () => {
      // Insert a test inquiry
      await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: validInquiry,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/academy/admin/inquiries",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);

      const inquiry = body.find(
        (i: { email: string }) => i.email === "juan@example.com",
      );
      expect(inquiry).toBeDefined();
      expect(inquiry.nombre).toBe("Juan Perez");
    });

    it("returns inquiries ordered by created_at desc", async () => {
      // Insert two inquiries
      await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: validInquiry,
      });

      await app.inject({
        method: "POST",
        url: "/api/academy/inquire",
        payload: { ...validInquiry, nombre: "Maria Lopez" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/academy/admin/inquiries",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      const testInquiries = body.filter(
        (i: { email: string }) => i.email === "juan@example.com",
      );

      if (testInquiries.length >= 2) {
        // Most recent should be first (desc order)
        expect(testInquiries[0].nombre).toBe("Maria Lopez");
        expect(testInquiries[1].nombre).toBe("Juan Perez");
      }
    });
  });
});
