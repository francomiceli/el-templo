// Módulo: conquer — Progreso del alumno (Fase 201 §7.1, §4.6, §4.5, D-13 b)
//
// Sesiones, % de acierto y Δ sobre TODO el historial (A8), "Hoy toca subir"
// (A3), calibraciones pendientes (§4.3), la figura de la semana (D-13 b) y, por
// día del plan, la progresión de cada escalón con la curva del E1. Recibe
// `userId` (no `request`) para que la ficha del admin (201-11) lo reuse. Pocas
// consultas fijas, nada por ejercicio en un loop. El app solo pinta.
import { and, between, count, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { addDaysIso, mondayOfIso } from "./calendar";
import { planDays, type ExerciseView } from "./catalog-service";
import {
  buildComboSubirItems,
  loadComboSessions,
  type ComboSubirItem,
} from "./combo-service";
import {
  accuracy,
  selectReales,
  type CountedStep,
  type Estado,
  type MarkRow,
  type StepKey,
  type Unit,
} from "./engine";
import {
  calibrationProposals,
  planExercises,
  type CalibrationProposal,
} from "./calibration-service";
import {
  loadMarks,
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import { exerciseWorked, lightZones } from "./lighting";
import { levelHasCombos } from "./rules";
import { findSubir } from "./step-service";
import { computeTodayStep } from "./today-service";

type DbInstance = MySql2Database<typeof schema>;

export interface SubirItem {
  exerciseId: number;
  exerciseName: string;
  step: CountedStep;
  fromRungName: string;
  /** `null` = tope de la escalera: no hay botón, el coach ya está avisado (A2). */
  toRungName: string | null;
}

export interface ProgressStep {
  step: StepKey;
  rungId: number;
  rungName: string;
  mode: "completa" | "negativa" | "hold";
  /** Última marca desde el último cambio de peldaño, o `null`. */
  last: number | null;
  target: number | null;
  estado: Estado | null;
}

export interface ProgressExercise {
  exerciseId: number;
  name: string;
  unit: Unit;
  /** Valores del E1 desde el último cambio de peldaño, de la más vieja a la más nueva. */
  e1Curve: number[];
  steps: ProgressStep[];
}

export interface ProgressDay {
  dayKey: string;
  label: string;
  sessionsCount: number;
  exercises: ProgressExercise[];
}

export interface ProgressResponse {
  sessionsCount: number;
  accuracy: {
    n: number;
    hits: number;
    pct: number | null;
    delta: number | null;
  };
  weekLighting: { primary: string[]; secondary: string[] };
  subir: SubirItem[];
  /** D-14: combos de Toro listos para Subir la progresión de arranque (vacío en otros niveles). */
  comboSubir: ComboSubirItem[];
  calibrations: CalibrationProposal[];
  days: ProgressDay[];
}

const STEP_ORDER: readonly StepKey[] = ["e1", "e2", "e3", "hold"];

/** Sesiones guardadas por día del plan (todo el historial): una query agrupada. */
async function loadSessionCounts(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      dayKey: schema.conquerSessions.dayKey,
      n: count(),
    })
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, userId),
      ),
    )
    .groupBy(schema.conquerSessions.dayKey);
  return new Map(rows.map((r) => [r.dayKey, Number(r.n)]));
}

/**
 * D-13 (b): zonas de la semana calendario en curso. Cada sesión-ejercicio con
 * algún E1-E3 > 0 cuenta por separado (las sesiones de días distintos suman).
 */
async function loadWeekLighting(
  db: DbInstance,
  ctx: TenantContext,
  mctx: MemberContext,
): Promise<ProgressResponse["weekLighting"]> {
  const monday = mondayOfIso(mctx.today);
  const rows = await db
    .select({
      sessionId: schema.conquerSessionSteps.sessionId,
      exerciseId: schema.conquerSessionSteps.exerciseId,
      step: schema.conquerSessionSteps.step,
      value: schema.conquerSessionSteps.value,
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
        eq(schema.conquerSessions.userId, mctx.userId),
        between(
          schema.conquerSessions.sessionDate,
          monday,
          addDaysIso(monday, 6),
        ),
        inArray(schema.conquerSessionSteps.step, ["e1", "e2", "e3"]),
      ),
    );

  const bySessionExercise = new Map<
    string,
    { exerciseId: number; e1: number; e2: number; e3: number }
  >();
  for (const row of rows) {
    if (row.step === "hold") continue;
    const key = `${row.sessionId}:${row.exerciseId}`;
    const entry = bySessionExercise.get(key) ?? {
      exerciseId: row.exerciseId,
      e1: 0,
      e2: 0,
      e3: 0,
    };
    entry[row.step] = row.value;
    bySessionExercise.set(key, entry);
  }
  const items = [...bySessionExercise.values()].map((entry) => ({
    muscles: mctx.catalog.exercises.get(entry.exerciseId)?.muscles ?? [],
    worked: exerciseWorked(entry),
  }));
  return lightZones(items);
}

