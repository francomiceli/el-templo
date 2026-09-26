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
 *
 * `trials.cadence_start_date`: `cleanAllTestData` vacía `system_settings`
 * SIN filtro (helpers.ts TABLES_TO_CLEAN) antes de CADA test, así que la
 * semilla `CURDATE()` de la migración 0241 nunca sobrevive hasta acá — sin
 * reseed, `getCadenceStartDate()` devuelve `null` ("sin corte") y las
 * aserciones de `nextAction===null` tras M3/Respondió ya prueban lo correcto
 * (el cierre de rama, no un corte de fecha trivial). Igual se resiembra acá
 * a una fecha vieja fija, defensivo: no depende de esa mecánica de limpieza
 * ni dejar pasar un futuro cambio de orden de hooks sin que se note (ver
 * también el test dedicado de "corte go-live" más abajo, que sí ejercita el
 * corte de verdad).
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
import { normalizePhoneE164 } from "../../src/modules/shared/phone";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const REPORTS_URL = "/api/admin/reports";
const TEMPLO_CTX = { tenantId: 1 };
const OLD_CADENCE_START_DATE = "2000-01-01";

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

/** `trials.cadence_start_date` — ver el docblock del archivo. */
async function seedCadenceStartDate(dateStr: string): Promise<void> {
  await ctx.app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: "trials.cadence_start_date",
      settingValue: dateStr,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: dateStr } });
}

/**
 * Reagenda: vincula `newBookingId` como sucesor de `oldBookingId` insertando
 * directamente en `trial_followups` (sin pasar por el endpoint de reagenda —
 * ese flujo ya está cubierto en `test/scheduling/reschedule-trial.test.ts`).
 * Alcanza para que `buildTrialSessionRows` derive `oldBookingId` como
 * "Reagendada" con `rescheduledTo` y `newBookingId` con `rescheduledFrom`.
 */
async function linkReschedule(
  oldBookingId: number,
  newBookingId: number,
): Promise<void> {
  await ctx.app.db.insert(schema.trialFollowups).values({
    tenantId: TEMPLO_CTX.tenantId,
    bookingId: newBookingId,
    rescheduledFromBookingId: oldBookingId,
  });
}

