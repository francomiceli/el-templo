/**
 * Fase 179 Plan 08 (D-05/D-06/D-07/D-18/D-19) — semana gratis de partner
 * (`benefit_type='free_pass'`): elegibilidad server-side, activación atómica
 * al reservar la primera clase, vencimiento a 30 días y precedencia sobre la
 * sesión de prueba freemium.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. `POST /reserve-partner-week` activa una suscripción de 7 días, 3
 *     clases, precio 0, `membership_kind='bonificada'`, Y reserva la primera
 *     clase en el mismo request — sin `is_trial` (D-05/D-06).
 *  2. Una segunda llamada NUNCA crea una segunda suscripción (409).
 *  3. El vencimiento (D-07) se evalúa en lectura: pasados los 30 días la
 *     activación se bloquea, pero el vínculo sigue vivo para atribución de
 *     comisión si el socio paga después.
 *  4. Precedencia sobre el trial freemium (D-18): un beneficio de partner
 *     (pending o consumed) saca al socio de la elegibilidad de
 *     `trial-eligibility`, sin romper la elegibilidad de un freemium sin
 *     partner (no-regresión de la fase 119).
 *  5. La semana gratis NO genera comisión (`price_paid=0` no cualifica).
 *  6. Un socio con plan activo, o un país sin el plan `paquete` de 1 semana /
 *     3 clases configurado, nunca dejan escritura a medias.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { assignPlan, createPlan } from "../subscriptions/_helpers";
import {
  insertBranch,
  insertPartner,
  insertPartnerLink,
  partnerCommissionRows,
} from "./_helpers";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_URL = "/api/members/scheduling";
const PARTNER_BENEFIT_URL = `${MEMBER_URL}/partner-benefit`;
const RESERVE_PARTNER_WEEK_URL = `${MEMBER_URL}/reserve-partner-week`;
const TRIAL_ELIGIBILITY_URL = `${MEMBER_URL}/trial-eligibility`;

let app: FastifyInstance;
let adminToken: string;
let arBranchId: number;
let seq = 0;

beforeAll(async () => {
  // Miércoles 10:00 UTC — mismo pin que trials.test.ts: deja el jueves como
  // slot futuro dentro de la ventana de +2 días de reserve() (D-06: la
  // semana de partner NO usa la ventana extendida de 30 días del trial,
  // reserva por el booking normal).
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [branch] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.isVirtual, false));
  arBranchId = branch.id;
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  seq += 1;
});

/** Email único por test — evita colisiones del UNIQUE de users.email. */
function email(prefix: string): string {
  return `sg-${prefix}-${seq}-${Date.now()}@test.com`;
}

// ─── Helpers de fixture ─────────────────────────────────────────────────────

async function createActivity(name = "Calistenia"): Promise<{ id: number }> {
  const res = await app.inject({
    method: "POST",
    url: `${ADMIN_URL}/activities`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, description: "Clase grupal" },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body);
}

async function createScheduleSlot(
  activityId: number,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  branchId?: number,
): Promise<{ id: number }> {
  const res = await app.inject({
    method: "POST",
    url: `${ADMIN_URL}/schedules`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      branchId: branchId ?? arBranchId,
      activityId,
      dayOfWeek,
      startTime,
      endTime,
    },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body);
}

function getDateForDayOfWeek(dayOfWeek: number): string {
  const now = new Date();
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const target = new Date(monday);
  target.setDate(monday.getDate() + (dayOfWeek - 1));
  return target.toISOString().split("T")[0];
}

/** Jueves — dentro de la ventana de +2 días de reserve() desde el miércoles pineado. */
function getFutureSlot(): {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  date: string;
} {
  return {
    dayOfWeek: 4,
    startTime: "10:00",
    endTime: "11:00",
    date: getDateForDayOfWeek(4),
  };
}

