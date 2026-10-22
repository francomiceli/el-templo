// Módulo: conquer — cambio de progresión de un escalón (Fase 201 §4.5, §4.3)
//
// "A mano desde el desplegable": el alumno elige otro peldaño (y/o modo) de un
// escalón. Cambiar el peldaño reinicia ese escalón en el piso (`since_date =
// hoy`, §4.5) y, si es el E1, vuelve a calibrar (§4.3). Cambiar solo el modo no
// reinicia nada. Reusa `applyRungChange`, que también usarán las rutas de SUBIR.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { ConquerMode, ConquerStepRow } from "../../db/schema/conquer";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { StepKey } from "./engine";
import { loadMarks, loadMemberContext, markKey } from "./history-loader";
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
 * §4.5 / §4.3: pasa el escalón a `newRungId` desde `today`. El E1 vuelve a
 * calibración pendiente. No toca el modo (eso lo decide el llamador).
 */
export async function applyRungChange(
  tx: Tx,
  ctx: TenantContext,
  stepRow: Pick<ConquerStepRow, "id" | "step">,
  newRungId: number,
  today: string,
): Promise<void> {
  await tx
    .update(schema.conquerSteps)
    .set({
      rungId: newRungId,
      sinceDate: today,
      ...(stepRow.step === "e1" ? { calibration: "pendiente" as const } : {}),
    })
    .where(
      and(
        tenantWhere(schema.conquerSteps, ctx),
        eq(schema.conquerSteps.id, stepRow.id),
      ),
    );
}

/** Relee el escalón con `FOR UPDATE` (primero en la transacción). */
async function lockStep(
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
 * la escalera del ejercicio o está inactivo, o si el hold pide otro modo.
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
    rung.ladderId !== exercise.ladderId ||
    (!rung.isActive && rung.id !== current.rungId)
  ) {
    throw invalidRungError();
  }
  if (step === "hold" && body.mode !== "hold") {
    throw new AppError(
      "El hold final siempre se hace en modo hold",
      400,
      "CONQUER_MODO_INVALIDO",
    );
  }

  const updated = await db.transaction(async (tx) => {
    const locked = await lockStep(tx, ctx, current.id);
    let next: ConquerStepRow = locked;
    if (body.rungId !== locked.rungId) {
      await applyRungChange(tx, ctx, locked, body.rungId, mctx.today);
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
