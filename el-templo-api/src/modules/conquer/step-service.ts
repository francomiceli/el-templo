// Módulo: conquer — cambio de progresión de un escalón (Fase 201 §4.5, §4.3)
//
// "A mano desde el desplegable": el alumno elige otro peldaño (y/o modo) de un
// escalón. Cambiar el peldaño reinicia ese escalón en el piso (`since_date =
// hoy`, §4.5) y, si es el E1, vuelve a calibrar (§4.3). Cambiar solo el modo no
// reinicia nada. Reusa `applyRungChange`, que también usan SUBIR (§4.5, A3) y la
// calibración (§4.3).
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { ConquerMode, ConquerStepRow } from "../../db/schema/conquer";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { autoResolveEventAlert, upsertEventAlert } from "./alerts-service";
import {
  neighborRung,
  stepLadderId,
  type ExerciseView,
  type RungView,
} from "./catalog-service";
import {
  pickSubir,
  type CountedStep,
  type Estado,
  type MarkRow,
  type StepKey,
} from "./engine";
import {
  loadMarks,
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import { allowedModes } from "./rules";
import { computeTodayStep, type TodayStep } from "./today-service";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export interface ChangeStepBody {
  rungId: number;
  mode: ConquerMode;
}

function invalidRungError(): AppError {
  return new AppError(
    "Ese peldaño no es de la escalera de este ejercicio o no está disponible",
    400,
    "CONQUER_PELDANO_INVALIDO",
  );
}

/**
 * §4.5 / §4.3: pasa el escalón a `newRungId` desde `mctx.today`. El E1 vuelve a
 * calibración pendiente. No toca el modo (eso lo decide el llamador). Fase 201
 * DA-11: al final sincroniza la alerta de tope (`syncTopeOnRungChange`).
 */
export async function applyRungChange(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  exercise: Pick<ExerciseView, "id" | "name" | "ladderId" | "holdLadderId">,
  stepRow: Pick<ConquerStepRow, "id" | "step" | "rungId">,
  newRungId: number,
): Promise<void> {
  await tx
    .update(schema.conquerSteps)
    .set({
      rungId: newRungId,
      sinceDate: mctx.today,
      ...(stepRow.step === "e1" ? { calibration: "pendiente" as const } : {}),
    })
    .where(
      and(
        tenantWhere(schema.conquerSteps, ctx),
        eq(schema.conquerSteps.id, stepRow.id),
      ),
    );
  await syncTopeOnRungChange(
    tx,
    ctx,
    mctx,
    exercise,
    stepRow.step,
    stepRow.rungId,
    newRungId,
  );
}

/** Relee el escalón con `FOR UPDATE` (primero en la transacción). */
export async function lockStep(
  tx: Tx,
  ctx: TenantContext,
  stepId: number,
): Promise<ConquerStepRow> {
  const [row] = await tx
    .select()
    .from(schema.conquerSteps)
    .where(
      and(
        tenantWhere(schema.conquerSteps, ctx),
        eq(schema.conquerSteps.id, stepId),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) throw new AppError("No encontramos ese escalón", 404);
  return row;
}

/**
 * Cambia peldaño y/o modo del escalón `(exerciseId, step)` del alumno.
 * 404 si el alumno no tiene ese escalón (T-201-24); 400 si el peldaño no es de
 * la escalera del ejercicio o está inactivo, o si el modo no corresponde (§1).
 * Devuelve el `TodayStep` recalculado.
 */
export async function changeStep(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  exerciseId: number,
  step: StepKey,
  body: ChangeStepBody,
): Promise<TodayStep> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const current = mctx.steps.get(markKey(exerciseId, step));
  const exercise = mctx.catalog.exercises.get(exerciseId);
  if (!current || !exercise) {
    throw new AppError("No encontramos ese escalón", 404);
  }

  // Un peldaño inactivo solo se tolera si es el que el escalón ya tiene (el
  // alumno que solo cambia el modo de un escalón cuyo peldaño se desactivó).
  const rung = mctx.catalog.rungById.get(body.rungId);
  if (
    !rung ||
    // DA-3: el hold final elige en su propia escalera.
    rung.ladderId !== stepLadderId(exercise, step) ||
    (!rung.isActive && rung.id !== current.rungId)
  ) {
    throw invalidRungError();
  }
  // Fase 201 DA-10 / anexo §1: los isométricos y el hold final solo en modo
  // hold, los dinámicos completa o negativa. Un escalón que ya tiene un modo
  // fuera de la regla (dato viejo) se tolera mientras el pedido no lo cambie.
  if (
    body.mode !== current.mode &&
    !allowedModes(exercise.unit, step).includes(body.mode)
  ) {
    throw new AppError(
      step === "hold"
        ? "El hold final siempre se hace en modo hold"
        : "Ese modo no corresponde a este ejercicio",
      400,
      "CONQUER_MODO_INVALIDO",
    );
  }

  const updated = await db.transaction(async (tx) => {
    const locked = await lockStep(tx, ctx, current.id);
    let next: ConquerStepRow = locked;
    if (body.rungId !== locked.rungId) {
      await applyRungChange(tx, ctx, mctx, exercise, locked, body.rungId);
      next = {
        ...next,
        rungId: body.rungId,
        sinceDate: mctx.today,
        calibration: step === "e1" ? "pendiente" : next.calibration,
      };
    }
    if (body.mode !== locked.mode) {
      await tx
        .update(schema.conquerSteps)
        .set({ mode: body.mode })
        .where(
          and(
            tenantWhere(schema.conquerSteps, ctx),
            eq(schema.conquerSteps.id, locked.id),
          ),
        );
      next = { ...next, mode: body.mode };
    }
    return next;
  });

  const marks = await loadMarks(db, ctx, userId);
  return computeTodayStep(mctx, exercise, updated, marks);
}

// ── SUBIR (§4.5, A2, A3) ────────────────────────────────────────────

export const COUNTED_STEPS: readonly CountedStep[] = ["e1", "e2", "e3"];

/** El escalón que ofrece SUBIR en un ejercicio y el peldaño al que pasaría. */
export interface SubirCandidate {
  step: CountedStep;
  fromRung: RungView;
  /** `null` = ya está en el peldaño más difícil (A2): no se sube, se avisa al coach. */
  toRung: RungView | null;
}

/**
 * A3: por ejercicio solo ofrece SUBIR el primer escalón en estado `subir`
 * (orden e1, e2, e3). El estado sale del motor con las `marks` recibidas: el
 * app no recalcula nada.
 */
export function findSubir(
  mctx: MemberContext,
  exercise: ExerciseView,
  marks: ReadonlyMap<string, MarkRow[]>,
): SubirCandidate | null {
  const estados: Record<CountedStep, Estado> = {
    e1: "sin_datos",
    e2: "sin_datos",
    e3: "sin_datos",
  };
  for (const step of COUNTED_STEPS) {
    const row = mctx.steps.get(markKey(exercise.id, step));
    if (!row) return null;
    estados[step] =
      computeTodayStep(mctx, exercise, row, marks).estado ?? "sin_datos";
  }
  const picked = pickSubir(estados);
  if (picked === null) return null;
  const row = mctx.steps.get(markKey(exercise.id, picked));
  const fromRung = row ? mctx.catalog.rungById.get(row.rungId) : undefined;
  if (!row || !fromRung) return null;
  return {
    step: picked,
    fromRung,
    toRung: neighborRung(
      mctx.catalog,
      stepLadderId(exercise, picked),
      row.rungId,
      "harder",
    ),
  };
}

/** A2 / §5: alerta 🟡 para el coach, una sola por ejercicio, escalón y peldaño (T-201-28). */
export async function emitTopeAlert(
  db: Parameters<typeof upsertEventAlert>[0],
  ctx: TenantContext,
  userId: number,
  exercise: Pick<ExerciseView, "id" | "name">,
  step: CountedStep,
  rung: Pick<RungView, "id" | "name">,
): Promise<void> {
  await upsertEventAlert(db, ctx, {
    userId,
    type: "tope_escalera",
    dedupeKey: topeDedupeKey(exercise.id, step, rung.id),
    detail: {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      step,
      rungName: rung.name,
    },
  });
}

/**
 * Fase 201 DA-11 / anexo §8: el tope se avisa cuando un escalón E1-E3 LLEGA al
 * peldaño activo más difícil de su escalera (Subir, calibración, cambio a mano,
 * recorte) y se auto-resuelve cuando DEJA ese peldaño. El hold no avisa (el
 * anexo dice "E{n}"). Vive acá, junto a `emitTopeAlert`, para no sumar imports
 * circulares entre servicios.
 */
export async function syncTopeOnRungChange(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  exercise: Pick<ExerciseView, "id" | "name" | "ladderId" | "holdLadderId">,
  step: StepKey,
  fromRungId: number,
  toRungId: number,
): Promise<void> {
  if (step === "hold" || fromRungId === toRungId) return;
  await autoResolveEventAlert(tx, ctx, {
    userId: mctx.userId,
    type: "tope_escalera",
    dedupeKey: topeDedupeKey(exercise.id, step, fromRungId),
  });
  const ladderId = stepLadderId(exercise, step);
  const toRung = mctx.catalog.rungById.get(toRungId);
  if (!toRung || toRung.ladderId !== ladderId || !toRung.isActive) return;
  const harder = neighborRung(mctx.catalog, ladderId, toRungId, "harder");
  if (harder === null)
    await emitTopeAlert(tx, ctx, mctx.userId, exercise, step, toRung);
}

/** Clave de dedupe de la alerta de tope: `tope:<ejercicio>:<escalón>:<peldaño>`. */
export function topeDedupeKey(
  exerciseId: number,
  step: CountedStep,
  rungId: number,
): string {
  return `tope:${exerciseId}:${step}:${rungId}`;
}

function noTocaSubirError(): AppError {
  return new AppError(
    "Ese escalón todavía no te toca subir",
    409,
    "CONQUER_NO_TOCA_SUBIR",
  );
}

/**
 * Botón SUBIR del alumno (§4.5, sin aprobación del coach, D-06). T-201-26: el
 * servidor recalcula el estado con el motor y solo deja subir el escalón que
 * `findSubir` elige (A3). Pasa al peldaño más difícil con `since_date = hoy`:
 * la próxima sesión arranca en el piso (S12-5). Sin peldaño más difícil, avisa
 * al coach (alerta de tope) y responde 409 `CONQUER_TOPE_ESCALERA` (A2).
 */
export async function subirStep(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  exerciseId: number,
  step: CountedStep,
): Promise<void> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const exercise = mctx.catalog.exercises.get(exerciseId);
  const current = mctx.steps.get(markKey(exerciseId, step));
  if (!exercise || !current) {
    throw new AppError("No encontramos ese escalón", 404);
  }

  const marks = await loadMarks(db, ctx, userId);
  const candidate = findSubir(mctx, exercise, marks);
  if (!candidate || candidate.step !== step) throw noTocaSubirError();

  const toRung = candidate.toRung;
  if (!toRung) {
    // Fuera de transacción: el INSERT de la alerta tiene que sobrevivir al 409.
    await emitTopeAlert(db, ctx, userId, exercise, step, candidate.fromRung);
    throw new AppError(
      "Ya estás en el peldaño más difícil de esta escalera. Le avisamos al equipo.",
      409,
      "CONQUER_TOPE_ESCALERA",
    );
  }

  await db.transaction(async (tx) => {
    const locked = await lockStep(tx, ctx, current.id);
    // Doble toque: si otro pedido ya movió el escalón, este no sube otra vez.
    if (locked.rungId !== current.rungId) throw noTocaSubirError();
    await applyRungChange(tx, ctx, mctx, exercise, locked, toRung.id);
  });
}
