/**
 * Phase 148 (ALTA-08) — coach-load `/alta` integration tests.
 *
 * Blinda el CORAZÓN de la fase: `POST /api/admin/finance/coach-load/alta`
 * (el profe resuelve/crea el alumno + asigna plan + cobro 'pendiente', todo
 * idempotente y branch-gated) y el cascade del void en
 * `POST /api/admin/finance/transactions/:id/void` (gestión, coach excluido).
 *
 * Ejercita los 7 escenarios críticos contra el MySQL real por-worker
 * (`eltemplo_test`), usando los helpers de test/helpers.ts:
 *
 *   1. crear-nuevo            — alumno {firstName,lastName,dni} sin match ⇒ 1 user
 *                               (email null, nacido 'prueba') + sub activa + charge
 *                               'pendiente' con createdMemberId = nuevo user.
 *   2. dedup-contra-existente — {dni} que matchea un member existente ⇒ NO crea
 *                               user; carga contra el existente; createdMemberId null.
 *   3. parcial→deuda          — amountReceived < precio ⇒ balance positivo (deuda).
 *   4. fixed-con-scheduleIds  — plan fixed con scheduleIds.length===classesPerWeek
 *                               ⇒ subscription_schedules + bookings; count erróneo ⇒ 400.
 *   5. void→cascade           — anular alta de alumno-nuevo ⇒ user 'inactivo' + sub
 *                               cancelada + userStatusHistory; preexistente ⇒ intacto.
 *   6. idempotencia           — doble-submit con misma key ⇒ 1 user + 1 charge.
 *   7. retry-tras-fallo-parcial (I-1) — replay con misma key ⇒ createdMemberId
 *                               SETEADO (no NULL) en la tx; void posterior desactiva.
 *
 * MEMORY: la suite NO se corre local — corre en CI al pushear a staging.
 * Correr un caso: `npx vitest run test/finance/coach-load-alta.test.ts -t "<tag>"`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (172-14): gimnasio de las queries DIRECTAS de este archivo. Sale del
 * fixture, nunca de un `1` a mano. Con `finance` en `TENANT_STRICT_MODULES` el
 * sentinel hace throw sobre cualquier acceso a `financial_transactions` /
 * `balances` sin gimnasio en el predicado — incluidos los `sql` crudos.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const COACH_LOAD_URL = "/api/admin/finance/coach-load";
const FINANCE_URL = "/api/admin/finance";
const PLAN_PRICE = 100000;

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;
let branchId: number;
let flexiblePlanId: number;
let fixedPlanId: number;
let onlinePlanId: number;
let dniSeq = 0;

/** Globally-unique DNI per call so alta-created members never collide across
 *  tests in the same per-worker DB (mirrors the phone uniqueness in helpers). */
function uniqueDni(): string {
  dniSeq = (dniSeq + 1) % 100000;
  return `D${Date.now().toString(36)}${String(dniSeq).padStart(5, "0")}`;
}

interface AltaBody {
  userId?: number;
  firstName?: string;
  lastName?: string;
  dni?: string;
  branchId: number;
  planId: number;
  zero?: boolean;
  paymentMethod: "cash" | "transfer" | "card";
  amountReceived?: number;
  scheduleIds?: number[];
  notes?: string;
  idempotencyKey: string;
}

