/**
 * Tanda 1 (#22): handler global de errores de la API.
 *
 * - Un error no manejado (500) NO puede filtrar SQL ni mensajes internos al
 *   cliente: la respuesta es siempre el cuerpo genérico.
 * - Los 4xx deliberados (validación de schema, 401 del gate de cuenta, 429 del
 *   rate limit, 404 de ruta) conservan EXACTAMENTE el cuerpo que tenían antes
 *   de que existiera `setErrorHandler`. Los asserts de control de abajo son el
 *   cuerpo capturado contra la app sin handler global.
 * - Un `AppError` 5xx deliberado (p. ej. 503 de Conquer: "Las fotos no están
 *   disponibles por ahora") sigue mostrando su mensaje: es copy pensado para
 *   el cliente, no un error interno.
 *
 * La ruta de prueba se registra DESPUÉS de `buildApp()` (que no hace `ready()`)
 * y antes de `ready()`: comprueba además que el handler del scope raíz cubre
 * rutas registradas en ese scope después de él.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { buildApp } from "../../src/app";
import { cleanAllTestData, createTestMember } from "../helpers";
import { AppError } from "../../src/modules/shared/errors";
import { INTERNAL_ERROR_BODY } from "../../src/modules/shared/error-handler";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const SQL_LEAK = "Failed query: select * from users where secret = ?";

let seq = 0;
function uniq(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

describe("Handler global de errores", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    app.get("/__test/boom", async () => {
      throw new Error(SQL_LEAK);
    });
    app.get("/__test/boom-503", async () => {
      const err = new Error("connect ECONNREFUSED 10.0.0.5:3306") as Error & {
        statusCode: number;
      };
      err.statusCode = 503;
      throw err;
    });
    app.get("/__test/app-error-503", async () => {
      throw new AppError(
        "Las fotos no están disponibles por ahora",
        503,
        "CONQUER_FOTOS_NO_DISPONIBLES",
      );
    });
    app.get("/__test/app-error-409", async () => {
      throw new AppError("Ya existe", 409, "YA_EXISTE");
    });
    await app.ready();
    await cleanAllTestData(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  describe("500: sin filtrar detalles internos", () => {
    it("un Error no manejado devuelve el cuerpo genérico, sin SQL", async () => {
      const res = await app.inject({ method: "GET", url: "/__test/boom" });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body).toEqual(INTERNAL_ERROR_BODY);
      expect(body.message).toBe("Error interno del servidor");
      expect(body.error).toBe("Error del servidor");
      expect(res.body).not.toContain("Failed query");
      expect(res.body.toLowerCase()).not.toContain("select");
      expect(res.body).not.toContain("secret");
    });

    it("un error 5xx de otra librería (503) conserva el status pero no el mensaje", async () => {
      const res = await app.inject({ method: "GET", url: "/__test/boom-503" });
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body)).toEqual(INTERNAL_ERROR_BODY);
      expect(res.body).not.toContain("ECONNREFUSED");
    });

    it("un AppError 503 deliberado conserva su mensaje, status y code", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/__test/app-error-503",
      });
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 503,
        code: "CONQUER_FOTOS_NO_DISPONIBLES",
        error: "Service Unavailable",
        message: "Las fotos no están disponibles por ahora",
      });
    });

    it("un AppError 409 deliberado conserva su cuerpo", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/__test/app-error-409",
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 409,
        code: "YA_EXISTE",
        error: "Conflict",
        message: "Ya existe",
      });
    });

    it("el 500 de una ruta real tampoco filtra SQL: registro con campo largo es 400 de validación, sin 'insert into'", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `largo-${uniq()}@test.com`,
          password: "clave-larga-123",
          firstName: "a".repeat(150),
          lastName: "Perez",
          gender: "male",
          branchId: 1,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.toLowerCase()).not.toContain("insert into");
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Bad Request");
      expect(body.message).toContain("firstName");
    });
  });

  describe("4xx: cuerpo idéntico al del handler por defecto", () => {
    it("400 de validación de schema (email inválido en login)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "no-es-un-mail", password: "x" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 400,
        code: "FST_ERR_VALIDATION",
        error: "Bad Request",
        message: 'body/email must match format "email"',
      });
    });

    it("400 de validación de schema (campo requerido ausente)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "a@test.com" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 400,
        code: "FST_ERR_VALIDATION",
        error: "Bad Request",
        message: "body must have required property 'password'",
      });
    });

    it("404 de ruta inexistente", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/__no-existe__",
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({
        message: "Route GET:/api/__no-existe__ not found",
        error: "Not Found",
        statusCode: 404,
      });
    });

    it("401 sin token (authenticate)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({
        error: "No autorizado",
        message: "Token invalido o ausente",
      });
    });

    it("401 ACCOUNT_BLOCKED lanzado por attachScope (cuenta borrada con access vigente)", async () => {
      const email = `eh-del-${uniq()}@test.com`;
      const member = await createTestMember(app, {
        email,
        password: "pass123456",
      });
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: "pass123456" },
      });
      const { accessToken } = JSON.parse(login.body) as {
        accessToken: string;
      };
      await app.db
        .update(schema.users)
        .set({ deletedAt: new Date() })
        .where(
          and(
            tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
            eq(schema.users.id, member.id),
          ),
        );

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 401,
        code: "ACCOUNT_BLOCKED",
        error: "Unauthorized",
        message: "Esta cuenta fue eliminada",
      });
    });

    it("429 del rate limit (forgot-password, 6.º pedido desde la misma IP)", async () => {
      const remoteAddress = "10.99.7.1";
      for (let i = 0; i < 5; i++) {
        const ok = await app.inject({
          method: "POST",
          url: "/api/auth/forgot-password",
          payload: { email: "nadie-error-handler@test.com" },
          remoteAddress,
        });
        expect(ok.statusCode).toBe(200);
      }
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "nadie-error-handler@test.com" },
        remoteAddress,
      });
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.statusCode).toBe(429);
      expect(body.error).toBe("Demasiados intentos");
      expect(body.message).toMatch(/^Demasiados intentos\. Probá de nuevo en /);
    });
  });
});
