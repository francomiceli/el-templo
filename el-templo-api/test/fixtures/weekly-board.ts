/**
 * Fixtures compartidas del Tablero semanal de gerencia (fase 206).
 *
 * Las usan los tests de coincidencia por sede (206-03) y las extienden los de
 * 206-04..07. Reglas que respetan todos los helpers:
 *
 *   - Semanas relativas a "ahora" via `currentWeekStart` + `addDays`
 *     (`boardWeeks`). Nunca los helpers de fecha en UTC de helpers.ts ni fake timers.
 *     Los tests de Embudo y Renovaciones siembran en la SEMANA PASADA (`last`):
 *     esta entera en el pasado, asi "clase ocurrida / asistio" no depende de la
 *     hora a la que corre el test.
 *   - Ningun id de `users` hardcodeado: cada helper devuelve los ids que crea.
 *   - Todo INSERT sobre tabla gym-owned pasa por `tenantValues`.
 *   - `branches` NO esta en `cleanAllTestData`: quien llame a
 *     `seedBoardBranches` debe llamar a `cleanupBoardBranches` en su `afterAll`
 *     (despues de `cleanAllTestData`, para que no queden FKs apuntando).
 */
import { and, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { currentWeekStart } from "../../src/modules/weekly-board/week";
import { TENANT_TEMPLO } from "./second-tenant";

// ─── Semanas ────────────────────────────────────────────────────────────────

/** Lunes (YYYY-MM-DD) de la semana en curso, la anterior, la de hace dos y la siguiente. */
export interface BoardWeeks {
  current: string;
  last: string;
  lastMinus1: string;
  next: string;
}

/** Semanas del Tablero relativas a `now` (hora de Argentina, lunes a domingo). */
export function boardWeeks(now: Date = new Date()): BoardWeeks {
  const current = currentWeekStart(now);
  return {
    current,
    last: addDays(current, -7),
    lastMinus1: addDays(current, -14),
    next: addDays(current, 7),
  };
}

// ─── Sedes ──────────────────────────────────────────────────────────────────

export interface BoardBranch {
  id: number;
  name: string;
  country: "AR" | "ES";
}

export interface BoardBranches {
  /** Dos sedes AR fisicas activas. */
  arA: BoardBranch;
  arB: BoardBranch;
  /** Una sede ES fisica activa. */
  es: BoardBranch;
  /** Una sede AR virtual (Online) activa. */
  virtualAr: BoardBranch;
  /** Una sede AR fisica inactiva. */
  inactiveAr: BoardBranch;
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const TZ_AR = "America/Argentina/Buenos_Aires";
const TZ_ES = "Europe/Madrid";

/**
 * Siembra las 5 sedes de los tests del Tablero. `code` (varchar(20), unique
 * compuesta con el tenant) y `name` llevan un sufijo aleatorio: los asserts van
 * sobre estos ids, nunca sobre "cuantas sedes hay" (la base de test ya trae
 * sedes de las migraciones).
 */
export async function seedBoardBranches(
  app: FastifyInstance,
  tenantId: number = TENANT_TEMPLO,
): Promise<BoardBranches> {
  const suf = suffix();
  const scope = { tenantId };

  const insert = async (
    label: string,
    code: string,
    country: "AR" | "ES",
    opts: { isVirtual: boolean; isActive: boolean },
  ): Promise<BoardBranch> => {
    const name = `Tablero ${label} ${suf}`;
    const [row] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(scope, {
          name,
          code: `${code}${suf}`.toUpperCase().slice(0, 20),
          country,
          timezone: country === "ES" ? TZ_ES : TZ_AR,
          isVirtual: opts.isVirtual,
          isActive: opts.isActive,
        }),
      )
      .$returningId();
    return { id: row.id, name, country };
  };

  const arA = await insert("AR A", "TBA", "AR", {
    isVirtual: false,
    isActive: true,
  });
  const arB = await insert("AR B", "TBB", "AR", {
    isVirtual: false,
    isActive: true,
  });
  const es = await insert("ES", "TBE", "ES", {
    isVirtual: false,
    isActive: true,
  });
  const virtualAr = await insert("Online", "TBV", "AR", {
    isVirtual: true,
    isActive: true,
  });
  const inactiveAr = await insert("Inactiva", "TBI", "AR", {
    isVirtual: false,
    isActive: false,
  });
  return { arA, arB, es, virtualAr, inactiveAr };
}

/**
 * Borra las sedes sembradas por `seedBoardBranches`. Llamar DESPUES de
 * `cleanAllTestData` (que vacia los horarios, suscripciones y socios que
 * cuelgan de ellas).
 */
export async function cleanupBoardBranches(
  app: FastifyInstance,
  ids: number[],
  tenantId: number = TENANT_TEMPLO,
): Promise<void> {
  if (ids.length === 0) return;
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, { tenantId }),
        inArray(schema.branches.id, ids),
      ),
    );
}

