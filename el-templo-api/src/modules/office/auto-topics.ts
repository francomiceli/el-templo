/**
 * Temas automáticos de Oficina (Fase 205, plan 03) — detectores del job
 * `office-auto-topics`.
 *
 * Seis señales que hoy se pierden se convierten en temas del sistema:
 *   1. Webhook de Wellhub con error  (`wellhub_event:<id>`)             — D-11
 *   2. Jornada de staff sin cerrar   (`staff_shift:<id>`)                — D-12
 *   3. Clase de mañana sin profe     (`clase_sin_profe:<schedule>:<día>`) — D-13
 *   4. Arqueo de caja con diferencia (`arqueo_dif:<caja>:<arqueo>`)      — D-23
 *   5. Wellhub: clases sin publicar  (`wellhub_sin_publicar:<sede>:<día>`) — D-24
 *   6. Tablero: leads sin cargar     (`tablero_leads:<lunes de la semana>`) — D-25
 *
 * Cada `syncX` hace lo mismo (ver `reconcile`): detecta lo que está mal ahora,
 * abre un tema por cada hallazgo y cierra los temas del sistema abiertos cuya
 * condición ya no se cumple. La unique (tenant, source_key) del servicio hace
 * que un tema cerrado a mano NO se reabra mientras la condición persista (D-04).
 *
 * Avisos automáticos (mig 0321): la gerencia puede apagar cada detector para
 * todo el gimnasio o por sede (`office_auto_topic_mutes`). La detección corre
 * igual (es barata) para que los temas abiertos de lo silenciado se cierren
 * con el motivo "Aviso desactivado…" y no con el de "se resolvió". Al volver a
 * activar un aviso, un tema ya cerrado NO se reabre (misma unique de
 * `source_key`, D-04): solo abren los episodios nuevos.
 *
 * "Hoy" y "mañana" se calculan SIEMPRE en la zona horaria de cada sede
 * (`todayInTz`), nunca con la del servidor. Toda lectura lleva `tenantWhere`.
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
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
  buildClassDateTime,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../shared/date-utils";
import { moneyEquals, roundMoney } from "../shared/money";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  isoDayOfWeek,
  isoWeekStart,
  RosterAttributionIndex,
  type RosterChangePoint,
} from "../ratings/roster-attribution";
import {
  currentWeekStart,
  BOARD_TZ,
  isLeadsEditableWeek,
} from "../weekly-board/week";
import { loadLeadsBranches } from "../weekly-board/leads-branches";
import { getWellhubConfig } from "../wellhub/config";
import {
  loadPublishableSchedules,
  loadSkippedDates,
} from "../wellhub/eligibility";
import type { OfficeService } from "./service";
import {
  AUTO_TOPIC_MUTED_REASON,
  CASH_DIFF_PREFIX,
  CLASS_NO_COACH_PREFIX,
  OFFICE_AUTO_DETECTOR_KEYS,
  STAFF_SHIFT_PREFIX,
  TABLERO_LEADS_PREFIX,
  TABLERO_MUTED_BRANCHES_REASON,
  WELLHUB_PREFIX,
  WELLHUB_UNPUBLISHED_PREFIX,
  type OfficeAutoDetectorKey,
} from "./auto-topics-catalog";
import {
  loadAutoTopicMutes,
  NO_AUTO_TOPIC_MUTES,
  type AutoTopicMutes,
} from "./auto-topics-mutes";
import type { CreateSystemTopicInput, OfficeSystemTopicRef } from "./types";

type Db = MySql2Database<typeof schema>;

const WELLHUB_WINDOW_DAYS = 7;
const WELLHUB_ERROR_MAX = 500;

export {
  WELLHUB_PREFIX,
  STAFF_SHIFT_PREFIX,
  CLASS_NO_COACH_PREFIX,
  CASH_DIFF_PREFIX,
  WELLHUB_UNPUBLISHED_PREFIX,
  TABLERO_LEADS_PREFIX,
};

const CASH_COUNT_WINDOW_DAYS = 30;
const CASH_NOTES_MAX = 500;
/** Horarios más nuevos que esto no cuentan: el sync (cada 30 min) todavía no los vio. */
const WELLHUB_GRACE_HOURS = 2;
/** Máximo de líneas de la lista en el cuerpo de un tema (Wellhub, Tablero). */
const MAX_BODY_LINES = 20;

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

