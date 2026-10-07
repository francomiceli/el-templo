/**
 * Fase 194 Plan 09 (SC-1, D-14, D-03) — uso real de los accesos de invitación:
 * reserva y check-in con la sub que deja `InvitationService.activate`.
 *
 * Sin cambios de código de producción: reservas por HTTP (`/api/members/scheduling/reserve`)
 * y check-in por QR / forzado por staff, con un invitado logueable (registro real).
 *
 * RELOJ: se fija solo `Date` (vi.useFakeTimers toFake:['Date']) en "hoy 10:00 hora
 * Buenos Aires" para que la clase de las 10:10 sea reservable (corte: 5 min antes)
 * y entre en la ventana de check-in (±20 min) sin depender de la hora real de la
 * corrida. Los timers y el I/O quedan reales. Todas las fechas salen de `todayInTz`.
 *
 * Sobre el no-show: NO existe un job de no-show que descuente saldo — el saldo baja
 * solo en el check-in (QR, coach o forzado) — así que no hay nada que invocar; ver
 * el caso de reservas pendientes (Pitfall 10, 194-06) para el otro lado.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { activeMemberExists } from "../../src/modules/shared/active-member";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { InvitationService } from "../../src/modules/referrals/invitation-service";
import {
  buildInvitationServices,
  createInviterWithCode,
  createTrialPlan,
  ensurePhysicalBranch,
  ensureVirtualBranch,
  fixtureCtx,
  resetInvitationSettings,
  uniquePhone10,
  type InvitationsFixtureCtx,
} from "./_helpers";

const RESERVE_URL = "/api/members/scheduling/reserve";
const CHECK_IN_URL = "/api/members/attendance/check-in";
const FORCE_URL = "/api/admin/attendance/force";
const AR_TZ = "America/Argentina/Buenos_Aires";

describe("Fase 194 SC-1 / D-14 — uso de los accesos de invitación (reserva y check-in)", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let service: InvitationService;
  let adminToken: string;

  let branchA: { id: number; timezone: string };
  let branchB: { id: number; timezone: string };
  let branchEs: { id: number; timezone: string };
  // Horario de las 10:10 por día ISO (1=lunes..7=domingo) y sede.
  const scheduleByBranch = new Map<number, Map<number, number>>();
  let arToday: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    service = buildInvitationServices(app).invitationService;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await resetInvitationSettings(ctx);
    // Reloj fijo ANTES de loguear: tokens, activación y reservas ven el mismo "ahora".
    arToday = todayInTz(AR_TZ);
    vi.useFakeTimers({ toFake: ["Date"] });
    setDay(0);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    branchA = await ensurePhysicalBranch(ctx, "AR");
    branchB = await secondArBranch(branchA.id);
    branchEs = await ensurePhysicalBranch(ctx, "ES");
    await createTrialPlan(ctx, { country: "AR" });
    await createTrialPlan(ctx, { country: "ES" });

    scheduleByBranch.clear();
    for (const b of [branchA, branchB, branchEs]) {
      await seedSchedules(b.id);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── fixtures ──────────────────────────────────────────────────────────

  /** Día `n` desde hoy (calendario de Buenos Aires), a las 10:00 locales (13:00Z). */
  function setDay(n: number): void {
    vi.setSystemTime(new Date(`${addDays(arToday, n)}T13:00:00Z`));
  }

  async function secondArBranch(
    excludeId: number,
  ): Promise<{ id: number; timezone: string }> {
    const rows = await app.db
      .select({ id: schema.branches.id, timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx.tenant),
          eq(schema.branches.country, "AR"),
          eq(schema.branches.isVirtual, false),
          eq(schema.branches.isActive, true),
        ),
      )
      .orderBy(schema.branches.id);
    const other = rows.find((r) => r.id !== excludeId);
    if (other) return other;
    const code = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const [created] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(ctx.tenant, {
          name: `Sede AR extra ${code}`,
          code: code.slice(0, 20),
          country: "AR" as const,
          timezone: AR_TZ,
        }),
      )
      .$returningId();
    return { id: created.id, timezone: AR_TZ };
  }

  async function seedSchedules(branchId: number): Promise<void> {
    const [act] = await app.db
      .insert(schema.activities)
      .values(tenantValues(ctx.tenant, { name: "Acceso 194", branchId }))
      .$returningId();
    const byDow = new Map<number, number>();
    for (let dow = 1; dow <= 7; dow++) {
      const [sch] = await app.db
        .insert(schema.schedules)
        .values(
          tenantValues(ctx.tenant, {
            activityId: act.id,
            branchId,
            dayOfWeek: dow,
            startTime: "10:10",
            endTime: "11:10",
            isActive: true,
          }),
        )
        .$returningId();
      byDow.set(dow, sch.id);
    }
    scheduleByBranch.set(branchId, byDow);
  }

  function scheduleFor(branchId: number, date: string): number {
    const jsDay = new Date(`${date}T12:00:00Z`).getUTCDay();
    const id = scheduleByBranch.get(branchId)?.get(jsDay === 0 ? 7 : jsDay);
    if (id === undefined) throw new Error(`sin horario ${branchId} ${date}`);
    return id;
  }

  /** Invitado logueable activado en la sede A (registro real en la sede virtual). */
  async function activatedInvitee(branchId: number = branchA.id): Promise<{
    userId: number;
    token: string;
    subscriptionId: number;
    invitationId: number;
    accessExpiresOn: string;
  }> {
    const inviter = await createInviterWithCode(ctx);
    const virtual = await ensureVirtualBranch(ctx);
    const email = `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@test.com`;
    const reg = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: virtual.id,
    });
    const userId = (reg.user as { id: number }).id;
    const result = await service.activate(ctx.tenant, {
      channel: "self_service",
      code: inviter.code,
      invitedUserId: userId,
      branchId,
      phone: uniquePhone10(),
      createdBy: null,
    });
    const token = await getAuthToken(app, email, "pass123456");
    return {
      userId,
      token,
      subscriptionId: result.subscriptionId,
      invitationId: result.invitationId,
      accessExpiresOn: result.accessExpiresOn,
    };
  }

  async function reserve(token: string, branchId: number, date: string) {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId: scheduleFor(branchId, date), date },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function checkInQr(token: string, branchId: number) {
    const res = await app.inject({
      method: "POST",
      url: CHECK_IN_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { qrToken: generateQrToken(branchId) },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function readSub(id: number) {
    const [row] = await app.db
      .select({
        classesRemaining: schema.subscriptions.classesRemaining,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, id),
        ),
      );
    if (!row) throw new Error(`sub ${id} no existe`);
    return row;
  }

  async function userStatus(userId: number) {
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
      );
    return row?.status;
  }

  /** ¿Lo cuenta el predicado canónico de "socio activo" (analytics / SEPA)? */
  async function countsAsActiveMember(userId: number): Promise<boolean> {
    const rows = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, userId),
          activeMemberExists(schema.users.id, ctx.tenant),
        ),
      );
    return rows.length > 0;
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("activado en la sede A: reserva en la sede B (mismo país), check-in QR en B y el saldo baja a 2, siempre en prueba", async () => {
    const inv = await activatedInvitee(branchA.id);
    expect(await userStatus(inv.userId)).toBe("prueba");

    const booking = await reserve(inv.token, branchB.id, arToday);
    expect(booking.statusCode).toBe(201);

    const checkIn = await checkInQr(inv.token, branchB.id);
    expect(checkIn.statusCode).toBe(201);
    expect(checkIn.body.status).toBe("confirmado");
    expect(checkIn.body.branchId).toBe(branchB.id);

    expect((await readSub(inv.subscriptionId)).classesRemaining).toBe(2);
    // D-03 en vivo: usar los accesos no lo convierte en socio.
    expect(await userStatus(inv.userId)).toBe("prueba");
    expect(await countsAsActiveMember(inv.userId)).toBe(false);
  });

  it("sede de otro país: la reserva se rechaza por el guard de país existente", async () => {
    const inv = await activatedInvitee(branchA.id);

    // Mañana: hoy 10:10 en Madrid ya pasó con el reloj fijado, y ese corte
    // corre antes que el guard de país.
    const res = await reserve(inv.token, branchEs.id, addDays(arToday, 1));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("otro pais");
    expect(await userStatus(inv.userId)).toBe("prueba");
  });

  it("tras 3 check-ins (3 días distintos, 3 sedes) la 4.ª reserva se rechaza y el saldo queda en 0", async () => {
    const inv = await activatedInvitee(branchA.id);
    const branches = [branchA.id, branchB.id, branchA.id];

    for (let day = 0; day < 3; day++) {
      setDay(day);
      const date = addDays(arToday, day);
      expect((await reserve(inv.token, branches[day], date)).statusCode).toBe(
        201,
      );
      expect((await checkInQr(inv.token, branches[day])).statusCode).toBe(201);
      expect(await userStatus(inv.userId)).toBe("prueba");
    }
    expect((await readSub(inv.subscriptionId)).classesRemaining).toBe(0);

    setDay(3);
    const fourth = await reserve(inv.token, branchA.id, addDays(arToday, 3));
    expect(fourth.statusCode).toBe(400);
    // Cupo semanal (3/3) o saldo agotado: cualquiera de los dos topes la frena.
    expect(fourth.body.message).toMatch(/limite semanal|Agotaste/);
    expect(await countsAsActiveMember(inv.userId)).toBe(false);
  });

  it("tras el vencimiento no puede reservar clases posteriores (cobertura de acceso intacta)", async () => {
    const inv = await activatedInvitee(branchA.id);
    // La ventana real de 10 días hábiles (~11 días corridos) excede los +2 días
    // en que se puede reservar: se acorta el vencimiento a hoy+1 para ejercitar el corte.
    await app.db
      .update(schema.subscriptions)
      .set({ endDate: addDays(arToday, 1) })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, inv.subscriptionId),
        ),
      );

    const afterEnd = await reserve(inv.token, branchA.id, addDays(arToday, 2));
    expect(afterEnd.statusCode).toBe(400);
    expect(afterEnd.body.message).toContain("renovar tu membresía");

    // El borde: el último día de vigencia todavía se puede usar.
    const lastDay = await reserve(inv.token, branchA.id, addDays(arToday, 1));
    expect(lastDay.statusCode).toBe(201);
  });

  it("dentro de la vigencia real sí puede reservar hasta la ventana de +2 días", async () => {
    const inv = await activatedInvitee(branchA.id);
    // accessExpiresOn está ~11 días adelante: el +2 de la ventana de reservas manda.
    expect(inv.accessExpiresOn > addDays(arToday, 2)).toBe(true);

    const inWindow = await reserve(inv.token, branchB.id, addDays(arToday, 2));
    expect(inWindow.statusCode).toBe(201);
    const outOfWindow = await reserve(
      inv.token,
      branchB.id,
      addDays(arToday, 3),
    );
    expect(outOfWindow.statusCode).toBe(400);
  });

  it("check-in forzado por staff en otra sede del país también descuenta del saldo", async () => {
    const inv = await activatedInvitee(branchA.id);

    const res = await app.inject({
      method: "POST",
      url: FORCE_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        memberId: inv.userId,
        branchId: branchB.id,
        reason: "Test 194-09",
      },
    });

    expect(res.statusCode).toBe(201);
    expect((await readSub(inv.subscriptionId)).classesRemaining).toBe(2);
    expect(await userStatus(inv.userId)).toBe("prueba");
  });

  it("invitado en la sede de España: reserva en una sede de AR rechazada (país de la sub)", async () => {
    const inv = await activatedInvitee(branchEs.id);

    const res = await reserve(inv.token, branchA.id, addDays(arToday, 1));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("otro pais");
  });
});
