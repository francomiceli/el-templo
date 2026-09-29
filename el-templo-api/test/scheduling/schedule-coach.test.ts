/**
 * PATCH /admin/scheduling/schedules/:scheduleId/coach — profe propio del
 * horario (2026-09-29, yoga de Moreno).
 *
 * La yoga de Moreno cae dentro del turno de OTRO profe del roster. Un horario
 * puede tener su propio profe (`schedules.coach_user_id`) que pisa al del turno
 * SOLO para ese horario: grilla del app, calificaciones.
 *
 * Cubre:
 *   - éxito como owner: respuesta + fila en DB; la grilla semanal (admin y
 *     member) muestra `coachOverride:true`, el nombre de pila (primera palabra
 *     de first_name) y `coachUserId` solo en ese horario, y los otros horarios
 *     del MISMO turno conservan al profe del roster.
 *   - `null` limpia el override y el horario vuelve a heredar el del turno.
 *   - solo el owner: admin y coach (aun de la sede) → 403, y nada cambia.
 *   - el profe tiene que ser rol 'coach' con acceso a la sede del horario →
 *     400 (coach de otra sede, usuario no-coach, id inexistente).
 *   - 404 con un scheduleId inexistente; 400 con body sin `coachUserId`.
 *   - calificaciones: la elegibilidad (GET /pending) y el submit atribuyen al
 *     profe del horario cuando lo hay (aunque el turno no tenga roster), y al
 *     del roster cuando no.
 *
 * Molde: schedule-time.test.ts (mismo esqueleto) + test/ratings/ratings.test.ts
 * (fixtures de roster/asistencia/calificación).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere, type TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ADMIN_URL = "/api/admin/scheduling";
const MEMBER_WEEKLY_URL = "/api/members/scheduling/weekly";
const RATINGS_URL = "/api/members/ratings";

// `schedules` es tabla strict del sentinel de tenancy: toda lectura directa
// fuera del camino API necesita `tenantWhere`. Archivo single-tenant.
const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

// Lunes de una semana pasada: el roster (change-point efectivo) se siembra una
// semana antes y la grilla lo hereda.
const GRID_WEEK = "2026-03-09";
const ROSTER_WEEK = "2026-03-02";

interface SlotBody {
  id: number;
  coachFirstName: string | null;
  coachOverride: boolean;
  coachUserId: number | null;
  specialLine: string | null;
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/** "YYYY-MM-DD" de hace `daysAgo` días (UTC mediodía). */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

/** Día ISO (1=lun..7=dom). */
function isoDow(dateStr: string): number {
  const day = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lunes ISO de la semana de dateStr. */
function isoMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split("T")[0];
}

/** Último día de clase (lun-sáb): el roster no tiene domingos. */
function lastClassDay(): string {
  for (let back = 0; ; back++) {
    const day = dateDaysAgo(back);
    if (isoDow(day) !== 7) return day;
  }
}