/** Sedes activas y físicas del gimnasio con su zona horaria. */
export async function loadActiveBranches(
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
 * Corazón común de los sync: abre un tema por hallazgo (ignora los que ya
 * existían, en cualquier estado) y cierra los temas del sistema abiertos con
 * ese prefijo cuyo `source_key` ya no está en `stillValid`.
 *
 * `isBranchMuted` (avisos automáticos, mig 0321) recibe la sede de un tema
 * (null = sin sede) y dice si ese aviso está apagado ahí: los hallazgos
 * silenciados no abren tema, y un tema abierto que SIGUE vigente pero quedó
 * silenciado se cierra con el motivo de "Aviso desactivado". Si la condición
 * ya se había resuelto, gana el motivo normal.
 */
async function reconcile(
  service: OfficeService,
  ctx: TenantContext,
  prefix: string,
  detected: CreateSystemTopicInput[],
  stillValid: Set<string>,
  closeReason: (ref: OfficeSystemTopicRef) => Promise<string> | string,
  isBranchMuted: (branchId: number | null) => boolean = () => false,
): Promise<SyncResult> {
  let opened = 0;
  for (const input of detected) {
    if (isBranchMuted(input.branchId)) continue;
    const id = await service.createSystemTopic(ctx, input);
    if (id !== null) opened += 1;
  }

  let closed = 0;
  const open = await service.listOpenSystemTopics(ctx, prefix);
  for (const ref of open) {
    const valid = stillValid.has(ref.sourceKey);
    if (valid && !isBranchMuted(ref.branchId)) continue;
    const reason = valid ? AUTO_TOPIC_MUTED_REASON : await closeReason(ref);
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
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
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
    (branchId) => mutes.isMuted("wellhub_error", branchId),
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
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
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
    (branchId) => mutes.isMuted("jornada_abierta", branchId),
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
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
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
    (branchId) => mutes.isMuted("clase_sin_profe", branchId),
  );
}

// ───────────────────────────── 4. Arqueo con diferencia ─────────────────────────────

/**
 * "+$ 2.000" / "-$ 2.000" (con signo) o "$ 10.000" en la moneda de la caja.
 * Regla de la fase 207 (DI-05): sin decimales si el importe es entero, y si no,
 * exactamente 2 ("-$ 0,50"). Con importes enteros el texto es idéntico al de
 * antes (no rompe el dedupe ni los temas ya creados).
 */
function formatMoney(
  amount: number,
  currency: string,
  signed: boolean,
): string {
  const fractionDigits = Number.isInteger(roundMoney(amount)) ? 0 : 2;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay: signed ? "always" : "auto",
    })
      .format(amount)
      .replace(/ /g, " ");
  } catch {
    // Código de moneda que Intl no conoce: mejor un texto simple que romper el detector.
    return `${signed && amount > 0 ? "+" : ""}${amount} ${currency}`;
  }
}

/** "03/11 18:40" de un instante en la zona horaria dada. */
function dateTimeInTz(instant: Date, tz: string): string {
  return `${shortDate(todayInTz(tz, instant))} ${timeInTz(instant, tz)}`;
}

interface CashCountRow {
  id: number;
  cashRegisterId: number;
  countedAt: Date;
  difference: number;
  expectedAmount: number;
  countedAmount: number;
  notes: string | null;
  cajaName: string;
  currency: string;
  branchId: number | null;
  timezone: string;
  counterName: string | null;
}

