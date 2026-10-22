// Módulo: conquer — Hoy del alumno y resumen de Inicio (Fase 201 §7.1, §13.2)
//
// D-16: Hoy propone el primer día del plan que falta en la semana calendario
// (lunes a domingo, en la zona horaria de la sede). D-18: el contador viene
// precargado con el objetivo del motor, así que "Guardar" sin tocar nada
// cuenta como cumplido. S12-2 / A10: el hold trae la última marca o 8 s.
//
// Ninguna regla del motor se reescribe acá: `engine.ts`, `calendar.ts` y
// `lighting.ts` se importan. El app NUNCA recalcula nada: pinta lo que manda
// este servicio.
import { and, eq, inArray, max, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type {
  ConquerMemberRow,
  ConquerSessionRow,
  ConquerStepRow,
} from "../../db/schema/conquer";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { addDaysIso, blockWeek, mondayOfIso, nextPendingDay } from "./calendar";
import {
  planDays,
  stepLadderId,
  type ConquerCatalog,
  type ExerciseView,
  type LadderView,
  type TemplateDayView,
} from "./catalog-service";
import {
  buildComboView,
  loadComboSessions,
  type ComboView,
} from "./combo-service";
import {
  isComboKey,
  SATURDAY_DAY_KEY,
  SATURDAY_LABEL,
  SATURDAY_WARMUP,
} from "./combos";
import {
  holdPreload,
  nextTarget,
  selectReales,
  type Estado,
  type MarkRow,
  type StepKey,
  type Unit,
} from "./engine";
import {
  loadMarks,
  loadMemberContext,
  loadSessionsBetween,
  markKey,
  type MemberContext,
} from "./history-loader";
import {
  allowedModes,
  levelHasCombos,
  openingTarget,
  saturdayPlan,
  type Level,
} from "./rules";

type DbInstance = MySql2Database<typeof schema>;

// ── Tipos de respuesta ──────────────────────────────────────────────

export interface PlanDayView {
  dayKey: string;
  label: string;
  done: boolean;
}

export interface PlanWeek {
  weekMonday: string;
  plan: PlanDayView[];
  nextDayKey: string | null;
  weekComplete: boolean;
}

export interface TodayRung {
  id: number;
  code: string;
  name: string;
  position: number;
  unilateral: boolean;
}

export interface TodayStep {
  step: StepKey;
  rungId: number;
  rungName: string;
  mode: "completa" | "negativa" | "hold";
  /**
   * Fase 201 DA-10 / anexo §1: modos que ofrece el desplegable. Los de la regla
   * y, al final, el modo actual si es un dato viejo fuera de la regla.
   */
  modes: ("completa" | "negativa" | "hold")[];
  target: number | null;
  estado: Estado | null;
  value: number;
  brazosRectos: boolean;
  unilateral: boolean;
}

export interface TodayExercise {
  exerciseId: number;
  code: string;
  name: string;
  unit: Unit;
  /** Opciones de peldaño de E1-E3 (la escalera del ejercicio). */
  rungs: TodayRung[];
  /**
   * Fase 201 DA-3: opciones de peldaño del hold final. Es la escalera de hold
   * del ejercicio o, si no tiene, la misma de E1-E3.
   */
  holdRungs: TodayRung[];
  steps: TodayStep[];
}

/** Sábado de Toro (§3.2): entrada en calor como texto y los combos push y pull. */
export interface SaturdayView {
  warmup: string;
  push: ComboView;
  pull: ComboView;
}

export interface TodayResponse extends PlanWeek {
  date: string;
  dayKey: string;
  label: string;
  alreadySaved: boolean;
  pain: number;
  finisher: string;
  level: Level;
  exercises: TodayExercise[];
  /** Combo de apertura del día (solo Toro, §3.2). */
  opening: ComboView | null;
  /** Solo `day=sabado` (solo Toro): ahí `exercises` es `[]` y `finisher` es `""`. */
  saturday: SaturdayView | null;
}

export interface HomeLastByDay {
  dayKey: string;
  label: string;
  date: string | null;
  /** `unilateral` = el peldaño de la marca se carga por lado (Fase 201 §1.4). */
  e1: {
    exerciseName: string;
    value: number;
    unit: Unit;
    unilateral: boolean;
  }[];
}

export interface HomeView extends PlanWeek {
  lastByDay: HomeLastByDay[];
}

const STEP_ORDER: readonly StepKey[] = ["e1", "e2", "e3", "hold"];

// ── Semana del plan ─────────────────────────────────────────────────

/** Lo que `buildPlanWeek` necesita; `level` y `member` son opcionales (sin ellos no hay sábado). */
type PlanWeekContext = Pick<MemberContext, "today" | "daysCount" | "catalog"> &
  Partial<Pick<MemberContext, "level">> & {
    member?: Pick<ConquerMemberRow, "cutStage">;
  };

/**
 * D-16: días del plan en el orden de la plantilla, cuáles están hechos en la
 * semana calendario de `today` y el primero que falta. `today` ya viene en la
 * zona de la sede (A16). Se filtran las sesiones por la semana acá adentro, así
 * que el llamador puede pasar una lista más ancha. Toro suma el sábado al final
 * (§3.2, D-16) salvo que el recorte 3 lo haya sacado (§5.1).
 */
export function buildPlanWeek(
  mctx: PlanWeekContext,
  weekSessions: readonly Pick<ConquerSessionRow, "dayKey" | "sessionDate">[],
): PlanWeek {
  const weekMonday = mondayOfIso(mctx.today);
  const weekSunday = addDaysIso(weekMonday, 6);
  const doneKeys = weekSessions
    .filter((s) => s.sessionDate >= weekMonday && s.sessionDate <= weekSunday)
    .map((s) => s.dayKey);
  const days = planDays(mctx.catalog, mctx.daysCount).map((d) => ({
    dayKey: d.dayKey,
    label: d.label,
  }));
  const hasSaturday =
    mctx.level !== undefined &&
    saturdayPlan(mctx.level, mctx.member?.cutStage ?? 0) !== null;
  if (hasSaturday) {
    days.push({ dayKey: SATURDAY_DAY_KEY, label: SATURDAY_LABEL });
  }
  const plan = days.map((d) => ({
    ...d,
    done: doneKeys.includes(d.dayKey),
  }));
  const nextDayKey = nextPendingDay(
    days.map((d) => d.dayKey),
    doneKeys,
  );
  return {
    weekMonday,
    plan,
    nextDayKey,
    weekComplete: plan.length > 0 && nextDayKey === null,
  };
}

// ── Un escalón de Hoy ───────────────────────────────────────────────

function incrementFor(mctx: MemberContext, unit: Unit): number {
  return unit === "reps" ? mctx.member.incReps : mctx.member.incS;
}

/** DA-10: modos permitidos + el actual al final si quedó fuera de la regla. */
function modesFor(
  unit: Unit,
  stepRow: Pick<ConquerStepRow, "step" | "mode">,
): TodayStep["modes"] {
  const modes = allowedModes(unit, stepRow.step);
  return modes.includes(stepRow.mode) ? modes : [...modes, stepRow.mode];
}

/**
 * Objetivo, estado y contador de un escalón (§4.4, S12-2, D-18). Los counted
 * (e1-e3) parten del objetivo del motor; el hold no tiene objetivo y precarga
 * la última marca o 8 (A10). `saved` es el valor ya guardado hoy, si lo hay.
 * Exportado: `changeStep` devuelve el mismo `TodayStep` recalculado.
 */
export function computeTodayStep(
  mctx: MemberContext,
  exercise: ExerciseView,
  stepRow: ConquerStepRow,
  marks: ReadonlyMap<string, MarkRow[]>,
  saved?: number,
): TodayStep {
  const rung = mctx.catalog.rungById.get(stepRow.rungId);
  const reales = selectReales(
    marks.get(markKey(exercise.id, stepRow.step)) ?? [],
    stepRow.sinceDate,
    stepRow.rungId,
  ).map((m) => m.value);

  let target: number | null = null;
  let estado: Estado | null = null;
  let preload: number;
  if (stepRow.step === "hold") {
    preload = holdPreload(reales);
  } else {
    const next = nextTarget(
      reales,
      exercise.unit,
      incrementFor(mctx, exercise.unit),
    );
    target = next.target;
    estado = next.estado;
    preload = next.target;
  }
  return {
    step: stepRow.step,
    rungId: stepRow.rungId,
    rungName: rung?.name ?? "",
    mode: stepRow.mode,
    modes: modesFor(exercise.unit, stepRow),
    target,
    estado,
    value: saved ?? preload,
    // DA-4: la marca de brazos rectos vive en el ejercicio, no en el peldaño.
    brazosRectos: exercise.brazosRectos,
    unilateral: rung?.unilateral ?? false,
  };
}

/**
 * Peldaños elegibles: los activos de la escalera + el actual de cada escalón
 * que la usa si quedó inactivo.
 */
function rungOptions(
  ladder: LadderView | undefined,
  stepRows: readonly ConquerStepRow[],
): TodayRung[] {
  if (!ladder) return [];
  const current = new Set(stepRows.map((s) => s.rungId));
  return ladder.rungs
    .filter((r) => r.isActive || current.has(r.id))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      position: r.position,
      unilateral: r.unilateral,
    }));
}

