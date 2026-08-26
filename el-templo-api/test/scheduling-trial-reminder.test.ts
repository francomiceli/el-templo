/**
 * Fase 180 Plan 03 (D-20/D-24) — recordatorio ~24h antes de la sesión de
 * prueba reservada, con fallback por email cuando el usuario no tiene
 * device token.
 *
 * Cubre:
 *   - reserveTrialSelfService encola trial_session_reminder (branch-tz aware,
 *     T-24h), incluso sin device token, y no revierte la reserva si el
 *     enqueue falla.
 *   - No se encola si la reserva se hace con <24h de anticipación.
 *   - cancelTrialSelfService y el reschedule admin limpian/reencolan el
 *     recordatorio (T-180-13).
 *   - processQueue: fallback por email SOLO para trial_session_reminder
 *     (T-180-10/T-180-12), sin tocar el comportamiento de cualquier otro
 *     templateKey (regresión).
 */
process.env.DRY_RUN = "true";

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
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createEligibleFreemium,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";
import { tenantWhere, tenantValues } from "../src/modules/shared/tenant";
import { NotificationService } from "../src/modules/notifications/service";
import { EmailService } from "../src/modules/email/service";

// El gimnasio de los fixtures (El Templo = tenant 1).
const CTX = { tenantId: 1 };

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_TRIAL_URL = "/api/members/scheduling/reserve-trial";
const CANCEL_TRIAL_URL = "/api/members/scheduling/cancel-trial";
const SEED_TEMPLATES_URL = "/api/notifications/admin/seed-templates";
const TRIAL_REMINDER_KEY = "trial_session_reminder";