// ─── Socios ─────────────────────────────────────────────────────────────────

interface SeedMemberOpts {
  tenantId: number;
  branchId: number;
  status: "prueba" | "activo";
  won?: boolean;
}

/** Inserta un socio minimo (sin telefono: el reporte lo tolera). */
async function seedMemberRow(
  app: FastifyInstance,
  opts: SeedMemberOpts,
): Promise<number> {
  const suf = suffix();
  const [row] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(
        { tenantId: opts.tenantId },
        {
          email: `tablero-${suf}@test.local`,
          passwordHash: "x",
          firstName: "Tablero",
          lastName: `Socio ${suf}`,
          role: "member" as const,
          branchId: opts.branchId,
          status: opts.status,
          leadStatus: opts.won
            ? ("ganado" as const)
            : ("en_seguimiento" as const),
          convertedAt: opts.won ? new Date() : null,
        },
      ),
    )
    .$returningId();
  return row.id;
}

// ─── Embudo (Sesiones de prueba) ────────────────────────────────────────────

/** Crea una actividad + un horario en la sede y devuelve el id del horario. */
async function seedScheduleFor(
  app: FastifyInstance,
  tenantId: number,
  branchId: number,
): Promise<number> {
  const scope = { tenantId };
  const [act] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(scope, { name: `Tablero ${suffix()}`, isActive: true }),
    )
    .$returningId();
  const [sch] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(scope, {
        branchId,
        activityId: act.id,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      }),
    )
    .$returningId();
  return sch.id;
}

export interface SeedTrialBookingOpts {
  /** Sede de la CLASE de prueba (donde cuenta el Embudo, D-13). */
  branchId: number;
  /** Fecha de la clase (YYYY-MM-DD). */
  bookingDate: string;
  /** "si" = hay presente confirmado. "no" = sin presente (clase ya ocurrida si es pasada). */
  attended: "si" | "no";
  /** `true` = el lead quedo ganado (compro). */
  won: boolean;
  /** Sede asignada del socio. Default: la de la clase. */
  userBranchId?: number;
  tenantId?: number;
}

/**
 * Una sesion de prueba: socio + reserva `is_trial` (+ presente si asistio).
 * Devuelve los ids creados.
 */
export async function seedTrialBooking(
  app: FastifyInstance,
  opts: SeedTrialBookingOpts,
): Promise<{ userId: number; bookingId: number; scheduleId: number }> {
  const tenantId = opts.tenantId ?? TENANT_TEMPLO;
  const scope = { tenantId };
  const userId = await seedMemberRow(app, {
    tenantId,
    branchId: opts.userBranchId ?? opts.branchId,
    status: opts.won ? "activo" : "prueba",
    won: opts.won,
  });
  const scheduleId = await seedScheduleFor(app, tenantId, opts.branchId);
  const [booking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(scope, {
        memberId: userId,
        scheduleId,
        bookingDate: opts.bookingDate,
        status: "reservado" as const,
        isTrial: true,
      }),
    )
    .$returningId();

  if (opts.attended === "si") {
    await app.db.insert(schema.attendance).values(
      tenantValues(scope, {
        memberId: userId,
        branchId: opts.branchId,
        scheduleId,
        sessionDate: opts.bookingDate,
        status: "confirmado" as const,
        source: "manual" as const,
      }),
    );
  }
  return { userId, bookingId: booking.id, scheduleId };
}

export interface SeedRescheduledTrialOpts {
  branchId: number;
  /** Fecha de la sesion original (queda "Reagendada": no suma reserva). */
  parentDate: string;
  /** Fecha de la sesion nueva (la que la persona cuenta). */
  childDate: string;
  tenantId?: number;
}

/**
 * Una prueba reagendada: sesion original cancelada + sesion nueva vinculada por
 * `trial_followups.rescheduled_from_booking_id` (el mismo vinculo que escribe
 * `rescheduleTrial`). La original deriva a "reagendada" y no cuenta; la nueva
 * cuenta una vez, sin presente.
 */
