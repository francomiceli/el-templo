// Módulo: conquer — guardado de la sesión del alumno (Fase 201 §4.1, §4.6, §9)
//
// Una sesión por fecha y día del plan. T-201-21/22: la fecha, el `prev_target`,
// el peldaño y el modo los fija el servidor; del body solo salen el día, la
// molestia y los valores. D-18: el contador viene precargado con el objetivo,
// así que guardar sin tocar nada deja `value == prev_target`.
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  planDays,
  type ExerciseView,
  type TemplateDayView,
} from "./catalog-service";
import {
  nextTarget,
  selectReales,
  type MarkRow,
  type StepKey,
  type Unit,
} from "./engine";
import {
  loadMarks,
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import { exerciseWorked, lightZones } from "./lighting";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

/** Topes por unidad (T-201-23): repeticiones 0-100, segundos 0-600. */
export const CONQUER_VALUE_MAX = { reps: 100, s: 600 } as const;

export interface SaveSessionExercise {
  exerciseId: number;
  e1: number;
  e2: number;
  e3: number;
  hold: number;
}

export interface SaveSessionBody {
  dayKey: string;
  pain: number;
  exercises: SaveSessionExercise[];
}

export interface SaveSessionResult {
  sessionId: number;
  date: string;
  dayKey: string;
  lighting: { primary: string[]; secondary: string[] };
}

type SessionStepInsert = Omit<
  typeof schema.conquerSessionSteps.$inferInsert,
  "tenantId" | "sessionId"
>;

const COUNTED: readonly Exclude<StepKey, "hold">[] = ["e1", "e2", "e3"];

function invalidExercisesError(): AppError {
  return new AppError(
    "La sesión tiene que traer exactamente los 3 ejercicios del día",
    400,
    "CONQUER_EJERCICIOS_INVALIDOS",
  );
}

/** Los ejercicios del body son EXACTAMENTE los del día (sin faltantes, repetidos ni ajenos). */
function matchDayExercises(
  mctx: MemberContext,
  day: TemplateDayView,
  body: SaveSessionBody,
): { exercise: ExerciseView; entry: SaveSessionExercise }[] {
  const exercises: ExerciseView[] = [];
  for (const code of day.exerciseCodes) {
    const exercise = mctx.catalog.exerciseByCode.get(code);
    if (exercise) exercises.push(exercise);
  }
  const byId = new Map(body.exercises.map((e) => [e.exerciseId, e]));
  if (
    body.exercises.length !== exercises.length ||
    byId.size !== exercises.length
  ) {
    throw invalidExercisesError();
  }
  return exercises.map((exercise) => {
    const entry = byId.get(exercise.id);
    if (!entry) throw invalidExercisesError();
    return { exercise, entry };
  });
}

/** T-201-23: el tope depende de la unidad del ejercicio (el JSON-schema solo conoce el máximo común). */
function assertValueRanges(unit: Unit, entry: SaveSessionExercise): void {
  const limits: [number, number][] = [
    [entry.e1, CONQUER_VALUE_MAX[unit]],
    [entry.e2, CONQUER_VALUE_MAX[unit]],
    [entry.e3, CONQUER_VALUE_MAX[unit]],
    [entry.hold, CONQUER_VALUE_MAX.s],
  ];
  for (const [value, max] of limits) {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new AppError(
        `Un valor de la sesión está fuera de rango (0 a ${max})`,
        400,
        "CONQUER_VALOR_INVALIDO",
      );
    }
  }
}

/**
 * Filas de `conquer_session_steps`: `rung_id` y `mode` se copian del escalón
 * actual (snapshot, A1) y `prev_target` es el objetivo que el motor calcula con
 * el historial SIN la sesión que se sobrescribe (§4.6). El hold no tiene prev.
 */
