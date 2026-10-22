// Módulo: conquer — cargador ÚNICO de historiales (Fase 201 §4, §7.1)
//
// Toda ruta que necesita las marcas de un alumno las arma acá y le pasa el
// resultado al motor (`engine.ts`). Si algún día hay que deduplicar o filtrar
// el historial, se hace en este archivo y en ningún otro.
import { and, asc, between, eq, ne } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  ConquerMemberRow,
  ConquerSessionRow,
  ConquerStepRow,
} from "../../db/schema/conquer";
import { todayInTz } from "../shared/date-utils";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { ensureStepsForPlan } from "./activation-service";
import { loadCatalog, planDays, type ConquerCatalog } from "./catalog-service";
import type { MarkRow, StepKey } from "./engine";
import type { Level } from "./rules";
import { getConquerSettings, type ConquerSettings } from "./settings";
import { resolveMemberTimezone } from "./timezone";

type DbInstance = MySql2Database<typeof schema>;

/** Contexto de un alumno ACTIVO: fila, "hoy" de su sede, catálogo y escalones. */
export interface MemberContext {
  userId: number;
  member: ConquerMemberRow;
  level: Level;
  daysCount: number;
  tz: string;
  /** YYYY-MM-DD de la sede del alumno (A16): nunca UTC ni del cliente. */
  today: string;
  catalog: ConquerCatalog;
  settings: ConquerSettings;
  /** Escalones del alumno por `markKey(exerciseId, step)`. */
  steps: Map<string, ConquerStepRow>;
}

/** Clave de un escalón: `"<exerciseId>:<step>"`. */
export function markKey(exerciseId: number, step: StepKey): string {
  return `${exerciseId}:${step}`;
}

function noActivoError(): AppError {
  return new AppError(
    "Todavía no tenés Conquer activo",
    409,
    "CONQUER_NO_ACTIVO",
  );
}

async function loadStepRows(
  db: DbInstance,
  ctx: TenantContext,
  memberId: number,
): Promise<Map<string, ConquerStepRow>> {
  const rows = await db
    .select()
    .from(schema.conquerSteps)
    .where(
      and(
        tenantWhere(schema.conquerSteps, ctx),
        eq(schema.conquerSteps.memberId, memberId),
      ),
    );
  return new Map(rows.map((r) => [markKey(r.exerciseId, r.step), r]));
}

/** ¿Falta algún escalón de los ejercicios del plan? (plantilla nueva, días nuevos) */
function missingPlanSteps(
  catalog: ConquerCatalog,
  daysCount: number,
  steps: ReadonlyMap<string, ConquerStepRow>,
): boolean {
  for (const day of planDays(catalog, daysCount)) {
    for (const code of day.exerciseCodes) {
      const exercise = catalog.exerciseByCode.get(code);
      if (!exercise) continue;
      for (const start of exercise.startSteps) {
        if (!steps.has(markKey(exercise.id, start.step))) return true;
      }
    }
  }
  return false;
}

/**
 * Contexto del alumno. 409 `CONQUER_NO_ACTIVO` si no hay fila `activo`
 * (bloqueado o pedido). Si faltan escalones del plan los crea (creación
 * perezosa, p. ej. si cambió la plantilla) y los vuelve a leer.
 */
export async function loadMemberContext(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  log?: FastifyBaseLogger,
): Promise<MemberContext> {
  const [member] = await db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member || member.status !== "activo" || !member.level) {
    throw noActivoError();
  }
  if (!member.daysCount) throw noActivoError();
  const level = member.level;
  const daysCount = member.daysCount;

  const tz = await resolveMemberTimezone(db, ctx, userId);
  const [catalog, settings] = await Promise.all([
    loadCatalog(db, ctx),
    getConquerSettings(db, ctx),
  ]);

  let steps = await loadStepRows(db, ctx, member.id);
  if (missingPlanSteps(catalog, daysCount, steps)) {
    await db.transaction(async (tx) => {
      await ensureStepsForPlan(
        tx,
        ctx,
        catalog,
        settings,
        { id: member.id, level, daysCount },
        log,
      );
    });
    steps = await loadStepRows(db, ctx, member.id);
  }

  return {
    userId,
    member,
    level,
    daysCount,
    tz,
    today: todayInTz(tz),
    catalog,
    settings,
    steps,
  };
}

/**
 * Marcas del alumno por escalón (`markKey`), en UNA query (join sesión ⨝ marca,
 * columnas calificadas). Orden: fecha de sesión, creación e id, así que
 * `selectReales` conserva el orden cronológico entre sesiones del mismo día.
 * `excludeSessionId` deja afuera la sesión que se está por sobrescribir (§4.6).
 */
export async function loadMarks(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  opts: { excludeSessionId?: number } = {},
): Promise<Map<string, MarkRow[]>> {
  const rows = await db
    .select({
      exerciseId: schema.conquerSessionSteps.exerciseId,
      step: schema.conquerSessionSteps.step,
      value: schema.conquerSessionSteps.value,
      prevTarget: schema.conquerSessionSteps.prevTarget,
      rungId: schema.conquerSessionSteps.rungId,
      date: schema.conquerSessions.sessionDate,
    })
    .from(schema.conquerSessionSteps)
    .innerJoin(
      schema.conquerSessions,
      eq(schema.conquerSessions.id, schema.conquerSessionSteps.sessionId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSessionSteps, ctx),
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, userId),
        // `and` descarta el `undefined`: sin exclusión no hay filtro extra.
        opts.excludeSessionId === undefined
          ? undefined
          : ne(schema.conquerSessions.id, opts.excludeSessionId),
      ),
    )
    .orderBy(
      asc(schema.conquerSessions.sessionDate),
      asc(schema.conquerSessions.createdAt),
      asc(schema.conquerSessions.id),
    );

  const marks = new Map<string, MarkRow[]>();
  for (const row of rows) {
    const key = markKey(row.exerciseId, row.step);
    const list = marks.get(key) ?? [];
    list.push({
      date: row.date,
      value: row.value,
      rungId: row.rungId,
      prevTarget: row.prevTarget,
    });
    marks.set(key, list);
  }
  return marks;
}

/** Sesiones del alumno con `from <= fecha <= to` (YYYY-MM-DD), de la más vieja a la más nueva. */
export async function loadSessionsBetween(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  from: string,
  to: string,
): Promise<ConquerSessionRow[]> {
  return db
    .select()
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, userId),
        between(schema.conquerSessions.sessionDate, from, to),
      ),
    )
    .orderBy(
      asc(schema.conquerSessions.sessionDate),
      asc(schema.conquerSessions.id),
    );
}