/**
 * Id del arqueo que abrió el episodio cuando la racha de diferencias empezó
 * ANTES de la ventana de 30 días: el primer arqueo posterior al último arqueo
 * en 0 anterior a la ventana (o el primero de la caja si nunca hubo uno en 0).
 * Sin esto, una diferencia que nadie ajusta (se repite arqueo tras arqueo)
 * cambiaría de `source_key` cuando el arqueo que la abrió sale de la ventana y
 * un tema cerrado a mano se reabriría.
 */
async function findEpisodeOpenerBefore(
  db: Db,
  ctx: TenantContext,
  cashRegisterId: number,
  since: Date,
): Promise<number | null> {
  const [lastZero] = await db
    .select({
      id: schema.cashCounts.id,
      countedAt: schema.cashCounts.countedAt,
    })
    .from(schema.cashCounts)
    .where(
      and(
        tenantWhere(schema.cashCounts, ctx),
        eq(schema.cashCounts.cashRegisterId, cashRegisterId),
        eq(schema.cashCounts.difference, 0),
        lt(schema.cashCounts.countedAt, since),
      ),
    )
    .orderBy(desc(schema.cashCounts.countedAt), desc(schema.cashCounts.id))
    .limit(1);

  // Posteriores al último arqueo en 0 (si no hubo ninguno, desde el principio).
  const afterLastZero: SQL | undefined = lastZero
    ? or(
        gt(schema.cashCounts.countedAt, lastZero.countedAt),
        and(
          eq(schema.cashCounts.countedAt, lastZero.countedAt),
          gt(schema.cashCounts.id, lastZero.id),
        ),
      )
    : undefined;
  const [opener] = await db
    .select({ id: schema.cashCounts.id })
    .from(schema.cashCounts)
    .where(
      and(
        tenantWhere(schema.cashCounts, ctx),
        eq(schema.cashCounts.cashRegisterId, cashRegisterId),
        lt(schema.cashCounts.countedAt, since),
        afterLastZero,
      ),
    )
    .orderBy(asc(schema.cashCounts.countedAt), asc(schema.cashCounts.id))
    .limit(1);
  return opener?.id ?? null;
}

function cashCountBody(row: CashCountRow): string {
  const who = row.counterName ?? "alguien del equipo";
  const lines = [
    `Arqueo del ${dateTimeInTz(row.countedAt, row.timezone)} hecho por ${who}.`,
    `Esperado: ${formatMoney(row.expectedAmount, row.currency, false)} · Contado: ${formatMoney(row.countedAmount, row.currency, false)} · Diferencia: ${formatMoney(row.difference, row.currency, true)}.`,
  ];
  const note = row.notes?.trim();
  if (note) lines.push(`Nota: ${note.slice(0, CASH_NOTES_MAX)}`);
  return lines.join("\n");
}

/**
 * D-23: arqueos de caja (últimos 30 días) con `difference != 0`. A lo sumo UN
 * tema abierto por caja: el episodio arranca en el primer arqueo con diferencia
 * después de un arqueo en 0 (o del primero que vemos) y su id va en el
 * `source_key`. Los arqueos siguientes con diferencia dentro del episodio
 * agregan un evento `sistema` (una vez por arqueo) al tema abierto. Se cierra
 * solo cuando el último arqueo de la caja da 0. Un tema cerrado a mano no se
 * reabre mientras dure el episodio (D-04).
 *
 * `difference` = contado − esperado, y el esperado sale del saldo del ledger
 * (cash-count-service.ts), que un arqueo NO modifica: si la diferencia no se
 * ajusta con un movimiento manual, el arqueo siguiente vuelve a dar la misma
 * diferencia. Por eso un episodio puede durar muchos arqueos.
 */
