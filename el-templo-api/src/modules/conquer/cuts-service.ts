// Módulo: conquer — recortes que acepta el coach (Fase 201 §5.1, A12, S12-6)
//
// La propuesta de recorte sale de `cutProposal` (rules.ts) y viaja con cada alerta
// de molestia o caída. Acá el coach la acepta DE A UN PASO:
//   - Toro: etapas 1 a 5 (`cut_stage + 1`) y después NADA (anexo §8, DA-12: el
//     paso 6 "bajar una progresión" es solo de Ternero y Novillo).
//   - Ternero y Novillo: bajar un escalón.
// A12: no hay reversión automática. El coach puede deshacer la última etapa.
// Los servicios que mutan devuelven `void`: la ruta responde con `buildFicha`
// (evita imports circulares con ficha-service).
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  lockActiveMember,
  requireActiveMember,
  type ConquerActor,
} from "./activation-service";
import { assertAlertOfMember, resolveAlertsByCoach } from "./alerts-service";
import { neighborRung, stepLadderId } from "./catalog-service";
import type { StepKey } from "./engine";
import {
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import { cutProposal, type Level } from "./rules";
import { applyRungChange, lockStep } from "./step-service";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export type CutBody =
  | { action: "aplicar_etapa"; alertId?: number }
  | { action: "deshacer_etapa" }
  | {
      action: "bajar_escalon";
      exerciseId: number;
      step: StepKey;
      alertId?: number;
    };

/** Body plano del JSON-schema (`cutSchema`): los campos de cada acción son opcionales. */
export interface CutRequestBody {
  action: CutBody["action"];
  alertId?: number;
  exerciseId?: number;
  step?: StepKey;
}

/**
 * Del body plano a la unión discriminada. `bajar_escalon` exige `exerciseId` y
 * `step` (400 `CONQUER_CORTE_INVALIDO`); en las otras acciones se ignoran.
 */
export function parseCutBody(raw: CutRequestBody): CutBody {
  if (raw.action === "deshacer_etapa") return { action: "deshacer_etapa" };
  if (raw.action === "aplicar_etapa") {
    return { action: "aplicar_etapa", alertId: raw.alertId };
  }
  if (raw.exerciseId === undefined || raw.step === undefined) {
    throw new AppError(
      "Para bajar un escalón hay que indicar el ejercicio y el escalón",
      400,
      "CONQUER_CORTE_INVALIDO",
    );
  }
  return {
    action: "bajar_escalon",
    exerciseId: raw.exerciseId,
    step: raw.step,
    alertId: raw.alertId,
  };
}

/** Alertas que un recorte puede cerrar (§5.1: molestia y caída). */
const CUT_ALERT_TYPES = ["molestia", "caida"] as const;

function sinEtapaError(): AppError {
  return new AppError(
    "No hay una etapa de recorte para aplicar o deshacer",
    409,
    "CONQUER_SIN_ETAPA",
  );
}

/** DA-12 / anexo §8: Toro (Espartano) no baja escalones como recorte. */
function recorteNoAplicaError(): AppError {
  return new AppError(
    "Espartano no tiene más pasos de recorte: bajar una progresión es solo de Legionario y Centurión",
    409,
    "CONQUER_RECORTE_NO_APLICA",
  );
}

function pisoEscaleraError(): AppError {
  return new AppError(
    "Ese escalón ya está en el peldaño más fácil de su escalera",
    409,
    "CONQUER_PISO_ESCALERA",
  );
}

async function setCutStage(
  tx: Tx,
  ctx: TenantContext,
  memberId: number,
  cutStage: number,
): Promise<void> {
  await tx
    .update(schema.conquerMembers)
    .set({ cutStage })
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.id, memberId),
      ),
    );
}

/**
 * §5.1 / A12: `cut_stage + 1`. Solo lo ofrece `cutProposal` cuando la propuesta
 * es una etapa: Toro con `cut_stage < 5`. Cualquier otro caso (incluido Toro con
 * la etapa 5, sin propuesta) es 409.
 */