/** `value >= prev_target` sobre TODAS las marcas con `prev_target` (A8). */
function buildAccuracy(
  marks: ReadonlyMap<string, MarkRow[]>,
): ProgressResponse["accuracy"] {
  const pairs: { value: number; prevTarget: number | null }[] = [];
  for (const list of marks.values()) {
    for (const mark of list) {
      pairs.push({ value: mark.value, prevTarget: mark.prevTarget });
    }
  }
  return accuracy(pairs);
}

function buildProgressExercise(
  mctx: MemberContext,
  exercise: ExerciseView,
  marks: ReadonlyMap<string, MarkRow[]>,
): ProgressExercise {
  const steps: ProgressStep[] = [];
  let e1Curve: number[] = [];
  for (const step of STEP_ORDER) {
    const row = mctx.steps.get(markKey(exercise.id, step));
    if (!row) continue;
    const reales = selectReales(
      marks.get(markKey(exercise.id, step)) ?? [],
      row.sinceDate,
      row.rungId,
    ).map((m) => m.value);
    const view = computeTodayStep(mctx, exercise, row, marks);
    if (step === "e1") e1Curve = reales;
    steps.push({
      step,
      rungId: row.rungId,
      rungName: view.rungName,
      mode: view.mode,
      last: reales.length > 0 ? reales[reales.length - 1] : null,
      target: view.target,
      estado: view.estado,
    });
  }
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    unit: exercise.unit,
    e1Curve,
    steps,
  };
}

/** A3: un SUBIR por ejercicio del plan, en el orden del plan (`findSubir` aplica `pickSubir` del motor). */
function buildSubirItems(
  mctx: MemberContext,
  marks: ReadonlyMap<string, MarkRow[]>,
): SubirItem[] {
  const items: SubirItem[] = [];
  for (const exercise of planExercises(mctx)) {
    const candidate = findSubir(mctx, exercise, marks);
    if (!candidate) continue;
    items.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      step: candidate.step,
      fromRungName: candidate.fromRung.name,
      toRungName: candidate.toRung?.name ?? null,
    });
  }
  return items;
}

/**
 * Progreso del alumno (§7.1, §13.3). Consultas fijas: contexto, marcas,
 * sesiones por día y filas de la semana. `days` trae solo los días del plan.
 */
export async function buildProgress(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<ProgressResponse> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const [marks, sessionCounts, weekLighting, comboSessions] = await Promise.all(
    [
      loadMarks(db, ctx, userId),
      loadSessionCounts(db, ctx, userId),
      loadWeekLighting(db, ctx, mctx),
      levelHasCombos(mctx.level)
        ? loadComboSessions(db, ctx, mctx)
        : Promise.resolve([]),
    ],
  );

  const days: ProgressDay[] = planDays(mctx.catalog, mctx.daysCount).map(
    (day) => ({
      dayKey: day.dayKey,
      label: day.label,
      sessionsCount: sessionCounts.get(day.dayKey) ?? 0,
      exercises: day.exerciseCodes.flatMap((code) => {
        const exercise = mctx.catalog.exerciseByCode.get(code);
        return exercise ? [buildProgressExercise(mctx, exercise, marks)] : [];
      }),
    }),
  );

  let sessionsCount = 0;
  for (const n of sessionCounts.values()) sessionsCount += n;

  return {
    sessionsCount,
    accuracy: buildAccuracy(marks),
    weekLighting,
    subir: buildSubirItems(mctx, marks),
    comboSubir: buildComboSubirItems(mctx, comboSessions),
    calibrations: calibrationProposals(mctx, marks),
    days,
  };
}
