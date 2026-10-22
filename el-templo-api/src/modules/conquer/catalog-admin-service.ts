// Módulo: conquer — edición del catálogo desde el admin (Fase 201 D-14, D-20, §8.1)
//
// Lo que Nacho valida en la prueba se edita SIN tocar código: escaleras y
// peldaños (renombrar, unilateral, agregar, desactivar, reordenar), marca de
// brazos rectos, las TRES tablas de arranque (Toro, Novillo, Ternero) y zonas de
// cada ejercicio, y las plantillas de 2, 3 y 4 días. El catálogo nunca queda
// inconsistente:
//
//   - un peldaño NUNCA se borra (el historial lo referencia): se desactiva;
//   - no se desactiva un peldaño que usa alguna tabla de arranque de un ejercicio
//     (en la escalera de su escalón) ni el de arranque de los combos;
//   - cada escalera conserva al menos un peldaño activo;
//   - un ejercicio aparece UNA sola vez entre los días de la misma plantilla
//     (`conquer_steps` se identifica por ejercicio, no por día);
//   - la unidad y la escalera de un ejercicio NO se editan (consistencia del
//     historial).
//
// Los alumnos reciben los escalones nuevos de forma perezosa
// (`ensureStepsForPlan` en `loadMemberContext`). Las mutaciones corren en una
// transacción con el FOR UPDATE primero y devuelven la vista ya actualizada.
import { and, asc, eq, ne, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  CONQUER_MODES,
  CONQUER_STEP_KEYS,
  type ConquerMuscle,
  type ConquerStartStep,
} from "../../db/schema/conquer";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { DEFAULT_COMBO_RUNG_CODE, COMBO_LADDER_CODE } from "./combos";
import {
  loadCatalog,
  stepLadderId,
  type ExerciseView,
  type LadderView,
  type RungView,
  type TemplateDayView,
} from "./catalog-service";
import { CONQUER_ZONES, ZONE_LABELS, isConquerZone } from "./lighting";
import { allowedModes } from "./rules";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

// ── Vistas ──────────────────────────────────────────────────────────

/**
 * Peldaño del editor: `inUse` = algún escalón de algún alumno apunta a él.
 * 201-25 DA-4: la marca de brazos rectos vive en el ejercicio, no en el peldaño.
 */
export interface RungAdminView extends RungView {
  inUse: boolean;
}

export interface LadderAdminView extends Omit<LadderView, "rungs"> {
  /** Por `position` ascendente (0 = el más difícil). */
  rungs: RungAdminView[];
}

/**
 * Ejercicio del editor. `ExerciseView` ya trae `holdLadderId`, `brazosRectos` y
 * las tablas de arranque de Novillo y Ternero (`[]` = no cargada, DA-5).
 */
export interface ExerciseAdminView extends ExerciseView {
  ladderCode: string;
  /** Código de la escalera de hold (`null` = el hold usa la de E1-E3). */
  holdLadderCode: string | null;
}

export interface CatalogAdminView {
  ladders: LadderAdminView[];
  exercises: ExerciseAdminView[];
  templateDays: TemplateDayView[];
  /** Las 15 zonas del mapa muscular, con su nombre para el editor. */
  zones: { slug: string; label: string }[];
}

// ── Errores y validaciones de texto ─────────────────────────────────

/** 400 con el detalle en el mensaje (D-14). */
function catalogError(message: string): AppError {
  return new AppError(message, 400, "CONQUER_CATALOGO_INVALIDO");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texto sin espacios sobrantes, entre 1 y `max` caracteres. */
function cleanText(value: unknown, max: number, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 1 || text.length > max) {
    throw catalogError(`${label} tiene que tener entre 1 y ${max} caracteres`);
  }
  return text;
}

/** Slug ASCII del nombre de un peldaño (`code` de la fila). */
export function slugifyRungName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
  return slug.length > 0 ? slug : "peldano";
}

