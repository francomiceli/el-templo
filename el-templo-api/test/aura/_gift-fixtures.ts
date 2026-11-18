/**
 * Fase 215 (plan 04) — siembra compartida para los tests de regalos de Aura.
 *
 * Clases, personas, asistencias, regalos y conciliación. Fechas siempre
 * relativas al día local de la sede (nada fijo) y personas siempre por fábrica
 * (ningún id de `users` hardcodeado). Las asistencias y los regalos se insertan
 * con `app.dbPool.query` y `tenant_id` explícito (lección del plan 04 de la
 * 214): así los tests no dependen de las reglas de las rutas de check-in.
 */
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { createTestPlan, getAuthToken, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import type { AuraGiftVoidCause } from "../../src/db/schema/aura-gifts";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  dowInTz,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { earnedAuraForUser } from "../../src/modules/aura/earned";
import type {
  GiftGiverKind,
  GiftReason,
} from "../../src/modules/aura/gift-rules";

export const GIFT_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

export interface GiftClass {
  branchId: number;
  activityId: number;
  scheduleId: number;
  /** Fecha local de la clase (`YYYY-MM-DD`). */
  sessionDate: string;
  /** Día local de la sede hoy. */
  today: string;
  timezone: string;
  startTime: string;
  endTime: string;
  /** Solo si el helper creó la sede (para borrarla después). */
  createdBranchId: number | null;
}

/**
 * Sede, actividad y horario de una clase. Por defecto usa la primera sede real
 * y la clase de AYER (siempre terminada). `dateOffset` mueve la fecha en días
 * respecto de hoy local; `tz` crea una sede propia con esa zona horaria (hay que
 * borrarla con `cleanupGiftClasses`).
 */
export async function seedGiftClass(
  app: FastifyInstance,
  opts: {
    tz?: string;
    startTime?: string;
    endTime?: string;
    dateOffset?: number;
  } = {},
): Promise<GiftClass> {
  let branchId: number;
  let timezone: string;
  let createdBranchId: number | null = null;

  if (opts.tz !== undefined) {
    const n = nextSeq();
    const [created] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(GIFT_CTX, {
          name: `Sede regalo 215 ${n}`,
          code: `G215${Date.now().toString(36).slice(-5)}${n}`.slice(0, 20),
          country: "AR",
          timezone: opts.tz,
        }),
      )
      .$returningId();
    branchId = created.id;
    createdBranchId = created.id;
    timezone = opts.tz;
  } else {
    const [branch] = await app.db
      .select({ id: schema.branches.id, tz: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, GIFT_CTX),
          eq(schema.branches.isVirtual, false),
        ),
      )
      .limit(1);
    branchId = branch.id;
    timezone = branch.tz ?? DEFAULT_TENANT_TIMEZONE;
  }

  const today = todayInTz(timezone);
  const sessionDate = addDays(today, opts.dateOffset ?? -1);
  const startTime = opts.startTime ?? "18:00";
  const endTime = opts.endTime ?? "19:00";

  const [activity] = await app.db
    .insert(schema.activities)
    .values(tenantValues(GIFT_CTX, { name: "General", description: "215" }))
    .$returningId();
  const [schedule] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(GIFT_CTX, {
        branchId,
        activityId: activity.id,
        dayOfWeek: dowInTz(timezone),
        startTime,
        endTime,
        isActive: true,
      }),
    )
    .$returningId();

  return {
    branchId,
    activityId: activity.id,
    scheduleId: schedule.id,
    sessionDate,
    today,
    timezone,
    startTime,
    endTime,
    createdBranchId,
  };
}

/** Borra las sedes que creó `seedGiftClass({ tz })` (`branches` no se limpia sola). */
export async function cleanupGiftClasses(
  app: FastifyInstance,
  classes: GiftClass[],
): Promise<void> {
  for (const cls of classes) {
    if (cls.createdBranchId === null) continue;
    await app.db
      .delete(schema.schedules)
      .where(eq(schema.schedules.branchId, cls.createdBranchId));
    await app.db
      .delete(schema.branches)
      .where(eq(schema.branches.id, cls.createdBranchId));
  }
}