function buildTodayExercise(
  mctx: MemberContext,
  exercise: ExerciseView,
  marks: ReadonlyMap<string, MarkRow[]>,
  savedValues: ReadonlyMap<string, number>,
): TodayExercise {
  const stepRows: ConquerStepRow[] = [];
  for (const step of STEP_ORDER) {
    const row = mctx.steps.get(markKey(exercise.id, step));
    if (!row) {
      throw new AppError(
        "Falta configurar un escalón de tu plan. Avisale al equipo.",
        409,
        "CONQUER_ESCALON_FALTANTE",
      );
    }
    stepRows.push(row);
  }
  return {
    exerciseId: exercise.id,
    code: exercise.code,
    name: exercise.name,
    unit: exercise.unit,
    // DA-3: E1-E3 eligen en la escalera del ejercicio y el hold en la suya.
    rungs: rungOptions(
      mctx.catalog.ladders.get(stepLadderId(exercise, "e1")),
      stepRows.filter((row) => row.step !== "hold"),
    ),
    holdRungs: rungOptions(
      mctx.catalog.ladders.get(stepLadderId(exercise, "hold")),
      stepRows.filter((row) => row.step === "hold"),
    ),
    steps: stepRows.map((row) =>
      computeTodayStep(
        mctx,
        exercise,
        row,
        marks,
        savedValues.get(markKey(exercise.id, row.step)),
      ),
    ),
  };
}

