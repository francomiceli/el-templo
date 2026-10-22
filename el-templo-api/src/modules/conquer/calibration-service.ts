// Módulo: conquer — calibración de la semana 1 (Fase 201 §4.3, S12-4, A5)
//
// La primera sesión de cada ejercicio (y la primera tras cambiar la progresión
// del E1) propone subir, quedarse o bajar según el E1. El alumno acepta o no
// con un toque. D-20 / A5: aceptar mueve el EJERCICIO ENTERO (E1, E2, E3 y
// hold) un peldaño, cada escalón acotado a su escalera; Nacho lo valida en la
// prueba. La regla (`calibracion`) vive en `engine.ts`: acá solo se aplica.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  neighborRung,
  planDays,
  stepLadderId,
  type ExerciseView,
  type RungView,
} from "./catalog-service";
import {
  calibracion,
  selectReales,
  type Calibracion,
  type MarkRow,
  type StepKey,
} from "./engine";
import {
  loadMarks,
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import { applyRungChange, lockStep } from "./step-service";

type DbInstance = MySql2Database<typeof schema>;

export interface CalibrationProposal {
  exerciseId: number;
  exerciseName: string;
  proposal: Calibracion;
  fromRungName: string;
  /** Peldaño al que pasaría (subir = más difícil, bajar = más fácil), `null` si no hay. */
  toRungName: string | null;
}

/** Los 4 escalones de un ejercicio, en el orden en que se bloquean (FOR UPDATE). */
const EXERCISE_STEPS: readonly StepKey[] = ["e1", "e2", "e3", "hold"];

/** Ejercicios del plan del alumno en el orden del plan, sin repetir. */
export function planExercises(mctx: MemberContext): ExerciseView[] {
  const seen = new Set<number>();
  const out: ExerciseView[] = [];
  for (const day of planDays(mctx.catalog, mctx.daysCount)) {
    for (const code of day.exerciseCodes) {
      const exercise = mctx.catalog.exerciseByCode.get(code);
      if (exercise && !seen.has(exercise.id)) {
        seen.add(exercise.id);
        out.push(exercise);
      }
    }
  }
  return out;
}

/**
 * §4.3 / A5: propuesta por ejercicio del plan cuyo E1 está en
 * `calibration = 'pendiente'` y tiene exactamente UNA marca desde el último
 * cambio. Sin E/S: trabaja sobre el contexto y las marcas recibidas.
 */
export function calibrationProposals(
  mctx: MemberContext,
  marks: ReadonlyMap<string, MarkRow[]>,
): CalibrationProposal[] {
  const out: CalibrationProposal[] = [];
  for (const exercise of planExercises(mctx)) {
    const e1 = mctx.steps.get(markKey(exercise.id, "e1"));
    if (!e1 || e1.calibration !== "pendiente") continue;
    const reales = selectReales(
      marks.get(markKey(exercise.id, "e1")) ?? [],
      e1.sinceDate,
      e1.rungId,
    );
    if (reales.length !== 1) continue;
    const from = mctx.catalog.rungById.get(e1.rungId);
    if (!from) continue;
    const proposal = calibracion(reales[0].value, exercise.unit);
    const to =
      proposal === "quedarse"
        ? from
        : neighborRung(
            mctx.catalog,
            stepLadderId(exercise, "e1"),
            e1.rungId,
            proposal === "subir" ? "harder" : "easier",
          );
    out.push({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      proposal,
      fromRungName: from.name,
      toRungName: to?.name ?? null,
    });
  }
  return out;
}

function noCalibrationError(): AppError {
  return new AppError(
    "Ese ejercicio no tiene una calibración pendiente",
    409,
    "CONQUER_SIN_CALIBRACION",
  );
}

function topeError(proposal: "subir" | "bajar"): AppError {
  return new AppError(
    proposal === "subir"
      ? "Ya estás en el peldaño más difícil de esta escalera"
      : "Ya estás en el peldaño más fácil de esta escalera",
    409,
    "CONQUER_TOPE_ESCALERA",
  );
}

/** Peldaño destino de cada escalón del ejercicio (solo los que se pueden mover). */
function planMoves(
  mctx: MemberContext,
  exercise: ExerciseView,
  direction: "harder" | "easier",
): { step: StepKey; stepId: number; to: RungView }[] {
  const moves: { step: StepKey; stepId: number; to: RungView }[] = [];
  for (const step of EXERCISE_STEPS) {
    const row = mctx.steps.get(markKey(exercise.id, step));
    if (!row) continue;
    const to = neighborRung(
      mctx.catalog,
      // DA-3: cada escalón se mueve dentro de SU escalera (el hold, en la de hold).
      stepLadderId(exercise, step),
      row.rungId,
      direction,
    );
    if (to) moves.push({ step, stepId: row.id, to });
  }
  return moves;
}

/**
 * Resuelve la calibración pendiente de un ejercicio (S12-4). `accept: false`
 * deja la progresión como está (E1 a `resuelta`). `accept: true` mueve los 4
 * escalones un peldaño en la dirección propuesta; el E1 queda `pendiente` (la
 * primera sesión con el peldaño nuevo vuelve a calibrar, §4.3). 404 si el
 * alumno no tiene el ejercicio (T-201-27), 409 `CONQUER_SIN_CALIBRACION` si no
 * hay propuesta subir/bajar pendiente, 409 `CONQUER_TOPE_ESCALERA` si el E1 no
 * se puede mover.
 */
export async function resolveCalibration(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  exerciseId: number,
  accept: boolean,
): Promise<void> {
  const mctx = await loadMemberContext(db, ctx, userId);
  const exercise = mctx.catalog.exercises.get(exerciseId);
  const e1 = mctx.steps.get(markKey(exerciseId, "e1"));
  if (!exercise || !e1) throw new AppError("No encontramos ese ejercicio", 404);

  const marks = await loadMarks(db, ctx, userId);
  const found = calibrationProposals(mctx, marks).find(
    (p) => p.exerciseId === exerciseId,
  );
  if (!found || found.proposal === "quedarse") throw noCalibrationError();
  const direction = found.proposal === "subir" ? "harder" : "easier";

  const moves = accept ? planMoves(mctx, exercise, direction) : [];
  if (accept && !moves.some((m) => m.step === "e1")) {
    throw topeError(found.proposal);
  }

  await db.transaction(async (tx) => {
    const lockedE1 = await lockStep(tx, ctx, e1.id);
    // Doble toque: si otro pedido ya resolvió o movió el E1, este no repite.
    if (lockedE1.calibration !== "pendiente" || lockedE1.rungId !== e1.rungId) {
      throw noCalibrationError();
    }
    if (!accept) {
      await tx
        .update(schema.conquerSteps)
        .set({ calibration: "resuelta" })
        .where(
          and(
            tenantWhere(schema.conquerSteps, ctx),
            eq(schema.conquerSteps.id, e1.id),
          ),
        );
      return;
    }
    for (const move of moves) {
      const locked =
        move.stepId === e1.id ? lockedE1 : await lockStep(tx, ctx, move.stepId);
      await applyRungChange(tx, ctx, locked, move.to.id, mctx.today);
    }
  });
}
