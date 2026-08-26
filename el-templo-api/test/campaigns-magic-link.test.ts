/**
 * Fase 180 Plan 06 (D-01/D-02) — `POST /api/campaigns/exchange`: canje de
 * magic-link por sesión.
 *
 * Cubre los caminos de `MagicLinkService.exchange` (magic-link-service.ts):
 *   1. Token de login válido → sesión completa (access + refresh + user +
 *      destination), y el refreshToken funciona en `POST /api/auth/refresh`.
 *   2. Multi-uso (D-02): el mismo token canjeado dos veces devuelve dos
 *      sesiones válidas con refreshTokens distintos.
 *   3. Token de purpose tracking (sin `purpose:'login'`) → 401.
 *   4. Token con `loginExp` vencido → 401.
 *   5. Token con firma alterada → 401.
 *   6. `sendId` inexistente → 401 (mismo mensaje genérico).
 *   7. `userId` del token que no coincide con `campaign_sends.user_id` → 401.
 *   8. Usuario con `deletedAt` → 401.
 *   9. Staff con `staffDisabled` → 401.
 *  10. Destino derivado del segmento persistido de la campaña (D-13).
 *
 * El aislamiento multi-tenant de esta ruta (T-180-23) vive en
 * `test/tenancy/iso-03-campaigns.test.ts`, no acá (mismo split que el resto
 * del módulo: comportamiento acá, aislamiento en la batería ISO-03).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
  createTestCampaign,
  createTestSend,
  createStaffUser,
} from "./helpers";
import { signCampaignToken } from "../src/modules/campaigns/token-service";
import { tenantWhere } from "../src/modules/shared/tenant";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let ownerId: number;

// El gimnasio de los fixtures (El Templo = tenant 1) — mismo criterio que
// campaigns-tracking.test.ts.
const CTX = { tenantId: 1 };

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // admin@test.com, nunca un id hardcodeado (test/setup.ts lo siembra).
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;
});

/**
 * Crea campaña + send + usuario elegible, y firma un token de LOGIN
 * (`purpose:'login'`) sobre ese send. `segment` opcional permite fijar el
 * segmento de la campaña para el caso de D-13; `loginExp` opcional simula un
 * token viejo (solo para test — production nunca lo pasa).
 */
async function seedLoginSend(
  overrides: {
    segment?: (typeof schema.campaigns.$inferInsert)["segment"];
    loginExp?: number;
  } = {},
): Promise<{
  sendId: number;
  campaignId: number;
  userId: number;
  email: string;
  token: string;
}> {
  const { id: userId, email } = await createEligibleFreemium(app);
  const campaignId = await createTestCampaign(app, ownerId);
  if (overrides.segment) {
    await app.db
      .update(schema.campaigns)
      .set({ segment: overrides.segment })
      .where(
        and(
          tenantWhere(schema.campaigns, CTX),
          eq(schema.campaigns.id, campaignId),
        ),
      );
  }
  const sendId = await createTestSend(app, campaignId, userId, email);
  const token = signCampaignToken({
    userId,
    campaignId,
    sendId,
    purpose: "login",
    ...(overrides.loginExp !== undefined
      ? { loginExp: overrides.loginExp }
      : {}),
  });
  return { sendId, campaignId, userId, email, token };
}

function exchange(token: string) {
  return app.inject({
    method: "POST",
    url: "/api/campaigns/exchange",
    payload: { token },
  });
}