// ── Hoy ─────────────────────────────────────────────────────────────

/** Valores ya guardados de una sesión, por `markKey`. */
async function loadSavedValues(
  db: DbInstance,
  ctx: TenantContext,
  sessionId: number,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      exerciseId: schema.conquerSessionSteps.exerciseId,
      step: schema.conquerSessionSteps.step,
      value: schema.conquerSessionSteps.value,
    })
    .from(schema.conquerSessionSteps)
    .where(
      and(
        tenantWhere(schema.conquerSessionSteps, ctx),
        eq(schema.conquerSessionSteps.sessionId, sessionId),
      ),
    );
  return new Map(rows.map((r) => [markKey(r.exerciseId, r.step), r.value]));
}

export function invalidDayError(): AppError {
  return new AppError(
    "Ese día no es parte de tu plan",
    400,
    "CONQUER_DIA_INVALIDO",
  );
}

/**
 * D-16: día a mostrar. Sin `requested` es el que toca (o, con la semana
 * completa, el primero del plan). Un día fuera del plan es 400.
 */
function resolveDayKey(week: PlanWeek, requested?: string): string {
  const keys = week.plan.map((d) => d.dayKey);
  if (requested !== undefined) {
    if (!keys.includes(requested)) throw invalidDayError();
    return requested;
  }
  const chosen = week.nextDayKey ?? keys[0];
  if (chosen === undefined) throw invalidDayError();
  return chosen;
}

/** Combo de apertura del día (§3.2, A11): solo Toro, con `opening_combo_key` y sin el recorte 5. */
function buildOpening(
  mctx: MemberContext,
  day: TemplateDayView,
  saved: ConquerSessionRow | undefined,
  comboSessions: readonly ConquerSessionRow[],
): ComboView | null {
  const comboKey = day.openingComboKey;
  const target = openingTarget(
    mctx.level,
    blockWeek(mctx.member.activationDate ?? mctx.today, mctx.today),
    mctx.member.cutStage,
  );
  if (target === null || !isComboKey(comboKey)) return null;
  return buildComboView(
    mctx,
    { comboKey, target, saved: saved?.comboSeries ?? null },
    comboSessions,
  );
}