async function applyStage(
  tx: Tx,
  ctx: TenantContext,
  member: { id: number; level: Level; cutStage: number },
): Promise<void> {
  const proposal = cutProposal(member.level, member.cutStage);
  if (proposal === null || proposal.kind !== "etapa") throw sinEtapaError();
  await setCutStage(tx, ctx, member.id, proposal.stage);
}

/** A12: el coach se arrepiente de la última etapa (`cut_stage - 1`). */
async function undoStage(
  tx: Tx,
  ctx: TenantContext,
  member: { id: number; cutStage: number },
): Promise<void> {
  if (member.cutStage <= 0) throw sinEtapaError();
  await setCutStage(tx, ctx, member.id, member.cutStage - 1);
}

/**
 * §5.1: el escalón baja al peldaño activo más fácil siguiente (`neighborRung`
 * "easier", que usa `easierPosition` del motor) con `since = hoy`; el E1 vuelve a
 * calibrar (`applyRungChange`, §4.3). Escalón que no es del alumno: 404 (T-201-37).
 */
async function lowerStep(
  tx: Tx,
  ctx: TenantContext,
  mctx: MemberContext,
  exerciseId: number,
  step: StepKey,
): Promise<void> {
  const current = mctx.steps.get(markKey(exerciseId, step));
  const exercise = mctx.catalog.exercises.get(exerciseId);
  if (!current || !exercise) {
    throw new AppError("No encontramos ese escalón", 404);
  }
  const locked = await lockStep(tx, ctx, current.id);
  const easier = neighborRung(
    mctx.catalog,
    // DA-3: el escalón baja dentro de SU escalera (el hold, en la de hold).
    stepLadderId(exercise, step),
    locked.rungId,
    "easier",
  );
  if (!easier) throw pisoEscaleraError();
  await applyRungChange(tx, ctx, mctx, exercise, locked, easier.id);
}

/**
 * Acepta un paso del recorte propuesto (o lo deshace). Una sola transacción:
 * `FOR UPDATE` de la fila del alumno primero, la acción y, si vino `alertId`,
 * el cierre de esa alerta con `resolved_by = actor` (T-201-38). Si la acción
 * falla (409) la alerta queda abierta.
 */
export async function applyCut(
  db: DbInstance,
  ctx: TenantContext,
  actor: ConquerActor,
  userId: number,
  body: CutBody,
): Promise<void> {
  // El contexto (catálogo, escalones, "hoy" de la sede) se arma ANTES de la
  // transacción: `loadMemberContext` puede escribir y no debe esperar el lock.
  await requireActiveMember(db, ctx, userId);
  const mctx =
    body.action === "bajar_escalon"
      ? await loadMemberContext(db, ctx, userId)
      : null;

  await db.transaction(async (tx) => {
    const member = await lockActiveMember(tx, ctx, userId);
    if (body.action !== "deshacer_etapa" && body.alertId !== undefined) {
      await assertAlertOfMember(tx, ctx, userId, body.alertId, CUT_ALERT_TYPES);
    }
    // DA-12: Toro no tiene el paso 6. Se rechaza ANTES de tocar nada: la alerta queda abierta.
    if (body.action === "bajar_escalon" && member.level === "toro") {
      throw recorteNoAplicaError();
    }

    if (body.action === "aplicar_etapa") {
      await applyStage(tx, ctx, member);
    } else if (body.action === "deshacer_etapa") {
      await undoStage(tx, ctx, member);
    } else if (mctx) {
      await lowerStep(tx, ctx, mctx, body.exerciseId, body.step);
    }

    if (body.action !== "deshacer_etapa" && body.alertId !== undefined) {
      await resolveAlertsByCoach(tx, ctx, actor, {
        userId,
        types: CUT_ALERT_TYPES,
        alertId: body.alertId,
      });
    }
  });
}