async function getReport(
  token: string,
  query = "",
): Promise<{
  statusCode: number;
  body: {
    rows: Array<Record<string, unknown>>;
    total: number;
    kpis: Record<string, unknown>;
  };
}> {
  const res = await ctx.app.inject({
    method: "GET",
    url: `${REPORTS_URL}/trial-sessions${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function followupUpdate(
  token: string,
  bookingId: number,
  body: Record<string, unknown>,
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
    // Defensivo: solo el test de aislamiento de tenant siembra el gimnasio 2,
    // pero la DB la comparten los archivos del worker — limpiarlo siempre acá
    // evita ensuciar el siguiente archivo si ese test corrió.
    await limpiarSegundoGimnasio(ctx.app);
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
    await seedCadenceStartDate(OLD_CADENCE_START_DATE);
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
    expect(
      (undoM2.body.followup as { lastMessage: unknown }).lastMessage,
    ).toMatchObject({ code: "M1" });
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

  // ─── GET /trial-sessions — nextAction / sessionStatus / kpis / filtros ──

  it("nextAction trae el código correcto por rama (Asistió → M2a, No asistió → M2b)", async () => {
    const attendedUser = await seedLead({ firstName: "RamaAsistio" });
    const attendedBooking = await seedBooking({
      userId: attendedUser,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    const absentUser = await seedLead({ firstName: "RamaNoAsistio" });
    const absentBooking = await seedBooking({
      userId: absentUser,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });

    const { statusCode, body } = await getReport(ctx.ownerToken);
    expect(statusCode).toBe(200);

    const attendedRow = body.rows.find((r) => r.bookingId === attendedBooking);
    const absentRow = body.rows.find((r) => r.bookingId === absentBooking);
    expect(attendedRow?.sessionStatus).toBe("asistio");
    expect((attendedRow?.nextAction as { code: string }).code).toBe("M2a");
    expect((attendedRow?.nextAction as { status: string }).status).toBe(
      "overdue",
    ); // clase terminó hace 7 días, turno de esa fecha ya cerró hace rato.

    expect(absentRow?.sessionStatus).toBe("no_asistio");
    expect((absentRow?.nextAction as { code: string }).code).toBe("M2b");
    expect((absentRow?.nextAction as { status: string }).status).toBe(
      "overdue",
    );
  });

  it("sessionStatus cubre agendada/asistio/no_asistio/ganada/perdida", async () => {
    const agendadaUser = await seedLead({ firstName: "Agendada" });
    const agendadaBooking = await seedBooking({
      userId: agendadaUser,
      bookingDateOffsetDays: 7,
    });
    const asistioUser = await seedLead({ firstName: "AsistioEstado" });
    const asistioBooking = await seedBooking({
      userId: asistioUser,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    const noAsistioUser = await seedLead({ firstName: "NoAsistioEstado" });
    const noAsistioBooking = await seedBooking({
      userId: noAsistioUser,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });
    const ganadaUser = await seedLead({
      firstName: "GanadaEstado",
      leadStatus: "ganado",
    });
    const ganadaBooking = await seedBooking({
      userId: ganadaUser,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    const perdidaUser = await seedLead({
      firstName: "PerdidaEstado",
      leadStatus: "perdido",
    });
    const perdidaBooking = await seedBooking({
      userId: perdidaUser,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });

    const { body } = await getReport(ctx.ownerToken);
    const statusOf = (bookingId: number): unknown =>
      body.rows.find((r) => r.bookingId === bookingId)?.sessionStatus;

    expect(statusOf(agendadaBooking)).toBe("agendada");
    expect(statusOf(asistioBooking)).toBe("asistio");
    expect(statusOf(noAsistioBooking)).toBe("no_asistio");
    expect(statusOf(ganadaBooking)).toBe("ganada");
    expect(statusOf(perdidaBooking)).toBe("perdida");
  });

  it("sessionStatus[] filtra multi-valor (ganada + perdida, sin las demás)", async () => {
    const ganadaUser = await seedLead({
      firstName: "FiltroGanada",
      leadStatus: "ganado",
    });
    await seedBooking({
      userId: ganadaUser,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });
    const perdidaUser = await seedLead({
      firstName: "FiltroPerdida",
      leadStatus: "perdido",
    });
    await seedBooking({
      userId: perdidaUser,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });
    const agendadaUser = await seedLead({ firstName: "FiltroAgendada" });
    await seedBooking({ userId: agendadaUser, bookingDateOffsetDays: 7 });

    const { body } = await getReport(
      ctx.ownerToken,
      "?sessionStatus=ganada&sessionStatus=perdida",
    );
    const statuses = body.rows.map((r) => r.sessionStatus);
    expect(statuses.sort()).toEqual(["ganada", "perdida"]);
  });

  it('fila "Reagendada" muestra rescheduledTo; la sesión nueva muestra rescheduledFrom', async () => {
    const userId = await seedLead({ firstName: "Encadenada2" });
    const [oldBooking] = await ctx.app.db
      .insert(schema.bookings)
      .values({
        memberId: userId,
        scheduleId: ctx.scheduleMorning,
        bookingDate: dateOffset(-10),
        status: "cancelado",
        isTrial: true,
      })
      .$returningId();
    const newBookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: 5,
    });
    await linkReschedule(oldBooking.id, newBookingId);

    const { body } = await getReport(ctx.ownerToken);
    const oldRow = body.rows.find((r) => r.bookingId === oldBooking.id);
    const newRow = body.rows.find((r) => r.bookingId === newBookingId);

    expect(oldRow?.sessionStatus).toBe("reagendada");
    expect(oldRow?.rescheduledTo).toMatchObject({ bookingId: newBookingId });
    expect(oldRow?.rescheduledFrom).toBeNull();

    expect(newRow?.rescheduledFrom).toMatchObject({ bookingId: oldBooking.id });
    expect(newRow?.rescheduledTo).toBeNull();
  });

  it("canReschedule/rescheduleDepth: true en la original sin reagendar, false en la fila Reagendada y al llegar al límite (mismo guard que rescheduleTrial)", async () => {
    // Original sin ninguna reagenda: depth 0, habilitada.
    const soloUser = await seedLead({ firstName: "SoloOriginal" });
    const soloBooking = await seedBooking({
      userId: soloUser,
      bookingDateOffsetDays: 7,
    });

    // Cadena original(b0, cancelado) → r1(b1, cancelado) → r2(b2, agendada) —
    // `trials.max_reschedules` fallback = 2 (system_settings vacío en test),
    // así que b2 (depth 2) ya está en el límite aunque no esté cerrada.
    const chainUser = await seedLead({ firstName: "LimiteReagenda" });
    const [b0] = await ctx.app.db
      .insert(schema.bookings)
      .values({
        memberId: chainUser,
        scheduleId: ctx.scheduleMorning,
        bookingDate: dateOffset(-30),
        status: "cancelado",
        isTrial: true,
      })
      .$returningId();
    const [b1] = await ctx.app.db
      .insert(schema.bookings)
      .values({
        memberId: chainUser,
        scheduleId: ctx.scheduleMorning,
        bookingDate: dateOffset(-20),
        status: "cancelado",
        isTrial: true,
      })
      .$returningId();
    await linkReschedule(b0.id, b1.id);
    const b2 = await seedBooking({
      userId: chainUser,
      bookingDateOffsetDays: 7,
    });
    await linkReschedule(b1.id, b2);

    const { body } = await getReport(ctx.ownerToken);
    const row = (id: number): Record<string, unknown> | undefined =>
      body.rows.find((r) => r.bookingId === id);

    expect(row(soloBooking)?.rescheduleDepth).toBe(0);
    expect(row(soloBooking)?.canReschedule).toBe(true);

    // b1: fila "Reagendada" (tiene hijo b2) — cerrada, sin importar su
    // profundidad (1 < 2).
    expect(row(b1.id)?.sessionStatus).toBe("reagendada");
    expect(row(b1.id)?.rescheduleDepth).toBe(1);
    expect(row(b1.id)?.canReschedule).toBe(false);

    // b2: última reagenda permitida (depth 2 === max_reschedules 2), sesión
    // abierta (agendada) pero ya en el límite.
    expect(row(b2)?.sessionStatus).toBe("agendada");
    expect(row(b2)?.rescheduleDepth).toBe(2);
    expect(row(b2)?.canReschedule).toBe(false);
  });

  it("phoneE164: la fila expone el teléfono normalizado (mismo criterio que Renovaciones)", async () => {
    const userId = await seedLead({ firstName: "TelefonoE164" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: 7,
    });
    const [user] = await ctx.app.db
      .select({ phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    const { body } = await getReport(ctx.ownerToken);
    const row = body.rows.find((r) => r.bookingId === bookingId);
    expect(row?.phoneE164).toBe(normalizePhoneE164(user.phone, "AR"));
    expect(row?.phoneE164).not.toBeNull();
  });

  it("kpis exactos sobre un set sembrado (total/attendanceRate/conversionRate/recoveryRate)", async () => {
    // A: Asistió + Ganada (asistio=1, ganadaConAsistio=1).
    const userA = await seedLead({
      firstName: "KpiGanada",
      leadStatus: "ganado",
    });
    await seedBooking({
      userId: userA,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });

    // B: No asistió, sin marcar nada (noAsistio=1). Al haber terminado hace
    // 7 días, su M2b quedó OVERDUE — dueAt en el pasado siempre cae dentro
    // de "el turno actual-o-próximo" (isPendingThisShift=true), sea cual sea
    // la hora en que corra el test.
    const userB = await seedLead({ firstName: "KpiNoAsistio" });
    const bookingB = await seedBooking({
      userId: userB,
      bookingDateOffsetDays: -7,
      withAttendance: false,
    });

    // D → E: reagenda. D cerrado como "Reagendada" (resolution ≠ null, no
    // cuenta ni pending ni attended porque su clase todavía no pasó). E queda
    // Agendada (booking a +7d): su M1 vence recién dentro de varios días, así
    // que NUNCA cae en "el turno actual-o-próximo" (ventana muy lejana).
    const userDE = await seedLead({ firstName: "KpiReagendada" });
    const [bookingD] = await ctx.app.db
      .insert(schema.bookings)
      .values({
        memberId: userDE,
        scheduleId: ctx.scheduleMorning,
        bookingDate: dateOffset(2),
        status: "cancelado",
        isTrial: true,
      })
      .$returningId();
    const bookingE = await seedBooking({
      userId: userDE,
      bookingDateOffsetDays: 7,
    });
    await linkReschedule(bookingD.id, bookingE);

    const { body } = await getReport(ctx.ownerToken);
    expect(body.total).toBe(4);
    expect(body.kpis).toMatchObject({
      total: 4,
      pendingThisShift: 1,
      attendanceRate: 50,
      conversionRate: 100,
      recoveryRate: 100,
    });

    // El pendiente del turno es justamente B (M2b vencido, nunca marcado).
    const { body: pendingBody } = await getReport(
      ctx.ownerToken,
      "?pendingThisShift=true",
    );
    expect(pendingBody.rows.map((r) => r.bookingId)).toEqual([bookingB]);
  });

  it("corte go-live: sesión ANTERIOR a trials.cadence_start_date no genera nextAction; posterior al corte sí", async () => {
    const userId = await seedLead({ firstName: "CorteGoLive" });
    const bookingId = await seedBooking({
      userId,
      bookingDateOffsetDays: -7,
      withAttendance: true,
    });

    // Corte DESPUÉS de la sesión (mañana) → nextAction null pese a que Asistió
    // sin M2 marcado sería M2a en cualquier otra circunstancia.
    await seedCadenceStartDate(dateOffset(1));
    const cut = await getReport(ctx.ownerToken);
    const cutRow = cut.body.rows.find((r) => r.bookingId === bookingId);
    expect(cutRow?.nextAction).toBeNull();
    // El corte NO inventa un estado — sessionStatus sigue siendo el real.
    expect(cutRow?.sessionStatus).toBe("asistio");

    // Corte ANTES de la sesión (vuelve al default de la suite) → nextAction
    // reaparece.
    await seedCadenceStartDate(OLD_CADENCE_START_DATE);
    const noCut = await getReport(ctx.ownerToken);
    const noCutRow = noCut.body.rows.find((r) => r.bookingId === bookingId);
    expect((noCutRow?.nextAction as { code: string } | null)?.code).toBe(
      "M2a",
    );
  });

  // ─── Aislamiento de tenant — franjas por sede ───────────────────────────

  it("GET/PUT shifts: un gimnasio no ve ni puede tocar las franjas de otro (aislamiento de tenant)", async () => {
    const gym2: SegundoGimnasio = await seedSecondTenant(ctx.app);
    try {
      const listAsGym2 = await ctx.app.inject({
        method: "GET",
        url: `${REPORTS_URL}/trial-sessions/shifts`,
        headers: { authorization: `Bearer ${gym2.adminToken}` },
      });
      expect(listAsGym2.statusCode).toBe(200);
      const branchIds = (
        JSON.parse(listAsGym2.body) as Array<{ branchId: number }>
      ).map((r) => r.branchId);
      expect(branchIds).toContain(gym2.branchId);
      expect(branchIds).not.toContain(ctx.arBranchId);

      const putOtherTenant = await ctx.app.inject({
        method: "PUT",
        url: `${REPORTS_URL}/trial-sessions/shifts/${ctx.arBranchId}`,
        headers: { authorization: `Bearer ${gym2.adminToken}` },
        payload: { morningStart: "08:00" },
      });
      expect(putOtherTenant.statusCode).toBe(404);
    } finally {
      await limpiarSegundoGimnasio(ctx.app);
    }
  });
});
