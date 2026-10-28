// Módulo: conquer — carga del catálogo del gimnasio (Fase 201 §9)
//
// El catálogo (escaleras, peldaños, ejercicios, días de plantilla) lo siembra
// la migración 0292 y lo alinea con el anexo de Nacho la 0293 (plan 201-25).
// Se carga ENTERO en 4 queries (una por tabla, con `tenantWhere`): es chico
// (20 escaleras, ~106 peldaños, 12 ejercicios, 9 días de plantilla) y las rutas
// siguientes lo usan completo, así que no hay N+1.
import { asc } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  CONQUER_MODES,
  CONQUER_STEP_KEYS,
  CONQUER_UNITS,
  type ConquerMuscle,
  type ConquerStartStep,
  type ConquerUnit,
} from "../../db/schema/conquer";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { easierPosition, harderPosition, type StepKey } from "./engine";
import type { Level } from "./rules";

type DbInstance = MySql2Database<typeof schema>;

export interface RungView {
  id: number;
  code: string;
  name: string;
  position: number;
  unilateral: boolean;
  isActive: boolean;
}

export interface LadderView {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Por `position` ascendente (0 = el más difícil). */
  rungs: RungView[];
}

export interface ExerciseView {
  id: number;
  code: string;
  name: string;
  /** Escalera de los escalones E1-E3 (y del hold si `holdLadderId` es null). */
  ladderId: number;
  /** 0293 (DA-3): escalera propia del hold final. `null` = usa `ladderId`. */
  holdLadderId: number | null;
  /** 0293 (DA-4): la marca de brazos rectos vive en el ejercicio (anexo §1). */
  brazosRectos: boolean;
  unit: ConquerUnit;
  muscles: ConquerMuscle[];
  /** Tabla de arranque de Toro. */
  startSteps: ConquerStartStep[];
  /** 0293 (DA-5): tabla de arranque de Novillo (`[]` = no cargada). */
  startStepsNovillo: ConquerStartStep[];
  /** 0293 (DA-5): tabla de arranque de Ternero (`[]` = no cargada). */
  startStepsTernero: ConquerStartStep[];
  sortOrder: number;
  isActive: boolean;
}

export interface TemplateDayView {
  id: number;
  daysCount: number;
  dayKey: string;
  label: string;
  sortOrder: number;
  finisherText: string;
  exerciseCodes: string[];
  openingComboKey: string | null;
}

export interface ConquerCatalog {
  ladders: Map<number, LadderView>;
  ladderByCode: Map<string, LadderView>;
  rungById: Map<number, RungView & { ladderId: number }>;
  exercises: Map<number, ExerciseView>;
  exerciseByCode: Map<string, ExerciseView>;
  templateDays: TemplateDayView[];
}

// ── Type guards para las columnas JSON (sin `any`) ──────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMuscle(value: unknown): value is ConquerMuscle {
  return (
    isRecord(value) &&
    typeof value.zone === "string" &&
    (value.role === "principal" || value.role === "secundario")
  );
}

function isStartStep(value: unknown): value is ConquerStartStep {
  return (
    isRecord(value) &&
    typeof value.rung === "string" &&
    (CONQUER_STEP_KEYS as readonly unknown[]).includes(value.step) &&
    (CONQUER_MODES as readonly unknown[]).includes(value.mode)
  );
}

function parseMuscles(raw: unknown): ConquerMuscle[] {
  return Array.isArray(raw) ? raw.filter(isMuscle) : [];
}

