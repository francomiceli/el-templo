import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { AuraService } from "../../src/modules/aura/service";
import {
  ACTIVITY_AURA_MAX,
  AURA_AMOUNTS,
} from "../../src/modules/aura/amounts";

/**
 * Aura por asistencia configurable por actividad (2026-11-25, migración 0358).
 *
 * `activities.aura_amount`: cuánta Aura acredita el presente en una clase de
 * esa actividad. NULL = la de siempre (5). Pedido original: que un evento
 * especial (masterclass) valga más que una clase de la semana.
 *
 * Casos:
 *  (A) CRUD admin: crear con y sin valor, listarlo, `null` vuelve a la de
 *      siempre, ausencia de la key no lo toca, validación de rango (0..50).
 *  (B) Acreditación: QR del socio, presente del profe, tope del día (D-64)
 *      con el valor de la actividad, 0 = no da Aura, deshacer devuelve lo
 *      acreditado, check-in forzado sin horario sigue en 5.
 *
 * Mismo reloj fijo que `attendance-day-cap.test.ts`: miércoles 10:00 hora de
 * la sede.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const PINNED_NOW = "2026-03-11T13:00:00Z";
const TODAY = PINNED_NOW.split("T")[0];
const TODAY_REF_ID = Number(TODAY.replace(/-/g, ""));

const SCHEDULING_ADMIN_URL = "/api/admin/scheduling";
const ADMIN_ATTENDANCE_URL = "/api/admin/attendance";
const MEMBER_ATTENDANCE_URL = "/api/members/attendance";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

const MASTERCLASS_AURA = 15;

interface ActivityBody {
  id: number;
  name: string;
  auraAmount: number | null;
}

describe("Aura por asistencia por actividad (0358)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
  let testBranchId: number;
  let auraService: AuraService;
  let counter = 0;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(PINNED_NOW));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    auraService = new AuraService(app.db);

    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(tenantWhere(users, TEMPLO_CTX), eq(users.email, "admin@test.com")),
      );
    adminUserId = adminUser.id;

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── helpers ────────────────────────────────────────────────────────────

  async function createActivityViaApi(
    name: string,
    extra: { auraAmount?: number | null },
  ): Promise<ActivityBody> {
    const res = await app.inject({
      method: "POST",
      url: `${SCHEDULING_ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, ...extra },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as ActivityBody;
  }

  async function updateActivity(
    id: number,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: ActivityBody }> {
    const res = await app.inject({
      method: "PUT",
      url: `${SCHEDULING_ADMIN_URL}/activities/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as ActivityBody,
    };
  }

  /** Socio con plan pago listo para hacer check-in. */
  async function setupMember(): Promise<{
    memberId: number;
    memberToken: string;
  }> {
    counter += 1;
    const email = `aura-actividad-${counter}@test.com`;
    const password = "pass123456";

    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Plan Aura Actividad ${counter}`,
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
        multiBranch: false,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body) as { id: number };

    const registered = await registerUser(app, {
      email,
      password,
      firstName: "Aura",
      lastName: "Actividad",
      branchId: testBranchId,
    });
    const memberId = (registered.user as { id: number }).id;

    const subRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: testBranchId,
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(subRes.statusCode).toBe(201);
    const subscription = JSON.parse(subRes.body) as { id: number };

    const [inserted] = await app.db.insert(financialTransactions).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: "plan_charge",
        direction: "inflow",
        amount: 15000,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: dateOffsetStr(-1),
        effectiveDate: dateOffsetStr(-1),
        branchId: testBranchId,
        recordedBy: adminUserId,
      }),
    );
    await app.db.insert(transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: (inserted as { insertId: number }).insertId,
        targetKind: "subscription",
        targetId: subscription.id,
        allocatedAmount: 15000,
      }),
    );

    const memberToken = await getAuthToken(app, email, password);
    return { memberId, memberToken };
  }

  /**
   * Horario del miércoles 10:00 (dentro de la ventana de check-in) de una
   * actividad (regular salvo `isSpecial`) con la Aura indicada, y reserva de
   * hoy.
   */
  async function createBookedSlotForNow(
    memberId: number,
    auraAmount: number | null,
    isSpecial = false,
  ): Promise<{ scheduleId: number }> {
    counter += 1;
    const [act] = await app.db.insert(activities).values(
      tenantValues(TEMPLO_CTX, {
        name: `Master Aura ${counter}`,
        auraAmount,
        isSpecial,
      }),
    );
    const [sch] = await app.db.insert(schedules).values(
      tenantValues(TEMPLO_CTX, {
        activityId: Number(act.insertId),
        branchId: testBranchId,
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      }),
    );
    const scheduleId = Number(sch.insertId);
    await app.db.insert(bookings).values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        scheduleId,
        branchId: testBranchId,
        bookingDate: TODAY,
        status: "reservado",
      }),
    );
    return { scheduleId };
  }

  async function qrCheckIn(
    memberId: number,
    memberToken: string,
    auraAmount: number | null,
  ): Promise<{ attendanceId: number }> {
    await createBookedSlotForNow(memberId, auraAmount);
    const res = await app.inject({
      method: "POST",
      url: `${MEMBER_ATTENDANCE_URL}/check-in`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { qrToken: generateQrToken(testBranchId) },
    });
    expect(res.statusCode).toBe(201);
    return { attendanceId: (JSON.parse(res.body) as { id: number }).id };
  }

  /**
   * Presente del profe. Para una especial no hace falta el pase: sin
   * suscripción que la cubra el presente igual entra (solo con advertencia).
   */
  async function coachCheckIn(
    memberId: number,
    auraAmount: number | null,
    isSpecial = false,
  ): Promise<number> {
    const { scheduleId } = await createBookedSlotForNow(
      memberId,
      auraAmount,
      isSpecial,
    );
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_ATTENDANCE_URL}/slot/${scheduleId}/${TODAY}/check-in`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { memberId, reason: "Prueba de Aura por actividad" },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { attendance: { id: number } }).attendance
      .id;
  }

  async function forceCheckIn(memberId: number): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_ATTENDANCE_URL}/force`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId,
        branchId: testBranchId,
        reason: "Prueba de Aura por actividad",
      },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { id: number }).id;
  }

  async function undo(attendanceId: number): Promise<void> {
    const res = await app.inject({
      method: "DELETE",
      url: `${ADMIN_ATTENDANCE_URL}/${attendanceId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  }

  async function seedTrainingAura(memberId: number): Promise<void> {
    await auraService.award({
      userId: memberId,
      sourceType: "training_completion",
      referenceType: "training_day",
      referenceId: TODAY_REF_ID,
      amount: AURA_AMOUNTS.training,
      description: "Aura de la app (test de Aura por actividad)",
    });
  }

  async function ledger(memberId: number): Promise<
    Array<{
      sourceType: string;
      referenceType: string | null;
      referenceId: number | null;
      amount: number;
    }>
  > {
    return app.db
      .select({
        sourceType: auraTransactions.sourceType,
        referenceType: auraTransactions.referenceType,
        referenceId: auraTransactions.referenceId,
        amount: auraTransactions.amount,
      })
      .from(auraTransactions)
      .where(
        and(
          tenantWhere(auraTransactions, TEMPLO_CTX),
          eq(auraTransactions.userId, memberId),
        ),
      )
      .orderBy(asc(auraTransactions.id));
  }

  async function attendanceAward(
    memberId: number,
    attendanceId: number,
  ): Promise<number> {
    return (await ledger(memberId))
      .filter(
        (r) => r.sourceType === "attendance" && r.referenceId === attendanceId,
      )
      .reduce((sum, r) => sum + r.amount, 0);
  }

  async function balanceOf(memberId: number): Promise<number> {
    const [row] = await app.db
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, memberId));
    return row?.balance ?? 0;
  }

  async function expectBalanceMatchesLedger(memberId: number): Promise<void> {
    const sum = (await ledger(memberId)).reduce((s, r) => s + r.amount, 0);
    expect(await balanceOf(memberId)).toBe(sum);
  }

  // ─── (A) CRUD admin ─────────────────────────────────────────────────────

  describe("(A) CRUD admin", () => {
    it("crear sin valor → null (la de siempre)", async () => {
      const act = await createActivityViaApi("Clase común", {});
      expect(act.auraAmount).toBeNull();
    });

    it("crear con valor → se devuelve y aparece en el listado", async () => {
      const act = await createActivityViaApi("Masterclass", {
        auraAmount: MASTERCLASS_AURA,
      });
      expect(act.auraAmount).toBe(MASTERCLASS_AURA);

      const res = await app.inject({
        method: "GET",
        url: `${SCHEDULING_ADMIN_URL}/activities`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const listed = (
        JSON.parse(res.body) as { activities: ActivityBody[] }
      ).activities.find((a) => a.id === act.id);
      expect(listed?.auraAmount).toBe(MASTERCLASS_AURA);
    });

    it("PUT sin la key no toca el valor; `null` explícito vuelve a la de siempre", async () => {
      const act = await createActivityViaApi("Masterclass editable", {
        auraAmount: MASTERCLASS_AURA,
      });

      const rename = await updateActivity(act.id, {
        name: "Masterclass editable 2",
      });
      expect(rename.statusCode).toBe(200);
      expect(rename.body.auraAmount).toBe(MASTERCLASS_AURA);

      const changed = await updateActivity(act.id, { auraAmount: 25 });
      expect(changed.statusCode).toBe(200);
      expect(changed.body.auraAmount).toBe(25);

      const reset = await updateActivity(act.id, { auraAmount: null });
      expect(reset.statusCode).toBe(200);
      expect(reset.body.auraAmount).toBeNull();

      const [row] = await app.db
        .select({ auraAmount: activities.auraAmount })
        .from(activities)
        .where(
          and(tenantWhere(activities, TEMPLO_CTX), eq(activities.id, act.id)),
        );
      expect(row.auraAmount).toBeNull();
    });

    it("acepta 0 (no da Aura) y el tope de 50", async () => {
      const zero = await createActivityViaApi("Open sin Aura", {
        auraAmount: 0,
      });
      expect(zero.auraAmount).toBe(0);
      const max = await createActivityViaApi("Evento tope", {
        auraAmount: ACTIVITY_AURA_MAX,
      });
      expect(max.auraAmount).toBe(50);
    });

    it.each([
      ["negativo", -1],
      ["más del tope", ACTIVITY_AURA_MAX + 1],
      ["no entero", 2.5],
    ])("rechaza un valor %s → 400", async (_label, value) => {
      const create = await app.inject({
        method: "POST",
        url: `${SCHEDULING_ADMIN_URL}/activities`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: `Inválida ${value}`, auraAmount: value },
      });
      expect(create.statusCode).toBe(400);

      const act = await createActivityViaApi(`Válida ${value}`, {});
      const update = await updateActivity(act.id, { auraAmount: value });
      expect(update.statusCode).toBe(400);
    });
  });

  // ─── (B) acreditación ───────────────────────────────────────────────────

  describe("(B) acreditación", () => {
    it("QR en una actividad sin valor propio acredita 5 (sin cambios)", async () => {
      const { memberId, memberToken } = await setupMember();

      const { attendanceId } = await qrCheckIn(memberId, memberToken, null);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        AURA_AMOUNTS.attendance,
      );
      await expectBalanceMatchesLedger(memberId);
    });

    it("QR en una masterclass de 15 acredita 15", async () => {
      const { memberId, memberToken } = await setupMember();

      const { attendanceId } = await qrCheckIn(
        memberId,
        memberToken,
        MASTERCLASS_AURA,
      );

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        MASTERCLASS_AURA,
      );
      expect(await balanceOf(memberId)).toBe(MASTERCLASS_AURA);
      await expectBalanceMatchesLedger(memberId);
    });

    it("presente del profe en una masterclass de 15 acredita 15", async () => {
      const { memberId } = await setupMember();

      const attendanceId = await coachCheckIn(memberId, MASTERCLASS_AURA);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        MASTERCLASS_AURA,
      );
      await expectBalanceMatchesLedger(memberId);
    });

    it("especial sin valor propio acredita 10", async () => {
      const { memberId } = await setupMember();

      const attendanceId = await coachCheckIn(memberId, null, true);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        AURA_AMOUNTS.attendanceSpecial,
      );
      expect(AURA_AMOUNTS.attendanceSpecial).toBe(10);
      await expectBalanceMatchesLedger(memberId);
    });

    it("especial con valor propio acredita el propio (no 10)", async () => {
      const { memberId } = await setupMember();

      const attendanceId = await coachCheckIn(memberId, MASTERCLASS_AURA, true);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        MASTERCLASS_AURA,
      );
    });

    it("tope del día: con 3 de app la especial de 10 acredita 7", async () => {
      const { memberId } = await setupMember();
      await seedTrainingAura(memberId);

      const attendanceId = await coachCheckIn(memberId, null, true);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        AURA_AMOUNTS.attendanceSpecial - AURA_AMOUNTS.training,
      );
      expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.attendanceSpecial);
      await expectBalanceMatchesLedger(memberId);
    });

    it("con un valor menor a 5 acredita ese valor", async () => {
      const { memberId } = await setupMember();

      const attendanceId = await coachCheckIn(memberId, 2);

      expect(await attendanceAward(memberId, attendanceId)).toBe(2);
      await expectBalanceMatchesLedger(memberId);
    });

    it("tope del día: con 3 de app la masterclass de 15 acredita 12 (el día vale 15)", async () => {
      const { memberId, memberToken } = await setupMember();
      await seedTrainingAura(memberId);

      const { attendanceId } = await qrCheckIn(
        memberId,
        memberToken,
        MASTERCLASS_AURA,
      );

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        MASTERCLASS_AURA - AURA_AMOUNTS.training,
      );
      expect(await balanceOf(memberId)).toBe(MASTERCLASS_AURA);
      await expectBalanceMatchesLedger(memberId);
    });

    it("una actividad en 0 no acredita ni escribe fila", async () => {
      const { memberId } = await setupMember();

      const attendanceId = await coachCheckIn(memberId, 0);

      expect(await attendanceAward(memberId, attendanceId)).toBe(0);
      const rows = (await ledger(memberId)).filter(
        (r) => r.sourceType === "attendance",
      );
      expect(rows).toHaveLength(0);
      expect(await balanceOf(memberId)).toBe(0);
    });

    it("segunda asistencia del día después de una masterclass: el forzado sin horario acredita 5", async () => {
      const { memberId, memberToken } = await setupMember();
      const { attendanceId: first } = await qrCheckIn(
        memberId,
        memberToken,
        MASTERCLASS_AURA,
      );

      const second = await forceCheckIn(memberId);

      expect(await attendanceAward(memberId, first)).toBe(MASTERCLASS_AURA);
      expect(await attendanceAward(memberId, second)).toBe(
        AURA_AMOUNTS.attendance,
      );
      expect(await balanceOf(memberId)).toBe(
        MASTERCLASS_AURA + AURA_AMOUNTS.attendance,
      );
      await expectBalanceMatchesLedger(memberId);
    });

    it("deshacer una masterclass de 15 revierte -15", async () => {
      const { memberId } = await setupMember();
      const attendanceId = await coachCheckIn(memberId, MASTERCLASS_AURA);

      await undo(attendanceId);

      const reversals = (await ledger(memberId))
        .filter((r) => r.referenceType === "attendance_reversal")
        .map((r) => r.amount);
      expect(reversals).toEqual([-MASTERCLASS_AURA]);
      expect(await balanceOf(memberId)).toBe(0);
      await expectBalanceMatchesLedger(memberId);
    });

    it("cambiar el valor de la actividad no toca lo ya acreditado", async () => {
      const { memberId } = await setupMember();
      const attendanceId = await coachCheckIn(memberId, MASTERCLASS_AURA);

      const [row] = await app.db
        .select({ activityId: schedules.activityId })
        .from(schedules)
        .innerJoin(bookings, eq(bookings.scheduleId, schedules.id))
        .where(
          and(
            tenantWhere(bookings, TEMPLO_CTX),
            eq(bookings.memberId, memberId),
          ),
        );
      const update = await updateActivity(row.activityId, { auraAmount: 5 });
      expect(update.statusCode).toBe(200);

      expect(await attendanceAward(memberId, attendanceId)).toBe(
        MASTERCLASS_AURA,
      );
    });
  });
});
