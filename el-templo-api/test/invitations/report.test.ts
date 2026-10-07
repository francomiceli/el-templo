/**
 * Fase 194-20 Task 1 (D-19) — reporte del programa de Invitaciones:
 * `GET /api/admin/referrals/invitations/report`.
 *
 * Servicio + HTTP contra MySQL real por worker. Meses SIEMPRE relativos al mes de
 * hoy en la tz de la sede (`todayInTz`); ningún `users.id` hardcodeado. El
 * aislamiento entre gimnasios vive en `iso-03-referrals.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  cleanAllTestData,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues } from "../../src/modules/shared/tenant";
import {
  InvitationReportService,
  monthsBetween,
  type InvitationReport,
} from "../../src/modules/referrals/invitation-report";
import {
  createActiveSub,
  createInvitationRow,
  createInvitedUser,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const URL = "/api/admin/referrals/invitations/report";

/** Suma `delta` meses a un 'YYYY-MM'. */
function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const total = year * 12 + (mon - 1) + delta;
  const y = Math.floor(total / 12);
  return `${y}-${String(total - y * 12 + 1).padStart(2, "0")}`;
}

describe("Fase 194-20 D-19 — reporte de Invitaciones", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationReportService;
  let ownerToken: string;
  let env: InvitedUserEnv;
  let month: string;
  let prevMonth: string;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = new InvitationReportService(app.db);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const branch = await ensurePhysicalBranch(ctx, "AR");
    const today = todayInTz(branch.timezone);
    env = {
      branchId: branch.id,
      today,
      trialPlanId: (await createTrialPlan(ctx)).id,
      membershipPlanId: (await createMembershipPlan(ctx)).id,
    };
    month = today.slice(0, 7);
    prevMonth = shiftMonth(month, -1);
  });

  async function staffToken(
    role: "gestion" | "admin" | "coach" | "recepcion",
    country?: "AR" | "ES",
  ): Promise<string> {
    const branch = await ensurePhysicalBranch(ctx, country ?? "AR");
    const email = `${role}-inv-rep-${country ?? "AR"}-${suffix}-${Math.random().toString(36).slice(2, 6)}@test.local`;
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "InvReport",
      role,
      branchId: branch.id,
      country:
        role === "gestion" || role === "admin" ? (country ?? "AR") : null,
    });
    return getAuthToken(app, email, "pass123456");
  }

  async function get(
    token: string,
    query = "",
  ): Promise<{ statusCode: number; body: InvitationReport }> {
    const res = await app.inject({
      method: "GET",
      url: `${URL}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as InvitationReport,
    };
  }

  async function credit(opts: {
    userId: number;
    subscriptionId: number;
    amount: number;
    createdAt?: Date;
  }): Promise<void> {
    await app.db.insert(schema.referralCredits).values(
      tenantValues(ctx.tenant, {
        userId: opts.userId,
        subscriptionId: opts.subscriptionId,
        percent: 10,
        amount: opts.amount,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      }),
    );
  }

  // ─── Cohortes ──────────────────────────────────────────────────────────

  it("activadas, convertidas y tasa por mes de cohorte (M: 3/1/0.33, M-1: 2/2/1) con totales", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    await createInvitedUser(ctx, env, inviter.id, {
      quotaMonth: month,
      converted: true,
    });
    await createInvitedUser(ctx, env, inviter.id, {
      quotaMonth: prevMonth,
      converted: true,
    });
    await createInvitedUser(ctx, env, inviter.id, {
      quotaMonth: prevMonth,
      converted: true,
    });

    const { statusCode, body } = await get(
      ownerToken,
      `?from=${prevMonth}&to=${month}`,
    );

    expect(statusCode).toBe(200);
    expect(body.months).toEqual([
      { month: prevMonth, activated: 2, converted: 2, conversionRate: 1 },
      { month, activated: 3, converted: 1, conversionRate: 0.3333 },
    ]);
    expect(body.totals).toEqual({
      activated: 5,
      converted: 3,
      conversionRate: 0.6,
    });
  });

  it("las anuladas (voided) no cuentan en ningún KPI", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    await createInvitedUser(ctx, env, inviter.id, {
      quotaMonth: month,
      status: "voided",
      converted: true,
      purchase: "vigente",
    });

    const { body } = await get(ownerToken, `?from=${month}&to=${month}`);

    expect(body.totals).toEqual({
      activated: 1,
      converted: 0,
      conversionRate: 0,
    });
    // El invitado de la anulada tiene membresía vigente pero no se cuenta como activo.
    expect(body.activeInvitees).toBe(0);
  });

  it("rellena con ceros los meses sin activaciones y la tasa es 0 (nunca NaN)", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    const from = shiftMonth(month, -3);

    const { body } = await get(ownerToken, `?from=${from}&to=${month}`);

    expect(body.months.map((m) => m.month)).toEqual(monthsBetween(from, month));
    expect(body.months).toHaveLength(4);
    expect(body.months[0]).toEqual({
      month: from,
      activated: 0,
      converted: 0,
      conversionRate: 0,
    });
    expect(body.months[3].activated).toBe(1);
  });

  it("sin parámetros: los últimos 12 meses terminando en el mes actual", async () => {
    const { statusCode, body } = await get(ownerToken);

    expect(statusCode).toBe(200);
    expect(body.months).toHaveLength(12);
    expect(body.to).toBe(month);
    expect(body.from).toBe(shiftMonth(month, -11));
  });

  // ─── Invitados activos ─────────────────────────────────────────────────

  it("activeInvitees: invitados DISTINTOS con membresía hoy; accesos is_trial, membresía vencida o repetidos no suman", async () => {
    const inviter = await createInviterWithCode(ctx);
    const active = await createInvitedUser(ctx, env, inviter.id, {
      purchase: "vigente",
    });
    await createInvitedUser(ctx, env, inviter.id, { purchase: "vencida" });
    await createInvitedUser(ctx, env, inviter.id, {}); // solo accesos is_trial
    // Segunda invitación del MISMO invitado activo (fila de otro mes): no se duplica.
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: active.userId,
      branchId: env.branchId,
      quotaMonth: prevMonth,
    });

    const { body } = await get(ownerToken, `?from=${prevMonth}&to=${month}`);

    expect(body.activeInvitees).toBe(1);
  });

  // ─── Descuentos por mes y moneda ───────────────────────────────────────

  it("descuentos: una fila por (mes, moneda), nunca ARS+EUR mezclados; incluye vínculos heredados sin invitación", async () => {
    const inviter = await createInviterWithCode(ctx);
    const arsPayer = await createInvitedUser(ctx, env, inviter.id, {
      purchase: "vigente",
    });
    const arsSub = await createActiveSub(ctx, {
      userId: arsPayer.userId,
      planId: env.membershipPlanId,
      branchId: env.branchId,
      pricePaid: 90000,
    });
    await credit({
      userId: arsPayer.userId,
      subscriptionId: arsSub.id,
      amount: 10000,
    });

    // Moneda EUR: sub de una sede de España.
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const esPlan = await createMembershipPlan(ctx, { country: "ES" });
    const esMember = await createMemberInPhysicalBranch(ctx, {
      country: "ES",
      status: "activo",
    });
    const esSub = await createActiveSub(ctx, {
      userId: esMember.id,
      planId: esPlan.id,
      branchId: esBranch.id,
      pricePaid: 100,
    });
    // Vínculo HEREDADO: sin fila en `invitations`; el crédito igual suma.
    await credit({
      userId: esMember.id,
      subscriptionId: esSub.id,
      amount: 15,
    });

    const { body } = await get(
      ownerToken,
      `?from=${prevMonth}&to=${shiftMonth(month, 1)}`,
    );

    const byCurrency = new Map<string, number>();
    for (const row of body.discounts) {
      byCurrency.set(
        row.currency,
        (byCurrency.get(row.currency) ?? 0) + row.amount,
      );
    }
    expect(Object.fromEntries(byCurrency)).toEqual({ ARS: 10000, EUR: 15 });
    // Una fila por moneda en el mes (no una suma mezclada).
    const rowsOfMonth = body.discounts.filter((row) => row.credits > 0);
    expect(new Set(rowsOfMonth.map((r) => r.currency))).toEqual(
      new Set(["ARS", "EUR"]),
    );
    expect(rowsOfMonth.every((r) => r.credits === 1)).toBe(true);
  });

  it("descuentos: el mes sale de la fecha del crédito y respeta el rango pedido", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await createInvitedUser(ctx, env, inviter.id, {
      purchase: "vigente",
    });
    const recentSub = await createActiveSub(ctx, {
      userId: payer.userId,
      planId: env.membershipPlanId,
      branchId: env.branchId,
      pricePaid: 90000,
    });
    const oldSub = await createActiveSub(ctx, {
      userId: payer.userId,
      planId: env.membershipPlanId,
      branchId: env.branchId,
      pricePaid: 90000,
      startOffsetDays: -200,
      endOffsetDays: -170,
      status: "expired",
    });
    await credit({
      userId: payer.userId,
      subscriptionId: recentSub.id,
      amount: 5000,
    });
    // Un crédito de hace ~200 días: fuera de los últimos 12 meses por defecto NO,
    // pero fuera de un rango corto SÍ.
    const oldDate = new Date(Date.now() - 200 * DAY_MS);
    await credit({
      userId: payer.userId,
      subscriptionId: oldSub.id,
      amount: 7000,
      createdAt: oldDate,
    });
    // Mes del crédito viejo según la propia base (misma zona que el DATE_FORMAT).
    const [oldRow] = (await app.db.execute(
      sql`SELECT /* tenant-safe: lee el mes de UN crédito sembrado por este test */ DATE_FORMAT(created_at, '%Y-%m') AS m FROM referral_credits WHERE subscription_id = ${oldSub.id}`,
    )) as unknown as [Array<{ m: string }>];
    const oldMonth = oldRow[0].m;

    const wide = await get(
      ownerToken,
      `?from=${shiftMonth(month, -11)}&to=${shiftMonth(month, 1)}`,
    );
    const wideTotal = wide.body.discounts.reduce((s, d) => s + d.amount, 0);
    expect(wideTotal).toBe(12000);
    expect(wide.body.discounts.find((d) => d.month === oldMonth)?.amount).toBe(
      7000,
    );

    const short = await get(
      ownerToken,
      `?from=${prevMonth}&to=${shiftMonth(month, 1)}`,
    );
    expect(short.body.discounts.reduce((s, d) => s + d.amount, 0)).toBe(5000);
  });

  // ─── Alcance por país ──────────────────────────────────────────────────

  it("servicio: con country solo cuenta invitaciones y créditos de sedes de ese país", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });
    const esEnv: InvitedUserEnv = {
      ...env,
      branchId: esBranch.id,
      today: todayInTz(esBranch.timezone),
    };
    await createInvitedUser(ctx, esEnv, esInviter.id, { quotaMonth: month });
    await createInvitedUser(ctx, esEnv, esInviter.id, { quotaMonth: month });

    const filters = { from: month, to: month };
    const all = await service.getReport(ctx.tenant, filters);
    const ar = await service.getReport(ctx.tenant, {
      ...filters,
      country: "AR",
    });
    const es = await service.getReport(ctx.tenant, {
      ...filters,
      country: "ES",
    });

    expect(all.totals.activated).toBe(3);
    expect(ar.totals.activated).toBe(1);
    expect(es.totals.activated).toBe(2);
  });

  it("HTTP: gestión de un país solo ve su país; el owner ve ambos", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, { quotaMonth: month });
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });
    await createInvitedUser(
      ctx,
      { ...env, branchId: esBranch.id, today: todayInTz(esBranch.timezone) },
      esInviter.id,
      { quotaMonth: month },
    );

    const query = `?from=${month}&to=${month}`;
    const gestionAr = await get(await staffToken("gestion", "AR"), query);
    const gestionEs = await get(await staffToken("gestion", "ES"), query);
    const owner = await get(ownerToken, query);

    expect(gestionAr.body.totals.activated).toBe(1);
    expect(gestionEs.body.totals.activated).toBe(1);
    expect(owner.body.totals.activated).toBe(2);
  });

  // ─── Gate de roles y validación ────────────────────────────────────────

  it("recepción y coach reciben 403; gestión y admin 200", async () => {
    expect((await get(await staffToken("recepcion"))).statusCode).toBe(403);
    expect((await get(await staffToken("coach"))).statusCode).toBe(403);
    expect((await get(await staffToken("gestion"))).statusCode).toBe(200);
    expect((await get(await staffToken("admin"))).statusCode).toBe(200);
  });

  it("sin token 401; querystring inválido 400 (patrón de mes, rango invertido, rango enorme)", async () => {
    const anon = await app.inject({ method: "GET", url: URL });
    expect(anon.statusCode).toBe(401);

    expect((await get(ownerToken, "?from=2026-13")).statusCode).toBe(400);
    expect((await get(ownerToken, "?to=hoy")).statusCode).toBe(400);
    expect(
      (await get(ownerToken, `?from=${shiftMonth(month, 1)}&to=${month}`))
        .statusCode,
    ).toBe(400);
    expect(
      (await get(ownerToken, `?from=${shiftMonth(month, -40)}&to=${month}`))
        .statusCode,
    ).toBe(400);
  });
});