export async function seedRescheduledTrial(
  app: FastifyInstance,
  opts: SeedRescheduledTrialOpts,
): Promise<{
  userId: number;
  parentBookingId: number;
  childBookingId: number;
}> {
  const tenantId = opts.tenantId ?? TENANT_TEMPLO;
  const scope = { tenantId };
  const userId = await seedMemberRow(app, {
    tenantId,
    branchId: opts.branchId,
    status: "prueba",
  });
  const scheduleId = await seedScheduleFor(app, tenantId, opts.branchId);

  const [parent] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(scope, {
        memberId: userId,
        scheduleId,
        bookingDate: opts.parentDate,
        status: "cancelado" as const,
        isTrial: true,
      }),
    )
    .$returningId();
  const [child] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(scope, {
        memberId: userId,
        scheduleId,
        bookingDate: opts.childDate,
        status: "reservado" as const,
        isTrial: true,
      }),
    )
    .$returningId();
  await app.db.insert(schema.trialFollowups).values(
    tenantValues(scope, {
      bookingId: child.id,
      rescheduledFromBookingId: parent.id,
    }),
  );
  return {
    userId,
    parentBookingId: parent.id,
    childBookingId: child.id,
  };
}

// ─── Renovaciones ───────────────────────────────────────────────────────────

/** Resultado deseado de un vencimiento sembrado. */
export type ExpiringOutcome =
  /** Sub siguiente que arranca al dia siguiente del vencimiento (dentro de los 5 dias). */
  | "renovo"
  /** Followup manual `no_renovo`, sin sub siguiente. */
  | "no_renovo_manual"
  /** Sin followup ni sub siguiente: "en proceso" y 0 mensajes (= sin contactar). */
  | "en_proceso_sin_mensajes";

export interface SeedExpiringMembershipOpts {
  /** Sede asignada del alumno (`users.branch_id`, D-12). */
  memberBranchId: number;
  /** Sede de la suscripcion que vence (`subscriptions.branch_id`). */
  subBranchId: number;
  /** Fecha de vencimiento (YYYY-MM-DD). Debe ser pasada. */
  endDate: string;
  outcome: ExpiringOutcome;
  tenantId?: number;
}

/**
 * Plan de membresia presencial de 30 dias (>= 7, no trial, no especial: entra
 * en Renovaciones tipo "membresia"). Nombre unico por llamada.
 */
async function seedMembershipPlan(
  app: FastifyInstance,
  tenantId: number,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(
        { tenantId },
        {
          name: `Tablero Foundation ${suffix()}`,
          planTier: "flex" as const,
          bookingMode: "flexible" as const,
          planCategory: "presencial" as const,
          priceRegular: 15000,
          priceZero: 10000,
          durationDays: 30,
          classesPerWeek: 3,
          country: "AR",
          currency: "ARS" as const,
        },
      ),
    )
    .$returningId();
  return row.id;
}

/**
 * Un alumno de plan cuya membresia vence en `endDate`, con el resultado de
 * renovacion elegido. Devuelve los ids creados.
 */
export async function seedExpiringMembership(
  app: FastifyInstance,
  opts: SeedExpiringMembershipOpts,
): Promise<{ userId: number; subscriptionId: number; planId: number }> {
  const tenantId = opts.tenantId ?? TENANT_TEMPLO;
  const scope = { tenantId };
  const userId = await seedMemberRow(app, {
    tenantId,
    branchId: opts.memberBranchId,
    status: "activo",
  });
  const planId = await seedMembershipPlan(app, tenantId);

  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(scope, {
        userId,
        planId,
        branchId: opts.subBranchId,
        status: "expired" as const,
        startDate: addDays(opts.endDate, -30),
        endDate: opts.endDate,
        pricePaid: 15000,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  if (opts.outcome === "renovo") {
    await app.db.insert(schema.subscriptions).values(
      tenantValues(scope, {
        userId,
        planId,
        branchId: opts.subBranchId,
        status: "active" as const,
        startDate: addDays(opts.endDate, 1),
        endDate: addDays(opts.endDate, 31),
        pricePaid: 15000,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    );
  } else if (opts.outcome === "no_renovo_manual") {
    await app.db.insert(schema.renewalFollowups).values(
      tenantValues(scope, {
        subscriptionId: sub.id,
        userId,
        messageCount: 1,
        manualStatus: "no_renovo" as const,
      }),
    );
  }
  return { userId, subscriptionId: sub.id, planId };
}