/** `base`, y si choca `base_2`, `base_3`… (único dentro de la escalera). */
function uniqueRungCode(base: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// ── Lectura ─────────────────────────────────────────────────────────

/** Ids de peldaños a los que apunta algún `conquer_steps` del gimnasio (1 query). */
async function loadRungsInUse(
  db: DbInstance,
  ctx: TenantContext,
): Promise<Set<number>> {
  const rows = await db
    .select({ rungId: schema.conquerSteps.rungId })
    .from(schema.conquerSteps)
    .where(tenantWhere(schema.conquerSteps, ctx))
    .groupBy(schema.conquerSteps.rungId);
  return new Set(rows.map((r) => r.rungId));
}

/**
 * Catálogo completo para el editor del admin (§8.1, D-14): escaleras con sus
 * peldaños, ejercicios, plantillas y las 15 zonas.
 */
export async function getCatalogForAdmin(
  db: DbInstance,
  ctx: TenantContext,
): Promise<CatalogAdminView> {
  const [catalog, inUse] = await Promise.all([
    loadCatalog(db, ctx),
    loadRungsInUse(db, ctx),
  ]);
  const ladders: LadderAdminView[] = [...catalog.ladders.values()].map(
    (ladder) => ({
      ...ladder,
      rungs: ladder.rungs.map((rung) => ({
        ...rung,
        inUse: inUse.has(rung.id),
      })),
    }),
  );
  const exercises: ExerciseAdminView[] = [...catalog.exercises.values()].map(
    (exercise) => ({
      ...exercise,
      ladderCode: catalog.ladders.get(exercise.ladderId)?.code ?? "",
      holdLadderCode:
        exercise.holdLadderId === null
          ? null
          : (catalog.ladders.get(exercise.holdLadderId)?.code ?? null),
    }),
  );
  return {
    ladders,
    exercises,
    templateDays: catalog.templateDays,
    zones: CONQUER_ZONES.map((slug) => ({ slug, label: ZONE_LABELS[slug] })),
  };
}

function ladderNotFound(): AppError {
  return new AppError(
    "Esa escalera no existe",
    404,
    "CONQUER_ESCALERA_NO_ENCONTRADA",
  );
}

function rungNotFound(): AppError {
  return new AppError(
    "Ese peldaño no existe",
    404,
    "CONQUER_PELDANO_NO_ENCONTRADO",
  );
}

function exerciseNotFound(): AppError {
  return new AppError(
    "Ese ejercicio no existe",
    404,
    "CONQUER_EJERCICIO_NO_ENCONTRADO",
  );
}

function templateDayNotFound(): AppError {
  return new AppError(
    "Ese día de la plantilla no existe",
    404,
    "CONQUER_PLANTILLA_NO_ENCONTRADA",
  );
}

async function readLadderAdmin(
  db: DbInstance,
  ctx: TenantContext,
  ladderId: number,
): Promise<LadderAdminView> {
  const { ladders } = await getCatalogForAdmin(db, ctx);
  const ladder = ladders.find((l) => l.id === ladderId);
  if (!ladder) throw ladderNotFound();
  return ladder;
}

/** FOR UPDATE de la escalera del gimnasio: serializa las ediciones de sus peldaños. */
async function lockLadder(
  tx: Tx,
  ctx: TenantContext,
  ladderId: number,
): Promise<void> {
  const [row] = await tx
    .select({ id: schema.conquerLadders.id })
    .from(schema.conquerLadders)
    .where(
      and(
        tenantWhere(schema.conquerLadders, ctx),
        eq(schema.conquerLadders.id, ladderId),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) throw ladderNotFound();
}

// ── Peldaños ────────────────────────────────────────────────────────

export interface CreateRungBody {
  name: string;
  unilateral: boolean;
}

/**
 * Agrega un peldaño al final de la escalera (el más fácil, §8.1). El `code` es
 * el slug ASCII del nombre, único en la escalera (`_2`, `_3` si choca).
 */
export async function createRung(
  db: DbInstance,
  ctx: TenantContext,
  ladderId: number,
  body: CreateRungBody,
): Promise<LadderAdminView> {
  const name = cleanText(body.name, 60, "El nombre del peldaño");
  await db.transaction(async (tx) => {
    await lockLadder(tx, ctx, ladderId);
    const rungs = await tx
      .select({
        code: schema.conquerRungs.code,
        position: schema.conquerRungs.position,
      })
      .from(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, ctx),
          eq(schema.conquerRungs.ladderId, ladderId),
        ),
      );
    const code = uniqueRungCode(
      slugifyRungName(name),
      rungs.map((r) => r.code),
    );
    const position =
      rungs.reduce((max, r) => Math.max(max, r.position), -1) + 1;
    await tx.insert(schema.conquerRungs).values(
      tenantValues(ctx, {
        ladderId,
        code,
        name,
        position,
        unilateral: body.unilateral,
      }),
    );
  });
  return readLadderAdmin(db, ctx, ladderId);
}