/** Sábado de Toro (§3.2): entrada en calor y combos push y pull con 3 máximas + 10 drops (menos con recortes). */
function buildSaturday(
  mctx: MemberContext,
  saved: ConquerSessionRow | undefined,
  comboSessions: readonly ConquerSessionRow[],
): SaturdayView {
  const plan = saturdayPlan(mctx.level, mctx.member.cutStage);
  if (!plan) throw invalidDayError();
  const base = {
    target: plan.target,
    maxSeries: plan.maxSeries,
    drops: plan.drops,
  };
  return {
    warmup: SATURDAY_WARMUP,
    push: buildComboView(
      mctx,
      { ...base, comboKey: "push", saved: saved?.pushSeries ?? null },
      comboSessions,
    ),
    pull: buildComboView(
      mctx,
      { ...base, comboKey: "pull", saved: saved?.pullSeries ?? null },
      comboSessions,
    ),
  };
}

/** Ejercicios del día con su progresión (D-18): las marcas y los valores ya guardados salen de 2 queries. */
async function buildDayExercises(
  db: DbInstance,
  ctx: TenantContext,
  mctx: MemberContext,
  day: TemplateDayView,
  savedSession: ConquerSessionRow | undefined,
): Promise<TodayExercise[]> {
  // Si el día ya se guardó hoy, el objetivo se calcula SIN esa sesión (es el
  // mismo que se mostró antes de guardar) y el contador trae lo guardado.
  const [marks, savedValues] = await Promise.all([
    loadMarks(
      db,
      ctx,
      mctx.userId,
      savedSession ? { excludeSessionId: savedSession.id } : {},
    ),
    savedSession
      ? loadSavedValues(db, ctx, savedSession.id)
      : Promise.resolve(new Map<string, number>()),
  ]);
  const exercises: TodayExercise[] = [];
  for (const code of day.exerciseCodes) {
    const exercise = mctx.catalog.exerciseByCode.get(code);
    if (exercise) {
      exercises.push(buildTodayExercise(mctx, exercise, marks, savedValues));
    }
  }
  return exercises;
}

/**
 * Vista de Hoy (§7.1): los 3 ejercicios del día con progresión, modo y contador
 * precargado. Toro suma el combo de apertura (§3.2) y, el sábado, los combos
 * push y pull en lugar de los ejercicios. Consultas fijas (contexto, marcas,
 * sesiones de la semana, marcas de la sesión de hoy, sesiones para la regla de
 * Subir de los combos): nada por ejercicio en un loop.
 */
export async function buildToday(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  dayKey?: string,
): Promise<TodayResponse> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const weekMonday = mondayOfIso(mctx.today);
  const weekSessions = await loadSessionsBetween(
    db,
    ctx,
    userId,
    weekMonday,
    addDaysIso(weekMonday, 6),
  );
  const week = buildPlanWeek(mctx, weekSessions);
  const chosen = resolveDayKey(week, dayKey);
  const savedSession = weekSessions.find(
    (s) => s.sessionDate === mctx.today && s.dayKey === chosen,
  );
  const comboSessions = levelHasCombos(mctx.level)
    ? await loadComboSessions(db, ctx, mctx)
    : [];

  const common = {
    ...week,
    date: mctx.today,
    dayKey: chosen,
    alreadySaved: savedSession !== undefined,
    pain: savedSession?.pain ?? 0,
    level: mctx.level,
  };
  if (chosen === SATURDAY_DAY_KEY) {
    return {
      ...common,
      label: SATURDAY_LABEL,
      finisher: "",
      exercises: [],
      opening: null,
      saturday: buildSaturday(mctx, savedSession, comboSessions),
    };
  }
  const day = planDays(mctx.catalog, mctx.daysCount).find(
    (d) => d.dayKey === chosen,
  );
  if (!day) throw invalidDayError();
  return {
    ...common,
    label: day.label,
    finisher: day.finisherText,
    exercises: await buildDayExercises(db, ctx, mctx, day, savedSession),
    opening: buildOpening(mctx, day, savedSession, comboSessions),
    saturday: null,
  };
}