/**
 * INSERT crudo del plan `paquete` de 1 semana / 3 clases (D-19) — el admin
 * API no acepta `planCategory='paquete'` en su schema (mismo motivo que
 * `createPlanWithCategory` de `discount-charge.test.ts`: esta categoría nace
 * de la matriz sembrada por la migración 0207, no del CRUD de planes). Se
 * inserta acá porque `subscription_plans` SÍ está en `TABLES_TO_CLEAN`
 * (`test/helpers.ts`) — el `beforeEach` la vacía en cada test, incluidas las
 * filas de la matriz 0207.
 */
async function createPartnerWeekPlan(
  country: "AR" | "ES" | "XX" = "AR",
): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name: `Paquete semana de regalo ${country} ${seq}`,
    planTier: "other",
    bookingMode: "flexible",
    planCategory: "paquete",
    priceRegular: 12000,
    priceZero: 12000,
    durationDays: 7,
    classesPerWeek: 3,
    monthlyClassBudget: null,
    requiresPresencial: false,
    country,
    currency: country === "ES" ? "EUR" : "ARS",
    isActive: true,
    isArchived: false,
  });
  return Number(res[0].insertId);
}

async function registerMember(
  branchId: number,
): Promise<{ token: string; id: number }> {
  const result = await registerUser(app, {
    email: email("member"),
    password: "pass123456",
    branchId,
  });
  const user = result.user as { id: number };
  return { token: result.token, id: user.id };
}

interface FullLinkRow {
  status: string;
  benefitStatus: string;
  benefitExpiresAt: Date;
  appliedPercent: number | null;
  appliedAmount: number | null;
  appliedSubscriptionId: number | null;
  appliedReason: string | null;
}

async function fullLinkRow(referredId: number): Promise<FullLinkRow | null> {
  const [row] = await app.db
    .select({
      status: schema.partnerReferrals.status,
      benefitStatus: schema.partnerReferrals.benefitStatus,
      benefitExpiresAt: schema.partnerReferrals.benefitExpiresAt,
      appliedPercent: schema.partnerReferrals.appliedPercent,
      appliedAmount: schema.partnerReferrals.appliedAmount,
      appliedSubscriptionId: schema.partnerReferrals.appliedSubscriptionId,
      appliedReason: schema.partnerReferrals.appliedReason,
    })
    .from(schema.partnerReferrals)
    .where(eq(schema.partnerReferrals.referredId, referredId))
    .limit(1);
  return row ?? null;
}

interface SubscriptionRow {
  pricePaid: number;
  membershipKind: string;
  startDate: string;
  endDate: string | null;
  classesRemaining: number | null;
  status: string;
}

async function subscriptionRow(id: number): Promise<SubscriptionRow | null> {
  const [row] = await app.db
    .select({
      pricePaid: schema.subscriptions.pricePaid,
      membershipKind: schema.subscriptions.membershipKind,
      startDate: schema.subscriptions.startDate,
      endDate: schema.subscriptions.endDate,
      classesRemaining: schema.subscriptions.classesRemaining,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id));
  return row ?? null;
}

async function bookingRow(
  id: number,
): Promise<{ isTrial: boolean; memberId: number } | null> {
  const [row] = await app.db
    .select({
      isTrial: schema.bookings.isTrial,
      memberId: schema.bookings.memberId,
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.id, id));
  return row ?? null;
}

async function countSubscriptionsForUser(userId: number): Promise<number> {
  const rows = await app.db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId));
  return rows.length;
}

async function countBookingsForUser(userId: number): Promise<number> {
  const rows = await app.db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(eq(schema.bookings.memberId, userId));
  return rows.length;
}

/** `endDate = startDate + 7 días`, comparado como strings YYYY-MM-DD. */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

// ─── (1)+(2)+(3): activación + segunda llamada ──────────────────────────────

