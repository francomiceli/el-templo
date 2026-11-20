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
import { attendance } from "../../src/db/schema/attendance";
import { completedSessions } from "../../src/db/schema/completed-sessions";
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
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";

/**
 * Fase 214 (plan 10, D-64): tope del día del lado de la asistencia.
 *
 * - La asistencia acredita solo la diferencia hasta 5 si la app (entrenamiento
 *   o plan a medida) ya pagó Aura ese día (app 3 -> asistencia 2).
 * - Una segunda asistencia el mismo día (otra categoría) acredita 5 como antes.
 * - Deshacer devuelve exactamente lo que esa asistencia acreditó (leído del
 *   ledger), y si no acreditó nada no revierte nada.
 *
 * Mismo reloj fijo que `attendance.test.ts`: miércoles 10:00 hora de la sede.
 * El día de los casos se deriva de ese reloj, no se escribe a mano.
 *
 * El check-in forzado guarda el día LOCAL de la sede (fase 215, #16; antes
 * guardaba el de UTC) y el tope del día usa ese mismo día: con el reloj fijado
 * a las 13:00 UTC (10:00 AR) coinciden siempre, y los casos nocturnos de abajo
 * cubren cuando el día UTC ya es el siguiente.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const PINNED_NOW = "2026-03-11T13:00:00Z";
const TODAY = PINNED_NOW.split("T")[0];
const TODAY_REF_ID = Number(TODAY.replace(/-/g, ""));

const ADMIN_ATTENDANCE_URL = "/api/admin/attendance";
const MEMBER_ATTENDANCE_URL = "/api/members/attendance";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

type AppSource = "training" | "goalPlan";

describe("Attendance day cap (D-64)", () => {
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

  /** Socio con plan pago listo para hacer check-in. */
  async function setupMember(): Promise<{
    memberId: number;
    memberToken: string;
  }> {
    counter += 1;
    const email = `day-cap-${counter}@test.com`;
    const password = "pass123456";

    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Plan Tope ${counter}`,
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
      firstName: "Tope",
      lastName: "Dia",
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

  /** Horario del miércoles 10:00 (dentro de la ventana de check-in) y reserva de hoy. */
  async function createBookedSlotForNow(memberId: number): Promise<{
    scheduleId: number;
  }> {
    counter += 1;
    const [act] = await app.db
      .insert(activities)
      .values(tenantValues(TEMPLO_CTX, { name: `Calistenia Tope ${counter}` }));
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

  /** Aura de la app del día, por el ledger real (deja el saldo coherente). */
  async function seedAppAura(
    memberId: number,
    source: AppSource,
    amount: number = AURA_AMOUNTS[source],
  ): Promise<void> {
    await auraService.award({
      userId: memberId,
      sourceType:
        source === "training" ? "training_completion" : "goal_plan_completion",
      referenceType: source === "training" ? "training_day" : "goal_plan_day",
      referenceId: TODAY_REF_ID,
      amount,
      description: "Aura de la app (test del tope del día)",
    });
  }

  async function qrCheckIn(
    memberId: number,
    memberToken: string,
  ): Promise<number> {
    await createBookedSlotForNow(memberId);
    const res = await app.inject({
      method: "POST",
      url: `${MEMBER_ATTENDANCE_URL}/check-in`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { qrToken: generateQrToken(testBranchId) },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { id: number }).id;
  }

  async function forceCheckIn(memberId: number): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_ATTENDANCE_URL}/force`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId,
        branchId: testBranchId,
        reason: "Prueba del tope del día",
      },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { id: number }).id;
  }

  async function coachCheckIn(memberId: number): Promise<number> {
    const { scheduleId } = await createBookedSlotForNow(memberId);
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_ATTENDANCE_URL}/slot/${scheduleId}/${TODAY}/check-in`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { memberId, reason: "Prueba del tope del día" },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { attendance: { id: number } }).attendance
      .id;
  }

  async function undo(attendanceId: number): Promise<void> {
    const res = await app.inject({
      method: "DELETE",
      url: `${ADMIN_ATTENDANCE_URL}/${attendanceId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ removed: true });
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

  /** Lo que acreditó la asistencia: filas `attendance` con su id de referencia. */
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

  async function reversals(memberId: number): Promise<number[]> {
    return (await ledger(memberId))
      .filter((r) => r.referenceType === "attendance_reversal")
      .map((r) => r.amount);
  }

  async function balanceOf(memberId: number): Promise<number> {
    const [row] = await app.db
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, memberId));
    return row?.balance ?? 0;
  }

  /** El saldo cacheado tiene que ser la suma del ledger del usuario. */
  async function expectBalanceMatchesLedger(memberId: number): Promise<void> {
    const sum = (await ledger(memberId)).reduce((s, r) => s + r.amount, 0);
    expect(await balanceOf(memberId)).toBe(sum);
  }

  it("app primero y después check-in del socio: la asistencia acredita la diferencia hasta 5", async () => {
    const { memberId, memberToken } = await setupMember();
    await seedAppAura(memberId, "training");

    const attendanceId = await qrCheckIn(memberId, memberToken);

    const credited = await attendanceAward(memberId, attendanceId);
    expect(credited).toBe(AURA_AMOUNTS.attendance - AURA_AMOUNTS.training);
    expect(credited).toBe(2);
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.attendance);
    await expectBalanceMatchesLedger(memberId);
  });

  it("sin Aura de la app ese día: la asistencia acredita 5", async () => {
    const { memberId, memberToken } = await setupMember();

    const attendanceId = await qrCheckIn(memberId, memberToken);

    expect(await attendanceAward(memberId, attendanceId)).toBe(
      AURA_AMOUNTS.attendance,
    );
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.attendance);
    await expectBalanceMatchesLedger(memberId);
  });

  it("segunda asistencia el mismo día (otra categoría): la primera absorbe la app y la segunda acredita 5", async () => {
    const { memberId, memberToken } = await setupMember();
    await seedAppAura(memberId, "training");

    const first = await qrCheckIn(memberId, memberToken);
    // El check-in forzado no tiene la regla de una por día: es la segunda
    // asistencia del día sin armar una actividad especial.
    const second = await forceCheckIn(memberId);

    expect(await attendanceAward(memberId, first)).toBe(2);
    expect(await attendanceAward(memberId, second)).toBe(
      AURA_AMOUNTS.attendance,
    );
    expect(await balanceOf(memberId)).toBe(
      AURA_AMOUNTS.training + 2 + AURA_AMOUNTS.attendance,
    );
    await expectBalanceMatchesLedger(memberId);
  });

  it("plan a medida primero: la asistencia acredita 2", async () => {
    const { memberId, memberToken } = await setupMember();
    await seedAppAura(memberId, "goalPlan");

    const attendanceId = await qrCheckIn(memberId, memberToken);

    expect(await attendanceAward(memberId, attendanceId)).toBe(
      AURA_AMOUNTS.attendance - AURA_AMOUNTS.goalPlan,
    );
    await expectBalanceMatchesLedger(memberId);
  });

  it("si la app ya cubrió el tope del día (5 o más) la asistencia acredita 0 y no escribe fila", async () => {
    const { memberId, memberToken } = await setupMember();
    // Defensivo: con los montos actuales la app no llega a 5, pero si el ledger
    // tuviera 5 o más de app ese día la asistencia no suma.
    await seedAppAura(memberId, "training", AURA_AMOUNTS.attendance);

    const attendanceId = await qrCheckIn(memberId, memberToken);

    const rows = (await ledger(memberId)).filter(
      (r) => r.sourceType === "attendance",
    );
    expect(rows).toHaveLength(0);
    expect(await attendanceAward(memberId, attendanceId)).toBe(0);
    await expectBalanceMatchesLedger(memberId);
  });

  it("deshacer la asistencia de 2 revierte -2 (no -5) y el día vuelve a valer lo de la app", async () => {
    const { memberId, memberToken } = await setupMember();
    await seedAppAura(memberId, "training");
    const attendanceId = await qrCheckIn(memberId, memberToken);
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.attendance);

    await undo(attendanceId);

    expect(await reversals(memberId)).toEqual([-2]);
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.training);
    await expectBalanceMatchesLedger(memberId);
  });

  it("deshacer una asistencia de 5 revierte -5", async () => {
    const { memberId, memberToken } = await setupMember();
    const attendanceId = await qrCheckIn(memberId, memberToken);
    expect(await attendanceAward(memberId, attendanceId)).toBe(
      AURA_AMOUNTS.attendance,
    );

    await undo(attendanceId);

    expect(await reversals(memberId)).toEqual([-AURA_AMOUNTS.attendance]);
    expect(await balanceOf(memberId)).toBe(0);
    await expectBalanceMatchesLedger(memberId);
  });

  it("deshacer una asistencia que no acreditó nada no revierte nada", async () => {
    const { memberId } = await setupMember();
    await seedAppAura(memberId, "training", AURA_AMOUNTS.attendance);
    const attendanceId = await forceCheckIn(memberId);
    expect(await attendanceAward(memberId, attendanceId)).toBe(0);

    await undo(attendanceId);

    expect(await reversals(memberId)).toEqual([]);
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.attendance);
    const rows = await app.db
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(
          tenantWhere(attendance, TEMPLO_CTX),
          eq(attendance.id, attendanceId),
        ),
      );
    expect(rows).toHaveLength(0);
    await expectBalanceMatchesLedger(memberId);
  });

  it("check-in forzado con app ese día acredita 2 (la fecha UTC del forzado coincide con el día de la app)", async () => {
    const { memberId } = await setupMember();
    await seedAppAura(memberId, "training");

    const attendanceId = await forceCheckIn(memberId);

    expect(await attendanceAward(memberId, attendanceId)).toBe(2);
    await expectBalanceMatchesLedger(memberId);
  });

  it("check-in forzado de noche (22:30 local, ya es mañana en UTC) absorbe la Aura de la app del día local: acredita 2", async () => {
    const { memberId } = await setupMember();
    await seedAppAura(memberId, "training");
    // 22:30 en Argentina del mismo día de la app: en UTC ya es el día siguiente.
    vi.setSystemTime(new Date("2026-03-12T01:30:00Z"));
    try {
      const attendanceId = await forceCheckIn(memberId);

      expect(await attendanceAward(memberId, attendanceId)).toBe(2);
      await expectBalanceMatchesLedger(memberId);
    } finally {
      vi.setSystemTime(new Date(PINNED_NOW));
    }
  });

  it("#16: check-in forzado a las 23:30 hora argentina guarda la fecha local de ese día, no la de UTC", async () => {
    const { memberId } = await setupMember();
    await seedAppAura(memberId, "training");
    // 23:30 AR del 11/03 = 02:30 UTC del 12/03.
    vi.setSystemTime(new Date("2026-03-12T02:30:00Z"));
    try {
      const attendanceId = await forceCheckIn(memberId);

      const [row] = await app.db
        .select({ sessionDate: attendance.sessionDate })
        .from(attendance)
        .where(
          and(
            tenantWhere(attendance, TEMPLO_CTX),
            eq(attendance.id, attendanceId),
          ),
        );
      expect(row.sessionDate).toBe(TODAY);
      // El tope del día lo cruza con el Aura de la app de ese mismo día local.
      expect(await attendanceAward(memberId, attendanceId)).toBe(2);
      await expectBalanceMatchesLedger(memberId);
      // El espejo de sesión presencial lleva el mismo día local.
      const espejo = await app.db
        .select({ date: completedSessions.date })
        .from(completedSessions)
        .where(
          and(
            tenantWhere(completedSessions, TEMPLO_CTX),
            eq(completedSessions.userId, memberId),
            eq(completedSessions.goalPlanType, "presencial"),
          ),
        );
      expect(espejo.map((r) => r.date)).toEqual([TODAY]);
    } finally {
      vi.setSystemTime(new Date(PINNED_NOW));
    }
  });

  it("#16: deshacer de noche un check-in forzado borra el espejo presencial del día local", async () => {
    const { memberId } = await setupMember();
    vi.setSystemTime(new Date("2026-03-12T02:30:00Z"));
    try {
      const attendanceId = await forceCheckIn(memberId);
      await undo(attendanceId);

      const espejo = await app.db
        .select({ id: completedSessions.id })
        .from(completedSessions)
        .where(
          and(
            tenantWhere(completedSessions, TEMPLO_CTX),
            eq(completedSessions.userId, memberId),
            eq(completedSessions.goalPlanType, "presencial"),
          ),
        );
      expect(espejo).toHaveLength(0);
    } finally {
      vi.setSystemTime(new Date(PINNED_NOW));
    }
  });

  it("#16: pasada la medianoche local el forzado cae en el día nuevo", async () => {
    const { memberId } = await setupMember();
    // 00:30 AR del 12/03 = 03:30 UTC del 12/03: los dos días coinciden.
    vi.setSystemTime(new Date("2026-03-12T03:30:00Z"));
    try {
      const attendanceId = await forceCheckIn(memberId);
      const [row] = await app.db
        .select({ sessionDate: attendance.sessionDate })
        .from(attendance)
        .where(
          and(
            tenantWhere(attendance, TEMPLO_CTX),
            eq(attendance.id, attendanceId),
          ),
        );
      expect(row.sessionDate).toBe("2026-03-12");
    } finally {
      vi.setSystemTime(new Date(PINNED_NOW));
    }
  });

  it("check-in del coach con app ese día acredita 2 y deshacerlo revierte -2", async () => {
    const { memberId } = await setupMember();
    await seedAppAura(memberId, "training");

    const attendanceId = await coachCheckIn(memberId);

    expect(await attendanceAward(memberId, attendanceId)).toBe(2);
    await expectBalanceMatchesLedger(memberId);

    await undo(attendanceId);

    expect(await reversals(memberId)).toEqual([-2]);
    expect(await balanceOf(memberId)).toBe(AURA_AMOUNTS.training);
    await expectBalanceMatchesLedger(memberId);
  });
});