describe("PATCH /admin/scheduling/schedules/:scheduleId/coach", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let branchId: number;
  let otherBranchId: number;

  // Profes: rosterCoach = el del turno (mañana), yogaCoach = el del horario.
  let rosterCoachId: number;
  let yogaCoachId: number;
  let otherBranchCoachId: number;

  // Dos horarios del MISMO turno (mañana) el mismo día: el de yoga y uno normal.
  let yogaSlotId: number;
  let normalSlotId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db.delete(schema.coachRatings);
    await app.db.delete(schema.classCoachAssignments);

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    branchId = branch.id;

    const [other] = await app.db
      .insert(schema.branches)
      .values({
        name: "Otra-Sede-Coach-Test",
        code: nextSuffix("OSC"),
        country: "AR",
        isVirtual: false,
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
      })
      .$returningId();
    otherBranchId = other.id;

    rosterCoachId = await createStaffUser(app, {
      email: "coach-roster-sc@test.com",
      password: "coach-pass-123",
      firstName: "Carlos",
      lastName: "Roster",
      role: "coach",
      branchId,
    });
    yogaCoachId = await createStaffUser(app, {
      email: "coach-yoga-sc@test.com",
      password: "coach-pass-123",
      // Varios nombres: la grilla muestra solo el primero.
      firstName: "Juan Pablo",
      lastName: "Yoga",
      role: "coach",
      branchId,
    });
    otherBranchCoachId = await createStaffUser(app, {
      email: "coach-otra-sede-sc@test.com",
      password: "coach-pass-123",
      firstName: "Olga",
      lastName: "Otra",
      role: "coach",
      branchId: otherBranchId,
    });

    // Turno de mañana del lunes: coach del roster = Carlos.
    await app.db.insert(schema.classCoachAssignments).values({
      branchId,
      weekStartDate: ROSTER_WEEK,
      dayOfWeek: 1,
      slot: "morning",
      coachId: rosterCoachId,
    });

    const yogaSlot = await createActivityAndSchedule(
      "Yoga regenerativo",
      { isSpecial: true, specialLine: "Yoga" },
      "11:00",
      "12:00",
    );
    yogaSlotId = yogaSlot;
    normalSlotId = await createActivityAndSchedule(
      "Calistenia",
      { isSpecial: false },
      "09:00",
      "10:00",
    );
  });

  async function createActivityAndSchedule(
    name: string,
    flags: { isSpecial: boolean; specialLine?: string },
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name, isActive: true, ...flags })
      .$returningId();
    const [sched] = await app.db
      .insert(schema.schedules)
      .values({
        tenantId: TENANT_TEMPLO,
        branchId,
        activityId: activity.id,
        dayOfWeek: 1,
        startTime,
        endTime,
        isActive: true,
      })
      .$returningId();
    return sched.id;
  }

  async function patchCoach(
    scheduleId: number,
    payload: Record<string, unknown>,
    token: string = ownerToken,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "PATCH",
      url: `${ADMIN_URL}/schedules/${scheduleId}/coach`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function dbCoachUserId(scheduleId: number): Promise<number | null> {
    const [row] = await app.db
      .select({ coachUserId: schema.schedules.coachUserId })
      .from(schema.schedules)
      .where(
        and(
          tenantWhere(schema.schedules, TEMPLO_CTX),
          eq(schema.schedules.id, scheduleId),
        ),
      );
    return row?.coachUserId ?? null;
  }

  async function adminGridSlots(): Promise<SlotBody[]> {
    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/schedules/weekly?branchId=${branchId}&weekStart=${GRID_WEEK}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { slots: SlotBody[] }).slots;
  }

  async function memberGridSlots(memberToken: string): Promise<SlotBody[]> {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_WEEKLY_URL}?weekStart=${GRID_WEEK}&branchId=${branchId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { slots: SlotBody[] }).slots;
  }

  // ── Éxito + grilla ──────────────────────────────────────────────────────
  it("owner asigna el profe: respuesta y DB reflejan el cambio, y la grilla (admin + member) lo marca SOLO en ese horario", async () => {
    // Antes: los dos horarios heredan al profe del turno (Carlos).
    for (const s of await adminGridSlots()) {
      expect(s.coachFirstName).toBe("Carlos");
      expect(s.coachOverride).toBe(false);
      expect(s.coachUserId).toBeNull();
    }

    const { statusCode, body } = await patchCoach(yogaSlotId, {
      coachUserId: yogaCoachId,
    });
    expect(statusCode).toBe(200);
    expect(body.id).toBe(yogaSlotId);
    expect(body.coachUserId).toBe(yogaCoachId);
    expect(await dbCoachUserId(yogaSlotId)).toBe(yogaCoachId);
    // El otro horario del turno no se toca.
    expect(await dbCoachUserId(normalSlotId)).toBeNull();

    const member = await registerUser(app, {
      email: "member-grid-sc@test.com",
      password: "member-pass-123",
      branchId,
    });

    for (const slots of [
      await adminGridSlots(),
      await memberGridSlots(member.token),
    ]) {
      const yoga = slots.find((s) => s.id === yogaSlotId);
      const normal = slots.find((s) => s.id === normalSlotId);
      expect(yoga).toBeDefined();
      expect(normal).toBeDefined();

      // Yoga: profe propio, solo la primera palabra de first_name.
      expect(yoga?.coachFirstName).toBe("Juan");
      expect(yoga?.coachOverride).toBe(true);
      expect(yoga?.coachUserId).toBe(yogaCoachId);
      expect(yoga?.specialLine).toBe("Yoga");

      // Mismo turno, otro horario: sigue con el profe del roster.
      expect(normal?.coachFirstName).toBe("Carlos");
      expect(normal?.coachOverride).toBe(false);
      expect(normal?.coachUserId).toBeNull();
    }
  });

  it("null limpia el override y el horario vuelve a heredar al profe del turno", async () => {
    expect(
      (await patchCoach(yogaSlotId, { coachUserId: yogaCoachId })).statusCode,
    ).toBe(200);

    const { statusCode, body } = await patchCoach(yogaSlotId, {
      coachUserId: null,
    });
    expect(statusCode).toBe(200);
    expect(body.coachUserId).toBeNull();
    expect(await dbCoachUserId(yogaSlotId)).toBeNull();

    const yoga = (await adminGridSlots()).find((s) => s.id === yogaSlotId);
    expect(yoga?.coachOverride).toBe(false);
    expect(yoga?.coachUserId).toBeNull();
    expect(yoga?.coachFirstName).toBe("Carlos");

    // Idempotente: limpiar de nuevo un horario sin override sigue siendo 200.
    expect(
      (await patchCoach(yogaSlotId, { coachUserId: null })).statusCode,
    ).toBe(200);
  });

  it("horario con profe propio y turno SIN roster: la grilla muestra al profe del horario", async () => {
    await app.db.delete(schema.classCoachAssignments);
    expect(
      (await patchCoach(yogaSlotId, { coachUserId: yogaCoachId })).statusCode,
    ).toBe(200);

    const slots = await adminGridSlots();
    const yoga = slots.find((s) => s.id === yogaSlotId);
    const normal = slots.find((s) => s.id === normalSlotId);
    expect(yoga?.coachFirstName).toBe("Juan");
    expect(yoga?.coachOverride).toBe(true);
    expect(normal?.coachFirstName).toBeNull();
    expect(normal?.coachOverride).toBe(false);
  });

  // ── Permisos ────────────────────────────────────────────────────────────
  it("solo el owner asigna: admin y coach (aun de la sede) → 403 y nada cambia", async () => {
    await createStaffUser(app, {
      email: "admin-sc@test.com",
      password: "admin-pass-123",
      firstName: "Ada",
      lastName: "Admin",
      role: "admin",
      branchId,
    });
    const adminToken = await getAuthToken(
      app,
      "admin-sc@test.com",
      "admin-pass-123",
    );
    const coachToken = await getAuthToken(
      app,
      "coach-roster-sc@test.com",
      "coach-pass-123",
    );

    for (const token of [adminToken, coachToken]) {
      const { statusCode } = await patchCoach(
        yogaSlotId,
        { coachUserId: yogaCoachId },
        token,
      );
      expect(statusCode).toBe(403);
    }
    expect(await dbCoachUserId(yogaSlotId)).toBeNull();
  });

  // ── Validaciones ────────────────────────────────────────────────────────
  it("un coach de OTRA sede → 400 y nada cambia", async () => {
    const { statusCode, body } = await patchCoach(yogaSlotId, {
      coachUserId: otherBranchCoachId,
    });
    expect(statusCode).toBe(400);
    expect(String(body.message)).toMatch(/no pertenece a esta sucursal/i);
    expect(await dbCoachUserId(yogaSlotId)).toBeNull();
  });

  it("un usuario que NO es coach (member) o un id inexistente → 400", async () => {
    const member = await registerUser(app, {
      email: "member-notcoach-sc@test.com",
      password: "member-pass-123",
      branchId,
    });
    const memberId = (member.user as { id: number }).id;

    expect(
      (await patchCoach(yogaSlotId, { coachUserId: memberId })).statusCode,
    ).toBe(400);
    expect(
      (await patchCoach(yogaSlotId, { coachUserId: 99999999 })).statusCode,
    ).toBe(400);
    expect(await dbCoachUserId(yogaSlotId)).toBeNull();
  });

  it("scheduleId inexistente → 404; body sin coachUserId → 400", async () => {
    expect(
      (await patchCoach(99999999, { coachUserId: yogaCoachId })).statusCode,
    ).toBe(404);
    expect((await patchCoach(yogaSlotId, {})).statusCode).toBe(400);
  });

  // ── Calificaciones ──────────────────────────────────────────────────────
  describe("atribución de calificaciones", () => {
    let memberId: number;
    let memberToken: string;
    let sessionDate: string;

    beforeEach(async () => {
      const reg = await registerUser(app, {
        email: "member-rating-sc@test.com",
        password: "member-pass-123",
        branchId,
      });
      memberId = (reg.user as { id: number }).id;
      memberToken = reg.token;

      sessionDate = lastClassDay();
      // El roster se resuelve por el día de la fecha de la clase (no por el
      // dayOfWeek del horario): se siembra el change-point para ese día.
      await app.db.delete(schema.classCoachAssignments);
      await app.db.insert(schema.classCoachAssignments).values({
        branchId,
        weekStartDate: isoMonday(dateDaysAgo(21)),
        dayOfWeek: isoDow(sessionDate),
        slot: "morning",
        coachId: rosterCoachId,
      });
    });

    async function attend(scheduleId: number): Promise<void> {
      await app.db.insert(schema.attendance).values({
        memberId,
        branchId,
        scheduleId,
        sessionDate,
        status: "confirmado",
        source: "qr",
        checkedInAt: new Date(),
      });
    }

    async function submitRating(scheduleId: number): Promise<number> {
      const res = await app.inject({
        method: "POST",
        url: RATINGS_URL,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { sessionDate, scheduleId, stars: 5, classStars: 4 },
      });
      return res.statusCode;
    }

    async function ratedCoachId(scheduleId: number): Promise<number | null> {
      const rows = await app.db
        .select({ coachId: schema.coachRatings.coachId })
        .from(schema.coachRatings)
        .where(
          and(
            eq(schema.coachRatings.memberId, memberId),
            eq(schema.coachRatings.scheduleId, scheduleId),
          ),
        );
      expect(rows.length).toBeLessThanOrEqual(1);
      return rows[0]?.coachId ?? null;
    }

    it("la calificación de la clase de yoga va al profe del horario, no al del turno", async () => {
      expect(
        (await patchCoach(yogaSlotId, { coachUserId: yogaCoachId }))
          .statusCode,
      ).toBe(200);
      await attend(yogaSlotId);

      expect(await submitRating(yogaSlotId)).toBe(201);
      expect(await ratedCoachId(yogaSlotId)).toBe(yogaCoachId);
    });

    it("otro horario del mismo turno SIN override sigue atribuyéndose al profe del roster", async () => {
      expect(
        (await patchCoach(yogaSlotId, { coachUserId: yogaCoachId }))
          .statusCode,
      ).toBe(200);
      await attend(normalSlotId);

      expect(await submitRating(normalSlotId)).toBe(201);
      expect(await ratedCoachId(normalSlotId)).toBe(rosterCoachId);
    });

    it("al limpiar el override (null) la atribución vuelve al profe del roster", async () => {
      await patchCoach(yogaSlotId, { coachUserId: yogaCoachId });
      await patchCoach(yogaSlotId, { coachUserId: null });
      await attend(yogaSlotId);

      expect(await submitRating(yogaSlotId)).toBe(201);
      expect(await ratedCoachId(yogaSlotId)).toBe(rosterCoachId);
    });

    it("con profe propio la clase es puntuable aunque el turno NO tenga roster (pending + submit)", async () => {
      await app.db.delete(schema.classCoachAssignments);
      await attend(yogaSlotId);

      // Sin roster ni override: no hay profe → nada para puntuar.
      const before = await app.inject({
        method: "GET",
        url: `${RATINGS_URL}/pending`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(JSON.parse(before.body)).toBeNull();

      await patchCoach(yogaSlotId, { coachUserId: yogaCoachId });

      const after = await app.inject({
        method: "GET",
        url: `${RATINGS_URL}/pending`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(after.statusCode).toBe(200);
      const pending = JSON.parse(after.body) as { scheduleId: number } | null;
      expect(pending?.scheduleId).toBe(yogaSlotId);

      expect(await submitRating(yogaSlotId)).toBe(201);
      expect(await ratedCoachId(yogaSlotId)).toBe(yogaCoachId);
    });
  });
});
