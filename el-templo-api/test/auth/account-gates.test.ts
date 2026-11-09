import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { MEMBER_TEMP_PASSWORD } from "../../src/modules/members/service";
import {
  ACCOUNT_BLOCKED,
  ROLE_CHANGED,
} from "../../src/modules/shared/country-scope";

/**
 * Gates de cuenta (tanda 1 de seguridad, H1 + #8 + #9):
 *  - /auth/refresh rechaza cuentas borradas o con staff deshabilitado y revoca
 *    todas sus sesiones.
 *  - `attachScope` corta en cada pedido un access token vigente de una cuenta
 *    bloqueada (401 ACCOUNT_BLOCKED) o con el rol cambiado (401 ROLE_CHANGED).
 *  - Reseteo de clave, baja, deshabilitación y promoción a staff revocan los
 *    refresh tokens del usuario.
 */

interface LoginBody {
  token: string;
  accessToken: string;
  refreshToken: string;
  user: { id: number; email: string; role: string };
}

interface RefreshBody {
  accessToken: string;
  refreshToken: string;
}

interface ErrorBody {
  statusCode?: number;
  code?: string;
  error?: string;
  message?: string;
}

const ME_URL = "/api/auth/me";
const REFRESH_URL = "/api/auth/refresh";

const BLOCKED_DELETED = "Esta cuenta fue eliminada";
const BLOCKED_DISABLED = "Cuenta desactivada";
const ROLE_CHANGED_MESSAGE = "Sesion desactualizada, volve a iniciar sesion";

/** Sufijo único por llamada: los emails no se pisan entre casos del mismo worker. */
function uniq(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Rol que el JWT lleva firmado (payload decodificado sin librerías). */
function roleOfJwt(jwt: string): string {
  const payload = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
  ) as { role: string };
  return payload.role;
}

