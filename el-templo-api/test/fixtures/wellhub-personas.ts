/**
 * Fase 204 — fixtures compartidos de los tests de Wellhub.
 *
 * Las tres personas del brief:
 *   - visitante nuevo   (`createWellhubVisitor`):  users.status = 'wellhub',
 *     sin suscripcion, creado como lo hace `findOrCreateVisitor` del webhook.
 *   - ex-alumno         (`createWellhubExAlumno`): users.status = 'inactivo',
 *     con una suscripcion vencida en el pasado.
 *   - socio activo      (`createWellhubSocioActivo`): plan vigente asignado.
 *     Los tres con `gympass_id`.
 *
 * Mas los helpers de filas (bookings, attendance, slots/bookings de Wellhub) y
 * los helpers del webhook (extraidos de `webhook-checkin.test.ts`, mismo
 * comportamiento) para que los planes 03-11 no los copien.
 *
 * Reglas: ningun id de `users` hardcodeado, todo insert estampa el gimnasio con
 * `tenantValues(TEMPLO_CTX, ...)` y las fechas "de hoy" se calculan en la tz de
 * la sede (`todayInTz`), nunca con fechas fijas.
 */
import { vi } from "vitest";
import { createHmac, randomBytes } from "crypto";
import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { assignTestPlan, createTestMember, dateOffsetStr } from "../helpers";
import { TENANT_TEMPLO } from "./second-tenant";

export const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

// ─── Helpers del webhook (extraidos de webhook-checkin.test.ts) ──────────────

export const WELLHUB_WEBHOOK_URL = "/api/webhooks/wellhub";
export const WELLHUB_TEST_SECRET = "test-wellhub-secret";

export function uniqueGymId(): number {
  return 500_000 + Math.floor(Math.random() * 400_000);
}

export function uniqueToken(): string {
  // 13 dígitos como los gympass_id reales del sandbox.
  return `1${String(Date.now() % 1_000_000_000).padStart(9, "0")}${String(
    Math.floor(Math.random() * 900) + 100,
  )}`;
}

/** gympass_id unico de 13 digitos (alias de `uniqueToken`). */
export function uniqueGympassId(): string {
  return uniqueToken();
}

export function checkinPayload(input: {
  token: string;
  gymId: number;
  timestamp?: number;
  email?: string;
}): string {
  return JSON.stringify({
    event_type: "checkin",
    event_data: {
      user: {
        unique_token: input.token,
        first_name: "Wellhub",
        last_name: "Visitor",
        email: input.email ?? `wh-${input.token}@example.com`,
        phone_number: "+5492235550000",
      },
      gym: { id: input.gymId, title: "El Templo Test" },
      timestamp: input.timestamp ?? Date.now(),
    },
  });
}

export function signWellhub(
  raw: string,
  algorithm: "sha1" | "sha256" = "sha256",
): string {
  return createHmac(algorithm, WELLHUB_TEST_SECRET).update(raw).digest("hex");
}

/** fetch mock: responde OK al validate y registra las llamadas. */
export function stubValidateFetch(
  status = 200,
  body: unknown = {
    metadata: { total: 1, errors: 0 },
    results: { validated_at: "2026-07-21T12:00:00Z" },
  },
): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  return { calls };
}

export async function postWellhubWebhook(
  app: FastifyInstance,
  raw: string,
  signature?: string,
) {
  return app.inject({
    method: "POST",
    url: WELLHUB_WEBHOOK_URL,
    headers: {
      "content-type": "application/json",
      ...(signature !== undefined ? { "x-gympass-signature": signature } : {}),
    },
    payload: raw,
  });
}

// ─── Tiempo en la tz de la sede ──────────────────────────────────────────────

/** Timezone de una sede (lectura acotada al gimnasio). */
export async function getBranchTimezone(
  app: FastifyInstance,
  branchId: number,
): Promise<string> {
  const [row] = await app.db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, TEMPLO_CTX),
        eq(schema.branches.id, branchId),
      ),
    );
  if (!row) throw new Error(`getBranchTimezone: sede ${branchId} inexistente`);
  return row.timezone;
}

/** "Hoy" (YYYY-MM-DD) en la tz de la sede. */
export async function branchToday(
  app: FastifyInstance,
  branchId: number,
): Promise<string> {
  return todayInTz(await getBranchTimezone(app, branchId));
}

