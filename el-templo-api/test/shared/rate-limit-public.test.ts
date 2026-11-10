/**
 * Tanda 1 (H4, #12): trustProxy de un salto + rate limit por IP en las rutas
 * públicas (login, registro, canje de campañas y formularios de marketing).
 *
 * El store del rate limit es en memoria y uno por instancia de app, así que
 * cada test usa su propia `remoteAddress` (o su propio XFF) para no contaminar
 * al siguiente. En NODE_ENV=test los pedidos SIN `remoteAddress` (127.0.0.1)
 * están en el `allowList` del plugin: eso es lo que protege a la suite entera.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance, RouteOptions } from "fastify";
import { createTestApp, cleanAllTestData, registerUser } from "../helpers";
import { RATE_LIMITS } from "../../src/modules/shared/rate-limits";

const PASSWORD = "clave-correcta-123";
const SEDE_ID = 1;

let emailSeq = 0;
function freshEmail(prefix: string): string {
  emailSeq += 1;
  return `${prefix}-${Date.now()}-${emailSeq}@test.com`;
}

/** Last-10 de teléfono y DNI únicos por alta (el registro bloquea duplicados). */
let altaSeq = 0;
function uniqueAlta(): { dni: string; phone: string } {
  altaSeq += 1;
  const tail = `${Date.now() % 1_000_000}`.padStart(6, "0");
  const seq = String(altaSeq).padStart(4, "0");
  return { dni: `RL${tail}${seq}`, phone: `+549${tail}${seq}` };
}