function parseStartSteps(raw: unknown): ConquerStartStep[] {
  return Array.isArray(raw) ? raw.filter(isStartStep) : [];
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

function toUnit(raw: string): ConquerUnit {
  return (CONQUER_UNITS as readonly string[]).includes(raw)
    ? (raw as ConquerUnit)
    : "reps";
}

// ── Carga ───────────────────────────────────────────────────────────

export async function loadCatalog(
  db: DbInstance,
  ctx: TenantContext,
): Promise<ConquerCatalog> {
  const [ladderRows, rungRows, exerciseRows, dayRows] = await Promise.all([
    db
      .select()
      .from(schema.conquerLadders)
      .where(tenantWhere(schema.conquerLadders, ctx))
      .orderBy(
        asc(schema.conquerLadders.sortOrder),
        asc(schema.conquerLadders.id),
      ),
    db
      .select()
      .from(schema.conquerRungs)
      .where(tenantWhere(schema.conquerRungs, ctx))
      .orderBy(asc(schema.conquerRungs.position)),
    db
      .select()
      .from(schema.conquerExercises)
      .where(tenantWhere(schema.conquerExercises, ctx))
      .orderBy(
        asc(schema.conquerExercises.sortOrder),
        asc(schema.conquerExercises.id),
      ),
    db
      .select()
      .from(schema.conquerTemplateDays)
      .where(tenantWhere(schema.conquerTemplateDays, ctx))
      .orderBy(
        asc(schema.conquerTemplateDays.sortOrder),
        asc(schema.conquerTemplateDays.id),
      ),
  ]);

  const ladders = new Map<number, LadderView>();
  const ladderByCode = new Map<string, LadderView>();
  for (const row of ladderRows) {
    const view: LadderView = {
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      rungs: [],
    };
    ladders.set(view.id, view);
    ladderByCode.set(view.code, view);
  }

  const rungById = new Map<number, RungView & { ladderId: number }>();
  for (const row of rungRows) {
    const rung: RungView = {
      id: row.id,
      code: row.code,
      name: row.name,
      position: row.position,
      unilateral: row.unilateral,
      isActive: row.isActive,
    };
    // La query ya viene ordenada por position: el push conserva el orden.
    ladders.get(row.ladderId)?.rungs.push(rung);
    rungById.set(rung.id, { ...rung, ladderId: row.ladderId });
  }

  const exercises = new Map<number, ExerciseView>();
  const exerciseByCode = new Map<string, ExerciseView>();
  for (const row of exerciseRows) {
    const view: ExerciseView = {
      id: row.id,
      code: row.code,
      name: row.name,
      ladderId: row.ladderId,
      holdLadderId: row.holdLadderId,
      brazosRectos: row.brazosRectos,
      unit: toUnit(row.unit),
      muscles: parseMuscles(row.muscles),
      startSteps: parseStartSteps(row.startSteps),
      startStepsNovillo: parseStartSteps(row.startStepsNovillo),
      startStepsTernero: parseStartSteps(row.startStepsTernero),
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
    exercises.set(view.id, view);
    exerciseByCode.set(view.code, view);
  }

  const templateDays: TemplateDayView[] = dayRows.map((row) => ({
    id: row.id,
    daysCount: row.daysCount,
    dayKey: row.dayKey,
    label: row.label,
    sortOrder: row.sortOrder,
    finisherText: row.finisherText,
    exerciseCodes: parseStringArray(row.exerciseCodes),
    openingComboKey: row.openingComboKey,
  }));

  return {
    ladders,
    ladderByCode,
    rungById,
    exercises,
    exerciseByCode,
    templateDays,
  };
}

/**
 * Fase 201 DA-3: escalera de un escalón. El hold final puede tener su propia
 * escalera (`holdLadderId`); E1-E3 y el hold sin escalera propia usan `ladderId`.
 */
export function stepLadderId(
  exercise: Pick<ExerciseView, "ladderId" | "holdLadderId">,
  step: StepKey,
): number {
  return step === "hold"
    ? (exercise.holdLadderId ?? exercise.ladderId)
    : exercise.ladderId;
}

/**
 * Fase 201 DA-5: tabla de arranque del ejercicio para un nivel (anexo §3). Si el
 * ejercicio no tiene la tabla de Novillo o Ternero (catálogo de otro gimnasio,
 * columna NULL) usa la de Toro y avisa con `fallback: true`.
 */
export function startStepsFor(
  exercise: Pick<
    ExerciseView,
    "startSteps" | "startStepsNovillo" | "startStepsTernero"
  >,
  level: Level,
): { steps: ConquerStartStep[]; fallback: boolean } {
  if (level === "toro") return { steps: exercise.startSteps, fallback: false };
  const own =
    level === "novillo"
      ? exercise.startStepsNovillo
      : exercise.startStepsTernero;
  if (own.length === 0) return { steps: exercise.startSteps, fallback: true };
  return { steps: own, fallback: false };
}

/** Días de la plantilla de `daysCount` días, por `sortOrder` (D-14). */
export function planDays(
  catalog: ConquerCatalog,
  daysCount: number,
): TemplateDayView[] {
  return catalog.templateDays
    .filter((d) => d.daysCount === daysCount)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/**
 * Peldaño vecino en la escalera (A2, §4.5): `harder` = el activo más difícil
 * que el actual (position menor), `easier` = el activo más fácil. `null` si ya
 * está en el extremo o el peldaño actual no es de la escalera.
 */
export function neighborRung(
  catalog: ConquerCatalog,
  ladderId: number,
  currentRungId: number,
  direction: "harder" | "easier",
): RungView | null {
  const ladder = catalog.ladders.get(ladderId);
  const current = catalog.rungById.get(currentRungId);
  if (!ladder || !current || current.ladderId !== ladderId) return null;
  const active = ladder.rungs.filter((r) => r.isActive);
  const positions = active.map((r) => r.position);
  const target =
    direction === "harder"
      ? harderPosition(positions, current.position)
      : easierPosition(positions, current.position);
  if (target === null) return null;
  return active.find((r) => r.position === target) ?? null;
}
