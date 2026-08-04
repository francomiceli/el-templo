import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, isNull, isNotNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";

/**
 * Phase 116 Plan 05 (Req 14) — integration tests for the refresh-token
 * scheme against the real per-worker test DB (eltemplo_test_<pool>).
 *
 * Flujos cubiertos:
 *  - Refresh exitoso + rotación (Req 2,6): el viejo queda revoked_at + replaced_by_id
 *    apuntando al nuevo; el nuevo expira ≈ now+30d (sliding); el access nuevo pasa /me.
 *  - Reuse detection (Req 3): reusar un refresh ya rotado fuera de la ventana de
 *    gracia → 401 + revocación de ESA cadena (no de las demás sesiones del user,
 *    fix 2026-08-04); dentro de la gracia → 200, es un reintento de red.
 *  - Logout idempotente (Req 4, D-04): logout → 200; refresh post-logout → 401; segundo logout → 200.
 *  - Change-password (Req 12, D-01): revoca todos los refresh menos emite par nuevo para el device actual.
 *  - Delete-account (D-05): revoca todos los refresh del user tras el soft-delete.
 *  - Dual access (Req 8): token legacy (7d) y accessToken (30m) ambos pasan /auth/me.
 */

// ---------------------------------------------------------------------------
// Tipos locales para narrowing de los bodies (CLAUDE.md: sin `any`).
// ---------------------------------------------------------------------------
interface AuthResponseBody {
  token: string;
  accessToken: string;
  refreshToken: string;
  user: { id: number; email: string; [key: string]: unknown };
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

interface ChangePasswordResponseBody {
  message: string;
  accessToken: string;
  refreshToken: string;
}

/** sha256 hex del refresh plano — mismo algoritmo que RefreshTokenService. */
function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

const PASSWORD = "password123";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

describe("Refresh Tokens — integración (Phase 116 Req 14)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /**
   * Registra un user único por test y devuelve el par de tokens + el userId.
   * Cada `it` usa su propio email para evitar colisiones intra-worker.
   */
  async function registerSession(emailPrefix: string): Promise<{
    userId: number;
    token: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  }> {
    const email = `${emailPrefix}-${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}@test.com`;
    // registerUser genera dni/phone únicos por llamada (Phase 111 phone-block
    // requiere un last-10 globalmente único) y devuelve el body completo.
    const result = (await registerUser(app, {
      email,
      password: PASSWORD,
      branchId: 1,
      firstName: "Refresh",
      lastName: "Tester",
    })) as unknown as AuthResponseBody;
    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).toBeTruthy();
    return {
      userId: result.user.id,
      token: result.token,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      email,
    };
  }

  /** Login adicional (segunda sesión para el mismo user). */
  async function login(email: string): Promise<AuthResponseBody> {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as AuthResponseBody;
  }

  async function refresh(refreshToken: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
  }