function buildSessionStepRows(
  mctx: MemberContext,
  matched: { exercise: ExerciseView; entry: SaveSessionExercise }[],
  marks: ReadonlyMap<string, MarkRow[]>,
): SessionStepInsert[] {
  const rows: SessionStepInsert[] = [];
  for (const { exercise, entry } of matched) {
    const inc =
      exercise.unit === "reps" ? mctx.member.incReps : mctx.member.incS;
    const steps: StepKey[] = [...COUNTED, "hold"];
    for (const step of steps) {
      const stepRow = mctx.steps.get(markKey(exercise.id, step));
      if (!stepRow) {
        throw new AppError(
          "Falta configurar un escalón de tu plan. Avisale al equipo.",
          409,
          "CONQUER_ESCALON_FALTANTE",
        );
      }
      let prevTarget: number | null = null;
      if (step !== "hold") {
        const reales = selectReales(
          marks.get(markKey(exercise.id, step)) ?? [],
          stepRow.sinceDate,
          stepRow.rungId,
        ).map((m) => m.value);
        prevTarget = nextTarget(reales, exercise.unit, inc).target;
      }
      rows.push({
        exerciseId: exercise.id,
        step,
        value: entry[step],
        prevTarget,
        rungId: stepRow.rungId,
        mode: stepRow.mode,
      });
    }
  }
  return rows;
}

/** Sesión ya guardada hoy para ese día, si existe. */
async function findSessionId(
  db: DbInstance | Tx,
  ctx: TenantContext,
  userId: number,
  date: string,
  dayKey: string,
): Promise<number | null> {
  const [row] = await db
    .select({ id: schema.conquerSessions.id })
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, userId),
        eq(schema.conquerSessions.sessionDate, date),
        eq(schema.conquerSessions.dayKey, dayKey),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Guarda la sesión de hoy. Una sola transacción: upsert de la sesión (T-201-25,
 * UNIQUE tenant+user+fecha+día) y reemplazo completo de sus marcas. El upsert
 * toma el lock de la fila, así que dos guardados simultáneos se serializan.
 */
export async function saveSession(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  body: SaveSessionBody,
): Promise<SaveSessionResult> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const day = planDays(mctx.catalog, mctx.daysCount).find(
    (d) => d.dayKey === body.dayKey,
  );
  if (!day) {
    throw new AppError(
      "Ese día no es parte de tu plan",
      400,
      "CONQUER_DIA_INVALIDO",
    );
  }
  const matched = matchDayExercises(mctx, day, body);
  for (const { exercise, entry } of matched) {
    assertValueRanges(exercise.unit, entry);
  }

  // §9: la fecha la fija el servidor con la zona de la sede (A16).
  const date = mctx.today;
  const existingId = await findSessionId(db, ctx, userId, date, day.dayKey);
  const marks = await loadMarks(
    db,
    ctx,
    userId,
    existingId === null ? {} : { excludeSessionId: existingId },
  );
  const rows = buildSessionStepRows(mctx, matched, marks);

  let sessionId = null as number | null;
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.conquerSessions)
      .values(
        tenantValues(ctx, {
          userId,
          sessionDate: date,
          dayKey: day.dayKey,
          pain: body.pain,
          savedAt: sql`NOW()`,
        }),
      )
      .onDuplicateKeyUpdate({
        set: { pain: body.pain, savedAt: sql`NOW()` },
      });
    sessionId = await findSessionId(tx, ctx, userId, date, day.dayKey);
    if (sessionId === null) {
      throw new AppError("No pudimos guardar la sesión", 500);
    }
    await tx
      .delete(schema.conquerSessionSteps)
      .where(
        and(
          tenantWhere(schema.conquerSessionSteps, ctx),
          eq(schema.conquerSessionSteps.sessionId, sessionId),
        ),
      );
    const savedId = sessionId;
    await tx
      .insert(schema.conquerSessionSteps)
      .values(
        rows.map((row) => tenantValues(ctx, { ...row, sessionId: savedId })),
      );
  });
  if (sessionId === null)
    throw new AppError("No pudimos guardar la sesión", 500);

  // D-13 (a): zonas que se encendieron hoy (cada ejercicio con E1-E3 > 0).
  const lighting = lightZones(
    matched.map(({ exercise, entry }) => ({
      muscles: exercise.muscles,
      worked: exerciseWorked(entry),
    })),
  );
  return { sessionId, date, dayKey: day.dayKey, lighting };
}