export interface UpdateRungBody {
  name?: string;
  unilateral?: boolean;
  isActive?: boolean;
}

/** Las tres tablas de arranque de un ejercicio (anexo §3) con su nombre de nivel. */
const START_TABLES = [
  { key: "startSteps", level: "Toro" },
  { key: "startStepsNovillo", level: "Novillo" },
  { key: "startStepsTernero", level: "Ternero" },
] as const;

/**
 * 409 si el peldaño es parte de CUALQUIER tabla de arranque (Toro, Novillo o
 * Ternero) de un ejercicio cuya escalera para ese escalón es la del peldaño
 * (E1-E3 usan `ladder_id`, el hold usa `hold_ladder_id ?? ladder_id`, DA-3), o
 * si es el arranque de los combos (DA-5, anexo §6: "straddle" de la palanca).
 */
async function assertNotInStartSteps(
  tx: Tx,
  ctx: TenantContext,
  rung: { ladderId: number; code: string; name: string },
): Promise<void> {
  const exercises = await tx
    .select({
      name: schema.conquerExercises.name,
      ladderId: schema.conquerExercises.ladderId,
      holdLadderId: schema.conquerExercises.holdLadderId,
      startSteps: schema.conquerExercises.startSteps,
      startStepsNovillo: schema.conquerExercises.startStepsNovillo,
      startStepsTernero: schema.conquerExercises.startStepsTernero,
    })
    .from(schema.conquerExercises)
    .where(
      and(
        tenantWhere(schema.conquerExercises, ctx),
        or(
          eq(schema.conquerExercises.ladderId, rung.ladderId),
          eq(schema.conquerExercises.holdLadderId, rung.ladderId),
        ),
      ),
    );
  for (const exercise of exercises) {
    for (const table of START_TABLES) {
      const steps = exercise[table.key];
      const hit = Array.isArray(steps)
        ? steps.find(
            (s) =>
              s.rung === rung.code &&
              stepLadderId(exercise, s.step) === rung.ladderId,
          )
        : undefined;
      if (hit) {
        throw new AppError(
          `El peldaño "${rung.name}" es un escalón de arranque de "${exercise.name}" (${table.level}): cambiá primero la tabla de arranque`,
          409,
          "CONQUER_PELDANO_EN_ARRANQUE",
        );
      }
    }
  }
  await assertNotComboStart(tx, ctx, rung);
}

/** 409 si el peldaño es el de arranque de los combos de Toro (T-201-98). */
async function assertNotComboStart(
  tx: Tx,
  ctx: TenantContext,
  rung: { ladderId: number; code: string; name: string },
): Promise<void> {
  if (rung.code !== DEFAULT_COMBO_RUNG_CODE) return;
  const [ladder] = await tx
    .select({ code: schema.conquerLadders.code })
    .from(schema.conquerLadders)
    .where(
      and(
        tenantWhere(schema.conquerLadders, ctx),
        eq(schema.conquerLadders.id, rung.ladderId),
      ),
    )
    .limit(1);
  if (ladder?.code === COMBO_LADDER_CODE) {
    throw new AppError(
      `El peldaño "${rung.name}" es el arranque de los combos: no se puede desactivar`,
      409,
      "CONQUER_PELDANO_EN_ARRANQUE",
    );
  }
}

/** 409 si no quedaría ningún peldaño activo en la escalera. */
async function assertOtherActiveRung(
  tx: Tx,
  ctx: TenantContext,
  rung: { id: number; ladderId: number },
): Promise<void> {
  const [other] = await tx
    .select({ id: schema.conquerRungs.id })
    .from(schema.conquerRungs)
    .where(
      and(
        tenantWhere(schema.conquerRungs, ctx),
        eq(schema.conquerRungs.ladderId, rung.ladderId),
        eq(schema.conquerRungs.isActive, true),
        ne(schema.conquerRungs.id, rung.id),
      ),
    )
    .limit(1);
  if (!other) {
    throw new AppError(
      "La escalera tiene que conservar al menos un peldaño activo",
      409,
      "CONQUER_ESCALERA_VACIA",
    );
  }
}

/**
 * Renombra, marca unilateral o activa y desactiva un peldaño.
 * Nunca se borra (T-201-51): desactivar es la única baja.
 */