// ── Inicio ──────────────────────────────────────────────────────────

/** Última fecha con sesión de cada día del plan. */
async function loadLastDates(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  dayKeys: string[],
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      dayKey: schema.conquerSessions.dayKey,
      lastDate: max(schema.conquerSessions.sessionDate),
    })
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, ctx),
        eq(schema.conquerSessions.userId, userId),
        inArray(schema.conquerSessions.dayKey, dayKeys),
      ),
    )
    .groupBy(schema.conquerSessions.dayKey);
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.lastDate) out.set(row.dayKey, row.lastDate);
  }
  return out;
}

/** Marca de E1 de una sesión: valor y peldaño con que se guardó. */
interface LastE1Mark {
  value: number;
  rungId: number;
}

/** Valores de E1 de las últimas sesiones por día (una query para todos los días). */
async function loadLastE1(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  lastDates: ReadonlyMap<string, string>,
): Promise<Map<string, Map<number, LastE1Mark>>> {
  const pairs = [...lastDates].map(([dayKey, date]) =>
    and(
      eq(schema.conquerSessions.dayKey, dayKey),
      eq(schema.conquerSessions.sessionDate, date),
    ),
  );
  const out = new Map<string, Map<number, LastE1Mark>>();
  if (pairs.length === 0) return out;
  const rows = await db
    .select({
      dayKey: schema.conquerSessions.dayKey,
      exerciseId: schema.conquerSessionSteps.exerciseId,
      value: schema.conquerSessionSteps.value,
      rungId: schema.conquerSessionSteps.rungId,
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
        eq(schema.conquerSessionSteps.step, "e1"),
        or(...pairs),
      ),
    );
  for (const row of rows) {
    const byExercise = out.get(row.dayKey) ?? new Map<number, LastE1Mark>();
    byExercise.set(row.exerciseId, { value: row.value, rungId: row.rungId });
    out.set(row.dayKey, byExercise);
  }
  return out;
}

function lastE1ForDay(
  catalog: ConquerCatalog,
  exerciseCodes: readonly string[],
  values: ReadonlyMap<number, LastE1Mark> | undefined,
): HomeLastByDay["e1"] {
  const out: HomeLastByDay["e1"] = [];
  for (const code of exerciseCodes) {
    const exercise = catalog.exerciseByCode.get(code);
    const mark = exercise ? values?.get(exercise.id) : undefined;
    if (exercise && mark !== undefined) {
      out.push({
        exerciseName: exercise.name,
        value: mark.value,
        unit: exercise.unit,
        // Fase 201 §1.4: "por lado" según el peldaño con que se guardó la marca
        unilateral: catalog.rungById.get(mark.rungId)?.unilateral ?? false,
      });
    }
  }
  return out;
}

/**
 * Resumen de Inicio (§7.1): semana del plan y, por día, la última sesión con
 * los valores de E1 de sus ejercicios.
 */
export async function buildHome(
  db: DbInstance,
  ctx: TenantContext,
  mctx: MemberContext,
): Promise<HomeView> {
  const weekMonday = mondayOfIso(mctx.today);
  const weekSessions = await loadSessionsBetween(
    db,
    ctx,
    mctx.userId,
    weekMonday,
    addDaysIso(weekMonday, 6),
  );
  const week = buildPlanWeek(mctx, weekSessions);
  const days = planDays(mctx.catalog, mctx.daysCount);
  if (days.length === 0) return { ...week, lastByDay: [] };

  const lastDates = await loadLastDates(
    db,
    ctx,
    mctx.userId,
    days.map((d) => d.dayKey),
  );
  const lastE1 = await loadLastE1(db, ctx, mctx.userId, lastDates);
  return {
    ...week,
    lastByDay: days.map((d) => ({
      dayKey: d.dayKey,
      label: d.label,
      date: lastDates.get(d.dayKey) ?? null,
      e1: lastE1ForDay(mctx.catalog, d.exerciseCodes, lastE1.get(d.dayKey)),
    })),
  };
}
