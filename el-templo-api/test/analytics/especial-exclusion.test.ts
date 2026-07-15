/**
 * D-11 (fase 161 — Actividades con Aura): las suscripciones de planes
 * `planCategory='especial'` (el "pase") NO cuentan en las MÉTRICAS DE MEMBRESÍA.
 *
 * Integración contra MySQL real (misma convención que member-flows.test.ts /
 * ticket.test.ts). Cubre los tres ejes que pide el plan 161-04:
 *   (1) Miembros activos (endpoint GET /api/admin/analytics): el externo cuya
 *       ÚNICA sub vigente es el pase NO figura; un socio con presencial + pase
 *       SÍ cuenta (por su presencial).
 *   (2) Altas/bajas (MemberFlowsService): el alta de un pase no es un alta de
 *       membresía; el alta de un presencial sí.
 *   (3) Ticket promedio (TicketService): la plata del pase no distorsiona el
 *       ticket ni infla el conteo de cargos considerados. (La plata igual cuenta
 *       en caja/cobros/advanced-finance — eso NO se toca ni se testea acá.)
 *
 * TZ note (flakes de seeds de analytics): las fechas se derivan de hoy con
 * offsets amplios para que las aserciones de vigencia no crucen un corrimiento
 * de zona horaria.
 *
 * NO correr localmente (MySQL real — CI lo corre en el push a staging).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { MemberFlowsService } from "../../src/modules/analytics/member-flows-service";
import { TicketService } from "../../src/modules/analytics/ticket-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

const ANALYTICS_URL = "/api/admin/analytics";

describe("D-11 — exclusión del pase especial de las métricas de membresía", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchA: number;
  let recorderId: number;
  let flowsSvc: MemberFlowsService;
  let ticketSvc: TicketService;

  let planPresencialId: number;
  let planEspecialId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    flowsSvc = new MemberFlowsService(app.db, app.log);
    ticketSvc = new TicketService(app.db, app.log);

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;

    const [admin] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    recorderId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    const [pres] = await app.db.insert(subscriptionPlans).values({
      name: "Excl Presencial AR",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      country: "AR",
      currency: "ARS",
      priceRegular: 15000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planPresencialId = (pres as { insertId: number }).insertId;

    // Pase Externo: planCategory='especial', budget explícito de 2, sin exigir
    // presencial (D-11 / contratos del plan 161-01).
    const [esp] = await app.db.insert(subscriptionPlans).values({
      name: "Excl Pase Externo AR",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "especial",
      country: "AR",
      currency: "ARS",
      priceRegular: 20000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: null,
      monthlyClassBudget: 2,
      requiresPresencial: false,
    });
    planEspecialId = (esp as { insertId: number }).insertId;
  });

  let __seq = 0;
  async function insertMember(): Promise<number> {
    __seq += 1;
    const [u] = await app.db.insert(users).values({
      email: `excl-m${__seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Ex",
      lastName: "Cl",
      branchId: branchA,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    planId: number;
    startDate: string;
    endDate: string;
    status?: "active" | "expired" | "paused";
    pricePaid?: number;
  }): Promise<number> {
    const [r] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId,
      branchId: branchA,
      status: opts.status ?? "active",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: opts.pricePaid ?? 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
      priceRegularSnapshot: opts.pricePaid ?? 15000,
    });
    return (r as { insertId: number }).insertId;
  }

  async function seedCharge(opts: {
    userId: number;
    subId: number;
    amount: number;
    date: string;
  }): Promise<void> {
    const [ft] = await app.db.insert(financialTransactions).values({
      memberId: opts.userId,
      kind: "plan_charge",
      direction: "inflow",
      amount: opts.amount,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: opts.date,
      effectiveDate: opts.date,
      branchId: branchA,
      recordedBy: recorderId,
    });
    const ftId = (ft as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values({
      transactionId: ftId,
      targetKind: "subscription",
      targetId: opts.subId,
      allocatedAmount: opts.amount,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // (1) Miembros activos — endpoint GET /api/admin/analytics
  // ═══════════════════════════════════════════════════════════════════════

  it("miembros activos: NO cuenta al externo-solo-pase; el socio con pase SÍ", async () => {
    const active = {
      startDate: dateOffsetStr(-10),
      endDate: dateOffsetStr(20),
    };

    // Socio con SOLO presencial vigente → cuenta.
    const socio = await insertMember();
    await insertSub({ userId: socio, planId: planPresencialId, ...active });

    // Socio con presencial + pase → cuenta UNA vez (por el presencial).
    const socioConPase = await insertMember();
    await insertSub({
      userId: socioConPase,
      planId: planPresencialId,
      ...active,
    });
    await insertSub({
      userId: socioConPase,
      planId: planEspecialId,
      ...active,
    });

    // Externo cuya ÚNICA sub vigente es el pase → NO cuenta.
    const externo = await insertMember();
    await insertSub({ userId: externo, planId: planEspecialId, ...active });

    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}?branchId=${branchA}&dateFrom=${dateOffsetStr(
        -30,
      )}&dateTo=${todayStr()}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      activeMembers: { value: number };
    };

    // socio + socioConPase = 2. El externo-solo-pase queda afuera.
    expect(body.activeMembers.value).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (2) Altas/bajas — MemberFlowsService
  // ═══════════════════════════════════════════════════════════════════════

  it("altas: el alta de un pase especial no es alta de membresía", async () => {
    const start = todayStr();
    const end = dateOffsetStr(30);

    // Alta real: un presencial que arranca hoy (racha nueva, post-cutoff).
    const nuevoSocio = await insertMember();
    await insertSub({
      userId: nuevoSocio,
      planId: planPresencialId,
      startDate: start,
      endDate: end,
    });

    // Externo: su pase arranca hoy → NO debe contar como alta.
    const externo = await insertMember();
    await insertSub({
      userId: externo,
      planId: planEspecialId,
      startDate: start,
      endDate: end,
    });

    const res = await flowsSvc.getMonthlyFlows({
      dateFrom: dateOffsetStr(-40),
      dateTo: dateOffsetStr(1),
    });
    const totalAltas = res.series.reduce((sum, p) => sum + p.altas, 0);

    // Solo el presencial: 1 alta, no 2.
    expect(totalAltas).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // (3) Ticket promedio — TicketService
  // ═══════════════════════════════════════════════════════════════════════

  it("ticket: el pase especial no distorsiona el promedio ni el conteo de cargos", async () => {
    const active = {
      startDate: dateOffsetStr(-10),
      endDate: dateOffsetStr(20),
    };
    const chargeDate = todayStr();

    // Cargo de membresía presencial: 15000 → SÍ cuenta.
    const socio = await insertMember();
    const subPres = await insertSub({
      userId: socio,
      planId: planPresencialId,
      pricePaid: 15000,
      ...active,
    });
    await seedCharge({
      userId: socio,
      subId: subPres,
      amount: 15000,
      date: chargeDate,
    });

    // Cargo del pase especial: 20000 → NO debe entrar en el ticket de membresía.
    const externo = await insertMember();
    const subEsp = await insertSub({
      userId: externo,
      planId: planEspecialId,
      pricePaid: 20000,
      ...active,
    });
    await seedCharge({
      userId: externo,
      subId: subEsp,
      amount: 20000,
      date: chargeDate,
    });

    const res = await ticketSvc.getTicket({
      dateFrom: dateOffsetStr(-40),
      dateTo: dateOffsetStr(1),
    });

    // Solo el presencial: promedio 15000 (no 17500) y 1 solo cargo considerado.
    expect(res.byCurrency.ARS.global.nominal).toBe(15000);
    expect(res.byCurrency.ARS.global.n).toBe(1);
    // El cargo del pase tampoco infla `excludedNoLink` (universo consistente).
    expect(res.excludedNoLink).toBe(0);
  });
});