export async function updateRung(
  db: DbInstance,
  ctx: TenantContext,
  rungId: number,
  body: UpdateRungBody,
): Promise<LadderAdminView> {
  const set: Partial<typeof schema.conquerRungs.$inferInsert> = {};
  if (body.name !== undefined) {
    set.name = cleanText(body.name, 60, "El nombre del peldaño");
  }
  if (body.unilateral !== undefined) set.unilateral = body.unilateral;
  if (body.isActive !== undefined) set.isActive = body.isActive;
  if (Object.keys(set).length === 0) {
    throw catalogError("No hay nada para cambiar");
  }

  let ladderId = null as number | null;
  await db.transaction(async (tx) => {
    // Primero la escalera (FOR UPDATE), después el peldaño: mismo orden que
    // createRung y reorderRungs.
    const [probe] = await tx
      .select({ ladderId: schema.conquerRungs.ladderId })
      .from(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, ctx),
          eq(schema.conquerRungs.id, rungId),
        ),
      )
      .limit(1);
    if (!probe) throw rungNotFound();
    await lockLadder(tx, ctx, probe.ladderId);
    const [rung] = await tx
      .select()
      .from(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, ctx),
          eq(schema.conquerRungs.id, rungId),
        ),
      )
      .limit(1);
    if (!rung) throw rungNotFound();

    if (body.isActive === false && rung.isActive) {
      await assertNotInStartSteps(tx, ctx, rung);
      await assertOtherActiveRung(tx, ctx, rung);
    }
    await tx
      .update(schema.conquerRungs)
      .set(set)
      .where(
        and(
          tenantWhere(schema.conquerRungs, ctx),
          eq(schema.conquerRungs.id, rungId),
        ),
      );
    ladderId = rung.ladderId;
  });
  if (ladderId === null) throw rungNotFound();
  return readLadderAdmin(db, ctx, ladderId);
}

export interface ReorderRungsBody {
  rungIds: number[];
}

/** La lista tiene que ser EXACTAMENTE todos los peldaños de la escalera, sin repetir. */
function assertExactRungSet(current: Set<number>, ids: unknown): number[] {
  if (
    !Array.isArray(ids) ||
    ids.length !== current.size ||
    new Set(ids).size !== ids.length ||
    !ids.every((id): id is number => typeof id === "number" && current.has(id))
  ) {
    throw catalogError(
      "La lista tiene que incluir todos los peldaños de la escalera, una sola vez cada uno",
    );
  }
  return ids;
}

/**
 * Reordena la escalera (índice 0 = el más difícil). En dos pasadas dentro de la
 * transacción: posiciones temporales `1000 + i` y después `i`, para no chocar
 * con el UNIQUE (tenant, escalera, posición) a mitad de camino (T-201-52).
 */
export async function reorderRungs(
  db: DbInstance,
  ctx: TenantContext,
  ladderId: number,
  body: ReorderRungsBody,
): Promise<LadderAdminView> {
  await db.transaction(async (tx) => {
    await lockLadder(tx, ctx, ladderId);
    const rows = await tx
      .select({ id: schema.conquerRungs.id })
      .from(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, ctx),
          eq(schema.conquerRungs.ladderId, ladderId),
        ),
      );
    const ids = assertExactRungSet(
      new Set(rows.map((r) => r.id)),
      body.rungIds,
    );
    for (const [index, id] of ids.entries()) {
      await tx
        .update(schema.conquerRungs)
        .set({ position: 1000 + index })
        .where(
          and(
            tenantWhere(schema.conquerRungs, ctx),
            eq(schema.conquerRungs.id, id),
          ),
        );
    }
    for (const [index, id] of ids.entries()) {
      await tx
        .update(schema.conquerRungs)
        .set({ position: index })
        .where(
          and(
            tenantWhere(schema.conquerRungs, ctx),
            eq(schema.conquerRungs.id, id),
          ),
        );
    }
  });
  return readLadderAdmin(db, ctx, ladderId);
}

// ── Ejercicios ──────────────────────────────────────────────────────

export interface UpdateExerciseBody {
  name?: string;
  /** Marca de brazos rectos del ejercicio (anexo §1): decide el texto de fallo. */
  brazosRectos?: boolean;
  /** Se valida en el servicio (4 escalones, peldaños activos de la escalera). */
  startSteps?: unknown;
  /** Tabla de Novillo (anexo §3): misma validación que `startSteps`. */
  startStepsNovillo?: unknown;
  /** Tabla de Ternero (anexo §3): misma validación que `startSteps`. */
  startStepsTernero?: unknown;
  /** Se valida en el servicio (zonas del mapa, al menos una principal). */
  muscles?: unknown;
}

