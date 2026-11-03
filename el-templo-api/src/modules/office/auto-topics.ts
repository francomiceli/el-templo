/**
 * Temas automáticos de Oficina (Fase 205, plan 03) — detectores del job
 * `office-auto-topics`.
 *
 * Tres señales que hoy se pierden se convierten en temas del sistema:
 *   1. Webhook de Wellhub con error  (`wellhub_event:<id>`)             — D-11
 *   2. Jornada de staff sin cerrar   (`staff_shift:<id>`)                — D-12
 *   3. Clase de mañana sin profe     (`clase_sin_profe:<schedule>:<día>`) — D-13
 *
 * Cada `syncX` hace lo mismo (ver `reconcile`): detecta lo que está mal ahora,
 * abre un tema por cada hallazgo y cierra los temas del sistema abiertos cuya
 * condición ya no se cumple. La unique (tenant, source_key) del servicio hace
 * que un tema cerrado a mano NO se reabra mientras la condición persista (D-04).
 *
 * "Hoy" y "mañana" se calculan SIEMPRE en la zona horaria de cada sede
 * (`todayInTz`), nunca con la del servidor. Toda lectura lleva `tenantWhere`.
 */
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  gt,
  type SQL,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  isoDayOfWeek,
  isoWeekStart,
  RosterAttributionIndex,
  type RosterChangePoint,
} from "../ratings/roster-attribution";
import type { OfficeService } from "./service";
import type { CreateSystemTopicInput, OfficeSystemTopicRef } from "./types";

type Db = MySql2Database<typeof schema>;

const WELLHUB_WINDOW_DAYS = 7;
const WELLHUB_ERROR_MAX = 500;

export const WELLHUB_PREFIX = "wellhub_event:";
export const STAFF_SHIFT_PREFIX = "staff_shift:";
export const CLASS_NO_COACH_PREFIX = "clase_sin_profe:";

/** Resultado de un `syncX`: cuántos temas abrió y cuántos cerró. */
export interface SyncResult {
  opened: number;
  closed: number;
}

export interface AutoTopicsResult extends SyncResult {
  woken: number;
}

const EMPTY_SYNC: SyncResult = { opened: 0, closed: 0 };

// ───────────────────────────── Helpers ─────────────────────────────

function personName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const full = [firstName, lastName]
    .map((p) => p?.trim() ?? "")
    .filter((p) => p !== "")
    .join(" ");
  return full === "" ? null : full;
}

/** "2026-11-03" -> "03/11". */
function shortDate(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

/** Hora "HH:MM" de un instante en la zona horaria de la sede. */
function timeInTz(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** Sedes activas del gimnasio con su zona horaria. */
async function loadActiveBranches(
  db: Db,
  ctx: TenantContext,
): Promise<Array<{ id: number; name: string; timezone: string }>> {
  return db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
    })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.isActive, true),
        // Las sedes virtuales (online) no tienen jornadas ni clases con profe.
        eq(schema.branches.isVirtual, false),
      ),
    )
    .orderBy(asc(schema.branches.id));
}

/**
 * Corazón común de los tres sync: abre un tema por hallazgo (ignora los que ya
 * existían, en cualquier estado) y cierra los temas del sistema abiertos con
 * ese prefijo cuyo `source_key` ya no está en `stillValid`.
 */
async function reconcile(
  service: OfficeService,
  ctx: TenantContext,
  prefix: string,
  detected: CreateSystemTopicInput[],
  stillValid: Set<string>,
  closeReason: (ref: OfficeSystemTopicRef) => Promise<string> | string,
): Promise<SyncResult> {
  let opened = 0;
  for (const input of detected) {
    const id = await service.createSystemTopic(ctx, input);
    if (id !== null) opened += 1;
  }

  let closed = 0;
  const open = await service.listOpenSystemTopics(ctx, prefix);
  for (const ref of open) {
    if (stillValid.has(ref.sourceKey)) continue;
    const reason = await closeReason(ref);
    if (await service.closeSystemTopic(ctx, ref.sourceKey, reason)) closed += 1;
  }
  return { opened, closed };
}

/** Id numérico de un source_key `prefijo<id>`; null si no tiene esa forma. */
function numericSuffix(sourceKey: string, prefix: string): number | null {
  const n = Number(sourceKey.slice(prefix.length));
  return Number.isInteger(n) ? n : null;
}

