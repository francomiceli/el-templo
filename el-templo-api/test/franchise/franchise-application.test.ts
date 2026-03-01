import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { franchiseApplications } from "../../src/db/schema/franchise-applications";

describe("Franchise Application Routes", () => {
  let app: FastifyInstance;

  const validPayload = {
    nombre: "Juan Perez",
    email: "juan@example.com",
    telefono: "+5492235551234",
    ciudadPais: "Buenos Aires, Argentina",
    modelo: "activa",
    experiencia: "fitness",
    capital: "entre_50k_100k",
    origen: "instagram",
    mensaje: "Me interesa abrir un Templo en mi ciudad.",
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    // Clean up test data
    await app.db
      .delete(franchiseApplications)
      .where(eq(franchiseApplications.email, "juan@example.com"));
    await app.db
      .delete(franchiseApplications)
      .where(eq(franchiseApplications.email, "duplicate@example.com"));
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // POST /api/franchise/apply — Happy path
  // ---------------------------------------------------------------
  describe("POST /api/franchise/apply", () => {
    it("returns 201 with success response and whatsappUrl for valid data", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("whatsappUrl", "https://wa.link/ci8dpl");
      expect(body.message).toContain("Solicitud recibida");
    });

    it("persists application data to franchise_applications table", async () => {
      await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: validPayload,
      });

      const rows = await app.db
        .select()
        .from(franchiseApplications)
        .where(eq(franchiseApplications.email, "juan@example.com"));

      expect(rows).toHaveLength(1);
      expect(rows[0].nombre).toBe("Juan Perez");
      expect(rows[0].email).toBe("juan@example.com");
      expect(rows[0].telefono).toBe("+5492235551234");
      expect(rows[0].ciudadPais).toBe("Buenos Aires, Argentina");
      expect(rows[0].modelo).toBe("activa");
      expect(rows[0].experiencia).toBe("fitness");
      expect(rows[0].capital).toBe("entre_50k_100k");
      expect(rows[0].origen).toBe("instagram");
      expect(rows[0].mensaje).toBe("Me interesa abrir un Templo en mi ciudad.");
      expect(rows[0].status).toBe("new");
    });

    it("allows submission without optional mensaje field", async () => {
      const { mensaje: _omitted, ...payloadWithoutMensaje } = validPayload;

      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: payloadWithoutMensaje,
      });

      expect(res.statusCode).toBe(201);
    });

    it("allows duplicate email submissions (same investor can reapply)", async () => {
      const duplicatePayload = {
        ...validPayload,
        email: "duplicate@example.com",
      };

      const res1 = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: duplicatePayload,
      });
      expect(res1.statusCode).toBe(201);

      const res2 = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: duplicatePayload,
      });
      expect(res2.statusCode).toBe(201);

      const rows = await app.db
        .select()
        .from(franchiseApplications)
        .where(eq(franchiseApplications.email, "duplicate@example.com"));

      expect(rows).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/franchise/apply — Validation errors
  // ---------------------------------------------------------------
  describe("POST /api/franchise/apply — validation", () => {
    it("returns 400 when nombre is missing", async () => {
      const { nombre: _omitted, ...payload } = validPayload;

      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when email is missing", async () => {
      const { email: _omitted, ...payload } = validPayload;

      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, email: "not-an-email" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when mensaje exceeds 500 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, mensaje: "x".repeat(501) },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid modelo value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, modelo: "invalid_modelo" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid experiencia value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, experiencia: "invalid_experiencia" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid capital value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, capital: "invalid_capital" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid origen value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        payload: { ...validPayload, origen: "invalid_origen" },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