/** Escalera y unidad del ejercicio que validan una tabla de arranque. */
interface StartTableOwner {
  ladderId: number;
  holdLadderId: number | null;
  unit: ExerciseView["unit"];
}

/**
 * Tabla de arranque (§8.2, anexo §3): exactamente 4 escalones (e1, e2, e3, hold,
 * sin repetir). Fase 201 DA-3/DA-10: cada `rung` = `code` de un peldaño ACTIVO de
 * la escalera de SU escalón (`stepLadderId`: el hold usa la de hold) y cada
 * `mode` está entre los `allowedModes` del escalón (anexo §1). Se guarda
 * ordenado e1, e2, e3, hold y solo con las 3 claves del contrato.
 */
function validateStartSteps(
  raw: unknown,
  owner: StartTableOwner,
  activeCodesByLadder: ReadonlyMap<number, Set<string>>,
): ConquerStartStep[] {
  if (!Array.isArray(raw) || raw.length !== CONQUER_STEP_KEYS.length) {
    throw catalogError(
      "La tabla de arranque tiene que tener exactamente 4 escalones: e1, e2, e3 y hold",
    );
  }
  const byStep = new Map<string, ConquerStartStep>();
  for (const item of raw) {
    if (!isRecord(item)) throw catalogError("Escalón de arranque inválido");
    const { step, rung, mode } = item;
    if (
      typeof step !== "string" ||
      !(CONQUER_STEP_KEYS as readonly string[]).includes(step)
    ) {
      throw catalogError("Escalón de arranque inválido: el escalón no existe");
    }
    if (byStep.has(step)) {
      throw catalogError(
        `El escalón ${step} está repetido en la tabla de arranque`,
      );
    }
    const stepKey = step as ConquerStartStep["step"];
    const active = activeCodesByLadder.get(stepLadderId(owner, stepKey));
    if (typeof rung !== "string" || !active?.has(rung)) {
      throw catalogError(
        `El peldaño del escalón ${step} no existe o no está activo en la escalera de este ejercicio`,
      );
    }
    if (
      typeof mode !== "string" ||
      !(CONQUER_MODES as readonly string[]).includes(mode)
    ) {
      throw catalogError(`El modo del escalón ${step} no es válido`);
    }
    const modeKey = mode as ConquerStartStep["mode"];
    if (!allowedModes(owner.unit, stepKey).includes(modeKey)) {
      throw catalogError(
        step === "hold"
          ? 'El escalón hold tiene que ir con modo "hold"'
          : `El modo del escalón ${step} no corresponde a este ejercicio`,
      );
    }
    byStep.set(step, { step: stepKey, rung, mode: modeKey });
  }
  return CONQUER_STEP_KEYS.map((key) => byStep.get(key)).filter(
    (s): s is ConquerStartStep => s !== undefined,
  );
}

/**
 * Zonas del ejercicio (D-13): cada `zone` es una de las 15 del mapa, rol
 * principal o secundario, sin pares repetidos y al menos una principal.
 */
function validateMuscles(raw: unknown): ConquerMuscle[] {
  if (!Array.isArray(raw))
    throw catalogError("Las zonas tienen que ser una lista");
  const seen = new Set<string>();
  const out: ConquerMuscle[] = [];
  for (const item of raw) {
    if (!isRecord(item)) throw catalogError("Zona inválida");
    const { zone, role } = item;
    if (typeof zone !== "string" || !isConquerZone(zone)) {
      throw catalogError(
        `La zona ${String(zone)} no existe en el mapa muscular`,
      );
    }
    if (role !== "principal" && role !== "secundario") {
      throw catalogError(
        `El rol de la zona ${zone} tiene que ser principal o secundario`,
      );
    }
    const key = `${zone}|${role}`;
    if (seen.has(key)) {
      throw catalogError(`La zona ${zone} está repetida con el mismo rol`);
    }
    seen.add(key);
    out.push({ zone, role });
  }
  if (!out.some((m) => m.role === "principal")) {
    throw catalogError("El ejercicio necesita al menos una zona principal");
  }
  return out;
}