// ───────────────────────────── 1. Wellhub ─────────────────────────────

/**
 * D-11: eventos de Wellhub con `status = 'error'` de los últimos 7 días. El
 * tema se cierra cuando el evento deja de estar en error (Wellhub lo reprocesó)
 * o cuando el error es más viejo que la ventana y nadie lo atendió.
 */
export async function syncWellhubErrors(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
): Promise<SyncResult> {
  const since = new Date(
    now.getTime() - WELLHUB_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const events = await db
    .select({
      id: schema.wellhubEvents.id,
      eventId: schema.wellhubEvents.eventId,
      eventType: schema.wellhubEvents.eventType,
      error: schema.wellhubEvents.error,
    })
    .from(schema.wellhubEvents)
    .where(
      and(
        tenantWhere(schema.wellhubEvents, ctx),
        eq(schema.wellhubEvents.status, "error"),
        gte(schema.wellhubEvents.createdAt, since),
      ),
    )
    .orderBy(asc(schema.wellhubEvents.id));

  const detected: CreateSystemTopicInput[] = events.map((e) => ({
    sourceKey: `${WELLHUB_PREFIX}${e.id}`,
    title: `Webhook de Wellhub con error (${e.eventType})`,
    body: e.error ? e.error.slice(0, WELLHUB_ERROR_MAX) : null,
    targetKind: "wellhub_evento",
    targetId: e.id,
    targetLabel: e.eventId,
    branchId: null,
  }));

  return reconcile(
    service,
    ctx,
    WELLHUB_PREFIX,
    detected,
    new Set(detected.map((d) => d.sourceKey)),
    async (ref) => {
      // Fuera de la ventana pero todavía en error: no es que se haya resuelto.
      const eventId = numericSuffix(ref.sourceKey, WELLHUB_PREFIX);
      if (eventId !== null) {
        const [row] = await db
          .select({ status: schema.wellhubEvents.status })
          .from(schema.wellhubEvents)
          .where(
            and(
              tenantWhere(schema.wellhubEvents, ctx),
              eq(schema.wellhubEvents.id, eventId),
            ),
          )
          .limit(1);
        if (row === undefined) {
          return "El evento ya no figura en este gimnasio";
        }
        if (row.status === "error") {
          return `El error tiene más de ${WELLHUB_WINDOW_DAYS} días: se cierra solo`;
        }
      }
      return "Wellhub lo reprocesó bien";
    },
  );
}

// ───────────────────────────── 2. Jornadas ─────────────────────────────

/**
 * D-12: jornadas con `checked_out_at IS NULL` y `shift_date` anterior a hoy en
 * la zona horaria de SU sede (misma regla `staleOpen` del dashboard de
 * check-in). Se cierra cuando aparece `checked_out_at`.
 */
export async function syncStaleShifts(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
): Promise<SyncResult> {
  const rows = await db
    .select({
      id: schema.staffShifts.id,
      branchId: schema.staffShifts.branchId,
      branchName: schema.branches.name,
      timezone: schema.branches.timezone,
      shiftDate: schema.staffShifts.shiftDate,
      checkedInAt: schema.staffShifts.checkedInAt,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.staffShifts)
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.staffShifts.branchId, schema.branches.id),
      ),
    )
    .innerJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.staffShifts.userId, schema.users.id),
      ),
    )
    .where(
      and(
        tenantWhere(schema.staffShifts, ctx),
        isNull(schema.staffShifts.checkedOutAt),
      ),
    )
    .orderBy(asc(schema.staffShifts.id));

  const todayByTz = new Map<string, string>();
  const todayOf = (tz: string): string => {
    let today = todayByTz.get(tz);
    if (today === undefined) {
      today = todayInTz(tz, now);
      todayByTz.set(tz, today);
    }
    return today;
  };

  const detected: CreateSystemTopicInput[] = [];
  for (const r of rows) {
    if (r.shiftDate >= todayOf(r.timezone)) continue; // la jornada de hoy sigue en curso
    const name = personName(r.firstName, r.lastName) ?? "Sin nombre";
    detected.push({
      sourceKey: `${STAFF_SHIFT_PREFIX}${r.id}`,
      title: `Jornada sin cerrar: ${name} en ${r.branchName} (${shortDate(r.shiftDate)})`,
      body: `Entró ${timeInTz(r.checkedInAt, r.timezone)} y no registró salida. Se puede cerrar desde Check-in › Jornadas.`,
      targetKind: "jornada",
      targetId: r.id,
      targetLabel: name,
      branchId: r.branchId,
    });
  }

  return reconcile(
    service,
    ctx,
    STAFF_SHIFT_PREFIX,
    detected,
    new Set(detected.map((d) => d.sourceKey)),
    () => "Se cerró la jornada",
  );
}

