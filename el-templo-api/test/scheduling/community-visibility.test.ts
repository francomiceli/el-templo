/**
 * Fase 214 Plan 16 (D-05, D-06, D-07, D-09, D-11, D-47): visibilidad del alumno
 * en la lista de anotados.
 *
 * - `PUT /api/members/scheduling/attendees/visibility` guarda la preferencia.
 * - `POST /api/members/scheduling/attendees/notice-seen` marca el aviso
 *   (idempotente: la primera marca no se pisa).
 * - `GET /api/auth/me` devuelve `communityVisible` (efectiva) y
 *   `communityNoticeSeen`.
 * - `getViewerCommunityState` decide `hasPlanInEffect` por `activeMemberExists`
 *   y no por `users.status` (blocker 2 del verificador).
 *
 * Las fechas se calculan relativas a hoy en la zona de la sede (nada fijo) y no
 * hay ids de `users` hardcodeados. El caso de punta a punta de `sin_plan` en la
 * lista lo cubre el plan 17.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  createTestPlan,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { getViewerCommunityState } from "../../src/modules/scheduling/community-service";
import {
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  todayInTz,
} from "../../src/modules/shared/date-utils";

const MEMBER_URL = "/api/members/scheduling";
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

interface MeBody {
  communityVisible: boolean;
  communityNoticeSeen: boolean;
}

/** Misma fecha con `years` años menos (la fecha local de la sede es la de hoy). */
function yearsAgo(today: string, years: number): string {
  const md = today.slice(4) === "-02-29" ? "-02-28" : today.slice(4);
  return `${Number(today.slice(0, 4)) - years}${md}`;
}