/** Códigos de los peldaños ACTIVOS de la escalera (para la tabla de arranque). */
async function activeRungCodes(
  tx: Tx,
  ctx: TenantContext,
  ladderId: number,
): Promise<Set<string>> {
  const rows = await tx
    .select({ code: schema.conquerRungs.code })
    .from(schema.conquerRungs)
    .where(
      and(
        tenantWhere(schema.conquerRungs, ctx),
        eq(schema.conquerRungs.ladderId, ladderId),
        eq(schema.conquerRungs.isActive, true),
      ),
    );
  return new Set(rows.map((r) => r.code));
}

/** Las tres tablas editables con la clave del body y la columna que guardan. */
const START_TABLE_FIELDS = [
  { body: "startSteps", column: "startSteps" },
  { body: "startStepsNovillo", column: "startStepsNovillo" },
  { body: "startStepsTernero", column: "startStepsTernero" },
] as const;

/**
 * Edita nombre, marca de brazos rectos, las tres tablas de arranque y las zonas
 * de un ejercicio (D-14, D-20, anexo §1 y §3). La unidad y las escaleras NO se
 * editan (consistencia del historial).
 */
export async function updateExercise(
  db: DbInstance,
  ctx: TenantContext,
  exerciseId: number,
  body: UpdateExerciseBody,
): Promise<ExerciseAdminView> {
  if (
    body.name === undefined &&
    body.brazosRectos === undefined &&
    body.startSteps === undefined &&
    body.startStepsNovillo === undefined &&
    body.startStepsTernero === undefined &&
    body.muscles === undefined
  ) {
    throw catalogError("No hay nada para cambiar");
  }
  await db.transaction(async (tx) => {
    const [exercise] = await tx
      .select({
        ladderId: schema.conquerExercises.ladderId,
        holdLadderId: schema.conquerExercises.holdLadderId,
        unit: schema.conquerExercises.unit,
      })
      .from(schema.conquerExercises)
      .where(
        and(
          tenantWhere(schema.conquerExercises, ctx),
          eq(schema.conquerExercises.id, exerciseId),
        ),
      )
      .limit(1)
      .for("update");
    if (!exercise) throw exerciseNotFound();

    const set: Partial<typeof schema.conquerExercises.$inferInsert> = {};
    if (body.name !== undefined) {
      set.name = cleanText(body.name, 80, "El nombre del ejercicio");
    }
    if (body.brazosRectos !== undefined) set.brazosRectos = body.brazosRectos;
    if (START_TABLE_FIELDS.some((f) => body[f.body] !== undefined)) {
      const activeCodes = await activeCodesOfExercise(tx, ctx, exercise);
      for (const field of START_TABLE_FIELDS) {
        const raw = body[field.body];
        if (raw === undefined) continue;
        set[field.column] = validateStartSteps(raw, exercise, activeCodes);
      }
    }
    if (body.muscles !== undefined) set.muscles = validateMuscles(body.muscles);

    await tx
      .update(schema.conquerExercises)
      .set(set)
      .where(
        and(
          tenantWhere(schema.conquerExercises, ctx),
          eq(schema.conquerExercises.id, exerciseId),
        ),
      );
  });
  const { exercises } = await getCatalogForAdmin(db, ctx);
  const updated = exercises.find((e) => e.id === exerciseId);
  if (!updated) throw exerciseNotFound();
  return updated;
}

/** Peldaños activos de la escalera de E1-E3 y de la de hold (si es otra). */
async function activeCodesOfExercise(
  tx: Tx,
  ctx: TenantContext,
  exercise: { ladderId: number; holdLadderId: number | null },
): Promise<Map<number, Set<string>>> {
  const ladderIds = new Set([
    exercise.ladderId,
    exercise.holdLadderId ?? exercise.ladderId,
  ]);
  const out = new Map<number, Set<string>>();
  for (const ladderId of ladderIds) {
    out.set(ladderId, await activeRungCodes(tx, ctx, ladderId));
  }
  return out;
}

// ── Plantillas ──────────────────────────────────────────────────────

export interface UpdateTemplateDayBody {
  label?: string;
  finisherText?: string;
  exerciseCodes?: unknown;
}

