import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, isNull, isNotNull } from "drizzle-orm";
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
 *  - Reuse detection (Req 3): reusar un refresh ya rotado → 401 + toda la familia revocada.
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
  it("reuse detection: reusar un refresh ya rotado → 401 y revoca la familia completa", async () => {
    const session = await registerSession("reuse");
    const tokenA = session.refreshToken;

    // Primera rotación: A → B (A queda revocado).
    const first = await refresh(tokenA);
    expect(first.statusCode).toBe(200);

    // Reusar A (ya rotado/revocado) → 401.
    const replay = await refresh(tokenA);
    expect(replay.statusCode).toBe(401);

    // Toda la familia del user quedó revocada (incluido B emitido en la rotación).
    const active = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, session.userId));
    expect(active.length).toBeGreaterThan(0);
    for (const row of active) {
      expect(row.revokedAt).not.toBeNull();
    }

    // Confirmación adicional: no queda ningún refresh activo (revoked_at IS NULL).
    const stillActive = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(isNull(schema.refreshTokens.revokedAt));
    const mine = stillActive.filter((r) => r.userId === session.userId);
    expect(mine.length).toBe(0);
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