// ───────────────────────────── 3. Clase sin profe ─────────────────────────────

interface ClassCandidate {
  scheduleId: number;
  branchId: number;
  branchName: string;
  activityName: string;
  startTime: string;
  date: string;
}

/**
 * Clases sin profe de una sede para una fecha. Resolución COPIADA de
 * `RatingsService.resolveRosterCoachId` (ratings/service.ts): el profe propio
 * del horario (`schedules.coach_user_id`) gana; si no, el change-point más
 * reciente del roster con semana <= lunes de la fecha, para el mismo
 * (sede, día, turno). Los helpers son los de `ratings/roster-attribution.ts`.
 */
async function findClassesWithoutCoach(
  db: Db,
  ctx: TenantContext,
  branch: { id: number; name: string },
  date: string,
): Promise<ClassCandidate[]> {
  const dayOfWeek = isoDayOfWeek(date);
  if (dayOfWeek > 6) return []; // el domingo no hay horarios ni roster

  const notDeleted: SQL | undefined = or(
    isNull(schema.schedules.deletedFrom),
    gt(schema.schedules.deletedFrom, date),
  );
  const schedules = await db
    .select({
      id: schema.schedules.id,
      startTime: schema.schedules.startTime,
      coachUserId: schema.schedules.coachUserId,
      activityName: schema.activities.name,
    })
    .from(schema.schedules)
    .innerJoin(
      schema.activities,
      and(
        tenantWhere(schema.activities, ctx),
        eq(schema.schedules.activityId, schema.activities.id),
      ),
    )
    .where(
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.branchId, branch.id),
        eq(schema.schedules.dayOfWeek, dayOfWeek),
        eq(schema.schedules.isActive, true),
        notDeleted,
      ),
    )
    .orderBy(asc(schema.schedules.startTime), asc(schema.schedules.id));
  if (schedules.length === 0) return [];

  // Clases canceladas puntualmente para esa fecha: no cuentan.
  const exceptions = await db
    .select({ scheduleId: schema.scheduleExceptions.scheduleId })
    .from(schema.scheduleExceptions)
    .where(
      and(
        tenantWhere(schema.scheduleExceptions, ctx),
        eq(schema.scheduleExceptions.exceptionDate, date),
        inArray(
          schema.scheduleExceptions.scheduleId,
          schedules.map((s) => s.id),
        ),
      ),
    );
  const cancelled = new Set(exceptions.map((e) => e.scheduleId));

  // Change-points del roster para el día de la semana, hasta el lunes de la fecha.
  /* tenant-safe: class_coach_assignments se escribe sin tenant_id
     (ratings/service.ts) y se ancla por branch_id, que ya viene de
     loadActiveBranches filtrado por tenant — mismo patron que
     getEffectiveRosterCells en ratings/roster-attribution.ts */
  const changePoints = await db
    .select({
      branchId: schema.classCoachAssignments.branchId,
      weekStartDate: schema.classCoachAssignments.weekStartDate,
      dayOfWeek: schema.classCoachAssignments.dayOfWeek,
      slot: schema.classCoachAssignments.slot,
      coachId: schema.classCoachAssignments.coachId,
    })
    .from(schema.classCoachAssignments)
    .where(
      and(
        eq(schema.classCoachAssignments.branchId, branch.id),
        eq(schema.classCoachAssignments.dayOfWeek, dayOfWeek),
        lte(schema.classCoachAssignments.weekStartDate, isoWeekStart(date)),
      ),
    );
  // El índice resuelve por (sede, día, turno) y semana; acá el nombre del profe
  // no hace falta (solo si hay o no hay), por eso `coachName` va vacío.
  const roster = new RosterAttributionIndex(
    changePoints.map((cp): RosterChangePoint => ({ ...cp, coachName: "" })),
  );

  const out: ClassCandidate[] = [];
  for (const s of schedules) {
    if (cancelled.has(s.id)) continue;
    if (s.coachUserId) continue;
    const resolved = roster.resolve({
      branchId: branch.id,
      sessionDate: date,
      startTime: s.startTime,
    });
    if (resolved) continue;
    out.push({
      scheduleId: s.id,
      branchId: branch.id,
      branchName: branch.name,
      activityName: s.activityName,
      startTime: s.startTime,
      date,
    });
  }
  return out;
}