export async function syncCashCountDifferences(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
): Promise<SyncResult> {
  const since = new Date(
    now.getTime() - CASH_COUNT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const raw = await db
    .select({
      id: schema.cashCounts.id,
      cashRegisterId: schema.cashCounts.cashRegisterId,
      countedAt: schema.cashCounts.countedAt,
      difference: schema.cashCounts.difference,
      expectedAmount: schema.cashCounts.expectedAmount,
      countedAmount: schema.cashCounts.countedAmount,
      notes: schema.cashCounts.notes,
      cajaName: schema.cashRegisters.name,
      currency: schema.cashRegisters.currency,
      branchId: schema.cashRegisters.branchId,
      timezone: schema.branches.timezone,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.cashCounts)
    .innerJoin(
      schema.cashRegisters,
      and(
        tenantWhere(schema.cashRegisters, ctx),
        eq(schema.cashRegisters.id, schema.cashCounts.cashRegisterId),
        eq(schema.cashRegisters.isActive, true),
      ),
    )
    .leftJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.cashRegisters.branchId),
      ),
    )
    .leftJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.cashCounts.countedBy),
      ),
    )
    .where(
      and(
        tenantWhere(schema.cashCounts, ctx),
        gte(schema.cashCounts.countedAt, since),
      ),
    )
    .orderBy(
      asc(schema.cashCounts.cashRegisterId),
      asc(schema.cashCounts.countedAt),
      asc(schema.cashCounts.id),
    );

  const byCaja = new Map<number, CashCountRow[]>();
  for (const r of raw) {
    const row: CashCountRow = {
      id: r.id,
      cashRegisterId: r.cashRegisterId,
      countedAt: r.countedAt,
      difference: r.difference,
      expectedAmount: r.expectedAmount,
      countedAmount: r.countedAmount,
      notes: r.notes,
      cajaName: r.cajaName,
      currency: r.currency,
      branchId: r.branchId,
      timezone: r.timezone ?? DEFAULT_TENANT_TIMEZONE,
      counterName: personName(r.firstName, r.lastName),
    };
    const list = byCaja.get(row.cashRegisterId);
    if (list) list.push(row);
    else byCaja.set(row.cashRegisterId, [row]);
  }

  interface Episode {
    sourceKey: string;
    /** Arqueos de la racha dentro de la ventana, del más viejo al más nuevo. */
    run: CashCountRow[];
    /** Arqueo con el que se abre el tema (el que arranca la racha en la ventana). */
    first: CashCountRow;
  }
  const episodes: Episode[] = [];
  const lastDiffByCaja = new Map<number, number>();

  for (const [cajaId, rows] of byCaja) {
    const last = rows[rows.length - 1];
    lastDiffByCaja.set(cajaId, last.difference);
    if (moneyEquals(last.difference, 0)) continue;

    let start = rows.length - 1;
    while (start > 0 && !moneyEquals(rows[start - 1].difference, 0)) start -= 1;
    const run = rows.slice(start);

    let openerId = run[0].id;
    if (start === 0) {
      openerId =
        (await findEpisodeOpenerBefore(db, ctx, cajaId, since)) ?? openerId;
    }
    episodes.push({
      sourceKey: `${CASH_DIFF_PREFIX}${cajaId}:${openerId}`,
      run,
      first: run[0],
    });
  }

  const detected: CreateSystemTopicInput[] = episodes.map((e) => ({
    sourceKey: e.sourceKey,
    title: `Arqueo con diferencia: ${e.first.cajaName} (${formatMoney(e.first.difference, e.first.currency, true)})`,
    body: cashCountBody(e.first),
    targetKind: "caja",
    targetId: e.first.cashRegisterId,
    targetLabel: e.first.cajaName,
    branchId: e.first.branchId,
  }));

  const result = await reconcile(
    service,
    ctx,
    CASH_DIFF_PREFIX,
    detected,
    new Set(detected.map((d) => d.sourceKey)),
    (ref) => {
      const cajaId = Number(ref.sourceKey.split(":")[1]);
      const lastDiff = lastDiffByCaja.get(cajaId);
      if (lastDiff === undefined) {
        return `El último arqueo tiene más de ${CASH_COUNT_WINDOW_DAYS} días: se cierra solo`;
      }
      return lastDiff === 0
        ? "El último arqueo dio sin diferencia"
        : "Hubo un arqueo sin diferencia después de este tema: lo reemplaza uno nuevo";
    },
    (branchId) => mutes.isMuted("arqueo_diferencia", branchId),
  );

  // Arqueos posteriores del mismo episodio: un evento por arqueo (idempotente
  // por `cashCountId`; si el tema está cerrado no inserta nada).
  for (const e of episodes) {
    if (mutes.isMuted("arqueo_diferencia", e.first.branchId)) continue;
    for (const row of e.run) {
      if (row.id === e.first.id) continue; // ese ya es el cuerpo del tema
      await service.addSystemEventOnce(
        ctx,
        e.sourceKey,
        `Nuevo arqueo (${dateTimeInTz(row.countedAt, row.timezone)}): diferencia ${formatMoney(row.difference, row.currency, true)}`,
        { cashCountId: row.id, difference: row.difference },
        "cashCountId",
      );
    }
  }
  return result;
}

