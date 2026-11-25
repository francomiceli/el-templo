/**
 * Horarios muestra el Aura de cada alumno (pedido de Franco, 2026-11-25).
 *
 * Los dos rosters de Horarios traen `aura` por fila:
 *   - vista de hoy/pasado (`GET /api/admin/attendance/slot/:scheduleId/:date`),
 *   - vista futura (`GET /api/admin/scheduling/schedules/:scheduleId/detail`).
 *
 * `aura` es la Aura ganada (misma definición que la app: `earnedAuraByUsers`), null
 * si es 0 o si el gimnasio no tiene `templo-gamification`. Via `app.inject` para
 * ejercitar la serialización (fast-json-stringify descarta lo no declarado).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createTestMember,
  createStaffUser,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { restoreTemploFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  branchToday,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

interface RosterBody {
  members: Array<{ memberId: number; aura?: number | null }>;
}

interface DetailBody {
  bookings: Array<{ memberId: number; aura?: number | null }>;
}

describe("Horarios: Aura de cada alumno en el roster", () => {
  let app: FastifyInstance;
  let coachToken: string;
  let adminToken: string;
  let today: string;
  let auraRef = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await restoreTemploFlags(app);
    today = await branchToday(app, BRANCH_ID);
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const coachEmail = `coach-aura-${suffix}@test.com`;
    await createStaffUser(app, {
      email: coachEmail,
      password: "coachpass123",
      firstName: "Pilar",
      lastName: "Profe",
      role: "coach",
      branchId: BRANCH_ID,
    });
    coachToken = await getAuthToken(app, coachEmail, "coachpass123");
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  async function sembrarAura(
    userId: number,
    amount: number,
    sourceType: "attendance" | "subscription_discount" = "attendance",
  ): Promise<void> {
    auraRef += 1;
    await app.db.insert(schema.auraTransactions).values(
      tenantValues(CTX, {
        userId,
        sourceType,
        amount,
        referenceType:
          sourceType === "attendance" ? "attendance" : "subscription",
        referenceId: auraRef,
      }),
    );
  }

  async function getRoster(token: string, scheduleId: number, date: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/attendance/slot/${scheduleId}/${date}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as RosterBody;
  }

  async function getDetail(token: string, scheduleId: number, date: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/scheduling/schedules/${scheduleId}/detail?date=${date}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as DetailBody;
  }

  it("roster de hoy: el profe ve el Aura ganada de reservados y presentes; 0 viene en null", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const conAura = await createTestMember(app, { branchId: BRANCH_ID });
    const sinAura = await createTestMember(app, { branchId: BRANCH_ID });
    const presente = await createTestMember(app, { branchId: BRANCH_ID });
    await sembrarAura(conAura.id, 120);
    await sembrarAura(conAura.id, 30);
    await sembrarAura(presente.id, 7);
    await insertBooking(app, {
      memberId: conAura.id,
      scheduleId,
      bookingDate: today,
    });
    await insertBooking(app, {
      memberId: sinAura.id,
      scheduleId,
      bookingDate: today,
    });
    await insertAttendance(app, {
      memberId: presente.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: today,
      source: "qr",
    });

    const body = await getRoster(coachToken, scheduleId, today);

    const aura = new Map(body.members.map((m) => [m.memberId, m.aura]));
    expect(aura.get(conAura.id)).toBe(150);
    expect(aura.get(sinAura.id)).toBeNull();
    expect(aura.get(presente.id)).toBe(7);
  });

  it("es Aura ganada: los canjes por descuento no la bajan", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const alumno = await createTestMember(app, { branchId: BRANCH_ID });
    await sembrarAura(alumno.id, 200);
    await sembrarAura(alumno.id, -100, "subscription_discount");
    await insertBooking(app, {
      memberId: alumno.id,
      scheduleId,
      bookingDate: today,
    });

    const body = await getRoster(coachToken, scheduleId, today);

    expect(body.members.find((m) => m.memberId === alumno.id)?.aura).toBe(200);
  });

  it("vista futura (detalle de la clase): cada reserva trae su Aura", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const futuro = dateOffsetStr(7);
    const conAura = await createTestMember(app, { branchId: BRANCH_ID });
    const sinAura = await createTestMember(app, { branchId: BRANCH_ID });
    await sembrarAura(conAura.id, 42);
    await insertBooking(app, {
      memberId: conAura.id,
      scheduleId,
      bookingDate: futuro,
    });
    await insertBooking(app, {
      memberId: sinAura.id,
      scheduleId,
      bookingDate: futuro,
    });

    const body = await getDetail(coachToken, scheduleId, futuro);

    const aura = new Map(body.bookings.map((b) => [b.memberId, b.aura]));
    expect(aura.get(conAura.id)).toBe(42);
    expect(aura.get(sinAura.id)).toBeNull();
  });

  it("el admin también la ve", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const alumno = await createTestMember(app, { branchId: BRANCH_ID });
    await sembrarAura(alumno.id, 15);
    await insertBooking(app, {
      memberId: alumno.id,
      scheduleId,
      bookingDate: today,
    });

    const body = await getRoster(adminToken, scheduleId, today);

    expect(body.members.find((m) => m.memberId === alumno.id)?.aura).toBe(15);
  });

  it("con templo-gamification apagado no viaja el Aura en ninguna de las dos vistas", async () => {
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const futuro = dateOffsetStr(7);
    const alumno = await createTestMember(app, { branchId: BRANCH_ID });
    await sembrarAura(alumno.id, 80);
    await insertBooking(app, {
      memberId: alumno.id,
      scheduleId,
      bookingDate: today,
    });
    await insertBooking(app, {
      memberId: alumno.id,
      scheduleId,
      bookingDate: futuro,
    });
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const roster = await getRoster(coachToken, scheduleId, today);
    const detail = await getDetail(coachToken, scheduleId, futuro);

    expect(
      roster.members.find((m) => m.memberId === alumno.id)?.aura,
    ).toBeNull();
    expect(
      detail.bookings.find((b) => b.memberId === alumno.id)?.aura,
    ).toBeNull();
  });
});