  async function getMe(bearer: string) {
    return app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${bearer}` },
    });
  }

  // -------------------------------------------------------------------------
  // Refresh exitoso + rotación (Req 2, 6)
  // -------------------------------------------------------------------------
  it("refresca exitosamente y rota: viejo revocado + replaced_by_id, nuevo sliding 30d", async () => {
    const session = await registerSession("rotate");

    const res = await refresh(session.refreshToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as RefreshResponseBody;
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    // El refresh nuevo difiere del original (rotación).
    expect(body.refreshToken).not.toBe(session.refreshToken);

    // El refresh viejo (el de register) quedó revocado + apunta al nuevo.
    const [oldRow] = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(
        eq(schema.refreshTokens.tokenHash, hashToken(session.refreshToken)),
      )
      .limit(1);
    expect(oldRow).toBeDefined();
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedById).not.toBeNull();

    // El nuevo refresh existe, no está revocado, y expira ≈ now+30d (sliding).
    const [newRow] = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hashToken(body.refreshToken)))
      .limit(1);
    expect(newRow).toBeDefined();
    expect(newRow.revokedAt).toBeNull();
    // replaced_by_id del viejo apunta exactamente al nuevo.
    expect(oldRow.replacedById).toBe(newRow.id);

    const expiresInMs = newRow.expiresAt.getTime() - Date.now();
    // Ventana razonable: 30d ± 5 minutos de holgura de ejecución.
    expect(expiresInMs).toBeGreaterThan(REFRESH_TTL_MS - 5 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(REFRESH_TTL_MS + 60 * 1000);

    // El accessToken nuevo pasa /auth/me.
    const me = await getMe(body.accessToken);
    expect(me.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Reuse detection (Req 3)
  // -------------------------------------------------------------------------
  /**
   * Envejece el `revoked_at` de un token para sacarlo de la ventana de gracia
   * sin fake timers: el servicio compara contra `Date.now()`, así que mover la
   * fila hacia atrás es equivalente a esperar, y es determinista.
   */
  async function ageRevocation(plain: string, seconds: number): Promise<void> {
    await app.db.execute(
      sql`UPDATE refresh_tokens
          SET revoked_at = DATE_SUB(NOW(), INTERVAL ${seconds} SECOND)
          WHERE token_hash = ${hashToken(plain)}`,
    );
  }

  it("replay fuera de la ventana de gracia → 401 y revoca SOLO la cadena de ese token", async () => {
    const sessionA = await registerSession("reuse");
    // Segunda sesión del MISMO user (el caso real: compu + celular).
    const sessionB = await login(sessionA.email);

    // Cadena A: A → A2 (A queda revocado).
    const first = await refresh(sessionA.refreshToken);
    expect(first.statusCode).toBe(200);
    const a2 = (JSON.parse(first.body) as RefreshResponseBody).refreshToken;

    // Sacamos A de la gracia: ahora sí es un replay.
    await ageRevocation(sessionA.refreshToken, 60);

    const replay = await refresh(sessionA.refreshToken);
    expect(replay.statusCode).toBe(401);

    // La cadena comprometida muere entera: A2 tampoco sirve.
    const a2After = await refresh(a2);
    expect(a2After.statusCode).toBe(401);

    // LO QUE IMPORTA (fix 2026-08-04): la OTRA sesión del mismo user sobrevive.
    // Antes, revokeAllForUser la mataba y el usuario perdía todos sus devices.
    const bAfter = await refresh(sessionB.refreshToken);
    expect(bAfter.statusCode).toBe(200);
  });

  it("reintento dentro de la ventana de gracia → 200, sin abrir una sesión nueva", async () => {
    const session = await registerSession("grace");

    // El cliente rota A → B, pero la respuesta se pierde (timeout de red).
    const first = await refresh(session.refreshToken);
    expect(first.statusCode).toBe(200);

    // Reintenta con A, lo único que tiene. Dentro de la gracia NO es robo.
    const retry = await refresh(session.refreshToken);
    expect(retry.statusCode).toBe(200);
    const retryToken = (JSON.parse(retry.body) as RefreshResponseBody)
      .refreshToken;

    // El token servido funciona de verdad.
    const again = await refresh(retryToken);
    expect(again.statusCode).toBe(200);

    // Y quedó UNA sola cadena viva, no dos sesiones paralelas.
    const alive = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, session.userId));
    expect(alive.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it("un replay repetido no puede tumbar las demás sesiones del user", async () => {
    const sessionA = await registerSession("replayloop");
    const sessionB = await login(sessionA.email);
    const sessionC = await login(sessionA.email);

    const first = await refresh(sessionA.refreshToken);
    expect(first.statusCode).toBe(200);
    await ageRevocation(sessionA.refreshToken, 60);

    // Tres replays seguidos del token comprometido.
    for (let i = 0; i < 3; i++) {
      const replay = await refresh(sessionA.refreshToken);
      expect(replay.statusCode).toBe(401);
    }

    // B y C siguen intactas.
    expect((await refresh(sessionB.refreshToken)).statusCode).toBe(200);
    expect((await refresh(sessionC.refreshToken)).statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Logout idempotente (Req 4, D-04)
  // -------------------------------------------------------------------------
  it("logout revoca el refresh, es idempotente, y un refresh posterior → 401", async () => {
    const session = await registerSession("logout");

    const out1 = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: session.refreshToken },
    });
    expect(out1.statusCode).toBe(200);

    // El refresh ya revocado no puede rotarse → 401.
    const afterLogout = await refresh(session.refreshToken);
    expect(afterLogout.statusCode).toBe(401);

    // Segundo logout con el mismo token (ya revocado) → 200 igual (idempotente, D-04).
    const out2 = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: session.refreshToken },
    });
    expect(out2.statusCode).toBe(200);

    // Logout de un token inexistente también es idempotente (no leak, D-04).
    const outUnknown = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: "token-que-no-existe" },
    });
    expect(outUnknown.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Change-password (Req 12, D-01)
  // -------------------------------------------------------------------------
  it("change-password revoca todos los refresh y emite un par nuevo para el device actual", async () => {
    const sessionA = await registerSession("chpwd");
    // Segunda sesión B (otro device) del mismo user.
    const sessionB = await login(sessionA.email);

    const chpwd = await app.inject({
      method: "POST",
      url: "/api/auth/me/change-password",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
      payload: { currentPassword: PASSWORD, newPassword: "nuevaPass456" },
    });
    expect(chpwd.statusCode).toBe(200);
    const chBody = JSON.parse(chpwd.body) as ChangePasswordResponseBody;
    expect(chBody.accessToken).toBeTruthy();
    expect(chBody.refreshToken).toBeTruthy();

    // El par NUEVO emitido para A en el change-password funciona (se verifica
    // PRIMERO: rotar un refresh revocado dispara reuse-detection que revoca la
    // familia completa, incluido este par nuevo — así que el orden importa).
    const aNewRefresh = await refresh(chBody.refreshToken);
    expect(aNewRefresh.statusCode).toBe(200);

    // El accessToken nuevo de A pasa /auth/me.
    const me = await getMe(chBody.accessToken);
    expect(me.statusCode).toBe(200);

    // El refresh de B quedó revocado por el change-password → no puede rotarse.
    const bRefresh = await refresh(sessionB.refreshToken);
    expect(bRefresh.statusCode).toBe(401);

    // El refresh viejo de A también fue revocado (revokeAllForUser revoca TODOS
    // los del user, no solo los de otros devices).
    const aOldRefresh = await refresh(sessionA.refreshToken);
    expect(aOldRefresh.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Delete-account (D-05)
  // -------------------------------------------------------------------------
  it("delete-account revoca todos los refresh del user (soft-delete + revocación explícita)", async () => {
    const session = await registerSession("delacct");

    const del = await app.inject({
      method: "POST",
      url: "/api/auth/me/delete-account",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { password: PASSWORD },
    });
    // El endpoint responde 200 (o 204) tras el soft-delete.
    expect([200, 204]).toContain(del.statusCode);

    // Tras el delete, ningún refresh del user puede rotarse.
    const afterDelete = await refresh(session.refreshToken);
    expect(afterDelete.statusCode).toBe(401);

    // En DB no queda ningún refresh activo del user.
    const active = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(isNotNull(schema.refreshTokens.revokedAt));
    const revokedMine = active.filter((r) => r.userId === session.userId);
    expect(revokedMine.length).toBeGreaterThan(0);

    const stillActive = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(isNull(schema.refreshTokens.revokedAt));
    const mineActive = stillActive.filter((r) => r.userId === session.userId);
    expect(mineActive.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Dual access (Req 8)
  // -------------------------------------------------------------------------
  it("acceso dual: el token legacy (7d) y el accessToken (30m) ambos pasan /auth/me", async () => {
    const session = await registerSession("dual");

    const meLegacy = await getMe(session.token);
    expect(meLegacy.statusCode).toBe(200);

    const meAccess = await getMe(session.accessToken);
    expect(meAccess.statusCode).toBe(200);
  });
});