// ───────────────────────────── 5. Wellhub sin publicar ─────────────────────────────

interface UnpublishedClass {
  scheduleId: number;
  activityName: string;
  startTime: string;
}

/**
 * Horarios de una sede que el sync de Wellhub DEBERÍA haber publicado para
 * `date` y no tienen fila en `wellhub_slots`. El criterio de elegibilidad es el
 * del sync (`wellhub/eligibility.ts`): actividad activa + `wellhub_enabled` +
 * no especial, horario activo, sin excepción ni feriado. Se descartan los
 * horarios creados hace menos de 2 h y, para hoy, los que ya empezaron (el sync
 * no publica clases pasadas).
 */
async function findUnpublishedClasses(
  db: Db,
  ctx: TenantContext,
  branch: { id: number; timezone: string; country: string },
  date: string,
  now: Date,
): Promise<UnpublishedClass[]> {
  const dayOfWeek = isoDayOfWeek(date);
  const schedules = (await loadPublishableSchedules(db, ctx, branch.id)).filter(
    (s) => s.dayOfWeek === dayOfWeek,
  );
  if (schedules.length === 0) return [];

  const { exceptionKeys, holidayDates } = await loadSkippedDates(
    db,
    ctx,
    schedules.map((s) => s.id),
    branch.country,
    date,
    date,
  );
  if (holidayDates.has(date)) return [];

  const graceEnd = now.getTime() - WELLHUB_GRACE_HOURS * 60 * 60 * 1000;
  const wanted = schedules.filter(
    (s) =>
      !exceptionKeys.has(`${s.id}:${date}`) &&
      s.createdAt.getTime() <= graceEnd &&
      buildClassDateTime(date, s.startTime, branch.timezone).getTime() >
        now.getTime(),
  );
  if (wanted.length === 0) return [];

  const published = await db
    .select({ scheduleId: schema.wellhubSlots.scheduleId })
    .from(schema.wellhubSlots)
    .where(
      and(
        tenantWhere(schema.wellhubSlots, ctx),
        eq(schema.wellhubSlots.sessionDate, date),
        inArray(
          schema.wellhubSlots.scheduleId,
          wanted.map((s) => s.id),
        ),
      ),
    );
  const publishedIds = new Set(published.map((p) => p.scheduleId));

  return wanted
    .filter((s) => !publishedIds.has(s.id))
    .sort((a, b) =>
      a.startTime === b.startTime
        ? a.id - b.id
        : a.startTime < b.startTime
          ? -1
          : 1,
    )
    .map((s) => ({
      scheduleId: s.id,
      activityName: s.activityName,
      startTime: s.startTime,
    }));
}