/**
 * D-13: por sede activa, las clases de MAÑANA (en la zona horaria de la sede)
 * sin profe. Se abre un tema por cada una; se cierra cuando el profe resuelve
 * o cuando la fecha ya pasó.
 *
 * Un tema abierto ayer para una clase de HOY que sigue sin profe no se cierra:
 * por eso la condición "sigue vigente" mira hoy y mañana, aunque solo se abran
 * temas nuevos para mañana.
 */
export async function syncClassesWithoutCoach(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
): Promise<SyncResult> {
  const branches = await loadActiveBranches(db, ctx);

  const detected: CreateSystemTopicInput[] = [];
  const stillValid = new Set<string>();
  const todays: string[] = [];

  for (const branch of branches) {
    const today = todayInTz(branch.timezone, now);
    const tomorrow = addDays(today, 1);
    todays.push(today);

    for (const dateToCheck of [today, tomorrow]) {
      const missing = await findClassesWithoutCoach(
        db,
        ctx,
        branch,
        dateToCheck,
      );
      for (const c of missing) {
        const sourceKey = `${CLASS_NO_COACH_PREFIX}${c.scheduleId}:${c.date}`;
        stillValid.add(sourceKey);
        if (dateToCheck !== tomorrow) continue;
        detected.push({
          sourceKey,
          title: `Clase sin profe mañana: ${c.activityName} ${c.startTime} en ${c.branchName}`,
          body: "Sin profe en el roster para esa franja. Asignalo desde Horarios.",
          targetKind: "horario",
          targetId: c.scheduleId,
          targetLabel: `${c.activityName} ${c.startTime}`,
          branchId: c.branchId,
        });
      }
    }
  }

  // "Ya pasó" solo si pasó en todas las sedes: la fecha más chica de "hoy".
  const earliestToday =
    todays.length > 0
      ? todays.reduce((a, b) => (a < b ? a : b))
      : todayInTz(DEFAULT_TENANT_TIMEZONE, now);

  return reconcile(
    service,
    ctx,
    CLASS_NO_COACH_PREFIX,
    detected,
    stillValid,
    (ref) => {
      const date = ref.sourceKey.slice(ref.sourceKey.lastIndexOf(":") + 1);
      return date < earliestToday
        ? "Pasó la fecha"
        : "Ya tiene profe o la clase dejó de estar programada";
    },
  );
}

// ───────────────────────────── Runner ─────────────────────────────

/**
 * Corrida completa para UN gimnasio: despierta los dormidos vencidos (D-09) y
 * sincroniza las tres señales. Cada paso está aislado: si uno falla se loguea
 * (llega a Sentry) y los demás siguen.
 */
export async function runOfficeAutoTopicsForTenant(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  log: FastifyBaseLogger,
): Promise<AutoTopicsResult> {
  const total: AutoTopicsResult = { ...EMPTY_SYNC, woken: 0 };

  try {
    total.woken = await service.wakeDueTopics(ctx);
  } catch (err: unknown) {
    log.error(
      { err, tenantId: ctx.tenantId },
      "office auto-topics: falló el despertar de dormidos",
    );
  }

  const steps: Array<{
    name: string;
    run: () => Promise<SyncResult>;
  }> = [
    { name: "wellhub", run: () => syncWellhubErrors(db, service, ctx, now) },
    { name: "jornadas", run: () => syncStaleShifts(db, service, ctx, now) },
    {
      name: "clase_sin_profe",
      run: () => syncClassesWithoutCoach(db, service, ctx, now),
    },
  ];
  for (const step of steps) {
    try {
      const r = await step.run();
      total.opened += r.opened;
      total.closed += r.closed;
    } catch (err: unknown) {
      log.error(
        { err, tenantId: ctx.tenantId, signal: step.name },
        "office auto-topics: falló un detector",
      );
    }
  }
  return total;
}