describe("POST /api/campaigns/exchange — canje de magic-link (D-01/D-02)", () => {
  it("D-01: un token de login válido devuelve token + accessToken + refreshToken + user + destination", async () => {
    const { token, email } = await seedLoginSend();

    const res = await exchange(token);

    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      token: string;
      accessToken: string;
      refreshToken: string;
      user: { id: number; email: string; onboardingCompleted: boolean };
      destination: string;
    };
    expect(typeof body.token).toBe("string");
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
    expect(body.user.email).toBe(email);
    expect(body.destination).toBe("reservas-prueba");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("el refreshToken devuelto funciona contra POST /api/auth/refresh", async () => {
    const { token } = await seedLoginSend();

    const exchanged = await exchange(token);
    expect(exchanged.statusCode, exchanged.body).toBe(200);
    const { refreshToken } = JSON.parse(exchanged.body) as {
      refreshToken: string;
    };

    const refreshed = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    const refreshedBody = JSON.parse(refreshed.body) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(typeof refreshedBody.accessToken).toBe("string");
    expect(typeof refreshedBody.refreshToken).toBe("string");
  });

  it("D-02 multi-uso: el mismo token canjeado dos veces devuelve dos sesiones válidas con refreshTokens distintos", async () => {
    const { token } = await seedLoginSend();

    const primero = await exchange(token);
    const segundo = await exchange(token);

    expect(primero.statusCode, primero.body).toBe(200);
    expect(segundo.statusCode, segundo.body).toBe(200);
    const bodyUno = JSON.parse(primero.body) as { refreshToken: string };
    const bodyDos = JSON.parse(segundo.body) as { refreshToken: string };
    expect(bodyUno.refreshToken).not.toBe(bodyDos.refreshToken);

    // Ambos refresh tokens funcionan de forma independiente (D-02: multi-uso
    // real, no un token que se "gasta" al primer canje).
    const refrescoUno = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: bodyUno.refreshToken },
    });
    const refrescoDos = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: bodyDos.refreshToken },
    });
    expect(refrescoUno.statusCode, refrescoUno.body).toBe(200);
    expect(refrescoDos.statusCode, refrescoDos.body).toBe(200);
  });

  it("un token de purpose TRACKING (sin purpose:'login') NO emite sesión: 401 genérico", async () => {
    const { id: userId, email } = await createEligibleFreemium(app);
    const campaignId = await createTestCampaign(app, ownerId);
    const sendId = await createTestSend(app, campaignId, userId, email);
    // Sin purpose -> token de tracking puro (idioma pre-Fase-180).
    const trackingToken = signCampaignToken({ userId, campaignId, sendId });

    const res = await exchange(trackingToken);

    expect(res.statusCode, res.body).toBe(401);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("Enlace inválido o vencido");
  });

  it("un token con loginExp vencido NO emite sesión: 401 genérico", async () => {
    const loginExpVencido = Math.floor(Date.now() / 1000) - 60 * 60; // 1h atrás
    const { token } = await seedLoginSend({ loginExp: loginExpVencido });

    const res = await exchange(token);

    expect(res.statusCode, res.body).toBe(401);
  });

  it("un token con firma alterada NO emite sesión: 401 genérico", async () => {
    const { token } = await seedLoginSend();
    const [payloadB64, signature] = token.split(".");
    // Voltea el último char de la firma — misma longitud, firma distinta.
    const ultimoChar = signature.at(-1) ?? "A";
    const charAlterado = ultimoChar === "A" ? "B" : "A";
    const firmaAlterada = signature.slice(0, -1) + charAlterado;
    const tokenAlterado = `${payloadB64}.${firmaAlterada}`;

    const res = await exchange(tokenAlterado);

    expect(res.statusCode, res.body).toBe(401);
  });

  it("un sendId que ya no resuelve NO emite sesión: 401 genérico (mismo mensaje que un token inválido)", async () => {
    const { sendId, token } = await seedLoginSend();
    // El token sigue firmado y vigente, pero la fila que identifica ya no existe.
    await app.db
      .delete(schema.campaignSends)
      .where(
        and(
          tenantWhere(schema.campaignSends, CTX),
          eq(schema.campaignSends.id, sendId),
        ),
      );

    const res = await exchange(token);

    expect(res.statusCode, res.body).toBe(401);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("Enlace inválido o vencido");
  });

  it("un userId del token que no coincide con campaign_sends.user_id NO emite sesión: 401", async () => {
    const otro = await createEligibleFreemium(app);
    const { sendId, campaignId } = await seedLoginSend();
    // sendId real, pero firmado con el userId de OTRO usuario elegible.
    const tokenSuplantado = signCampaignToken({
      userId: otro.id,
      campaignId,
      sendId,
      purpose: "login",
    });

    const res = await exchange(tokenSuplantado);

    expect(res.statusCode, res.body).toBe(401);
  });

  it("un usuario con deletedAt NO emite sesión: 401", async () => {
    const { userId, token } = await seedLoginSend();
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, userId)));

    const res = await exchange(token);

    expect(res.statusCode, res.body).toBe(401);
  });

  it("un staff con staffDisabled NO emite sesión: 401", async () => {
    const email = `magic-link-coach-${Date.now().toString(36)}@test.com`;
    const coachId = await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: "Coach",
      lastName: "Disabled",
      role: "coach",
      branchId: 1,
    });
    const campaignId = await createTestCampaign(app, ownerId);
    const sendId = await createTestSend(app, campaignId, coachId, email);
    const token = signCampaignToken({
      userId: coachId,
      campaignId,
      sendId,
      purpose: "login",
    });
    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, coachId)));

    const res = await exchange(token);

    expect(res.statusCode, res.body).toBe(401);
  });

  it("D-13: el destino devuelto se deriva del segmento persistido de la campaña", async () => {
    const { token: tokenBajas } = await seedLoginSend({ segment: "bajas" });
    const resBajas = await exchange(tokenBajas);
    expect(resBajas.statusCode, resBajas.body).toBe(200);
    const bodyBajas = JSON.parse(resBajas.body) as { destination: string };
    expect(bodyBajas.destination).toBe("volver");

    const { token: tokenAusente } = await seedLoginSend({
      segment: "alerta_ausente",
    });
    const resAusente = await exchange(tokenAusente);
    expect(resAusente.statusCode, resAusente.body).toBe(200);
    const bodyAusente = JSON.parse(resAusente.body) as { destination: string };
    expect(bodyAusente.destination).toBe("reservas");
  });

  it("el body rechaza un token vacío o ausente (minLength 1)", async () => {
    const sinToken = await app.inject({
      method: "POST",
      url: "/api/campaigns/exchange",
      payload: {},
    });
    expect(sinToken.statusCode).toBe(400);

    const tokenVacio = await exchange("");
    expect(tokenVacio.statusCode).toBe(400);
  });

  it("additionalProperties:false: un campo desconocido en el body se descarta (Fastify/AJV removeAdditional) y el request sigue evaluando SOLO el token", async () => {
    // Mismo comportamiento documentado en scheduling-reserve-trial.test.ts /
    // exercise-adjustments.test.ts: Fastify corre con removeAdditional=true,
    // así que additionalProperties:false PODA el campo desconocido en vez de
    // devolver 400 — el trust boundary igual se sostiene (nada ajeno al
    // schema llega al handler), solo que el mecanismo es silencioso.
    const conCampoExtra = await app.inject({
      method: "POST",
      url: "/api/campaigns/exchange",
      payload: { token: "token-invalido-no-resuelve-nada", extra: "no-deberia-colarse" },
    });
    // El token es invalido de por si -> 401 genérico, NO un 400 por el campo
    // extra (prueba que se podó, no que rompió la validación).
    expect(conCampoExtra.statusCode).toBe(401);
  });

  it("nunca deja una fila huérfana de refresh_tokens para un canje que falló (401)", async () => {
    const antes = (
      (await app.db.execute(
        sql`SELECT /* tenant-safe: conteo total de evidencia, no hay ctx en una ruta publica sin token valido */ COUNT(*) AS n FROM refresh_tokens`,
      )) as unknown as [Array<{ n: number }>]
    )[0][0].n;

    await exchange("token-invalido-no-resuelve-nada");

    const despues = (
      (await app.db.execute(
        sql`SELECT /* tenant-safe: conteo total de evidencia, no hay ctx en una ruta publica sin token valido */ COUNT(*) AS n FROM refresh_tokens`,
      )) as unknown as [Array<{ n: number }>]
    )[0][0].n;
    expect(Number(despues)).toBe(Number(antes));
  });
});