function unpublishedText(
  list: UnpublishedClass[],
  branchName: string,
  when: "mañana" | "hoy",
): { title: string; body: string } {
  const n = list.length;
  const lines = list
    .slice(0, MAX_BODY_LINES)
    .map((c) => `${c.activityName} ${c.startTime}`);
  if (n > MAX_BODY_LINES) lines.push(`y ${n - MAX_BODY_LINES} más`);
  return {
    title: `Wellhub: ${n} ${n === 1 ? "clase" : "clases"} de ${when} sin publicar en ${branchName}`,
    body: lines.join("\n"),
  };
}

/**
 * Sedes que sincronizan con Wellhub (`wellhub_gym_id` cargado y activas): las
 * que mira el detector de clases sin publicar y las que el panel de Avisos
 * automáticos ofrece para ese aviso.
 */
export async function loadWellhubBranches(
  db: Db,
  ctx: TenantContext,
): Promise<
  Array<{ id: number; name: string; timezone: string; country: string }>
> {
  return db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
      country: schema.branches.country,
    })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        isNotNull(schema.branches.wellhubGymId),
        eq(schema.branches.isActive, true),
      ),
    )
    .orderBy(asc(schema.branches.id));
}

/**
 * D-24: por sede con `wellhub_gym_id` (y Wellhub configurado, igual que el cron
 * de sync), las clases de MAÑANA que el sync debería haber publicado y no
 * están en `wellhub_slots`. UN tema por sede y fecha; si la cantidad cambia se
 * reescribe el título (no se abre otro). Se cierra cuando quedan todas
 * publicadas o cuando la fecha pasó.
 *
 * Un tema abierto ayer para una clase de HOY sigue vigente mientras falten
 * clases por empezar, aunque solo se abran temas nuevos para mañana.
 */
export async function syncWellhubUnpublished(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
): Promise<SyncResult> {
  // Sin credenciales el cron de sync está apagado: "no publicado" no sería una falla.
  if (getWellhubConfig() === null) return { ...EMPTY_SYNC };

  const branches = await loadWellhubBranches(db, ctx);

  const detected: CreateSystemTopicInput[] = [];
  const stillValid = new Set<string>();
  const texts = new Map<string, { title: string; body: string }>();
  const todayByBranch = new Map<number, string>();

  for (const branch of branches) {
    const today = todayInTz(branch.timezone, now);
    const tomorrow = addDays(today, 1);
    todayByBranch.set(branch.id, today);

    for (const [date, when] of [
      [today, "hoy"],
      [tomorrow, "mañana"],
    ] as const) {
      const missing = await findUnpublishedClasses(db, ctx, branch, date, now);
      if (missing.length === 0) continue;
      const sourceKey = `${WELLHUB_UNPUBLISHED_PREFIX}${branch.id}:${date}`;
      const text = unpublishedText(missing, branch.name, when);
      stillValid.add(sourceKey);
      texts.set(sourceKey, text);
      if (date !== tomorrow) continue;
      detected.push({
        sourceKey,
        title: text.title,
        body: text.body,
        targetKind: "sede",
        targetId: branch.id,
        targetLabel: branch.name,
        branchId: branch.id,
      });
    }
  }

  const result = await reconcile(
    service,
    ctx,
    WELLHUB_UNPUBLISHED_PREFIX,
    detected,
    stillValid,
    (ref) => {
      const [branchPart, date] = ref.sourceKey
        .slice(WELLHUB_UNPUBLISHED_PREFIX.length)
        .split(":");
      const today = todayByBranch.get(Number(branchPart));
      if (today === undefined) {
        return "La sede dejó de sincronizar con Wellhub";
      }
      return date < today
        ? "Pasó la fecha"
        : "Wellhub ya tiene todas las clases publicadas";
    },
    (branchId) => mutes.isMuted("wellhub_sin_publicar", branchId),
  );

  // La cantidad cambió entre corridas (o el tema de ayer pasó a ser "de hoy"):
  // se actualiza el texto del tema abierto, sin abrir otro.
  for (const [sourceKey, text] of texts) {
    // Sede silenciada: el tema ya se cerró arriba, no hay texto que reescribir.
    const branchPart = Number(
      sourceKey.slice(WELLHUB_UNPUBLISHED_PREFIX.length).split(":")[0],
    );
    if (mutes.isMuted("wellhub_sin_publicar", branchPart)) continue;
    await service.updateSystemTopicText(ctx, sourceKey, text.title, text.body);
  }
  return result;
}