export interface GiftPerson {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

/** Socio de la sede indicada, sin plan. */
export async function seedMember(
  app: FastifyInstance,
  opts: {
    branchId: number;
    status?: "freemium" | "activo" | "wellhub";
    dateOfBirth?: string | null;
    deletedAt?: Date;
    firstName?: string;
    lastName?: string;
  },
): Promise<GiftPerson> {
  const n = nextSeq();
  const firstName = opts.firstName ?? `Nom${n}`;
  const lastName = opts.lastName ?? `Apellido${n}Largo`;
  const email = `regalo-215-${n}-${Date.now()}@test.com`;
  const registered = await registerUser(app, {
    email,
    password: "pass123456",
    firstName,
    lastName,
    branchId: opts.branchId,
  });
  const id = (registered.user as { id: number }).id;
  const cambios: Partial<typeof schema.users.$inferInsert> = {};
  if (opts.status !== undefined) cambios.status = opts.status;
  if (opts.dateOfBirth !== undefined) cambios.dateOfBirth = opts.dateOfBirth;
  if (opts.deletedAt !== undefined) cambios.deletedAt = opts.deletedAt;
  if (Object.keys(cambios).length > 0) {
    await app.db
      .update(schema.users)
      .set(cambios)
      .where(and(tenantWhere(schema.users, GIFT_CTX), eq(schema.users.id, id)));
  }
  return { id, email, firstName, lastName };
}

/** Plan de prueba para las suscripciones de `seedMemberWithPlan`. */
export async function seedGiftPlan(app: FastifyInstance): Promise<number> {
  const adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const plan = await createTestPlan(app, adminToken, {
    name: `Plan regalo 215 ${nextSeq()} ${Date.now()}`,
  });
  return plan.id;
}

/** Socio activo con una suscripción en vigor (puede ver la lista de anotados). */
export async function seedMemberWithPlan(
  app: FastifyInstance,
  opts: {
    branchId: number;
    planId: number;
    today: string;
    dateOfBirth?: string | null;
    firstName?: string;
    lastName?: string;
  },
): Promise<GiftPerson> {
  const person = await seedMember(app, {
    branchId: opts.branchId,
    status: "activo",
    dateOfBirth: opts.dateOfBirth,
    firstName: opts.firstName,
    lastName: opts.lastName,
  });
  await app.db.insert(schema.subscriptions).values({
    tenantId: TENANT_TEMPLO,
    userId: person.id,
    planId: opts.planId,
    branchId: opts.branchId,
    status: "active",
    startDate: addDays(opts.today, -40),
    endDate: addDays(opts.today, 20),
    pricePaid: 15000,
    currency: "ARS",
    priceTypeApplied: "regular",
  });
  return person;
}

/** Asistencia a una clase. Devuelve el id de la fila. */
export async function seedAttendance(
  app: FastifyInstance,
  input: {
    memberId: number;
    branchId: number;
    scheduleId: number | null;
    sessionDate: string;
    source?: "qr" | "manual" | "wellhub" | "wellhub_manual";
    checkedInAt?: Date;
  },
): Promise<number> {
  const [result] = await app.dbPool.query(
    `INSERT INTO attendance
       (tenant_id, member_id, branch_id, schedule_id, session_date, checked_in_at, status, source)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmado', ?)`,
    [
      TENANT_TEMPLO,
      input.memberId,
      input.branchId,
      input.scheduleId,
      input.sessionDate,
      input.checkedInAt ?? new Date(),
      input.source ?? "qr",
    ],
  );
  return (result as ResultSetHeader).insertId;
}

/** Reserva de una clase (para probar la clase de prueba y el orden de reserva). */
export async function seedBooking(
  app: FastifyInstance,
  input: {
    memberId: number;
    scheduleId: number;
    bookingDate: string;
    isTrial?: boolean;
    status?: (typeof schema.bookings.status.enumValues)[number];
    bookedAt?: Date;
  },
): Promise<number> {
  const [row] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(GIFT_CTX, {
        memberId: input.memberId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
        status: input.status ?? "reservado",
        isTrial: input.isTrial ?? false,
        source: null,
        bookedAt: input.bookedAt ?? new Date(),
      }),
    )
    .$returningId();
  return row.id;
}

/** Guarda la preferencia de visibilidad (D-05 de la 214). */
export async function setCommunityVisible(
  app: FastifyInstance,
  userId: number,
  visible: boolean,
): Promise<void> {
  await app.db
    .insert(schema.memberProfiles)
    .values(tenantValues(GIFT_CTX, { userId, communityVisible: visible }))
    .onDuplicateKeyUpdate({ set: { communityVisible: visible } });
}

/** Regalo insertado directo en `aura_gifts` (sin Aura en el ledger). */
export async function seedGift(
  app: FastifyInstance,
  input: {
    giverUserId: number;
    receiverUserId: number;
    giverKind?: GiftGiverKind;
    branchId: number;
    scheduleId: number | null;
    sessionDate: string;
    giverAttendanceId?: number | null;
    receiverAttendanceId?: number;
    reason?: GiftReason;
    amount?: number;
    status?: "vigente" | "anulado";
    voidCause?: AuraGiftVoidCause;
  },
): Promise<number> {
  const kind = input.giverKind ?? "alumno";
  const n = nextSeq();
  const [row] = await app.db
    .insert(schema.auraGifts)
    .values(
      tenantValues(GIFT_CTX, {
        giverUserId: input.giverUserId,
        receiverUserId: input.receiverUserId,
        giverKind: kind,
        branchId: input.branchId,
        scheduleId: input.scheduleId,
        sessionDate: input.sessionDate,
        // Alumno: una asistencia propia distinta por regalo (UNIQUE D-02).
        giverAttendanceId:
          kind === "alumno" ? (input.giverAttendanceId ?? 700000 + n) : null,
        receiverAttendanceId: input.receiverAttendanceId ?? 800000 + n,
        // Profe: la fecha del día (UNIQUE D-03).
        coachGiftDate: kind === "profe" ? input.sessionDate : null,
        reason: input.reason ?? "tecnica",
        amount: input.amount ?? (kind === "profe" ? 2 : 1),
        status: input.status ?? "vigente",
        voidCause: input.voidCause ?? null,
      }),
    )
    .$returningId();
  return row.id;
}

/** Suma del ledger de Aura de un usuario (para conciliar con `aura_balances`). */
export async function ledgerSum(
  app: FastifyInstance,
  userId: number,
): Promise<number> {
  const [row] = await app.db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, GIFT_CTX),
        eq(schema.auraTransactions.userId, userId),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Aura ganada de un usuario (la que muestra la app). */
export async function earnedOf(
  app: FastifyInstance,
  userId: number,
): Promise<number> {
  return earnedAuraForUser(app.db, GIFT_CTX, userId);
}