describe("Gates de cuenta: refresh, scope por pedido y revocación de sesiones", () => {
  let app: FastifyInstance;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

  async function login(email: string, password: string): Promise<LoginBody> {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as LoginBody;
  }

  async function refresh(refreshToken: string) {
    return app.inject({
      method: "POST",
      url: REFRESH_URL,
      payload: { refreshToken },
    });
  }

  async function me(accessToken: string) {
    return app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  async function activeRefreshTokens(userId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.refreshTokens.id })
      .from(schema.refreshTokens)
      .where(
        and(
          tenantWhere(schema.refreshTokens, { tenantId: TENANT_TEMPLO }),
          eq(schema.refreshTokens.userId, userId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
    return rows.length;
  }

  async function createCoachSession() {
    const email = `gates-coach-${uniq()}@test.com`;
    const password = "coachpass123";
    const id = await createStaffUser(app, {
      email,
      password,
      firstName: "Coach",
      lastName: "Gates",
      role: "coach",
      branchId: 1,
    });
    const session = await login(email, password);
    return { id, email, password, session };
  }

  it("staff deshabilitado: /refresh 401 'Cuenta desactivada', token quedó revocado y el access vigente se corta", async () => {
    const coach = await createCoachSession();
    // Antes de deshabilitar el access funciona (control del gate).
    expect((await me(coach.session.accessToken)).statusCode).toBe(200);

    const disable = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${coach.id}/status`,
      headers: ownerHeaders(),
      payload: { disabled: true },
    });
    expect(disable.statusCode).toBe(200);
    // Deshabilitar revoca las sesiones en el momento, sin esperar al refresh.
    expect(await activeRefreshTokens(coach.id)).toBe(0);

    const r1 = await refresh(coach.session.refreshToken);
    expect(r1.statusCode).toBe(401);
    const b1 = JSON.parse(r1.body) as ErrorBody;
    expect(b1.error).toBe("No autorizado");
    // El token ya estaba revocado por el toggle: llega como refresh inválido.
    expect(b1.message).toBe("Refresh invalido");

    // El mismo token otra vez: sigue 401.
    expect((await refresh(coach.session.refreshToken)).statusCode).toBe(401);

    // Access token todavía vigente (30 min): lo corta attachScope.
    const meRes = await me(coach.session.accessToken);
    expect(meRes.statusCode).toBe(401);
    const meBody = JSON.parse(meRes.body) as ErrorBody;
    expect(meBody.code).toBe(ACCOUNT_BLOCKED);
    expect(meBody.message).toBe(BLOCKED_DISABLED);
  });

  it("/refresh con la cuenta bloqueada por DB (sin pasar por el toggle): 401 'Cuenta desactivada' y revoca todo", async () => {
    // Simula una baja hecha por otro camino (SQL manual, otro proceso) que no
    // revocó los tokens: el gate de /refresh tiene que cerrarlo igual.
    const coach = await createCoachSession();
    // Una segunda sesión del mismo usuario (otro dispositivo).
    const second = await login(coach.email, coach.password);
    expect(await activeRefreshTokens(coach.id)).toBe(2);

    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, coach.id),
        ),
      );

    const res = await refresh(coach.session.refreshToken);
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as ErrorBody;
    expect(body.error).toBe("No autorizado");
    expect(body.message).toBe(BLOCKED_DISABLED);

    // Quedaron revocadas TODAS las sesiones, incluida la del otro dispositivo
    // y el token recién rotado.
    expect(await activeRefreshTokens(coach.id)).toBe(0);
    const again = await refresh(second.refreshToken);
    expect(again.statusCode).toBe(401);
    expect((JSON.parse(again.body) as ErrorBody).message).toBe(
      "Refresh invalido",
    );
  });

  it("socio borrado por admin: /refresh 401 y el access vigente da 401 'Esta cuenta fue eliminada'", async () => {
    const email = `gates-del-${uniq()}@test.com`;
    const member = await createTestMember(app, {
      email,
      password: "pass123456",
    });
    const session = await login(email, "pass123456");
    expect((await me(session.accessToken)).statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/members/${member.id}`,
      headers: ownerHeaders(),
    });
    expect(del.statusCode).toBe(204);
    expect(await activeRefreshTokens(member.id)).toBe(0);

    const r = await refresh(session.refreshToken);
    expect(r.statusCode).toBe(401);
    expect((JSON.parse(r.body) as ErrorBody).error).toBe("No autorizado");

    const meRes = await me(session.accessToken);
    expect(meRes.statusCode).toBe(401);
    const meBody = JSON.parse(meRes.body) as ErrorBody;
    expect(meBody.code).toBe(ACCOUNT_BLOCKED);
    expect(meBody.message).toBe(BLOCKED_DELETED);
  });

  it("/refresh de un socio con deletedAt puesto sin revocar: 401 'Esta cuenta fue eliminada'", async () => {
    const email = `gates-del2-${uniq()}@test.com`;
    const member = await createTestMember(app, {
      email,
      password: "pass123456",
    });
    const session = await login(email, "pass123456");

    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
          eq(schema.users.id, member.id),
        ),
      );

    const r = await refresh(session.refreshToken);
    expect(r.statusCode).toBe(401);
    const body = JSON.parse(r.body) as ErrorBody;
    expect(body.error).toBe("No autorizado");
    expect(body.message).toBe(BLOCKED_DELETED);
    expect(await activeRefreshTokens(member.id)).toBe(0);
  });

  it("reseteo de clave a la temporal: revoca el refresh viejo y el login con la temporal funciona", async () => {
    const email = `gates-reset-${uniq()}@test.com`;
    const member = await createTestMember(app, {
      email,
      password: "pass123456",
    });
    const session = await login(email, "pass123456");
    expect(await activeRefreshTokens(member.id)).toBeGreaterThan(0);

    const reset = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${member.id}/password`,
      headers: ownerHeaders(),
    });
    expect(reset.statusCode).toBe(204);
    expect(await activeRefreshTokens(member.id)).toBe(0);

    const r = await refresh(session.refreshToken);
    expect(r.statusCode).toBe(401);
    expect((JSON.parse(r.body) as ErrorBody).message).toBe("Refresh invalido");

    const relogin = await login(email, MEMBER_TEMP_PASSWORD);
    expect(relogin.user.id).toBe(member.id);
  });

  it("promoción de socio a staff: revoca el refresh viejo y el login nuevo trae el rol de staff", async () => {
    const email = `gates-promo-${uniq()}@test.com`;
    const member = await createTestMember(app, {
      email,
      password: "pass123456",
    });
    const session = await login(email, "pass123456");

    const promote = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: ownerHeaders(),
      payload: {
        firstName: "Promo",
        lastName: "Staff",
        email,
        password: "staffpass123",
        role: "recepcion",
        branchId: 1,
        branchIds: [1],
      },
    });
    expect(promote.statusCode).toBe(201);
    expect((JSON.parse(promote.body) as { id: number }).id).toBe(member.id);

    const r = await refresh(session.refreshToken);
    expect(r.statusCode).toBe(401);
    expect((JSON.parse(r.body) as ErrorBody).message).toBe("Refresh invalido");

    // La contraseña de socio ya no sirve; la nueva sí, con rol recepcion.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "pass123456" },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newSession = await login(email, "staffpass123");
    expect(roleOfJwt(newSession.accessToken)).toBe("recepcion");
    expect(newSession.user.role).toBe("recepcion");
  });

  it("access token de socio tras ser promovido: 401 ROLE_CHANGED (no conserva el rol de socio)", async () => {
    const email = `gates-promo2-${uniq()}@test.com`;
    await createTestMember(app, { email, password: "pass123456" });
    const session = await login(email, "pass123456");

    const promote = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: ownerHeaders(),
      payload: {
        firstName: "Promo",
        lastName: "Dos",
        email,
        password: "staffpass123",
        role: "recepcion",
        branchId: 1,
        branchIds: [1],
      },
    });
    expect(promote.statusCode).toBe(201);

    const meRes = await me(session.accessToken);
    expect(meRes.statusCode).toBe(401);
    const body = JSON.parse(meRes.body) as ErrorBody;
    expect(body.code).toBe(ROLE_CHANGED);
    expect(body.message).toBe(ROLE_CHANGED_MESSAGE);
  });

  it("cambio de rol: el access viejo da 401 ROLE_CHANGED, /refresh firma el rol nuevo y con él /me da 200", async () => {
    const coach = await createCoachSession();
    expect(roleOfJwt(coach.session.accessToken)).toBe("coach");

    const put = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${coach.id}`,
      headers: ownerHeaders(),
      payload: { role: "recepcion" },
    });
    expect(put.statusCode).toBe(200);
    // Cambiar solo el rol NO revoca las sesiones: el refresh sigue sirviendo.
    expect(await activeRefreshTokens(coach.id)).toBeGreaterThan(0);

    const stale = await me(coach.session.accessToken);
    expect(stale.statusCode).toBe(401);
    const staleBody = JSON.parse(stale.body) as ErrorBody;
    expect(staleBody.code).toBe(ROLE_CHANGED);
    expect(staleBody.message).toBe(ROLE_CHANGED_MESSAGE);

    const r = await refresh(coach.session.refreshToken);
    expect(r.statusCode).toBe(200);
    const fresh = JSON.parse(r.body) as RefreshBody;
    expect(roleOfJwt(fresh.accessToken)).toBe("recepcion");

    expect((await me(fresh.accessToken)).statusCode).toBe(200);
  });

  it("cambio de contraseña de staff desde admin (PUT con password): revoca sus sesiones", async () => {
    const coach = await createCoachSession();
    expect(await activeRefreshTokens(coach.id)).toBeGreaterThan(0);

    const put = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${coach.id}`,
      headers: ownerHeaders(),
      payload: { password: "nuevaclave123" },
    });
    expect(put.statusCode).toBe(200);
    expect(await activeRefreshTokens(coach.id)).toBe(0);

    const r = await refresh(coach.session.refreshToken);
    expect(r.statusCode).toBe(401);
    expect((JSON.parse(r.body) as ErrorBody).message).toBe("Refresh invalido");
    // Y con la clave nueva se puede entrar.
    const relogin = await login(coach.email, "nuevaclave123");
    expect(relogin.user.id).toBe(coach.id);
  });

  it("re-habilitar al staff (disabled: false) no revoca nada y permite volver a entrar", async () => {
    const coach = await createCoachSession();
    const url = `/api/admin/users/${coach.id}/status`;

    const off = await app.inject({
      method: "PATCH",
      url,
      headers: ownerHeaders(),
      payload: { disabled: true },
    });
    expect(off.statusCode).toBe(200);
    const on = await app.inject({
      method: "PATCH",
      url,
      headers: ownerHeaders(),
      payload: { disabled: false },
    });
    expect(on.statusCode).toBe(200);

    // El token viejo quedó revocado por el disable (no se "resucita"), pero un
    // login nuevo funciona y abre sesiones válidas.
    expect((await refresh(coach.session.refreshToken)).statusCode).toBe(401);
    const session = await login(coach.email, coach.password);
    expect((await me(session.accessToken)).statusCode).toBe(200);
    expect((await refresh(session.refreshToken)).statusCode).toBe(200);
  });

  it("control: socio activo normal hace /refresh 200 y /me 200 con el access nuevo", async () => {
    const email = `gates-ok-${uniq()}@test.com`;
    await createTestMember(app, { email, password: "pass123456" });
    const session = await login(email, "pass123456");

    expect((await me(session.accessToken)).statusCode).toBe(200);

    const r = await refresh(session.refreshToken);
    expect(r.statusCode).toBe(200);
    const fresh = JSON.parse(r.body) as RefreshBody;
    expect(fresh.accessToken).toEqual(expect.any(String));
    expect(fresh.refreshToken).not.toBe(session.refreshToken);
    expect(roleOfJwt(fresh.accessToken)).toBe("member");
    expect((await me(fresh.accessToken)).statusCode).toBe(200);
  });

  it("control: el owner semilla sigue pasando el gate por pedido", async () => {
    const res = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: ownerHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });
});
