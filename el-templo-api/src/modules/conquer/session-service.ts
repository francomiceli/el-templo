// Módulo: conquer — guardado de la sesión del alumno (Fase 201 §4.1, §4.6, §9)
//
// Una sesión por fecha y día del plan. T-201-21/22: la fecha, el `prev_target`,
// el peldaño y el modo los fija el servidor; del body solo salen el día, la
// molestia y los valores. D-18: el contador viene precargado con el objetivo,
// así que guardar sin tocar nada deja `value == prev_target`.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { autoResolveEventAlert, evaluateAfterSave } from "./alerts-service";
import {
  applyComboStateWrites,
  planComboWrites,
  type ComboEntry,
  type ComboWrites,
} from "./combo-service";
import { SATURDAY_DAY_KEY } from "./combos";
import {
  calibrationProposals,
  type CalibrationProposal,
} from "./calibration-service";
import {
  neighborRung,
  planDays,
  stepLadderId,
  type ExerciseView,
  type TemplateDayView,
} from "./catalog-service";
import {
  nextTarget,
  selectReales,
  type CountedStep,
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
import { saturdayPlan } from "./rules";
import { emitTopeAlert, topeDedupeKey } from "./step-service";
import { computeTodayStep, invalidDayError } from "./today-service";

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
  /** Obligatorio salvo el sábado de Toro (que no lleva ejercicios). */
  exercises?: SaveSessionExercise[];
  /** §3.3: combo de apertura (Toro). Opcional en el API, el app lo manda siempre. */
  opening?: ComboEntry;
  /** §3.2: combos del sábado (Toro), obligatorios ese día. */
  push?: ComboEntry;
  pull?: ComboEntry;
}

export interface SaveSessionResult {
  sessionId: number;
  date: string;
  dayKey: string;
  lighting: { primary: string[]; secondary: string[] };
  /** §4.3: propuestas de calibración de los ejercicios del día (puede ser vacío). */
  calibration: CalibrationProposal[];
}

type SessionStepInsert = Omit<
  typeof schema.conquerSessionSteps.$inferInsert,
  "tenantId" | "sessionId"
>;

