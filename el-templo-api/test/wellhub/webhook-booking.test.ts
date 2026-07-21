/**
 * Integration tests — reservas Wellhub (Booking API) + sincronización.
 *
 * Coverage:
 *  - booking-requested feliz: crea booking real (source='wellhub'), responde
 *    RESERVED por PATCH v2 y deja wellhub_bookings 'confirmed'.
 *  - Clase llena → REJECTED CLASS_IS_FULL sin booking; reintento del mismo
 *    booking_number → duplicate.
 *  - Slot no publicado → REJECTED CLASS_NOT_FOUND + skipped.
 *  - booking-canceled: cancela el booking, promueve lista de espera y marca
 *    wellhub_bookings 'canceled'; booking-late-canceled → 'late_canceled'.
 *  - Push de ocupación: una reserva de socio vía API dispara el PATCH del
 *    slot publicado con el total_booked nuevo (bus occupancy-events).
 *  - Sync (runWellhubSync): publica class+slots del horizonte, patchea al
 *    cambiar la capacidad, despublica ante una excepción de fecha y expira
 *    solicitudes 'pending' muertas liberando el cupo.
 *
 * Toda la API de Wellhub se mockea con vi.stubGlobal(fetch).
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
import type { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  createTestPlan,
  assignTestPlan,
  ensureEfectivoCaja,
  getAuthToken,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { runWellhubSync } from "../../src/jobs/wellhub-sync";

const WEBHOOK_URL = "/api/webhooks/wellhub";
const SECRET = "test-wellhub-secret";
const PRODUCT_ID = 777;

let nextWellhubId = 10_000;

interface ApiCall {
  method: string;
  url: string;
  body?: unknown;
}

/** Mock de toda la API de partners de Wellhub. */
function stubWellhubApi(): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url: u,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      const json = (payload: unknown) =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      if (u.includes("/setup/v1/")) {
        return json({ products: [{ product_id: PRODUCT_ID, name: "Test" }] });
      }
      if (method === "POST" && /\/classes$/.test(u)) {
        return json({ classes: [{ id: nextWellhubId++ }] });
      }
      if (method === "POST" && /\/slots$/.test(u)) {
        return json({ id: nextWellhubId++ });
      }
      if (u.includes("/access/v1/validate")) {
        return json({ results: { validated_at: "2026-07-21T12:00:00Z" } });
      }
      return new Response(null, { status: 204 });
    },
  );
  return calls;
}

function sign(raw: string): string {
  return createHmac("sha256", SECRET).update(raw).digest("hex");
}

function uniqueToken(): string {
  return `2${String(Date.now() % 1_000_000_000).padStart(9, "0")}${String(
    Math.floor(Math.random() * 900) + 100,
  )}`;
}