/** POST /alta as the coach (the PoS role). */
async function postAlta(body: AltaBody, token = coachToken) {
  const res = await app.inject({
    method: "POST",
    url: `${COACH_LOAD_URL}/alta`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Read the persisted charge row straight from the DB by idempotency key. */
async function readChargeByKey(key: string): Promise<{
  id: number;
  validationStatus: string;
  kind: string;
  amount: number;
  createdMemberId: number | null;
  voidedAt: Date | null;
} | null> {
  const [row] = await app.db
    .select({
      id: schema.financialTransactions.id,
      validationStatus: schema.financialTransactions.validationStatus,
      kind: schema.financialTransactions.kind,
      amount: schema.financialTransactions.amount,
      createdMemberId: schema.financialTransactions.createdMemberId,
      voidedAt: schema.financialTransactions.voidedAt,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        eq(schema.financialTransactions.idempotencyKey, key),
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Read a user's status + email by id. */
async function readUser(
  id: number,
): Promise<{ status: string; email: string | null } | null> {
  const [row] = await app.db
    .select({ status: schema.users.status, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return row ?? null;
}

/** Count non-staff users carrying a given DNI (alta-created members). */
async function countUsersByDni(dni: string): Promise<number> {
  const [row] = await app.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.users)
    .where(eq(schema.users.dni, dni));
  return Number(row?.count ?? 0);
}

/** Subscription balance (outstanding obligation) for a member's sub. */
async function readSubBalance(
  memberId: number,
  subscriptionId: number,
): Promise<number | null> {
  const [row] = await app.db
    .select({ amount: schema.balances.amount })
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.memberId, memberId),
        eq(schema.balances.targetKind, "subscription"),
        eq(schema.balances.targetId, subscriptionId),
        tenantWhere(schema.balances, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ? row.amount : null;
}

/** Create `count` fixed schedule slots on a branch, returning their ids. */
async function createScheduleSlots(
  branch: number,
  count: number,
  offset = 0,
): Promise<number[]> {
  const [act] = await app.db
    .insert(schema.activities)
    .values({ name: `Alta Calistenia ${offset}-${Date.now()}`, isActive: true })
    .$returningId();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const dayOfWeek = ((offset + i) % 5) + 1;
    const startHour = 8 + ((offset + i) % 10);
    const startTime = `${String(startHour).padStart(2, "0")}:00`;
    const endTime = `${String(startHour + 1).padStart(2, "0")}:00`;
    const result = await app.db.insert(schema.schedules).values({
      branchId: branch,
      activityId: act.id,
      dayOfWeek,
      startTime,
      endTime,
      isActive: true,
    });
    ids.push(Number(result[0].insertId));
  }
  return ids;
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  await ensureEfectivoCaja(app, branchId, "ARS");

  await createStaffUser(app, {
    email: "coach-alta@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Alta",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-alta@test.local", "pass123456");

  // Plan flexible (sin picker de turnos) — el caso por defecto.
  const [flexRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Alta Flex Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: PLAN_PRICE,
      priceZero: 0,
      priceCreditCard: 120000,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  flexiblePlanId = flexRes.id;

  // Plan fixed (requiere scheduleIds.length === classesPerWeek).
  const [fixedRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Alta Fixed Plan",
      planTier: "flex",
      bookingMode: "fixed",
      planCategory: "presencial",
      priceRegular: PLAN_PRICE,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 2,
      currency: "ARS",
    })
    .$returningId();
  fixedPlanId = fixedRes.id;

  // Plan ONLINE (otro grupo de categoría). Permite que un alumno tenga una sub
  // online activa EN PARALELO a una presencial — usado por el caso de void
  // preexistente para aislar el cascade del recompute de status: tras anular la
  // sub presencial del alta, la online sigue activa ⇒ recomputeUserStatus lo deja
  // 'activo', así que cualquier 'inactivo' SOLO podría venir del cascade.
  const [onlineRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Alta Online Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "online_regular",
      priceRegular: PLAN_PRICE,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  onlinePlanId = onlineRes.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Limpiar el estado finance + suscripciones en UNA conexion del pool con FK
  // checks off (mismo patron que coach-load.test.ts): "el orden cubre las FKs"
  // era falso en cuanto otro archivo del mismo worker (isolate=false) deja
  // program_enrollments referenciando subscriptions — ER_ROW_IS_REFERENCED_2.
  // Los users creados por /alta persisten pero usan DNIs únicos → no interfieren.
  // 172-14: los 3 DELETE sobre tablas strict se ACOTAN al gimnasio en vez de
  // llevar exencion `tenant-safe`. El borrado global aca era comodidad, no
  // diseno: este archivo no siembra en otro gimnasio. La conexion cruda del
  // pool es una de las puertas que el sentinel intercepta: sin filtro, throw.
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
      [TENANT_TEMPLO],
    );
    await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `bookings`");
    await conn.query("DELETE FROM `subscription_schedules`");
    await conn.query("DELETE FROM `program_enrollments`");
    await conn.query("DELETE FROM `subscriptions`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
});

// ─── 1. crear-nuevo ──────────────────────────────────────────────────────────
describe("alta crear-nuevo", () => {
  it("crear-nuevo: alumno sin match → 1 user (email null) + sub activa + charge pendiente con createdMemberId", async () => {
    const dni = uniqueDni();
    const key = `alta-new-${Date.now()}`;
    const { statusCode, body } = await postAlta({
      firstName: "Walk",
      lastName: "In",
      dni,
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(body.createdNew).toBe(true);
    expect(body.createdMemberId).toBeGreaterThan(0);

    // Exactamente 1 user con ese DNI (el recién creado).
    expect(await countUsersByDni(dni)).toBe(1);

    // El alumno se creó por el path mínimo: email null, nació 'prueba'
    // (history null→prueba), y assignPlan lo dejó 'activo' (puede entrenar ya).
    const user = await readUser(body.createdMemberId);
    expect(user?.email).toBeNull();
    expect(user?.status).toBe("activo");
    const bornPrueba = await app.db
      .select({ id: schema.userStatusHistory.id })
      .from(schema.userStatusHistory)
      .where(
        and(
          eq(schema.userStatusHistory.userId, body.createdMemberId),
          eq(schema.userStatusHistory.toStatus, "prueba"),
        ),
      );
    expect(bornPrueba.length).toBe(1);

    // Subscription activa.
    expect(body.subscription?.id).toBeGreaterThan(0);
    const [sub] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, body.subscription.id))
      .limit(1);
    expect(sub.status).toBe("active");

    // Charge born PENDIENTE (coach) con createdMemberId = el alumno nuevo.
    const charge = await readChargeByKey(key);
    expect(charge).toBeTruthy();
    expect(charge?.validationStatus).toBe("pendiente");
    expect(charge?.kind).toBe("plan_charge");
    expect(charge?.amount).toBe(PLAN_PRICE);
    expect(charge?.createdMemberId).toBe(body.createdMemberId);
  });
});

// ─── 2. dedup-contra-existente ───────────────────────────────────────────────
describe("alta dedup-contra-existente", () => {
  it("dedup: DNI que matchea un member existente → NO crea user, carga contra el existente, createdMemberId null", async () => {
    const dni = uniqueDni();
    // Member preexistente con DNI conocido.
    const existing = await registerUser(app, {
      email: `alta-dedup-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Pre",
      lastName: "Existente",
      branchId,
      dni,
    });
    const existingId = (existing.user as { id: number }).id;
    expect(await countUsersByDni(dni)).toBe(1);

    const key = `alta-dedup-${Date.now()}`;
    const { statusCode, body } = await postAlta({
      firstName: "Otro",
      lastName: "Nombre",
      dni, // mismo DNI → dedup
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(body.createdNew).toBe(false);
    expect(body.createdMemberId).toBeNull();

    // NO se creó un segundo user con ese DNI.
    expect(await countUsersByDni(dni)).toBe(1);

    // La carga referencia al member existente (la sub es suya) y el charge no
    // lleva createdMemberId (no creó a nadie).
    const [sub] = await app.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, body.subscription.id))
      .limit(1);
    expect(sub.userId).toBe(existingId);

    const charge = await readChargeByKey(key);
    expect(charge?.createdMemberId).toBeNull();
    expect(charge?.validationStatus).toBe("pendiente");
  });
});

// ─── 3. parcial→deuda ────────────────────────────────────────────────────────
describe("alta parcial→deuda", () => {
  it("parcial: amountReceived < precio → balance positivo (deuda) por la diferencia", async () => {
    const dni = uniqueDni();
    const key = `alta-partial-${Date.now()}`;
    const partial = 40000;
    const { statusCode, body } = await postAlta({
      firstName: "Deudor",
      lastName: "Parcial",
      dni,
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      amountReceived: partial,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(body.createdNew).toBe(true);

    // El charge cobra solo lo recibido…
    const charge = await readChargeByKey(key);
    expect(charge?.amount).toBe(partial);

    // …y la subscription queda con deuda = precio - recibido.
    const balance = await readSubBalance(
      body.createdMemberId,
      body.subscription.id,
    );
    expect(balance).toBe(PLAN_PRICE - partial);
  });
});

// ─── 4. fixed-con-scheduleIds ────────────────────────────────────────────────
describe("alta fixed-con-scheduleIds", () => {
  it("fixed: scheduleIds.length === classesPerWeek → subscription_schedules + bookings generados", async () => {
    const dni = uniqueDni();
    const slots = await createScheduleSlots(branchId, 2, 0); // classesPerWeek=2
    const key = `alta-fixed-${Date.now()}`;

    const { statusCode, body } = await postAlta({
      firstName: "Turno",
      lastName: "Fijo",
      dni,
      branchId,
      planId: fixedPlanId,
      paymentMethod: "cash",
      scheduleIds: slots,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);

    // subscription_schedules: una fila por slot elegido.
    const schedRows = await app.db
      .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
      .from(schema.subscriptionSchedules)
      .where(
        eq(schema.subscriptionSchedules.subscriptionId, body.subscription.id),
      );
    expect(schedRows.map((r) => r.scheduleId).sort()).toEqual(
      [...slots].sort(),
    );

    // Bookings recurrentes generados para el alumno nuevo.
    const [bk] = await app.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, body.createdMemberId));
    expect(Number(bk.count)).toBeGreaterThan(0);
  });

  it("fixed: scheduleIds con count erróneo → 400 (no se crea sub ni alumno persiste con plan)", async () => {
    const dni = uniqueDni();
    const slots = await createScheduleSlots(branchId, 1, 20); // 1 ≠ classesPerWeek(2)
    const key = `alta-fixed-bad-${Date.now()}`;

    const { statusCode } = await postAlta({
      firstName: "Turno",
      lastName: "Malo",
      dni,
      branchId,
      planId: fixedPlanId,
      paymentMethod: "cash",
      scheduleIds: slots, // count incorrecto
      idempotencyKey: key,
    });

    expect(statusCode).toBe(400);

    // La tx del charge rolleó → no quedó charge con esa key.
    expect(await readChargeByKey(key)).toBeNull();
  });
});

/** Anular una carga como gestión (admin). keepMembershipActive=false dispara el
 *  cascade: cancela la sub y (si createdMemberId) desactiva al alumno. */
async function voidCharge(
  txId: number,
  token = adminToken,
  keepMembershipActive = false,
) {
  const res = await app.inject({
    method: "POST",
    url: `${FINANCE_URL}/transactions/${txId}/void`,
    headers: { authorization: `Bearer ${token}` },
    payload: { reason: "Anulación de prueba", keepMembershipActive },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

// ─── 5. void→cascade ─────────────────────────────────────────────────────────
describe("alta void→cascade", () => {
  it("void: anular carga de alumno-nuevo → tx anulada + sub cancelada + alumno inactivo (no borrado) + history", async () => {
    const dni = uniqueDni();
    const key = `alta-void-new-${Date.now()}`;
    const alta = await postAlta({
      firstName: "Anular",
      lastName: "Nuevo",
      dni,
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      idempotencyKey: key,
    });
    expect(alta.statusCode).toBe(201);
    const createdMemberId = alta.body.createdMemberId as number;
    const subId = alta.body.subscription.id as number;
    const charge = await readChargeByKey(key);
    expect(charge?.createdMemberId).toBe(createdMemberId);

    // Anular como gestión (coach NO puede — ver caso de auth en coach-load.test).
    const res = await voidCharge(charge!.id);
    expect(res.statusCode).toBe(200);

    // La transacción quedó anulada (voided_at seteado).
    const voided = await readChargeByKey(key);
    expect(voided?.voidedAt).not.toBeNull();

    // La subscription quedó cancelada.
    const [sub] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subId))
      .limit(1);
    expect(sub.status).toBe("cancelled");

    // El alumno NO se borró: sigue existiendo, ahora 'inactivo'.
    expect(await countUsersByDni(dni)).toBe(1);
    const user = await readUser(createdMemberId);
    expect(user?.status).toBe("inactivo");

    // Quedó registrada la transición →inactivo en userStatusHistory.
    const history = await app.db
      .select({ id: schema.userStatusHistory.id })
      .from(schema.userStatusHistory)
      .where(
        and(
          eq(schema.userStatusHistory.userId, createdMemberId),
          eq(schema.userStatusHistory.toStatus, "inactivo"),
        ),
      );
    expect(history.length).toBe(1);
  });

  it("void: anular carga de alumno PREEXISTENTE → el cascade NO lo desactiva (queda activo por su otra sub)", async () => {
    const dni = uniqueDni();
    const existing = await registerUser(app, {
      email: `alta-void-pre-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Pre",
      lastName: "Void",
      branchId,
      dni,
    });
    const existingId = (existing.user as { id: number }).id;

    // El preexistente conserva una sub ONLINE activa EN PARALELO a la presencial
    // del alta. Clave para aislar el cascade del recompute compartido: anular SOLO
    // la sub presencial deja la online viva ⇒ recomputeUserStatus lo mantiene
    // 'activo'. Así, si terminara 'inactivo', la ÚNICA causa posible sería el
    // cascade del void disparando indebidamente sobre un createdMemberId null.
    const onlineKey = `alta-void-pre-online-${Date.now()}`;
    const onlineAlta = await postAlta({
      userId: existingId,
      branchId,
      planId: onlinePlanId,
      paymentMethod: "cash",
      idempotencyKey: onlineKey,
    });
    expect(onlineAlta.statusCode).toBe(201);
    const onlineSubId = onlineAlta.body.subscription.id as number;

    const key = `alta-void-pre-${Date.now()}`;
    const alta = await postAlta({
      dni, // dedup → carga contra el existente
      firstName: "Ignorado",
      lastName: "Ignorado",
      branchId,
      planId: flexiblePlanId, // presencial
      paymentMethod: "cash",
      idempotencyKey: key,
    });
    expect(alta.statusCode).toBe(201);
    expect(alta.body.createdMemberId).toBeNull();

    const charge = await readChargeByKey(key);
    expect(charge?.createdMemberId).toBeNull();

    const res = await voidCharge(charge!.id);
    expect(res.statusCode).toBe(200);

    // El alumno preexistente NO fue desactivado por el cascade (createdMemberId
    // null → no-op). Sigue 'activo' por su sub online, que el void NO tocó.
    const user = await readUser(existingId);
    expect(user?.status).toBe("activo");
    const [onlineSub] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, onlineSubId))
      .limit(1);
    expect(onlineSub.status).toBe("active");

    // El cascade no escribió ninguna transición →inactivo para el preexistente.
    const inactiveHistory = await app.db
      .select({ id: schema.userStatusHistory.id })
      .from(schema.userStatusHistory)
      .where(
        and(
          eq(schema.userStatusHistory.userId, existingId),
          eq(schema.userStatusHistory.toStatus, "inactivo"),
        ),
      );
    expect(inactiveHistory.length).toBe(0);
  });
});

// ─── 7. retry-tras-fallo-parcial (I-1, W-1) ──────────────────────────────────
describe("alta retry-tras-fallo-parcial (I-1)", () => {
  it("retry: replay con misma idempotency_key → createdMemberId SETEADO (no NULL) en la tx; void posterior desactiva", async () => {
    const dni = uniqueDni();
    const key = `alta-retry-${Date.now()}`;
    const payload: AltaBody = {
      firstName: "Retry",
      lastName: "Alumno",
      dni,
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      idempotencyKey: key,
    };

    // 1er alta: crea el alumno + charge con createdMemberId grabado atómicamente.
    const first = await postAlta(payload);
    expect(first.statusCode).toBe(201);
    const createdMemberId = first.body.createdMemberId as number;
    expect(createdMemberId).toBeGreaterThan(0);

    const chargeAfterFirst = await readChargeByKey(key);
    expect(chargeAfterFirst?.createdMemberId).toBe(createdMemberId);

    // Reintento (simula fallo parcial: el alta ya creó al alumno, el profe
    // reintenta con la MISMA key). Replay no-op → 200 con el charge existente.
    const retry = await postAlta(payload);
    expect(retry.statusCode).toBe(200);

    // W-1: el createdMemberId NO se perdió por el replay — sigue SETEADO en la
    // ÚNICA transacción persistida (viajó atómico con el insert del charge).
    expect(await countUsersByDni(dni)).toBe(1);
    const chargeAfterRetry = await readChargeByKey(key);
    expect(chargeAfterRetry?.id).toBe(chargeAfterFirst?.id);
    expect(chargeAfterRetry?.createdMemberId).toBe(createdMemberId);
    expect(chargeAfterRetry?.createdMemberId).not.toBeNull();

    // El cascade encuentra al alumno tras el replay: el void lo desactiva.
    const res = await voidCharge(chargeAfterRetry!.id);
    expect(res.statusCode).toBe(200);
    const user = await readUser(createdMemberId);
    expect(user?.status).toBe("inactivo");
  });
});

// ─── 6. idempotencia (doble-submit) ──────────────────────────────────────────
describe("alta idempotencia", () => {
  it("idempotencia: dos POST con la misma key → exactamente 1 user + 1 charge; el 2º devuelve el existente", async () => {
    const dni = uniqueDni();
    const key = `alta-idem-${Date.now()}`;
    const payload: AltaBody = {
      firstName: "Doble",
      lastName: "Submit",
      dni,
      branchId,
      planId: flexiblePlanId,
      paymentMethod: "cash",
      idempotencyKey: key,
    };

    const first = await postAlta(payload);
    expect(first.statusCode).toBe(201);

    const second = await postAlta(payload);
    // No 500: el duplicado se captura y se devuelve el charge existente.
    expect(second.statusCode).toBe(200);
    expect(second.body.transaction?.id).toBe(first.body.transaction.id);

    // Exactamente 1 user con ese DNI…
    expect(await countUsersByDni(dni)).toBe(1);

    // …y exactamente 1 financial_transaction con esa key.
    const rows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.idempotencyKey, key),
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        ),
      );
    expect(rows.length).toBe(1);
  });
});
