/**
 * Shared helpers for session edit operations.
 *
 * Used by AdminEditService, ExerciseSwapService, and SessionMutationService
 * to avoid triplicating revert-to-pending and edit-log logic.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import type { EditAction } from "./types";

/**
 * Ambos helpers aceptan el pool o un handle de transacción: los callers que
 * escriben varias filas relacionadas (ver `syncInitiumAcrossDay`) necesitan que
 * el revert y el log de auditoría entren en el mismo commit que la escritura.
 */
type DbOrTx = MySql2Database<typeof schema> | TxHandle;

/** Payload to reset a session back to pending_review */
export const PENDING_REVIEW_RESET = {
  status: "pending_review" as const,
  approvedAt: null,
  approvedBy: null,
  approvedBySystem: false,
};

/**
 * If the session is currently approved, revert it to pending_review.
 * Called after any edit mutation so coaches must re-approve.
 */
export async function revertToPendingIfApproved(
  db: DbOrTx,
  sessionId: number,
): Promise<void> {
  const [session] = await db
    .select({ status: schema.sessions.status })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId));

  if (session?.status === "approved") {
    await db
      .update(schema.sessions)
      .set(PENDING_REVIEW_RESET)
      .where(eq(schema.sessions.id, sessionId));
  }
}

/**
 * Insert a row into session_edit_logs for audit trail.
 */
export async function logEdit(
  db: DbOrTx,
  sessionId: number,
  userId: number,
  action: EditAction,
): Promise<void> {
  await db.insert(schema.sessionEditLogs).values({ sessionId, userId, action });
}