describe("Rate limit por IP en rutas públicas", () => {
  let app: FastifyInstance;
  const routes: RouteOptions[] = [];

  beforeAll(async () => {
    app = await createTestApp({ onRoute: (r) => routes.push(r) });
    await cleanAllTestData(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  function login(email: string, password: string, remoteAddress?: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
      remoteAddress,
    });
  }

  function forgot(remoteAddress: string, xff?: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "nadie-rate-limit@test.com" },
      remoteAddress,
      headers: xff ? { "x-forwarded-for": xff } : undefined,
    });
  }

  it("/login: 20 intentos malos dan 401, el 21 da 429; otra IP sigue en 401", async () => {
    const email = freshEmail("login-rl");
    await registerUser(app, {
      email,
      password: PASSWORD,
      branchId: SEDE_ID,
    });
    const remoteAddress = "10.88.1.1";

    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      const res = await login(email, "clave-mala-999", remoteAddress);
      expect(res.statusCode, `intento ${i + 1}`).toBe(401);
      expect(JSON.parse(res.body).message, `intento ${i + 1}`).toBe(
        "Credenciales invalidas",
      );
    }

    const blocked = await login(email, "clave-mala-999", remoteAddress);
    expect(blocked.statusCode).toBe(429);
    const body = JSON.parse(blocked.body);
    expect(body.error).toBe("Demasiados intentos");
    expect(body.message).toMatch(/Demasiados intentos/);

    // Bloqueada la IP, hasta la contraseña correcta recibe 429 (corte previo a bcrypt).
    const blockedCorrect = await login(email, PASSWORD, remoteAddress);
    expect(blockedCorrect.statusCode).toBe(429);

    // Control: otra IP no está afectada y con la clave correcta entra.
    const otherBad = await login(email, "clave-mala-999", "10.88.1.2");
    expect(otherBad.statusCode).toBe(401);
    const otherGood = await login(email, PASSWORD, "10.88.1.3");
    expect(otherGood.statusCode).toBe(200);
  });

  it("/register: 20 altas válidas dan 200, la 21 da 429; otra IP sigue pudiendo registrar", async () => {
    const remoteAddress = "10.88.2.1";
    const register = (ip: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/register",
        remoteAddress: ip,
        payload: {
          email: freshEmail("register-rl"),
          password: PASSWORD,
          firstName: "Rate",
          lastName: "Limit",
          gender: "male",
          branchId: SEDE_ID,
          ...uniqueAlta(),
        },
      });

    for (let i = 0; i < RATE_LIMITS.register.max; i++) {
      const res = await register(remoteAddress);
      expect(res.statusCode, `alta ${i + 1}: ${res.body}`).toBe(200);
    }

    const blocked = await register(remoteAddress);
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).message).toMatch(/Demasiados intentos/);

    const other = await register("10.88.2.2");
    expect(other.statusCode, other.body).toBe(200);
  });

  it("/api/franchise/apply: 10 solicitudes dan 201, la 11 da 429; otra IP pasa", async () => {
    const remoteAddress = "10.88.3.1";
    const apply = (ip: string) =>
      app.inject({
        method: "POST",
        url: "/api/franchise/apply",
        remoteAddress: ip,
        payload: {
          nombre: "Rate Limit Test",
          email: "rate-limit-franchise@example.com",
          telefono: "+5492235550000",
          ciudadPais: "Mar del Plata, Argentina",
          modelo: "activa",
          experiencia: "fitness",
          capital: "entre_50k_100k",
          origen: "instagram",
          mensaje: "Prueba de rate limit.",
        },
      });

    for (let i = 0; i < RATE_LIMITS.publicForm.max; i++) {
      const res = await apply(remoteAddress);
      expect(res.statusCode, `solicitud ${i + 1}: ${res.body}`).toBe(201);
    }

    const blocked = await apply(remoteAddress);
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).message).toMatch(/Demasiados intentos/);

    const other = await apply("10.88.3.2");
    expect(other.statusCode, other.body).toBe(201);
  });

  describe("trustProxy: 1 (la IP del cliente sale del X-Forwarded-For que agregó nginx)", () => {
    const MAX = RATE_LIMITS.forgotPassword.max;

    it("el límite se cuenta por la IP del XFF, no por la del socket", async () => {
      const proxy = "10.77.0.1";
      const client = "203.0.113.5";

      for (let i = 0; i < MAX; i++) {
        const res = await forgot(proxy, client);
        expect(res.statusCode, `pedido ${i + 1}`).toBe(200);
      }
      const blocked = await forgot(proxy, client);
      expect(blocked.statusCode).toBe(429);

      // Mismo socket (el nginx), otro cliente: contador propio.
      const otherClient = await forgot(proxy, "203.0.113.6");
      expect(otherClient.statusCode).toBe(200);

      // Mismo cliente por otro socket: sigue contando contra el cliente.
      const sameClientOtherProxy = await forgot("10.77.0.2", client);
      expect(sameClientOtherProxy.statusCode).toBe(429);
    });

    it("anti-spoof: lo que el cliente antepone al XFF no le da un contador nuevo", async () => {
      const proxy = "10.77.0.3";
      const real = "203.0.113.50";

      for (let i = 0; i < MAX; i++) {
        const res = await forgot(proxy, `198.51.100.${i + 1}, ${real}`);
        expect(res.statusCode, `pedido ${i + 1}`).toBe(200);
      }
      const spoofed = await forgot(proxy, `198.51.100.200, ${real}`);
      expect(spoofed.statusCode).toBe(429);

      // Sin cadena falseada, la IP real sigue bloqueada.
      const plain = await forgot(proxy, real);
      expect(plain.statusCode).toBe(429);
    });
  });

  it("sin remoteAddress (127.0.0.1, allowList de test): 25 logins fallidos y ninguno da 429", async () => {
    for (let i = 0; i < 25; i++) {
      const res = await login(freshEmail("nadie"), "clave-mala-999");
      expect(res.statusCode, `intento ${i + 1}`).toBe(401);
    }
  });

  describe("cobertura de config.rateLimit por ruta", () => {
    function rateLimitOf(method: string, url: string): unknown {
      const route = routes.find((r) => {
        const methods = Array.isArray(r.method) ? r.method : [r.method];
        return r.url === url && methods.includes(method);
      });
      expect(route, `${method} ${url} no está registrada`).toBeDefined();
      return (route?.config as { rateLimit?: unknown } | undefined)?.rateLimit;
    }

    it.each([
      ["POST", "/api/auth/login", RATE_LIMITS.login],
      ["POST", "/api/auth/register", RATE_LIMITS.register],
      ["POST", "/api/campaigns/exchange", RATE_LIMITS.exchange],
      ["POST", "/api/franchise/apply", RATE_LIMITS.publicForm],
      ["POST", "/api/academy/inquire", RATE_LIMITS.publicForm],
      ["POST", "/api/gladius/inquire", RATE_LIMITS.publicForm],
      ["POST", "/api/app/waitlist", RATE_LIMITS.publicForm],
      ["POST", "/api/app/labs-inquiry", RATE_LIMITS.publicForm],
      ["POST", "/api/auth/forgot-password", RATE_LIMITS.forgotPassword],
      ["POST", "/api/auth/reset-password", RATE_LIMITS.resetPassword],
      ["GET", "/api/web/site-data", RATE_LIMITS.siteData],
    ])("%s %s lleva el límite esperado", (method, url, expected) => {
      expect(rateLimitOf(method, url)).toEqual(expected);
    });

    it("/auth/refresh NO lleva límite (los clientes lo llaman seguido)", () => {
      expect(rateLimitOf("POST", "/api/auth/refresh")).toBeUndefined();
    });

    it("los topes de forgot/reset/site-data conservan sus valores históricos", () => {
      expect(RATE_LIMITS.forgotPassword).toEqual({
        max: 5,
        timeWindow: "15 minutes",
      });
      expect(RATE_LIMITS.resetPassword).toEqual({
        max: 10,
        timeWindow: "15 minutes",
      });
      expect(RATE_LIMITS.siteData).toEqual({ max: 60, timeWindow: "1 minute" });
    });
  });
});