/** 3 códigos distintos de ejercicios ACTIVOS del gimnasio. */
async function validateExerciseCodes(
  tx: Tx,
  ctx: TenantContext,
  raw: unknown,
): Promise<string[]> {
  if (
    !Array.isArray(raw) ||
    raw.length !== 3 ||
    !raw.every((c): c is string => typeof c === "string") ||
    new Set(raw).size !== 3
  ) {
    throw catalogError("Cada día tiene que tener 3 ejercicios distintos");
  }
  const active = await tx
    .select({ code: schema.conquerExercises.code })
    .from(schema.conquerExercises)
    .where(
      and(
        tenantWhere(schema.conquerExercises, ctx),
        eq(schema.conquerExercises.isActive, true),
      ),
    );
  const activeCodes = new Set(active.map((e) => e.code));
  const unknownCode = raw.find((code) => !activeCodes.has(code));
  if (unknownCode !== undefined) {
    throw catalogError(
      `El ejercicio ${unknownCode} no existe o no está activo`,
    );
  }
  return raw;
}

/** Códigos que usan los OTROS días de la misma plantilla (mismo `days_count`). */
function codesOfOtherDays(
  days: { id: number; exerciseCodes: unknown }[],
  dayId: number,
): Set<string> {
  const codes = new Set<string>();
  for (const day of days) {
    if (day.id === dayId || !Array.isArray(day.exerciseCodes)) continue;
    for (const code of day.exerciseCodes) {
      if (typeof code === "string") codes.add(code);
    }
  }
  return codes;
}

/**
 * Edita un día de la plantilla de 2, 3 o 4 días: nombre, finisher y los 3
 * ejercicios. Un ejercicio no puede repetirse entre los días de la misma
 * plantilla (409): `conquer_steps` se identifica por ejercicio (§9).
 */
export async function updateTemplateDay(
  db: DbInstance,
  ctx: TenantContext,
  dayId: number,
  body: UpdateTemplateDayBody,
): Promise<TemplateDayView> {
  if (
    body.label === undefined &&
    body.finisherText === undefined &&
    body.exerciseCodes === undefined
  ) {
    throw catalogError("No hay nada para cambiar");
  }
  await db.transaction(async (tx) => {
    const [probe] = await tx
      .select({ daysCount: schema.conquerTemplateDays.daysCount })
      .from(schema.conquerTemplateDays)
      .where(
        and(
          tenantWhere(schema.conquerTemplateDays, ctx),
          eq(schema.conquerTemplateDays.id, dayId),
        ),
      )
      .limit(1);
    if (!probe) throw templateDayNotFound();
    // Se bloquean TODOS los días de la plantilla: dos ediciones simultáneas no
    // pueden meter el mismo ejercicio en dos días distintos.
    const days = await tx
      .select({
        id: schema.conquerTemplateDays.id,
        exerciseCodes: schema.conquerTemplateDays.exerciseCodes,
      })
      .from(schema.conquerTemplateDays)
      .where(
        and(
          tenantWhere(schema.conquerTemplateDays, ctx),
          eq(schema.conquerTemplateDays.daysCount, probe.daysCount),
        ),
      )
      .orderBy(asc(schema.conquerTemplateDays.id))
      .for("update");
    if (!days.some((d) => d.id === dayId)) throw templateDayNotFound();

    const set: Partial<typeof schema.conquerTemplateDays.$inferInsert> = {};
    if (body.label !== undefined) {
      set.label = cleanText(body.label, 40, "El nombre del día");
    }
    if (body.finisherText !== undefined) {
      set.finisherText = cleanText(body.finisherText, 200, "El finisher");
    }
    if (body.exerciseCodes !== undefined) {
      const codes = await validateExerciseCodes(tx, ctx, body.exerciseCodes);
      const taken = codesOfOtherDays(days, dayId);
      const repeated = codes.find((code) => taken.has(code));
      if (repeated !== undefined) {
        throw new AppError(
          `El ejercicio ${repeated} ya está en otro día de esta plantilla`,
          409,
          "CONQUER_EJERCICIO_REPETIDO",
        );
      }
      set.exerciseCodes = codes;
    }

    await tx
      .update(schema.conquerTemplateDays)
      .set(set)
      .where(
        and(
          tenantWhere(schema.conquerTemplateDays, ctx),
          eq(schema.conquerTemplateDays.id, dayId),
        ),
      );
  });
  const { templateDays } = await getCatalogForAdmin(db, ctx);
  const updated = templateDays.find((d) => d.id === dayId);
  if (!updated) throw templateDayNotFound();
  return updated;
}
