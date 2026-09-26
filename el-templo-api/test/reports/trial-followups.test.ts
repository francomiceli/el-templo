/**
 * Cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26) —
 * integration tests del PATCH de followup y las franjas por sede.
 *
 *   PATCH /api/admin/reports/trial-sessions/:bookingId/followup
 *   GET   /api/admin/reports/trial-sessions/shifts
 *   PUT   /api/admin/reports/trial-sessions/shifts/:branchId
 *
 * El motor puro (turnos, ventanas, KPIs) está cubierto exhaustivamente en
 * `test/reports/trial-cadence.test.ts` — acá se cubren los GUARDRAILS del
 * endpoint (409 con `code` estable), el alcance de sede/país (404 fail-closed
 * fuera de scope), la reutilización del PATCH de leads para "Perdida", el
 * sellado de `trial_followup_started_at`, y las franjas por sede
 * (owner/admin only + validación de rango).
 *
 * Fechas: bookings ±7 días de "hoy" (sin fake timers) para que "clase
 * terminada" / "clase futura" sean inequívocos en cualquier huso horario.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";

const REPORTS_URL = "/api/admin/reports";
const TEMPLO_CTX = { tenantId: 1 };

interface Ctx {
  app: FastifyInstance;
  ownerToken: string;
  gestionToken: string;
  arBranchId: number;
  esBranchId: number;
  activityId: number;
  scheduleMorning: number; // 08:00-09:00
}

const ctx = {} as Ctx;

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextCode(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${t}${r}`;
}

async function seedBranches(): Promise<void> {
  const [ar] = await ctx.app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "TEST"));
  ctx.arBranchId = ar.id;

  const [esRow] = await ctx.app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "ES-TF-114"));
  if (esRow) {
    ctx.esBranchId = esRow.id;
  } else {
    const [esIns] = await ctx.app.db
      .insert(schema.branches)
      .values({
        name: "ES Madrid TF",
        code: "ES-TF-114",
        country: "ES",
        isVirtual: false,
        isActive: true,
      })
      .$returningId();
    ctx.esBranchId = esIns.id;
  }
}

async function seedActivityAndSchedule(): Promise<void> {
  const [act] = await ctx.app.db
    .insert(schema.activities)
    .values({ name: "Calistenia TF", description: "trial followup test" })
    .$returningId();
  ctx.activityId = act.id;

  const [sm] = await ctx.app.db
    .insert(schema.schedules)
    .values({
      branchId: ctx.arBranchId,
      activityId: ctx.activityId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
    })
    .$returningId();
  ctx.scheduleMorning = sm.id;
}

interface SeedLeadOpts {
  firstName: string;
  branchId?: number;
  leadStatus?: "en_seguimiento" | "ganado" | "perdido" | null;
}

async function seedLead(opts: SeedLeadOpts): Promise<number> {
  const phone = `+549115${Date.now().toString().slice(-7)}`;
  const dni = `TF${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [u] = await ctx.app.db
    .insert(schema.users)
    .values({
      email: `tf-lead-${nextCode("L")}@test.local`,
      passwordHash: "$argon2id$dummy",
      firstName: opts.firstName,
      lastName: "Lead",
      role: "member",
      branchId: opts.branchId ?? ctx.arBranchId,
      phone,
      dni,
      status: "prueba",
      leadStatus: opts.leadStatus ?? "en_seguimiento",
    })
    .$returningId();
  return u.id;
}

interface SeedBookingOpts {
  userId: number;
  scheduleId?: number;
  bookingDateOffsetDays: number;
  withAttendance?: boolean;
  branchId?: number;
}

async function seedBooking(opts: SeedBookingOpts): Promise<number> {
  const date = dateOffset(opts.bookingDateOffsetDays);
  const scheduleId = opts.scheduleId ?? ctx.scheduleMorning;
  const [b] = await ctx.app.db
    .insert(schema.bookings)
    .values({
      memberId: opts.userId,
      scheduleId,
      bookingDate: date,
      status: "reservado",
      isTrial: true,
    })
    .$returningId();

  if (opts.withAttendance) {
    await ctx.app.db.insert(schema.attendance).values({
      memberId: opts.userId,
      branchId: opts.branchId ?? ctx.arBranchId,
      scheduleId,
      sessionDate: date,
      status: "confirmado",
      source: "manual",
    });
  }
  return b.id;
}

async function followupUpdate(
  token: string,
  bookingId: number,
  body: unknown,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await ctx.app.inject({
    method: "PATCH",
    url: `${REPORTS_URL}/trial-sessions/${bookingId}/followup`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function leadStatusOf(userId: number): Promise<{
  leadStatus: string | null;
  leadStatusSource: string | null;
  trialFollowupStartedAt: Date | null;
}> {
  const [row] = await ctx.app.db
    .select({
      leadStatus: schema.users.leadStatus,
      leadStatusSource: schema.users.leadStatusSource,
      trialFollowupStartedAt: schema.users.trialFollowupStartedAt,
    })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
    );
  return row;
}

describe("Cadencia de mensajes en Sesiones de Prueba — followup + franjas (2026-09-26)", () => {
  beforeAll(async () => {
    ctx.app = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(ctx.app);
    await seedBranches();
    await seedActivityAndSchedule();
    ctx.ownerToken = await getAuthToken(
      ctx.app,
      "admin@test.com",
      "adminpass123",
    );
    const gestionEmail = `gestion-tf-${nextCode("G")}@test.local`;
    await createStaffUser(ctx.app, {
      email: gestionEmail,
      password: "pass123456",
      firstName: "Gestion",
      lastName: "TF",
      role: "gestion",
      branchId: ctx.arBranchId,
      country: "AR",
    });
    ctx.gestionToken = await getAuthToken(ctx.app, gestionEmail, "pass123456");
  });

  // ─── mark_sent / unmark_sent ────────────────────────────────────────────

  it("marca M1 en una sesión futura y sella trial_followup_started_at", async () => {
    const userId = await seedLead({ firstName: "Futura" });
    const bookingId = await seedBooking({ userId, bookingDateOffsetDays: 7 });

    const { statusCode, body } = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M1" },
    });
    expect(statusCode).toBe(200);
    expect(body.followup).toMatchObject({
      lastMessage: { code: "M1" },
    });
    expect(body.sessionStatus).toBe("agendada");

    const lead = await leadStatusOf(userId);
    expect(lead.trialFollowupStartedAt).not.toBeNull();
  });

  it("409 M2_BEFORE_CLASS_END al marcar M2 antes de que termine la clase", async () => {
    const userId = await seedLead({ firstName: "SinTerminar" });
    const bookingId = await seedBooking({ userId, bookingDateOffsetDays: 7 });

    const { statusCode, body } = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });
    expect(statusCode).toBe(409);
    expect(body.code).toBe("M2_BEFORE_CLASS_END");
  });

  it("409 ATTENDANCE_MISMATCH al marcar M2a en una sesión que No asistió", async () => {
    const userId = await seedLead({ firstName: "Ausente" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });

    const { statusCode, body } = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });
    expect(statusCode).toBe(409);
    expect(body.code).toBe("ATTENDANCE_MISMATCH");

    // M2b (la rama correcta) sí funciona.
    const okRes = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2b" },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body.followup).toMatchObject({
      m2Kind: "reagenda",
      lastMessage: { code: "M2b" },
    });
  });

  it("409 M3_WITHOUT_M2 al marcar M3 sin M2 registrado", async () => {
    const userId = await seedLead({ firstName: "SaltaM2" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });

    const { statusCode, body } = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M3a" },
    });
    expect(statusCode).toBe(409);
    expect(body.code).toBe("M3_WITHOUT_M2");
  });

  it("marca M2a → M3a en cadena feliz (Asistió, sin respuesta)", async () => {
    const userId = await seedLead({ firstName: "Feliz" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });

    const m2 = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });
    expect(m2.statusCode).toBe(200);

    const m3 = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M3a" },
    });
    expect(m3.statusCode).toBe(200);
    expect(m3.body.followup).toMatchObject({ lastMessage: { code: "M3a" } });
    expect(m3.body.nextAction).toBeNull(); // tras M3 → sin próxima acción.
  });

  it("409 ALREADY_RESPONDED al intentar M3 después de marcar Respondió", async () => {
    const userId = await seedLead({ firstName: "Respondio" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });
    const responded = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "responded", value: true },
    });
    expect(responded.statusCode).toBe(200);
    expect(responded.body.followup).toMatchObject({ respondedAt: expect.any(String) });
    expect(responded.body.nextAction).toBeNull();

    const m3 = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M3a" },
    });
    expect(m3.statusCode).toBe(409);
    expect(m3.body.code).toBe("ALREADY_RESPONDED");
  });

  it("unmark_sent: 409 CANNOT_UNMARK si el siguiente mensaje ya se envió", async () => {
    const userId = await seedLead({ firstName: "Encadenado" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M1" },
    });
    await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });

    const undoM1 = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "unmark_sent", code: "M1" },
    });
    expect(undoM1.statusCode).toBe(409);
    expect(undoM1.body.code).toBe("CANNOT_UNMARK");

    // Deshacer M2 (el último) SÍ funciona.
    const undoM2 = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "unmark_sent", code: "M2a" },
    });
    expect(undoM2.statusCode).toBe(200);
    expect(undoM2.body.followup.lastMessage).toMatchObject({ code: "M1" });
  });

  // ─── Perdida manual (reusa el PATCH de leads) ───────────────────────────

  it('acción "lost" marca perdido reusando la lógica de leads (motivo+nota persistidos)', async () => {
    const userId = await seedLead({ firstName: "Perdido" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });
    await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2b" },
    });

    const lost = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "lost", reason: "precio", note: "Dijo que es caro" },
    });
    expect(lost.statusCode).toBe(200);
    expect(lost.body.sessionStatus).toBe("perdida");
    expect(lost.body.followup).toMatchObject({
      lostReason: "precio",
      lostNote: "Dijo que es caro",
    });

    const lead = await leadStatusOf(userId);
    expect(lead.leadStatus).toBe("perdido");
    expect(lead.leadStatusSource).toBe("manual");
  });

  // ─── Cierre de rama ─────────────────────────────────────────────────────

  it("409 SESSION_CLOSED al intentar marcar sobre una sesión Ganada", async () => {
    const userId = await seedLead({
      firstName: "Ganada",
      leadStatus: "ganado",
    });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });

    const { statusCode, body } = await followupUpdate(ctx.ownerToken, bookingId, {
      action: { type: "mark_sent", code: "M2a" },
    });
    expect(statusCode).toBe(409);
    expect(body.code).toBe("SESSION_CLOSED");
  });

  // ─── Alcance de sede/país (404 fail-closed) ─────────────────────────────

  it("404 al intentar marcar una sesión de otro país (admin sin alcance forzado)", async () => {
    const userId = await seedLead({
      firstName: "DeES",
      branchId: ctx.esBranchId,
    });
    const scheduleEs = (
      await ctx.app.db
        .insert(schema.schedules)
        .values({
          branchId: ctx.esBranchId,
          activityId: ctx.activityId,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        })
        .$returningId()
    )[0].id;
    const bookingId = await seedBooking({
      userId,
      scheduleId: scheduleEs,
      bookingDateOffsetDays: 7,
      branchId: ctx.esBranchId,
    });

    const adminArId = await createStaffUser(ctx.app, {
      email: `admin-ar-tf-${Date.now()}@test.local`,
      password: "pass123456",
      firstName: "AdminAR",
      lastName: "TF",
      role: "admin",
      branchId: ctx.arBranchId,
      country: "AR",
    });
    const [row] = await ctx.app.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, adminArId));
    const adminArToken = await getAuthToken(
      ctx.app,
      row.email as string,
      "pass123456",
    );

    const { statusCode } = await followupUpdate(adminArToken, bookingId, {
      action: { type: "mark_sent", code: "M1" },
    });
    expect(statusCode).toBe(404);
  });

  it("404 al intentar marcar un bookingId inexistente", async () => {
    const { statusCode } = await followupUpdate(ctx.ownerToken, 99999999, {
      action: { type: "mark_sent", code: "M1" },
    });
    expect(statusCode).toBe(404);
  });

  // ─── Franjas por sede ───────────────────────────────────────────────────

  it("GET /trial-sessions/shifts trae las 4 franjas por defecto de la sede", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions/shifts`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as Array<{
      branchId: number;
      morningStart: string;
      morningEnd: string;
      afternoonStart: string;
      afternoonEnd: string;
    }>;
    const ar = rows.find((r) => r.branchId === ctx.arBranchId);
    expect(ar).toMatchObject({
      morningStart: "07:00:00",
      morningEnd: "11:00:00",
      afternoonStart: "17:00:00",
      afternoonEnd: "21:00:00",
    });
  });

  it("PUT /trial-sessions/shifts/:branchId actualiza y valida inicio<fin y mañana<tarde", async () => {
    const ok = await ctx.app.inject({
      method: "PUT",
      url: `${REPORTS_URL}/trial-sessions/shifts/${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { morningStart: "08:00", morningEnd: "12:00" },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toMatchObject({
      morningStart: "08:00:00",
      morningEnd: "12:00:00",
    });

    const badRange = await ctx.app.inject({
      method: "PUT",
      url: `${REPORTS_URL}/trial-sessions/shifts/${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { morningStart: "12:00", morningEnd: "08:00" },
    });
    expect(badRange.statusCode).toBe(400);

    const overlap = await ctx.app.inject({
      method: "PUT",
      url: `${REPORTS_URL}/trial-sessions/shifts/${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { morningEnd: "18:00" }, // pisa el inicio de tarde (17:00)
    });
    expect(overlap.statusCode).toBe(400);
  });

  it("shifts: 403 para un rol no-admin (gestion) en GET y PUT", async () => {
    const getRes = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions/shifts`,
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
    });
    expect(getRes.statusCode).toBe(403);

    const putRes = await ctx.app.inject({
      method: "PUT",
      url: `${REPORTS_URL}/trial-sessions/shifts/${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.gestionToken}` },
      payload: { morningStart: "08:00" },
    });
    expect(putRes.statusCode).toBe(403);
  });

  it("PUT shifts: 404 para una sede inexistente", async () => {
    const res = await ctx.app.inject({
      method: "PUT",
      url: `${REPORTS_URL}/trial-sessions/shifts/999999`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
      payload: { morningStart: "08:00" },
    });
    expect(res.statusCode).toBe(404);
  });
});