/** Hora actual "HH:MM" en la tz dada (para sembrar una clase dentro de la ventana del QR). */
export function nowHHMMInTz(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

// ─── Personas ────────────────────────────────────────────────────────────────

export interface WellhubVisitor {
  id: number;
  gympassId: string;
  email: string;
}

/**
 * Visitante nuevo: mismo shape que `findOrCreateVisitor` (rol member, status
 * 'wellhub', gympass_id, historial from NULL -> 'wellhub'), sin suscripcion.
 */
export async function createWellhubVisitor(
  app: FastifyInstance,
  opts: { branchId: number; gympassId?: string },
): Promise<WellhubVisitor> {
  const gympassId = opts.gympassId ?? uniqueGympassId();
  const email = `wh-${gympassId}@example.com`;
  const passwordHash = await argon2.hash(randomBytes(32).toString("hex"));

  const [inserted] = await app.db.insert(schema.users).values(
    tenantValues(TEMPLO_CTX, {
      passwordHash,
      firstName: "Wellhub",
      lastName: "Visitor",
      email,
      branchId: opts.branchId,
      branchUpdatedAt: new Date(),
      branchSource: "auto" as const,
      role: "member" as const,
      status: "wellhub" as const,
      gympassId,
    }),
  );
  const id = Number(inserted.insertId);

  await app.db.insert(schema.userStatusHistory).values(
    tenantValues(TEMPLO_CTX, {
      userId: id,
      fromStatus: null,
      toStatus: "wellhub" as const,
      source: "wellhub",
    }),
  );

  return { id, gympassId, email };
}

export interface WellhubExAlumno {
  id: number;
  gympassId: string;
  email: string;
  token: string;
  subscriptionId: number;
}

/**
 * Ex-alumno: socio con una suscripcion vencida hace ~30 dias (arranco hace ~120),
 * status 'inactivo' y gympass_id. La suscripcion se inserta directo (la API no
 * deja crear una vencida).
 */
export async function createWellhubExAlumno(
  app: FastifyInstance,
  _adminToken: string,
  opts: { branchId: number; planId: number; gympassId?: string },
): Promise<WellhubExAlumno> {
  const member = await createTestMember(app, { branchId: opts.branchId });
  const gympassId = opts.gympassId ?? uniqueGympassId();

  const [sub] = await app.db.insert(schema.subscriptions).values(
    tenantValues(TEMPLO_CTX, {
      userId: member.id,
      planId: opts.planId,
      branchId: opts.branchId,
      status: "expired" as const,
      startDate: dateOffsetStr(-120),
      endDate: dateOffsetStr(-30),
      pricePaid: 15000,
      priceTypeApplied: "regular" as const,
    }),
  );
  const subscriptionId = Number(sub.insertId);

  await app.db
    .update(schema.users)
    .set({ status: "inactivo", gympassId })
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.id, member.id),
      ),
    );

  await app.db.insert(schema.userStatusHistory).values(
    tenantValues(TEMPLO_CTX, {
      userId: member.id,
      fromStatus: "activo" as const,
      toStatus: "inactivo" as const,
      source: "recompute",
    }),
  );

  return {
    id: member.id,
    gympassId,
    email: member.email,
    token: member.token,
    subscriptionId,
  };
}

export interface WellhubSocioActivo {
  id: number;
  gympassId: string;
  email: string;
  token: string;
  subscriptionId: number;
  /** classesRemaining inicial de la suscripcion (null si el plan no lo trackea). */
  classesRemaining: number | null;
}

/**
 * Socio activo: se registra, se le asigna `planId` por la API admin (el plan
 * define `classesPerWeek` / cupo mensual) y se le setea el gympass_id.
 */
export async function createWellhubSocioActivo(
  app: FastifyInstance,
  adminToken: string,
  opts: { planId: number; branchId?: number; gympassId?: string },
): Promise<WellhubSocioActivo> {
  const branchId = opts.branchId ?? 1;
  const member = await createTestMember(app, { branchId });
  const assigned = await assignTestPlan(
    app,
    adminToken,
    member.id,
    opts.planId,
    { branchId },
  );
  if (assigned.statusCode !== 201) {
    throw new Error(
      `createWellhubSocioActivo: assign fallo ${assigned.statusCode} ${JSON.stringify(assigned.body)}`,
    );
  }
  const gympassId = opts.gympassId ?? uniqueGympassId();
  await app.db
    .update(schema.users)
    .set({ gympassId })
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.id, member.id),
      ),
    );

  const body = assigned.body as {
    id: number;
    classesRemaining?: number | null;
  };
  return {
    id: member.id,
    gympassId,
    email: member.email,
    token: member.token,
    subscriptionId: body.id,
    classesRemaining: body.classesRemaining ?? null,
  };
}

// ─── Helpers de filas ────────────────────────────────────────────────────────

/** Valores de `bookings.source` en uso: NULL = legacy/propia. */
export type TestBookingSource = "wellhub" | "admin" | "self_service" | null;