// ───────────────────────────── 6. Tablero: leads sin cargar ─────────────────────────────

/** "2026-10-26" -> 20261026: id neutro del vínculo `tablero` (no es id de ninguna tabla). */
function weekAsTargetId(weekStart: string): number {
  return Number(weekStart.replaceAll("-", ""));
}

function tableroLeadsText(
  weekStart: string,
  missing: Array<{ name: string }>,
): { title: string; body: string } {
  const n = missing.length;
  const lines = missing.slice(0, MAX_BODY_LINES).map((b) => b.name);
  if (n > MAX_BODY_LINES) lines.push(`y ${n - MAX_BODY_LINES} más`);
  return {
    title: `Tablero: faltan los leads de la semana del ${shortDate(weekStart)} (${n} ${n === 1 ? "sede" : "sedes"})`,
    body: lines.join("\n"),
  };
}

/**
 * D-25: leads del Tablero sin cargar. Desde el martes de la semana W+1 (en la
 * zona del Tablero, `BOARD_TZ`: Argentina, fija), si alguna sede que carga leads
 * (activa y física, `loadLeadsBranches`) no tiene fila en `weekly_board_leads`
 * para la semana W (la que terminó), se abre UN tema agregado por semana con las
 * sedes faltantes por su nombre. Si la cantidad cambia entre corridas se
 * reescribe título y cuerpo (sin evento, sin tocar `last_activity_at`).
 *
 * Se cierra solo cuando todas las sedes están cargadas o cuando la semana W deja
 * de ser editable (`isLeadsEditableWeek`: el lunes de W+2). Un tema cerrado a
 * mano no se reabre (unique del `source_key`, D-04).
 *
 * Solo se mira la semana inmediata anterior: las más viejas ya no se pueden
 * cargar, no hay nada que pedirle a nadie.
 */