const COUNTED: readonly CountedStep[] = ["e1", "e2", "e3"];

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
  entries: readonly SaveSessionExercise[],
): Matched {
  const exercises: ExerciseView[] = [];
  for (const code of day.exerciseCodes) {
    const exercise = mctx.catalog.exerciseByCode.get(code);
    if (exercise) exercises.push(exercise);
  }
  const byId = new Map(entries.map((e) => [e.exerciseId, e]));
  if (entries.length !== exercises.length || byId.size !== exercises.length) {
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
  matched: Matched,
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

type Matched = { exercise: ExerciseView; entry: SaveSessionExercise }[];

/** Historial con las marcas recién armadas de hoy (sin releer la base). */
function withSessionMarks(
  marks: ReadonlyMap<string, MarkRow[]>,
  date: string,
  rows: readonly SessionStepInsert[],
): Map<string, MarkRow[]> {
  const merged = new Map<string, MarkRow[]>();
  for (const [key, list] of marks) merged.set(key, [...list]);
  for (const row of rows) {
    const key = markKey(row.exerciseId, row.step);
    const list = merged.get(key) ?? [];
    list.push({
      date,
      value: row.value,
      rungId: row.rungId,
      prevTarget: row.prevTarget ?? null,
    });
    merged.set(key, list);
  }
  return merged;
}

/**
 * §4.3 / A5: cierra la calibración de los ejercicios del día. Las propuestas
 * `quedarse` no necesitan respuesta del alumno y desde la 2ª sesión del E1
 * corre el §4.4, así que ambos casos pasan a `resuelta`. Devuelve las
 * propuestas de los ejercicios del día para que el app las muestre.
 */
async function settleCalibration(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  matched: Matched,
  marksAfter: ReadonlyMap<string, MarkRow[]>,
): Promise<CalibrationProposal[]> {
  const dayIds = new Set(matched.map(({ exercise }) => exercise.id));
  const proposals = calibrationProposals(mctx, marksAfter).filter((p) =>
    dayIds.has(p.exerciseId),
  );
  const quedarse = new Set(
    proposals.filter((p) => p.proposal === "quedarse").map((p) => p.exerciseId),
  );

  const settleIds: number[] = [];
  for (const { exercise } of matched) {
    const e1 = mctx.steps.get(markKey(exercise.id, "e1"));
    if (!e1 || e1.calibration !== "pendiente") continue;
    const reales = selectReales(
      marksAfter.get(markKey(exercise.id, "e1")) ?? [],
      e1.sinceDate,
      e1.rungId,
    );
    if (reales.length >= 2 || quedarse.has(exercise.id)) settleIds.push(e1.id);
  }
  if (settleIds.length > 0) {
    await tx
      .update(schema.conquerSteps)
      .set({ calibration: "resuelta" })
      .where(
        and(
          tenantWhere(schema.conquerSteps, ctx),
          inArray(schema.conquerSteps.id, settleIds),
        ),
      );
  }
  return proposals;
}

/**
 * A2 / §5: un escalón E1-E3 en `subir` sin peldaño más difícil avisa al coach
 * (una alerta por ejercicio, escalón y peldaño: T-201-28). Si el escalón está en
 * el tope pero ya no está en `subir`, la alerta se auto-resuelve.
 */
async function syncTopeAlerts(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  matched: Matched,
  marksAfter: ReadonlyMap<string, MarkRow[]>,
): Promise<void> {
  for (const { exercise } of matched) {
    for (const step of COUNTED) {
      const row = mctx.steps.get(markKey(exercise.id, step));
      if (!row) continue;
      const atTop =
        neighborRung(
          mctx.catalog,
          stepLadderId(exercise, step),
          row.rungId,
          "harder",
        ) === null;
      if (!atTop) continue;
      const rung = mctx.catalog.rungById.get(row.rungId);
      const { estado } = computeTodayStep(mctx, exercise, row, marksAfter);
      if (estado === "subir" && rung) {
        await emitTopeAlert(tx, ctx, mctx.userId, exercise, step, rung);
      } else {
        await autoResolveEventAlert(tx, ctx, {
          userId: mctx.userId,
          type: "tope_escalera",
          dedupeKey: topeDedupeKey(exercise.id, step, row.rungId),
        });
      }
    }
  }
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
 * Día a guardar: el de la plantilla, o `null` para el sábado de Toro (§3.2). Un
 * día fuera del plan es 400, también el sábado de quien no lo tiene (Ternero,
 * Novillo o Toro con el recorte 3).
 */
function resolveSaveDay(
  mctx: MemberContext,
  dayKey: string,
): TemplateDayView | null {
  if (dayKey === SATURDAY_DAY_KEY) {
    if (saturdayPlan(mctx.level, mctx.member.cutStage) === null) {
      throw invalidDayError();
    }
    return null;
  }
  const day = planDays(mctx.catalog, mctx.daysCount).find(
    (d) => d.dayKey === dayKey,
  );
  if (!day) throw invalidDayError();
  return day;
}

/** Ejercicios de la sesión: los 3 del día, o ninguno el sábado (que solo lleva combos). */
function resolveMatched(
  mctx: MemberContext,
  day: TemplateDayView | null,
  body: SaveSessionBody,
): Matched {
  if (day === null) {
    if (body.exercises !== undefined) throw invalidExercisesError();
    return [];
  }
  if (body.exercises === undefined) throw invalidExercisesError();
  const matched = matchDayExercises(mctx, day, body.exercises);
  for (const { exercise, entry } of matched) {
    assertValueRanges(exercise.unit, entry);
  }
  return matched;
}

interface PersistInput {
  date: string;
  dayKey: string;
  pain: number;
  matched: Matched;
  rows: SessionStepInsert[];
  marksAfter: ReadonlyMap<string, MarkRow[]>;
  combos: ComboWrites;
}

/**
 * Una sola transacción: estado de los combos (con `FOR UPDATE` primero), upsert
 * de la sesión (T-201-25, UNIQUE tenant+user+fecha+día) y reemplazo completo de
 * sus marcas. El upsert toma el lock de la fila, así que dos guardados
 * simultáneos se serializan. Devuelve el id y las propuestas de calibración.
 */
async function persistSession(
  db: DbInstance,
  ctx: TenantContext,
  mctx: MemberContext,
  input: PersistInput,
): Promise<{ sessionId: number; calibration: CalibrationProposal[] }> {
  const { date, dayKey, pain, matched, rows, marksAfter, combos } = input;
  let sessionId = null as number | null;
  let calibration: CalibrationProposal[] = [];
  await db.transaction(async (tx) => {
    // Fase 201 §4.5, D-14: cambiar el peldaño de arranque de un combo reinicia su cuenta.
    await applyComboStateWrites(
      tx,
      ctx,
      mctx.member.id,
      date,
      combos.stateWrites,
    );
    // Fase 201 S12-3: las columnas de combo se pisan siempre (NULL si no vinieron).
    await tx
      .insert(schema.conquerSessions)
      .values(
        tenantValues(ctx, {
          userId: mctx.userId,
          sessionDate: date,
          dayKey,
          pain,
          savedAt: sql`NOW()`,
          ...combos.columns,
        }),
      )
      .onDuplicateKeyUpdate({
        set: { pain, savedAt: sql`NOW()`, ...combos.columns },
      });
    sessionId = await findSessionId(tx, ctx, mctx.userId, date, dayKey);
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
    // El sábado no tiene escalones: no hay marcas ni calibración ni caída (§3.2).
    if (rows.length > 0) {
      await tx
        .insert(schema.conquerSessionSteps)
        .values(
          rows.map((row) => tenantValues(ctx, { ...row, sessionId: savedId })),
        );
    }
    // Fase 201 §4.3, A2: calibración y alertas de tope, en la misma transacción.
    calibration =
      matched.length === 0
        ? []
        : await settleCalibration(tx, ctx, mctx, matched, marksAfter);
    await syncTopeAlerts(tx, ctx, mctx, matched, marksAfter);
    // Fase 201 §5, A6, A13: molestia, caída y paso de nivel, también en la tx.
    await evaluateAfterSave(
      tx,
      ctx,
      mctx,
      {
        sessionId: savedId,
        date,
        dayKey,
        pain,
        exerciseIds: matched.map(({ exercise }) => exercise.id),
      },
      marksAfter,
    );
  });
  if (sessionId === null)
    throw new AppError("No pudimos guardar la sesión", 500);
  return { sessionId, calibration };
}

/**
 * Guarda la sesión de hoy (un día del plan o el sábado de Toro). La fecha, el
 * `prev_target`, el peldaño y el modo los fija el servidor (T-201-21).
 */
export async function saveSession(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  body: SaveSessionBody,
): Promise<SaveSessionResult> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const day = resolveSaveDay(mctx, body.dayKey);
  const dayKey = day === null ? SATURDAY_DAY_KEY : day.dayKey;
  const combos = planComboWrites(mctx, day, body);
  const matched = resolveMatched(mctx, day, body);

  // §9: la fecha la fija el servidor con la zona de la sede (A16).
  const date = mctx.today;
  const existingId = await findSessionId(db, ctx, userId, date, dayKey);
  const marks = await loadMarks(
    db,
    ctx,
    userId,
    existingId === null ? {} : { excludeSessionId: existingId },
  );
  const rows = buildSessionStepRows(mctx, matched, marks);
  const marksAfter = withSessionMarks(marks, date, rows);
  const { sessionId, calibration } = await persistSession(db, ctx, mctx, {
    date,
    dayKey,
    pain: body.pain,
    matched,
    rows,
    marksAfter,
    combos,
  });

  // D-13 (a): zonas que se encendieron hoy (cada ejercicio con E1-E3 > 0).
  const lighting = lightZones(
    matched.map(({ exercise, entry }) => ({
      muscles: exercise.muscles,
      worked: exerciseWorked(entry),
    })),
  );
  return { sessionId, date, dayKey, lighting, calibration };
}