describe("Recordatorio de sesión de prueba — D-20/D-24 (Fase 180-03)", () => {
  let app: FastifyInstance;
  let adminToken: string; // admin@test.com — role 'owner' (puede seedear templates)
  let physicalBranchId: number;
  let activityId: number;

  // Miércoles 10:00 UTC — el jueves (día siguiente) queda >24h en el futuro
  // para las clases de la tarde; mismo pin que el resto de la suite de trials.
  const PINNED_NOW = "2026-03-11T10:00:00Z";
  const THURSDAY = "2026-03-12";
  const TODAY = "2026-03-11";

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(PINNED_NOW));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [physical] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    physicalBranchId = physical.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // El seed es idempotente por tenant (INSERT IGNORE) — necesario para que
    // queueNotification encuentre el template trial_session_reminder.
    const seedRes = await app.inject({
      method: "POST",
      url: SEED_TEMPLATES_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(seedRes.statusCode).toBe(200);

    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia", description: "Clase grupal" },
    });
    activityId = JSON.parse(activityRes.body).id;
  });

  async function mkSchedule(
    dayOfWeek: number,
    startTime: string,
    branchId: number = physicalBranchId,
    endTime: string = "23:59",
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    return JSON.parse(res.body).id as number;
  }

  async function freemiumToken(): Promise<{
    id: number;
    email: string;
    token: string;
  }> {
    const { id, email } = await createEligibleFreemium(app, {
      phone: "1122334455",
    });
    const token = await getAuthToken(app, email, "pass123456");
    return { id, email, token };
  }

  async function reserve(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function reminderRows(userId: number) {
    return app.db
      .select({
        id: schema.pendingNotifications.id,
        status: schema.pendingNotifications.status,
        scheduledAt: schema.pendingNotifications.scheduledAt,
        title: schema.pendingNotifications.title,
        body: schema.pendingNotifications.body,
        templateId: schema.pendingNotifications.templateId,
      })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(
          schema.notificationTemplates.id,
          schema.pendingNotifications.templateId,
        ),
      )
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.notificationTemplates.templateKey, TRIAL_REMINDER_KEY),
        ),
      );
  }

  async function reminderTemplateId(): Promise<number> {
    const [row] = await app.db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX),
          eq(schema.notificationTemplates.templateKey, TRIAL_REMINDER_KEY),
        ),
      )
      .limit(1);
    return row.id;
  }

  // ── Task 2: enqueue al reservar, limpieza al cancelar/reprogramar ───────

  it("D-20: reservar una clase encola trial_session_reminder pending, scheduledAt exactamente T-24h (branch-tz aware, sin device token)", async () => {
    const scheduleId = await mkSchedule(4, "19:00"); // Jueves 19:00 hora AR
    const { id, token } = await freemiumToken();

    const { statusCode } = await reserve(token, {
      scheduleId,
      date: THURSDAY,
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(201);

    const rows = await reminderRows(id);
    expect(rows).toHaveLength(1); // el usuario NUNCA registró un device token
    expect(rows[0].status).toBe("pending");
    // Jueves 19:00 America/Argentina/Buenos_Aires (UTC-3, sin DST) = 22:00 UTC.
    // T-24h = miércoles 22:00 UTC.
    expect(rows[0].scheduledAt).toEqual(new Date("2026-03-11T22:00:00.000Z"));
  });

  it("el body del recordatorio menciona día, hora y sede (sin dirección cuando la sede no tiene)", async () => {
    const scheduleId = await mkSchedule(4, "19:00");
    const { id, token } = await freemiumToken();
    await reserve(token, {
      scheduleId,
      date: THURSDAY,
      branchId: physicalBranchId,
    });

    const [row] = await reminderRows(id);
    expect(row.body).toContain("12/03");
    expect(row.body).toContain("19:00");
    expect(row.body).toContain("Test Branch");
    expect(row.body).not.toMatch(/Test Branch \(/); // sin paréntesis de dirección
  });

  it("el body del recordatorio incluye la dirección cuando la sede la tiene", async () => {
    const direccion = "Av. Colón 1234, Mar del Plata";
    const [{ id: sedeConDireccionId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Con Dirección 180-03",
        code: "T18003-CD",
        country: "AR",
        address: direccion,
      })
      .$returningId();
    const scheduleId = await mkSchedule(4, "19:00", sedeConDireccionId);
    const { id, token } = await freemiumToken();

    const { statusCode } = await reserve(token, {
      scheduleId,
      date: THURSDAY,
      branchId: sedeConDireccionId,
    });
    expect(statusCode).toBe(201);

    const [row] = await reminderRows(id);
    expect(row.body).toContain("Sede Con Dirección 180-03");
    expect(row.body).toContain(direccion);
  });

  it("no encola el recordatorio si la reserva se hace con menos de 24h de anticipación", async () => {
    const todayScheduleId = await mkSchedule(3, "11:00"); // Miércoles, ~1h desde el pin
    const { id, token } = await freemiumToken();

    const { statusCode } = await reserve(token, {
      scheduleId: todayScheduleId,
      date: TODAY,
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(201);

    const rows = await reminderRows(id);
    expect(rows).toHaveLength(0);
  });

  it("D-20: un fallo del enqueue no revierte la reserva de prueba", async () => {
    const scheduleId = await mkSchedule(4, "19:00");
    const spy = vi
      .spyOn(NotificationService.prototype, "queueNotification")
      .mockRejectedValueOnce(new Error("boom"));
    const { id, token } = await freemiumToken();

    const { statusCode, body } = await reserve(token, {
      scheduleId,
      date: THURSDAY,
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(201);
    expect(typeof body.bookingId).toBe("number");
    spy.mockRestore();

    const [user] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    expect(user.status).toBe("prueba"); // la promoción freemium→prueba quedó firme

    const rows = await reminderRows(id);
    expect(rows).toHaveLength(0); // el enqueue falló — no queda fila fantasma
  });

  it("cancelar la prueba borra la fila pending del recordatorio (T-180-13)", async () => {
    const scheduleId = await mkSchedule(4, "19:00");
    const { id, token } = await freemiumToken();
    await reserve(token, {
      scheduleId,
      date: THURSDAY,
      branchId: physicalBranchId,
    });
    expect(await reminderRows(id)).toHaveLength(1);

    const cancelRes = await app.inject({
      method: "POST",
      url: CANCEL_TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(cancelRes.statusCode).toBe(200);

    expect(await reminderRows(id)).toHaveLength(0);
  });

  it("reprogramar (admin) borra el recordatorio del horario viejo y encola exactamente uno para el nuevo", async () => {
    const oldScheduleId = await mkSchedule(4, "19:00", physicalBranchId, "19:30"); // Jueves 19:00-19:30
    const newScheduleId = await mkSchedule(4, "20:00", physicalBranchId, "20:30"); // Jueves 20:00-20:30, misma fecha, sin solaparse
    const { id, token } = await freemiumToken();
    const { body } = await reserve(token, {
      scheduleId: oldScheduleId,
      date: THURSDAY,
      branchId: physicalBranchId,
    });
    const bookingId = body.bookingId as number;
    expect(await reminderRows(id)).toHaveLength(1);

    const rescheduleRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/trials/${bookingId}/reschedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        scheduleId: newScheduleId,
        date: THURSDAY,
        branchId: physicalBranchId,
      },
    });
    expect(rescheduleRes.statusCode).toBe(200);

    const rows = await reminderRows(id);
    expect(rows).toHaveLength(1); // no quedaron dos filas (vieja + nueva)
    // Jueves 20:00 AR = 23:00 UTC. T-24h = miércoles 23:00 UTC.
    expect(rows[0].scheduledAt).toEqual(new Date("2026-03-11T23:00:00.000Z"));
  });

  // ── Task 3: fallback por email en processQueue (D-24) ────────────────────

  it("trial_session_reminder sin device token y con email → envía el fallback y marca sent (no failed)", async () => {
    const templateId = await reminderTemplateId();
    const { id: userId, email } = await freemiumToken();
    const [inserted] = await app.db
      .insert(schema.pendingNotifications)
      .values(
        tenantValues(CTX, {
          userId,
          templateId,
          title: "Mañana entrenás con nosotros",
          body: "Tu sesión de prueba es mañana.",
          status: "pending" as const,
          scheduledAt: new Date(Date.now() - 60 * 60 * 1000), // 1h vencida
        }),
      )
      .$returningId();

    const emailSpy = vi
      .spyOn(EmailService.prototype, "sendTrialReminderEmail")
      .mockResolvedValue(undefined);
    const service = new NotificationService(
      app.db,
      app.log,
      true,
      new EmailService(app.log),
    );
    const result = await service.processQueue();

    expect(emailSpy).toHaveBeenCalledWith(
      email,
      "Mañana entrenás con nosotros",
      "Tu sesión de prueba es mañana.",
    );
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const [row] = await app.db
      .select({
        status: schema.pendingNotifications.status,
        sentAt: schema.pendingNotifications.sentAt,
        errorMessage: schema.pendingNotifications.errorMessage,
      })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, inserted.id),
        ),
      );
    expect(row.status).toBe("sent");
    expect(row.sentAt).not.toBeNull();
    expect(row.errorMessage).toBeNull();

    emailSpy.mockRestore();
  });

  it("otro templateKey sin device token → sigue quedando failed (regresión: comportamiento existente intacto)", async () => {
    const [otherTemplate] = await app.db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX),
          eq(schema.notificationTemplates.templateKey, "waitlist_promoted"),
        ),
      )
      .limit(1);
    const { id: userId } = await freemiumToken();
    const [inserted] = await app.db
      .insert(schema.pendingNotifications)
      .values(
        tenantValues(CTX, {
          userId,
          templateId: otherTemplate.id,
          title: "¡Se liberó tu lugar!",
          body: "Pasaste a una reserva confirmada.",
          status: "pending" as const,
          scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      )
      .$returningId();

    const emailSpy = vi
      .spyOn(EmailService.prototype, "sendTrialReminderEmail")
      .mockResolvedValue(undefined);
    const service = new NotificationService(
      app.db,
      app.log,
      true,
      new EmailService(app.log),
    );
    await service.processQueue();

    expect(emailSpy).not.toHaveBeenCalled();
    const [row] = await app.db
      .select({
        status: schema.pendingNotifications.status,
        errorMessage: schema.pendingNotifications.errorMessage,
      })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, inserted.id),
        ),
      );
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBe("No device tokens registered");

    emailSpy.mockRestore();
  });

  it("trial_session_reminder CON device token → camino FCM (DRY_RUN), nunca intenta el fallback de email", async () => {
    const templateId = await reminderTemplateId();
    const { id: userId } = await freemiumToken();
    await app.db.insert(schema.deviceTokens).values(
      tenantValues(CTX, {
        userId,
        token: `dtok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        platform: "android" as const,
      }),
    );
    const [inserted] = await app.db
      .insert(schema.pendingNotifications)
      .values(
        tenantValues(CTX, {
          userId,
          templateId,
          title: "Mañana entrenás con nosotros",
          body: "Tu sesión de prueba es mañana.",
          status: "pending" as const,
          scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      )
      .$returningId();

    const emailSpy = vi
      .spyOn(EmailService.prototype, "sendTrialReminderEmail")
      .mockResolvedValue(undefined);
    const service = new NotificationService(
      app.db,
      app.log,
      true, // DRY_RUN: sendToDevice resuelve true sin pegarle a FCM real
      new EmailService(app.log),
    );
    await service.processQueue();

    expect(emailSpy).not.toHaveBeenCalled();
    const [row] = await app.db
      .select({ status: schema.pendingNotifications.status })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, inserted.id),
        ),
      );
    expect(row.status).toBe("sent");

    emailSpy.mockRestore();
  });

  it("trial_session_reminder sin device token y sin email → failed (nunca se inventa destinatario)", async () => {
    const templateId = await reminderTemplateId();
    const { id: userId } = await freemiumToken();
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, userId)));

    const [inserted] = await app.db
      .insert(schema.pendingNotifications)
      .values(
        tenantValues(CTX, {
          userId,
          templateId,
          title: "Mañana entrenás con nosotros",
          body: "Tu sesión de prueba es mañana.",
          status: "pending" as const,
          scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      )
      .$returningId();

    const emailSpy = vi
      .spyOn(EmailService.prototype, "sendTrialReminderEmail")
      .mockResolvedValue(undefined);
    const service = new NotificationService(
      app.db,
      app.log,
      true,
      new EmailService(app.log),
    );
    await service.processQueue();

    expect(emailSpy).not.toHaveBeenCalled();
    const [row] = await app.db
      .select({
        status: schema.pendingNotifications.status,
        errorMessage: schema.pendingNotifications.errorMessage,
      })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, inserted.id),
        ),
      );
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBe("No device tokens registered");

    emailSpy.mockRestore();
  });
});
