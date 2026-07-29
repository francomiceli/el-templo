/**
 * INITIUM cross-day sync.
 *
 * El INITIUM es el calentamiento compartido del día: conceptualmente hay UNO
 * solo, pero el modelo de datos lo guarda copiado en cada sesión de nivel
 * (cada sesión es autocontenida para el member app). Este helper mantiene el
 * invariante "un solo INITIUM por día" a nivel de escritura: después de
 * cualquier edición sobre un bloque INITIUM, replica su estado completo
 * (formato, params, título y prescripciones) a los bloques INITIUM de todas
 * las sesiones hermanas del mismo día (mismo week + day + goal_plan_type).
 *
 * Es un parche consciente hasta unificar el INITIUM en una fuente única real
 * (refactor de modelo pendiente). Cualquier camino de escritura nuevo sobre
 * bloques debe llamar a syncInitiumAcrossDay.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, ne, asc, isNull, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { revertToPendingIfApproved, logEdit } from "./session-edit-helpers";

/**
 * Replicate the INITIUM block of `sourceBlockId` to every sibling session of
 * the same day. No-op if the block doesn't exist or isn't an INITIUM.
 *
 * Siblings whose sessions were approved are reverted to pending_review (same
 * rule as direct edits) and get an "initium_sync" audit log entry.
 *
 * @returns number of sibling blocks updated
 */
export async function syncInitiumAcrossDay(
  db: MySql2Database<typeof schema>,
  sourceBlockId: number,
  userId: number,
): Promise<number> {
  const [source] = await db
    .select()
    .from(schema.sessionBlocks)
    .where(eq(schema.sessionBlocks.id, sourceBlockId));

  if (!source || source.role !== "INITIUM") return 0;

  const [sourceSession] = await db
    .select({
      id: schema.sessions.id,
      week: schema.sessions.week,
      day: schema.sessions.day,
      goalPlanType: schema.sessions.goalPlanType,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, source.sessionId));

  if (!sourceSession) return 0;

  const siblings = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.week, sourceSession.week),
        eq(schema.sessions.day, sourceSession.day),
        sourceSession.goalPlanType === null
          ? isNull(schema.sessions.goalPlanType)
          : eq(schema.sessions.goalPlanType, sourceSession.goalPlanType),
        ne(schema.sessions.id, sourceSession.id),
      ),
    );

  if (siblings.length === 0) return 0;

  const siblingBlocks = await db
    .select({
      id: schema.sessionBlocks.id,
      sessionId: schema.sessionBlocks.sessionId,
    })
    .from(schema.sessionBlocks)
    .where(
      and(
        inArray(
          schema.sessionBlocks.sessionId,
          siblings.map((s) => s.id),
        ),
        eq(schema.sessionBlocks.role, "INITIUM"),
      ),
    );

  if (siblingBlocks.length === 0) return 0;

  const sourcePrescriptions = await db
    .select()
    .from(schema.sessionPrescriptions)
    .where(eq(schema.sessionPrescriptions.blockId, sourceBlockId))
    .orderBy(asc(schema.sessionPrescriptions.sortOrder));

  // DELETE + INSERT de prescripciones por hermana: sin transacción, un fallo a
  // mitad del loop dejaba a esa sesión con el bloque actualizado y CERO
  // prescripciones — un INITIUM vacío, sin rollback y sin forma de detectarlo.
  // Una sola transacción para todo el loop porque el invariante es del día
  // completo: sincronizar la mitad de las hermanas divergiría los niveles entre
  // sí, que es exactamente lo que este helper existe para evitar. Mismo criterio
  // que `swapBlock` en service.ts.
  await db.transaction(async (tx) => {
    for (const sibling of siblingBlocks) {
      await tx
        .update(schema.sessionBlocks)
        .set({
          pattern: source.pattern,
          intensity: source.intensity,
          repsBudget: source.repsBudget,
          formatId: source.formatId,
          formatName: source.formatName,
          exerciseCount: source.exerciseCount,
          formatParams: source.formatParams,
          customTitle: source.customTitle,
        })
        .where(eq(schema.sessionBlocks.id, sibling.id));

      await tx
        .delete(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, sibling.id));

      if (sourcePrescriptions.length > 0) {
        await tx.insert(schema.sessionPrescriptions).values(
          sourcePrescriptions.map((p) => ({
            blockId: sibling.id,
            exerciseId: p.exerciseId,
            exerciseName: p.exerciseName,
            contraction: p.contraction,
            reps: p.reps,
            repsMax: p.repsMax,
            seconds: p.seconds,
            secondsMax: p.secondsMax,
            increment: p.increment,
            rest: p.rest,
            notes: p.notes,
            difficulty: p.difficulty,
            sortOrder: p.sortOrder,
            exerciseType: p.exerciseType,
            weighted: p.weighted,
          })),
        );
      }

      await revertToPendingIfApproved(tx, sibling.sessionId);
      await logEdit(tx, sibling.sessionId, userId, "initium_sync");
    }
  });

  return siblingBlocks.length;
}
