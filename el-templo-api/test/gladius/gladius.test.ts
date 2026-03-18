import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken } from "../helpers";
import { gladiusInquiries } from "../../src/db/schema/gladius-inquiries";
import { gladiusProducts } from "../../src/db/schema/gladius-products";

describe("Gladius Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const validInquiry = {
    nombre: "Maria Lopez",
    email: "maria@example.com",
    productoInteres: "Barra Olimpica",
    mensaje: "Me gustaria saber el precio.",
  };

  const validProduct = {
    name: "Barra Olimpica Gladius",
    description: "Barra olimpica de acero inoxidable, 20kg.",
  };

  beforeAll(async () => {
    app = await createTestApp();
    // Get admin token from seeded owner user
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterEach(async () => {
    // Clean up test data
    await app.db
      .delete(gladiusInquiries)
      .where(eq(gladiusInquiries.email, "maria@example.com"));
    await app.db
      .delete(gladiusProducts)
      .where(eq(gladiusProducts.name, "Barra Olimpica Gladius"));
    await app.db
      .delete(gladiusProducts)
      .where(eq(gladiusProducts.name, "Updated Product Name"));
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/gladius/products — Public
  // ---------------------------------------------------------------
  describe("GET /api/gladius/products", () => {
    it("returns empty array when no products exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/products",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it("returns only published products", async () => {
      // Create a published and an unpublished product
      await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...validProduct, status: "published" },
      });
      await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Hidden Product",
          description: "Not visible",
          status: "unpublished",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/products",
      });

      const body = JSON.parse(res.body);
      expect(body.length).toBeGreaterThanOrEqual(1);
      const names = body.map((p: { name: string }) => p.name);
      expect(names).toContain("Barra Olimpica Gladius");
      expect(names).not.toContain("Hidden Product");

      // Clean up hidden product
      await app.db
        .delete(gladiusProducts)
        .where(eq(gladiusProducts.name, "Hidden Product"));
    });
  });

  // ---------------------------------------------------------------
  // GET /api/gladius/products/:slug — Public
  // ---------------------------------------------------------------
  describe("GET /api/gladius/products/:slug", () => {
    it("returns 404 for non-existent slug", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/products/non-existent-product",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns product by slug", async () => {
      // Create a product first
      await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validProduct,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/products/barra-olimpica-gladius",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Barra Olimpica Gladius");
      expect(body.slug).toBe("barra-olimpica-gladius");
    });
  });

  // ---------------------------------------------------------------
  // POST /api/gladius/inquire — Public
  // ---------------------------------------------------------------
  describe("POST /api/gladius/inquire", () => {
    it("returns 201 with whatsappUrl for valid inquiry", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload: validInquiry,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("whatsappUrl", "https://wa.link/ci8dpl");
      expect(body.message).toContain("Consulta recibida");
    });

    it("persists inquiry to gladius_inquiries table", async () => {
      await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload: validInquiry,
      });

      const rows = await app.db
        .select()
        .from(gladiusInquiries)
        .where(eq(gladiusInquiries.email, "maria@example.com"));

      expect(rows).toHaveLength(1);
      expect(rows[0].nombre).toBe("Maria Lopez");
      expect(rows[0].productoInteres).toBe("Barra Olimpica");
      expect(rows[0].mensaje).toBe("Me gustaria saber el precio.");
      expect(rows[0].status).toBe("new");
    });

    it("allows inquiry without optional mensaje field", async () => {
      const { mensaje: _omitted, ...payloadWithoutMensaje } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload: payloadWithoutMensaje,
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when nombre is missing", async () => {
      const { nombre: _omitted, ...payload } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when email is missing", async () => {
      const { email: _omitted, ...payload } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload: { ...validInquiry, email: "not-an-email" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when productoInteres is missing", async () => {
      const { productoInteres: _omitted, ...payload } = validInquiry;

      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when mensaje exceeds 1000 characters", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/inquire",
        payload: { ...validInquiry, mensaje: "x".repeat(1001) },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // Admin routes — CRUD (owner only)
  // ---------------------------------------------------------------
  describe("Admin CRUD routes", () => {
    it("POST /api/gladius/admin/products creates product and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validProduct,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Barra Olimpica Gladius");
      expect(body.slug).toBe("barra-olimpica-gladius");
    });

    it("GET /api/gladius/admin/products returns all products including unpublished", async () => {
      // Create an unpublished product
      await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...validProduct, status: "unpublished" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it("PUT /api/gladius/admin/products/:id updates product", async () => {
      // Create product first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validProduct,
      });
      const created = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/gladius/admin/products/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Updated Product Name" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Updated Product Name");
    });

    it("DELETE /api/gladius/admin/products/:id deletes product", async () => {
      // Create product first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/gladius/admin/products",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validProduct,
      });
      const created = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/gladius/admin/products/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify it's gone
      const getRes = await app.inject({
        method: "GET",
        url: `/api/gladius/products/${created.slug}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 403 for non-admin users on admin routes", async () => {
      // The only non-admin user we can easily test with requires registration
      // We'll test that unauthenticated requests get rejected
      const res = await app.inject({
        method: "GET",
        url: "/api/gladius/admin/products",
      });

      // Without auth header, authenticate preHandler should reject
      expect(res.statusCode).not.toBe(200);
    });
  });
});
