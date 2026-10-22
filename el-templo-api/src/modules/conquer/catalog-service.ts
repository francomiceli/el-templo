// Módulo: conquer — carga del catálogo del gimnasio (Fase 201 §9)
//
// El catálogo (escaleras, peldaños, ejercicios, días de plantilla) lo siembra
// la migración 0292. Se carga ENTERO en 4 queries (una por tabla, con
// `tenantWhere`): es chico (4 escaleras, ~30 peldaños, 12 ejercicios, 15 días)
// y las rutas siguientes lo usan completo, así que no hay N+1.
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

type DbInstance = MySql2Database<typeof schema>;

export interface RungView {
  id: number;
  code: string;
  name: string;
  position: number;
  brazosRectos: boolean;
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
  ladderId: number;
  unit: ConquerUnit;
  muscles: ConquerMuscle[];
  startSteps: ConquerStartStep[];
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
      brazosRectos: row.brazosRectos,
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
      unit: toUnit(row.unit),
      muscles: parseMuscles(row.muscles),
      startSteps: parseStartSteps(row.startSteps),
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

/** Días de la plantilla de `daysCount` días, por `sortOrder` (D-14). */
export function planDays(
  catalog: ConquerCatalog,
  daysCount: number,
): TemplateDayView[] {
  return catalog.templateDays
    .filter((d) => d.daysCount === daysCount)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}