describe("Fase 214-16: visibilidad de la comunidad (D-05, D-06, D-47)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let testBranchToday: string;
  let adminToken: string;
  let planId: number;
  let esBranchId: number | null = null;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: schema.branches.id, tz: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
    testBranchToday = todayInTz(branch.tz ?? DEFAULT_TENANT_TIMEZONE);

    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan comunidad 214-16 ${Date.now()}`,
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    if (esBranchId !== null) {
      await app.db
        .delete(schema.branches)
        .where(eq(schema.branches.id, esBranchId));
    }
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Registra un socio (freemium, en la sede de prueba) y devuelve su id y token. */
  async function crearSocio(
    campos: {
      dateOfBirth?: string | null;
      status?: "freemium" | "activo" | "wellhub";
      branchId?: number;
    } = {},
  ): Promise<{ id: number; token: string }> {
    seq += 1;
    const email = `comunidad-${seq}-${Date.now()}@test.com`;
    const registered = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    const id = (registered.user as { id: number }).id;
    const cambios: Partial<typeof schema.users.$inferInsert> = {};
    if (campos.dateOfBirth !== undefined) {
      cambios.dateOfBirth = campos.dateOfBirth;
    }
    if (campos.status !== undefined) cambios.status = campos.status;
    if (campos.branchId !== undefined) cambios.branchId = campos.branchId;
    if (Object.keys(cambios).length > 0) {
      await app.db
        .update(schema.users)
        .set(cambios)
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    }
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  async function siembraSuscripcion(
    userId: number,
    endDate: string | null,
    startDate: string,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId,
      planId,
      branchId: testBranchId,
      status: "active",
      startDate,
      endDate,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
  }

  async function me(token: string): Promise<MeBody> {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as MeBody;
  }

  function put(token: string, payload: unknown) {
    return app.inject({
      method: "PUT",
      url: `${MEMBER_URL}/attendees/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as Record<string, unknown>,
    });
  }

  function postNoticeSeen(token: string) {
    return app.inject({
      method: "POST",
      url: `${MEMBER_URL}/attendees/notice-seen`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function perfil(userId: number) {
    const [row] = await app.db
      .select({
        visible: schema.memberProfiles.communityVisible,
        noticeSeenAt: schema.memberProfiles.communityNoticeSeenAt,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX),
          eq(schema.memberProfiles.userId, userId),
        ),
      )
      .limit(1);
    return row;
  }

  // ── Plan vigente (blocker 2): activeMemberExists, nunca users.status ───────

  it("status 'activo' con su única suscripción VENCIDA no tiene plan en vigor (hasPlanInEffect false)", async () => {
    const socio = await crearSocio({ status: "activo" });
    await siembraSuscripcion(
      socio.id,
      addDays(todayStr(), -10),
      addDays(todayStr(), -40),
    );

    const estado = await getViewerCommunityState(app.db, CTX, socio.id);

    expect(estado.hasPlanInEffect).toBe(false);
  });

  it("con una suscripción en vigor tiene plan (hasPlanInEffect true)", async () => {
    const socio = await crearSocio({ status: "freemium" });
    await siembraSuscripcion(
      socio.id,
      addDays(todayStr(), 20),
      addDays(todayStr(), -10),
    );

    const estado = await getViewerCommunityState(app.db, CTX, socio.id);

    expect(estado.hasPlanInEffect).toBe(true);
    expect(estado.isStaff).toBe(false);
  });

  it("un freemium sin suscripción no tiene plan en vigor", async () => {
    const socio = await crearSocio({ status: "freemium" });

    const estado = await getViewerCommunityState(app.db, CTX, socio.id);

    expect(estado.hasPlanInEffect).toBe(false);
  });

  it("un wellhub sin suscripción no tiene plan en vigor (ve solo el número, D-68)", async () => {
    const socio = await crearSocio({ status: "wellhub" });

    const estado = await getViewerCommunityState(app.db, CTX, socio.id);

    expect(estado.hasPlanInEffect).toBe(false);
  });

  // ── /me y regla por defecto ────────────────────────────────────────────────

  it("adulto de sede argentina sin fila de member_profiles: /me da communityVisible true y communityNoticeSeen false", async () => {
    const socio = await crearSocio({
      dateOfBirth: yearsAgo(testBranchToday, 30),
    });
    expect(await perfil(socio.id)).toBeUndefined();

    const body = await me(socio.token);

    expect(body.communityVisible).toBe(true);
    expect(body.communityNoticeSeen).toBe(false);
  });

  it("PUT visibility false guarda la preferencia y PUT true la revierte", async () => {
    const socio = await crearSocio({
      dateOfBirth: yearsAgo(testBranchToday, 30),
    });

    const res = await put(socio.token, { visible: false });
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ visible: false, noticeSeen: false });
    expect((await perfil(socio.id))?.visible).toBe(false);
    expect((await me(socio.token)).communityVisible).toBe(false);

    const res2 = await put(socio.token, { visible: true });
    expect(res2.statusCode, res2.body).toBe(200);
    expect(JSON.parse(res2.body)).toEqual({ visible: true, noticeSeen: false });
    expect((await perfil(socio.id))?.visible).toBe(true);
  });

  it("un menor no es visible por defecto y la preferencia explícita le gana", async () => {
    const socio = await crearSocio({
      dateOfBirth: yearsAgo(testBranchToday, 17),
    });

    expect((await me(socio.token)).communityVisible).toBe(false);

    const res = await put(socio.token, { visible: true });
    expect(res.statusCode, res.body).toBe(200);
    expect((await me(socio.token)).communityVisible).toBe(true);
  });

  it("quien cumple 18 hoy pasa a visible sin guardar nada (D-47)", async () => {
    const socio = await crearSocio({
      dateOfBirth: yearsAgo(testBranchToday, 18),
    });

    expect((await me(socio.token)).communityVisible).toBe(true);
    expect(await perfil(socio.id)).toBeUndefined();
  });

  it("sin fecha de nacimiento cuenta como adulto y es visible", async () => {
    const socio = await crearSocio({ dateOfBirth: null });

    expect((await me(socio.token)).communityVisible).toBe(true);
  });

  it("un alumno de una sede con country ES no es visible por defecto", async () => {
    if (esBranchId === null) {
      const [{ id }] = await app.db
        .insert(schema.branches)
        .values({
          name: "Sede ES 214-16",
          code: "T21416-ES",
          country: "ES",
        })
        .$returningId();
      esBranchId = id;
    }
    const socio = await crearSocio({
      dateOfBirth: yearsAgo(testBranchToday, 30),
      branchId: esBranchId,
    });

    expect((await me(socio.token)).communityVisible).toBe(false);
    const estado = await getViewerCommunityState(app.db, CTX, socio.id);
    expect(estado.branchCountry).toBe("ES");
  });

  // ── Aviso visto ────────────────────────────────────────────────────────────

  it("notice-seen es idempotente: dos llamadas dan 204 y la fecha de la primera no se pisa", async () => {
    const socio = await crearSocio();

    const primera = await postNoticeSeen(socio.token);
    expect(primera.statusCode, primera.body).toBe(204);
    const despuesDePrimera = (await perfil(socio.id))?.noticeSeenAt;
    expect(despuesDePrimera).toBeInstanceOf(Date);

    // Pisar la fecha con un valor viejo distinguible: si la segunda llamada
    // sobreescribiera, volvería a "ahora".
    const vieja = new Date(Math.round(Date.now() / 1000) * 1000 - 3_600_000);
    await app.db
      .update(schema.memberProfiles)
      .set({ communityNoticeSeenAt: vieja })
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX),
          eq(schema.memberProfiles.userId, socio.id),
        ),
      );

    const segunda = await postNoticeSeen(socio.token);
    expect(segunda.statusCode, segunda.body).toBe(204);
    const despuesDeSegunda = (await perfil(socio.id))?.noticeSeenAt;
    expect(despuesDeSegunda?.getTime()).toBe(vieja.getTime());

    expect((await me(socio.token)).communityNoticeSeen).toBe(true);
  });

  // ── Validación y autenticación ─────────────────────────────────────────────

  it("PUT visibility con un body inválido responde 400", async () => {
    const socio = await crearSocio();

    const res = await put(socio.token, { visible: "si" });

    expect(res.statusCode, res.body).toBe(400);
  });

  it("PUT visibility ignora un userId en el body: la preferencia es del usuario del token", async () => {
    const yo = await crearSocio();
    const otro = await crearSocio();

    const res = await put(yo.token, { visible: false, userId: otro.id });

    expect(res.statusCode, res.body).toBe(200);
    expect((await perfil(yo.id))?.visible).toBe(false);
    expect(await perfil(otro.id)).toBeUndefined();
  });

  it("sin token las dos rutas responden 401", async () => {
    const sinToken = await app.inject({
      method: "PUT",
      url: `${MEMBER_URL}/attendees/visibility`,
      payload: { visible: true },
    });
    const sinTokenAviso = await app.inject({
      method: "POST",
      url: `${MEMBER_URL}/attendees/notice-seen`,
    });

    expect(sinToken.statusCode).toBe(401);
    expect(sinTokenAviso.statusCode).toBe(401);
  });
});