/** Actividad regular + slot semanal en la sede. Devuelve ids. */
export async function insertActivityWithSchedule(
  app: FastifyInstance,
  opts: {
    branchId: number;
    name?: string;
    startTime?: string;
    endTime?: string;
    dayOfWeek?: number;
  },
): Promise<{ activityId: number; scheduleId: number }> {
  const [act] = await app.db.insert(schema.activities).values(
    tenantValues(TEMPLO_CTX, {
      name: opts.name ?? `Clase Wellhub ${Date.now().toString(36)}`,
      isActive: true,
    }),
  );
  const activityId = Number(act.insertId);
  const [sched] = await app.db.insert(schema.schedules).values(
    tenantValues(TEMPLO_CTX, {
      branchId: opts.branchId,
      activityId,
      dayOfWeek: opts.dayOfWeek ?? 3,
      startTime: opts.startTime ?? "10:00",
      endTime: opts.endTime ?? "11:00",
      isActive: true,
    }),
  );
  return { activityId, scheduleId: Number(sched.insertId) };
}

export async function insertBooking(
  app: FastifyInstance,
  opts: {
    memberId: number;
    scheduleId: number;
    bookingDate: string;
    status?:
      | "reservado"
      | "qr_escaneado"
      | "confirmado"
      | "cancelado"
      | "no_show";
    source?: TestBookingSource;
  },
): Promise<number> {
  const [res] = await app.db.insert(schema.bookings).values(
    tenantValues(TEMPLO_CTX, {
      memberId: opts.memberId,
      scheduleId: opts.scheduleId,
      bookingDate: opts.bookingDate,
      status: opts.status ?? ("reservado" as const),
      source: opts.source ?? null,
    }),
  );
  return Number(res.insertId);
}

export async function insertAttendance(
  app: FastifyInstance,
  opts: {
    memberId: number;
    branchId: number;
    scheduleId?: number | null;
    sessionDate: string;
    source: "qr" | "manual" | "wellhub" | "wellhub_manual";
    checkedInAt?: Date;
  },
): Promise<number> {
  const [res] = await app.db.insert(schema.attendance).values(
    tenantValues(TEMPLO_CTX, {
      memberId: opts.memberId,
      branchId: opts.branchId,
      scheduleId: opts.scheduleId ?? null,
      sessionDate: opts.sessionDate,
      status: "confirmado" as const,
      source: opts.source,
      ...(opts.checkedInAt ? { checkedInAt: opts.checkedInAt } : {}),
    }),
  );
  return Number(res.insertId);
}

let __idSeq = 0;
function nextExternalId(): number {
  __idSeq = (__idSeq + 1) % 100;
  // Wellhub ids son bigint: Date.now() * 100 + seq entra de sobra en 2^53.
  return Date.now() * 100 + __idSeq;
}

/**
 * Slot publicado en Wellhub para (schedule, fecha): crea la `wellhub_classes`
 * necesaria y el `wellhub_slots`. Devuelve el id de fila del slot.
 */
export async function insertWellhubSlot(
  app: FastifyInstance,
  opts: {
    branchId: number;
    activityId: number;
    scheduleId: number;
    sessionDate: string;
    totalCapacity?: number;
  },
): Promise<number> {
  const [cls] = await app.db.insert(schema.wellhubClasses).values(
    tenantValues(TEMPLO_CTX, {
      branchId: opts.branchId,
      activityId: opts.activityId,
      wellhubClassId: nextExternalId(),
      wellhubProductId: nextExternalId(),
    }),
  );
  const [slot] = await app.db.insert(schema.wellhubSlots).values(
    tenantValues(TEMPLO_CTX, {
      wellhubClassRowId: Number(cls.insertId),
      scheduleId: opts.scheduleId,
      sessionDate: opts.sessionDate,
      wellhubSlotId: nextExternalId(),
      totalCapacity: opts.totalCapacity ?? 10,
    }),
  );
  return Number(slot.insertId);
}

/** Fila `wellhub_bookings` que enlaza una reserva nuestra con un slot de Wellhub. */
export async function insertWellhubBookingRow(
  app: FastifyInstance,
  opts: {
    userId: number;
    bookingId: number | null;
    wellhubSlotRowId: number;
    status?: "confirmed" | "rejected" | "canceled" | "late_canceled";
  },
): Promise<number> {
  const [res] = await app.db.insert(schema.wellhubBookings).values(
    tenantValues(TEMPLO_CTX, {
      bookingNumber:
        `WH${Date.now().toString(36)}${nextExternalId().toString(36)}`.slice(
          0,
          32,
        ),
      bookingId: opts.bookingId,
      userId: opts.userId,
      wellhubSlotRowId: opts.wellhubSlotRowId,
      status: opts.status ?? "confirmed",
    }),
  );
  return Number(res.insertId);
}