describe("Semana gratis de partner (D-05/D-06/D-07/D-18/D-19)", () => {
  it("(1) GET /partner-benefit: eligible=true con partnerName y expiresAt para un free_pass pendiente", async () => {
    const partner = await insertPartner(app, {
      name: "Café del Centro",
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });

    const res = await app.inject({
      method: "GET",
      url: PARTNER_BENEFIT_URL,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.eligible).toBe(true);
    expect(body.partnerName).toBe("Café del Centro");
    expect(body.expiresAt).toBeTruthy();
  });

  it("(2) POST /reserve-partner-week: 201, suscripción bonificada de 7 días / 3 clases, reserva NO trial, vínculo consumido (semana_activada)", async () => {
    await createPartnerWeekPlan("AR");
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });

    const res = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: slot.id,
        date: futureSlot.date,
        branchId: arBranchId,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.subscriptionId).toBeTruthy();
    expect(body.bookingId).toBeTruthy();
    expect(body.classesRemaining).toBe(3);

    const sub = await subscriptionRow(body.subscriptionId);
    expect(sub?.pricePaid).toBe(0);
    expect(sub?.membershipKind).toBe("bonificada");
    expect(sub?.classesRemaining).toBe(3);
    expect(sub?.endDate).toBe(addDaysStr(sub!.startDate, 7));

    const booking = await bookingRow(body.bookingId);
    expect(booking?.memberId).toBe(member.id);
    expect(booking?.isTrial).toBe(false);

    const link = await fullLinkRow(member.id);
    expect(link?.benefitStatus).toBe("consumed");
    expect(link?.appliedReason).toBe("semana_activada");
    expect(link?.appliedPercent).toBe(0);
    expect(link?.appliedAmount).toBe(0);
    expect(link?.appliedSubscriptionId).toBe(body.subscriptionId);
    // La atribución (status, distinto de benefitStatus) sigue pending: recién
    // se cualifica al primer pago REAL (D-17), y esta semana no cobró nada.
    expect(link?.status).toBe("pending");
  });

  it("(3) una segunda llamada devuelve 409 y no crea una segunda suscripción ni una segunda reserva", async () => {
    await createPartnerWeekPlan("AR");
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });

    const first = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: slot.id,
        date: futureSlot.date,
        branchId: arBranchId,
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: slot.id,
        date: futureSlot.date,
        branchId: arBranchId,
      },
    });
    expect(second.statusCode).toBe(409);

    expect(await countSubscriptionsForUser(member.id)).toBe(1);
    expect(await countBookingsForUser(member.id)).toBe(1);
  });

  // ─── (4): vencimiento (D-07) ───────────────────────────────────────────

  it("(4) vencimiento: benefit_expires_at pasado → GET expirado, POST 409, el vínculo sigue vivo y comisiona si paga después", async () => {
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
      benefitExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // ayer
    });

    const eligRes = await app.inject({
      method: "GET",
      url: PARTNER_BENEFIT_URL,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(eligRes.statusCode).toBe(200);
    expect(JSON.parse(eligRes.body)).toEqual({
      eligible: false,
      reason: "expirado",
    });

    const postRes = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: 1,
        date: getFutureSlot().date,
        branchId: arBranchId,
      },
    });
    expect(postRes.statusCode).toBe(409);

    const linkAfterExpiry = await fullLinkRow(member.id);
    expect(linkAfterExpiry?.status).toBe("pending"); // atribución sigue viva
    expect(linkAfterExpiry?.benefitStatus).toBe("pending"); // D-07: no lo pasa ningún cron

    // Cross-assertion: el vínculo sigue vivo para atribución — si el socio
    // paga un plan real después, la comisión dispara igual (D-07/D-11).
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const charge = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(charge.statusCode).toBe(201);
    const subscriptionId = charge.body.id as number;

    const commissions = await partnerCommissionRows(app, subscriptionId);
    expect(commissions).toHaveLength(1);
    expect(commissions[0].amount).toBe(5000);
    expect(commissions[0].status).toBe("pending");
  });

  // ─── (5): precedencia sobre el trial freemium (D-18) ────────────────────

  it("(5) precedencia D-18: free_pass pendiente o consumido excluye del trial; un freemium sin partner sigue elegible (no-regresión 119)", async () => {
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
    });

    const pendingMember = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: pendingMember.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });
    const pendingRes = await app.inject({
      method: "GET",
      url: TRIAL_ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${pendingMember.token}` },
    });
    expect(pendingRes.statusCode).toBe(200);
    expect(JSON.parse(pendingRes.body).eligible).toBe(false);

    const consumedMember = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: consumedMember.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "consumed",
      appliedReason: "semana_activada",
      appliedPercent: 0,
      appliedAmount: 0,
    });
    const consumedRes = await app.inject({
      method: "GET",
      url: TRIAL_ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${consumedMember.token}` },
    });
    expect(consumedRes.statusCode).toBe(200);
    expect(JSON.parse(consumedRes.body).eligible).toBe(false);

    // No-regresión (fase 119): un freemium SIN vínculo de partner sigue
    // elegible al trial.
    const plainMember = await registerMember(arBranchId);
    const plainRes = await app.inject({
      method: "GET",
      url: TRIAL_ELIGIBILITY_URL,
      headers: { authorization: `Bearer ${plainMember.token}` },
    });
    expect(plainRes.statusCode).toBe(200);
    expect(JSON.parse(plainRes.body).eligible).toBe(true);
  });

  // ─── (6): sin conversión — cero comisión ────────────────────────────────

  it("(6) la semana gratis no genera comisión (price_paid=0 no cualifica)", async () => {
    await createPartnerWeekPlan("AR");
    const activity = await createActivity();
    const futureSlot = getFutureSlot();
    const slot = await createScheduleSlot(
      activity.id,
      futureSlot.dayOfWeek,
      futureSlot.startTime,
      futureSlot.endTime,
    );
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
      commissionType: "fixed",
      commissionValue: 5000,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });

    const res = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: slot.id,
        date: futureSlot.date,
        branchId: arBranchId,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    const commissions = await partnerCommissionRows(app, body.subscriptionId);
    expect(commissions).toHaveLength(0);
  });

  // ─── (7): socio con plan activo ─────────────────────────────────────────

  it("(7) socio con plan activo → 409 sin tocar nada", async () => {
    await createPartnerWeekPlan("AR");
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await registerMember(arBranchId);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const activePlan = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(activePlan.statusCode).toBe(201);

    const eligRes = await app.inject({
      method: "GET",
      url: PARTNER_BENEFIT_URL,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(JSON.parse(eligRes.body)).toEqual({
      eligible: false,
      reason: "con_plan_activo",
    });

    const res = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: 1,
        date: getFutureSlot().date,
        branchId: arBranchId,
      },
    });
    expect(res.statusCode).toBe(409);

    expect(await countSubscriptionsForUser(member.id)).toBe(1); // solo la que ya tenía
    expect(await countBookingsForUser(member.id)).toBe(0);
    const link = await fullLinkRow(member.id);
    expect(link?.benefitStatus).toBe("pending"); // sin tocar
  });

  // ─── (8): falta el plan configurado ─────────────────────────────────────

  it("(8) sin plan paquete 1 semana / 3 clases para el país de la sede → 400 en español, cero escrituras", async () => {
    // Sede de un país sin el plan de semana gratis configurado. Deliberadamente
    // NO se llama a createPartnerWeekPlan para ningún país.
    const xxBranch = await insertBranch(app, { country: "XX" });
    const partner = await insertPartner(app, {
      branchId: xxBranch.id,
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await registerMember(xxBranch.id);
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });

    const res = await app.inject({
      method: "POST",
      url: RESERVE_PARTNER_WEEK_URL,
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        scheduleId: 1,
        date: getFutureSlot().date,
        branchId: xxBranch.id,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/XX/);

    expect(await countSubscriptionsForUser(member.id)).toBe(0);
    expect(await countBookingsForUser(member.id)).toBe(0);
    const link = await fullLinkRow(member.id);
    expect(link?.benefitStatus).toBe("pending");
  });
});