export async function syncTableroLeads(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  mutes: AutoTopicMutes = NO_AUTO_TOPIC_MUTES,
): Promise<SyncResult> {
  const today = todayInTz(BOARD_TZ, now);
  const current = currentWeekStart(now);
  const week = addDays(current, -7);

  const branches = await loadLeadsBranches(db, ctx);
  // Faltantes sin mirar los avisos silenciados, y los que SÍ se avisan: una
  // sede silenciada sale de la lista, y si solo faltan sedes silenciadas el
  // tema no se abre (o se cierra con su propio motivo).
  let missingAll: Array<{ id: number; name: string }> = [];
  if (branches.length > 0 && isLeadsEditableWeek(week, current)) {
    const loaded = await db
      .select({ branchId: schema.weeklyBoardLeads.branchId })
      .from(schema.weeklyBoardLeads)
      .where(
        and(
          tenantWhere(schema.weeklyBoardLeads, ctx),
          eq(schema.weeklyBoardLeads.weekStart, week),
        ),
      );
    const loadedIds = new Set(loaded.map((l) => l.branchId));
    missingAll = branches.filter((b) => !loadedIds.has(b.id));
  }
  const missing = missingAll.filter(
    (b) => !mutes.isMuted("tablero_leads", b.id),
  );

  const sourceKey = `${TABLERO_LEADS_PREFIX}${week}`;
  const stillValid = new Set<string>();
  const detected: CreateSystemTopicInput[] = [];
  const text = tableroLeadsText(week, missing);
  if (missing.length > 0) {
    stillValid.add(sourceKey);
    // El lunes (reunión de carga) todavía no se avisa: se abre desde el martes.
    if (today > current) {
      detected.push({
        sourceKey,
        title: text.title,
        body: text.body,
        targetKind: "tablero",
        targetId: weekAsTargetId(week),
        targetLabel: `Semana del ${shortDate(week)}`,
        branchId: null,
      });
    }
  }

  const result = await reconcile(
    service,
    ctx,
    TABLERO_LEADS_PREFIX,
    detected,
    stillValid,
    (ref) => {
      const topicWeek = ref.sourceKey.slice(TABLERO_LEADS_PREFIX.length);
      if (!isLeadsEditableWeek(topicWeek, current)) {
        return "Se cerró la ventana de carga de esa semana";
      }
      if (missingAll.length > 0) {
        // Faltan sedes pero todas tienen el aviso apagado.
        return mutes.isMutedForAll("tablero_leads")
          ? AUTO_TOPIC_MUTED_REASON
          : TABLERO_MUTED_BRANCHES_REASON;
      }
      return branches.length > 0
        ? "Ya están cargados los leads de todas las sedes"
        : "El gimnasio ya no tiene sedes que carguen leads";
    },
  );

  if (missing.length > 0) {
    await service.updateSystemTopicText(ctx, sourceKey, text.title, text.body);
  }
  return result;
}

// ───────────────────────────── Runner ─────────────────────────────

type DetectorRunner = (
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  mutes: AutoTopicMutes,
) => Promise<SyncResult>;

const DETECTOR_RUNNERS: Record<OfficeAutoDetectorKey, DetectorRunner> = {
  wellhub_error: syncWellhubErrors,
  jornada_abierta: syncStaleShifts,
  clase_sin_profe: syncClassesWithoutCoach,
  arqueo_diferencia: syncCashCountDifferences,
  wellhub_sin_publicar: syncWellhubUnpublished,
  tablero_leads: syncTableroLeads,
};

/**
 * Corre UN detector para un gimnasio con los avisos silenciados de ese momento.
 * Lo usa el panel de Avisos automáticos para que al apagar un aviso sus temas
 * abiertos se cierren ya, sin esperar al cron.
 */
export async function runOfficeAutoDetectorForTenant(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  now: Date,
  detector: OfficeAutoDetectorKey,
): Promise<SyncResult> {
  const mutes = await loadAutoTopicMutes(db, ctx);
  return DETECTOR_RUNNERS[detector](db, service, ctx, now, mutes);
}

/**
 * Corrida completa para UN gimnasio: despierta los dormidos vencidos (D-09) y
 * sincroniza las seis señales. Cada paso está aislado: si uno falla se loguea
 * (llega a Sentry) y los demás siguen. Los avisos silenciados se leen UNA vez.
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

  let mutes: AutoTopicMutes;
  try {
    mutes = await loadAutoTopicMutes(db, ctx);
  } catch (err: unknown) {
    // Sin saber qué está silenciado, correr los detectores podría reabrir ruido
    // que la gerencia apagó: se salta la corrida (el próximo cron reintenta).
    log.error(
      { err, tenantId: ctx.tenantId },
      "office auto-topics: no se pudieron leer los avisos silenciados",
    );
    return total;
  }

  for (const detector of OFFICE_AUTO_DETECTOR_KEYS) {
    try {
      const r = await DETECTOR_RUNNERS[detector](db, service, ctx, now, mutes);
      total.opened += r.opened;
      total.closed += r.closed;
    } catch (err: unknown) {
      log.error(
        { err, tenantId: ctx.tenantId, signal: detector },
        "office auto-topics: falló un detector",
      );
    }
  }
  return total;
}