function bookingRequestedPayload(input: {
  token: string;
  gymId: number;
  slotId: number;
  classId: number;
  bookingNumber: string;
  eventId?: string;
}): string {
  return JSON.stringify({
    event_type: "booking-requested",
    event_data: {
      user: {
        unique_token: input.token,
        name: "Wellhub Booker",
        email: `wb-${input.token}@example.com`,
      },
      slot: {
        id: input.slotId,
        gym_id: input.gymId,
        class_id: input.classId,
        booking_number: input.bookingNumber,
      },
      timestamp: Date.now(),
      event_id:
        input.eventId ??
        `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

function bookingCancelPayload(input: {
  token: string;
  gymId: number;
  slotId: number;
  classId: number;
  bookingNumber: string;
  late?: boolean;
}): string {
  return JSON.stringify({
    event_type: input.late ? "booking-late-canceled" : "booking-canceled",
    event_data: {
      user: { unique_token: input.token },
      slot: {
        id: input.slotId,
        gym_id: input.gymId,
        class_id: input.classId,
        booking_number: input.bookingNumber,
      },
      timestamp: Date.now(),
      event_id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

async function postWebhook(app: FastifyInstance, raw: string) {
  return app.inject({
    method: "POST",
    url: WEBHOOK_URL,
    headers: {
      "content-type": "application/json",
      "x-gympass-signature": sign(raw),
    },
    payload: raw,
  });
}

describe("Wellhub — reservas y sincronización", () => {
  let app: FastifyInstance;
  let branchId: number;
  let gymId: number;
  let activityId: number;
  let scheduleId: number;
  let tomorrow: string;

  /** Publica el slot de mañana directamente en las tablas de mapeo. */
  async function publishSlot(totalCapacity = 2): Promise<{
    classRowId: number;
    wellhubClassId: number;
    slotRowId: number;
    wellhubSlotId: number;
  }> {
    const wellhubClassId = nextWellhubId++;
    const insertedClass = await app.db.insert(schema.wellhubClasses).values({
      branchId,
      activityId,
      wellhubClassId,
      wellhubProductId: PRODUCT_ID,
    });
    const classRowId = Number(insertedClass[0].insertId);

    const wellhubSlotId = nextWellhubId++;
    const insertedSlot = await app.db.insert(schema.wellhubSlots).values({
      wellhubClassRowId: classRowId,
      scheduleId,
      sessionDate: tomorrow,
      wellhubSlotId,
      totalCapacity,
      totalBooked: 0,
    });
    return {
      classRowId,
      wellhubClassId,
      slotRowId: Number(insertedSlot[0].insertId),
      wellhubSlotId,
    };
  }

  /** Inserta un usuario mínimo directo en DB (para llenar cupos). */
  async function insertBareUser(
    status: "wellhub" | null = null,
  ): Promise<number> {
    const inserted = await app.db.insert(schema.users).values({
      passwordHash: "x",
      firstName: "Filler",
      lastName: `U${Math.random().toString(36).slice(2, 7)}`,
      role: "member",
      branchId,
      status,
      gympassId: status === "wellhub" ? uniqueToken() : null,
    });
    return Number(inserted[0].insertId);
  }

  beforeAll(async () => {
    process.env.WELLHUB_API_KEY = "test-api-key";
    process.env.WELLHUB_WEBHOOK_SECRET = SECRET;

    app = await createTestApp();

    tomorrow = dateOffsetStr(1);
    gymId = 600_000 + Math.floor(Math.random() * 300_000);
    const suffix = Date.now().toString(36).slice(-6);

    const insertedBranch = await app.db.insert(schema.branches).values({
      name: `Sede WH Booking ${suffix}`,
      code: `WB${suffix.toUpperCase()}`,
      timezone: "America/Argentina/Buenos_Aires",
      country: "AR",
      maxCapacity: 22,
      wellhubGymId: gymId,
    });
    branchId = Number(insertedBranch[0].insertId);
    await ensureEfectivoCaja(app, branchId);
  });

  afterAll(async () => {
    delete process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    await app.db
      .delete(schema.cashRegisters)
      .where(eq(schema.cashRegisters.branchId, branchId));
    await app.db
      .delete(schema.branches)
      .where(eq(schema.branches.id, branchId));
    await app.close();
  });

  // cleanAllTestData también borra activities/schedules → los fixtures se
  // recrean por test.
  beforeEach(async () => {
    vi.unstubAllGlobals();
    await cleanAllTestData(app);

    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const insertedActivity = await app.db.insert(schema.activities).values({
      name: `Calistenia WH ${suffix}`,
      description: "Actividad de test Wellhub",
      isActive: true,
      isSpecial: false,
      maxCapacity: 2,
    });
    activityId = Number(insertedActivity[0].insertId);

    // dayOfWeek ISO (1=Lun..7=Dom) de mañana.
    const utcDow = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
    const isoDow = utcDow === 0 ? 7 : utcDow;
    const insertedSchedule = await app.db.insert(schema.schedules).values({
      branchId,
      activityId,
      dayOfWeek: isoDow,
      startTime: "12:00",
      endTime: "13:00",
      isActive: true,
    });
    scheduleId = Number(insertedSchedule[0].insertId);
  });

  // ─── booking-requested ───────────────────────────────────────────────────

  it("booking-requested feliz: crea booking source=wellhub y confirma RESERVED", async () => {
    const calls = stubWellhubApi();
    const slot = await publishSlot();
    const token = uniqueToken();
    const bookingNumber = `BK_${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

    const res = await postWebhook(
      app,
      bookingRequestedPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    // PATCH v2 de confirmación.
    const patch = calls.find(
      (c) =>
        c.method === "PATCH" && c.url.includes(`/bookings/${bookingNumber}`),
    );
    expect(patch).toBeDefined();
    expect(patch?.url).toContain("/booking/v2/");
    expect((patch?.body as { status: string }).status).toBe("RESERVED");

    // Booking real del visitante.
    const [visitor] = await app.db
      .select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    expect(visitor.status).toBe("wellhub");

    const bookings = await app.db
      .select()
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, visitor.id));
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("reservado");
    expect(bookings[0].source).toBe("wellhub");
    expect(bookings[0].scheduleId).toBe(scheduleId);
    expect(bookings[0].bookingDate).toBe(tomorrow);

    const [wb] = await app.db
      .select()
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
    expect(wb.status).toBe("confirmed");
    expect(wb.bookingId).toBe(bookings[0].id);
  });

  it("clase llena → REJECTED CLASS_IS_FULL sin booking; mismo booking_number reintenta → duplicate", async () => {
    const calls = stubWellhubApi();
    const slot = await publishSlot(2);

    // Llenar el cupo (2) con reservas directas.
    for (let i = 0; i < 2; i++) {
      const fillerId = await insertBareUser();
      await app.db.insert(schema.bookings).values({
        memberId: fillerId,
        scheduleId,
        bookingDate: tomorrow,
        status: "reservado",
      });
    }

    const token = uniqueToken();
    const bookingNumber = `BK_FULL${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const res = await postWebhook(
      app,
      bookingRequestedPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).detail).toBe("rechazada_CLASS_IS_FULL");

    const patch = calls.find(
      (c) =>
        c.method === "PATCH" && c.url.includes(`/bookings/${bookingNumber}`),
    );
    expect(
      (patch?.body as { status: string; reason_category: string }).status,
    ).toBe("REJECTED");
    expect((patch?.body as { reason_category: string }).reason_category).toBe(
      "CLASS_IS_FULL",
    );

    const [wb] = await app.db
      .select()
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
    expect(wb.status).toBe("rejected");
    expect(wb.bookingId).toBeNull();

    // Reintento con OTRO event_id pero mismo booking_number.
    const retry = await postWebhook(
      app,
      bookingRequestedPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );
    expect(JSON.parse(retry.body).outcome).toBe("duplicate");
  });

  it("slot no publicado → REJECTED CLASS_NOT_FOUND + skipped", async () => {
    const calls = stubWellhubApi();
    const bookingNumber = `BK_NOSLOT${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const res = await postWebhook(
      app,
      bookingRequestedPayload({
        token: uniqueToken(),
        gymId,
        slotId: 99_999_999,
        classId: 88_888_888,
        bookingNumber,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).detail).toBe("slot_desconocido");

    const patch = calls.find(
      (c) =>
        c.method === "PATCH" && c.url.includes(`/bookings/${bookingNumber}`),
    );
    expect(
      (patch?.body as { status: string; reason_category: string })
        .reason_category,
    ).toBe("CLASS_NOT_FOUND");
  });

  // ─── booking-canceled ────────────────────────────────────────────────────

  it("booking-canceled cancela el booking, promueve la lista de espera y patchea ocupación", async () => {
    const calls = stubWellhubApi();
    const slot = await publishSlot(1);
    const token = uniqueToken();
    const bookingNumber = `BK_CXL${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Reserva Wellhub confirmada (ocupa el único cupo).
    await postWebhook(
      app,
      bookingRequestedPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );

    // Otro usuario en lista de espera.
    const waiterId = await insertBareUser();
    await app.db.insert(schema.bookings).values({
      memberId: waiterId,
      scheduleId,
      bookingDate: tomorrow,
      status: "lista_espera",
      waitlistPosition: 1,
    });

    const res = await postWebhook(
      app,
      bookingCancelPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const [wb] = await app.db
      .select()
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
    expect(wb.status).toBe("canceled");

    const [cancelled] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, wb.bookingId as number));
    expect(cancelled.status).toBe("cancelado");

    // La lista de espera se promovió.
    const [promoted] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.memberId, waiterId));
    expect(promoted.status).toBe("reservado");

    // Y la ocupación (1: el promovido) se empujó al slot.
    await vi.waitFor(() => {
      const slotPatch = calls.find(
        (c) =>
          c.method === "PATCH" &&
          c.url.includes(`/slots/${slot.wellhubSlotId}`),
      );
      expect(slotPatch).toBeDefined();
    });
  });

  it("booking-late-canceled marca late_canceled", async () => {
    stubWellhubApi();
    const slot = await publishSlot();
    const token = uniqueToken();
    const bookingNumber = `BK_LATE${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    await postWebhook(
      app,
      bookingRequestedPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
      }),
    );
    const res = await postWebhook(
      app,
      bookingCancelPayload({
        token,
        gymId,
        slotId: slot.wellhubSlotId,
        classId: slot.wellhubClassId,
        bookingNumber,
        late: true,
      }),
    );
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const [wb] = await app.db
      .select()
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
    expect(wb.status).toBe("late_canceled");
  });

  // ─── Check-in con reserva del día ────────────────────────────────────────

  it("checkin de un visitante con reserva de HOY la confirma y liga la asistencia", async () => {
    stubWellhubApi();

    // Horario de HOY en la sede (hora irrelevante para la asistencia).
    const todayAr = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const utcDow = new Date(`${todayAr}T12:00:00Z`).getUTCDay();
    const insertedSchedule = await app.db.insert(schema.schedules).values({
      branchId,
      activityId,
      dayOfWeek: utcDow === 0 ? 7 : utcDow,
      startTime: "08:00",
      endTime: "09:00",
      isActive: true,
    });
    const todayScheduleId = Number(insertedSchedule[0].insertId);

    const token = uniqueToken();
    const visitorId = await app.db
      .insert(schema.users)
      .values({
        passwordHash: "x",
        firstName: "Visitor",
        lastName: "ConReserva",
        role: "member",
        branchId,
        status: "wellhub",
        gympassId: token,
      })
      .then((r) => Number(r[0].insertId));

    const insertedBooking = await app.db.insert(schema.bookings).values({
      memberId: visitorId,
      scheduleId: todayScheduleId,
      bookingDate: todayAr,
      status: "reservado",
      source: "wellhub",
    });
    const bookingId = Number(insertedBooking[0].insertId);

    const raw = JSON.stringify({
      event_type: "checkin-booking-occurred",
      event_data: {
        user: { unique_token: token, first_name: "Visitor" },
        booking: { booking_number: "BK_TODAY1" },
        gym: { id: gymId },
        timestamp: Date.now(),
      },
    });
    const res = await postWebhook(app, raw);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const [booking] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));
    expect(booking.status).toBe("confirmado");

    const [att] = await app.db
      .select()
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitorId));
    expect(att.source).toBe("wellhub");
    expect(att.scheduleId).toBe(todayScheduleId);
    expect(att.sessionDate).toBe(todayAr);
  });

  // ─── Push de ocupación ante reservas de socios ───────────────────────────

  it("una reserva de socio empuja el total_booked al slot publicado", async () => {
    const calls = stubWellhubApi();
    const slot = await publishSlot(5);

    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan WH ${Date.now().toString(36)}`,
    });
    const member = await createTestMember(app, { branchId });
    const assigned = await assignTestPlan(app, adminToken, member.id, plan.id, {
      branchId,
    });
    expect(assigned.statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: "/api/members/scheduling/reserve",
      headers: { authorization: `Bearer ${member.token}` },
      payload: { scheduleId, date: tomorrow },
    });
    expect(res.statusCode).toBe(201);

    // El push es fire-and-forget: esperar el PATCH del slot.
    await vi.waitFor(() => {
      const slotPatch = calls.find(
        (c) =>
          c.method === "PATCH" &&
          c.url.includes(`/slots/${slot.wellhubSlotId}`),
      );
      expect(slotPatch).toBeDefined();
      expect((slotPatch?.body as { total_booked: number }).total_booked).toBe(
        1,
      );
    });

    const [slotRow] = await app.db
      .select({ totalBooked: schema.wellhubSlots.totalBooked })
      .from(schema.wellhubSlots)
      .where(eq(schema.wellhubSlots.id, slot.slotRowId));
    expect(slotRow.totalBooked).toBe(1);
  });

  // ─── Sincronización ──────────────────────────────────────────────────────

  it("runWellhubSync publica class y slot, patchea capacidad y despublica excepciones", async () => {
    const calls = stubWellhubApi();

    // 1. Publicación inicial.
    const summary1 = await runWellhubSync(app.db);
    expect(summary1).not.toBeNull();
    expect(summary1?.classesCreated).toBeGreaterThanOrEqual(1);

    const [classRow] = await app.db
      .select()
      .from(schema.wellhubClasses)
      .where(
        and(
          eq(schema.wellhubClasses.branchId, branchId),
          eq(schema.wellhubClasses.activityId, activityId),
        ),
      );
    expect(classRow).toBeDefined();
    expect(classRow.wellhubProductId).toBe(PRODUCT_ID);

    const slots = await app.db
      .select()
      .from(schema.wellhubSlots)
      .where(eq(schema.wellhubSlots.scheduleId, scheduleId));
    expect(slots.length).toBeGreaterThanOrEqual(1);
    const tomorrowSlot = slots.find((s) => s.sessionDate === tomorrow);
    expect(tomorrowSlot).toBeDefined();
    expect(tomorrowSlot?.totalCapacity).toBe(2);

    const createSlotCall = calls.find(
      (c) => c.method === "POST" && /\/slots$/.test(c.url),
    );
    expect(
      (createSlotCall?.body as { booking_window: unknown }).booking_window,
    ).toBeDefined();

    // 2. Cambio de capacidad → patch.
    await app.db
      .update(schema.activities)
      .set({ maxCapacity: 4 })
      .where(eq(schema.activities.id, activityId));
    const summary2 = await runWellhubSync(app.db);
    expect(summary2?.slotsPatched).toBeGreaterThanOrEqual(1);
    const [patched] = await app.db
      .select({ totalCapacity: schema.wellhubSlots.totalCapacity })
      .from(schema.wellhubSlots)
      .where(eq(schema.wellhubSlots.id, tomorrowSlot?.id as number));
    expect(patched.totalCapacity).toBe(4);

    // 3. Excepción de fecha → despublica.
    await app.db.insert(schema.scheduleExceptions).values({
      scheduleId,
      exceptionDate: tomorrow,
      reason: "test",
    });
    const summary3 = await runWellhubSync(app.db);
    expect(summary3?.slotsDeleted).toBeGreaterThanOrEqual(1);
    const remaining = await app.db
      .select()
      .from(schema.wellhubSlots)
      .where(
        and(
          eq(schema.wellhubSlots.scheduleId, scheduleId),
          eq(schema.wellhubSlots.sessionDate, tomorrow),
        ),
      );
    expect(remaining).toHaveLength(0);
    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall?.url).toContain(`/slots/${tomorrowSlot?.wellhubSlotId}`);
  });

  it("runWellhubSync expira solicitudes pending muertas y libera el cupo", async () => {
    stubWellhubApi();
    const slot = await publishSlot();
    const visitorId = await insertBareUser("wellhub");

    const insertedBooking = await app.db.insert(schema.bookings).values({
      memberId: visitorId,
      scheduleId,
      bookingDate: tomorrow,
      status: "reservado",
      source: "wellhub",
    });
    const bookingId = Number(insertedBooking[0].insertId);

    const bookingNumber = `BK_DEAD${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await app.db.insert(schema.wellhubBookings).values({
      bookingNumber,
      bookingId,
      userId: visitorId,
      wellhubSlotRowId: slot.slotRowId,
      status: "pending",
    });
    // Envejecer el pending más allá de la ventana de expiración.
    await app.db.execute(
      sql`UPDATE wellhub_bookings SET created_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE) WHERE booking_number = ${bookingNumber}`,
    );

    const summary = await runWellhubSync(app.db);
    expect(summary?.pendingsExpired).toBe(1);

    const [wb] = await app.db
      .select({ status: schema.wellhubBookings.status })
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
    expect(wb.status).toBe("expired");

    const [booking] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));
    expect(booking.status).toBe("cancelado");
  });
});
