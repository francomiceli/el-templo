// Module: scheduling (fase 214, registro de aperturas de la lista de anotados)
//
// El plan de lanzamiento de la Comunidad quiere medir en la semana 1, 2 y 4
// cuantos alumnos abren la lista "quien va a esta clase". Cada vez que
// `GET /slots/:scheduleId/:date/attendees` responde 200 suma 1 a la fila del
// alumno para ese horario y fecha (`community_list_opens`). Se cuenta toda
// respuesta buena, sin importar si el que mira ve la lista o solo el total.
//
// El registro NUNCA rompe la lista: cualquier falla se loguea (solo ids) y la
// ruta sigue devolviendo la lista.
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { tenantValues, type TenantContext } from "../shared/tenant";

/** Lo unico que el registro necesita de la base (permite un stub en los tests). */
export type ListOpensDb = Pick<FastifyInstance["db"], "insert">;

/**
 * Suma una apertura de la lista para `(tenant, alumno, horario, fecha)`.
 *
 * - Primera vez: `open_count = 1` y `first_opened_at = last_opened_at = ahora`.
 * - Siguientes: `open_count = open_count + 1` y `last_opened_at = ahora`
 *   (`first_opened_at` no se toca).
 *
 * No lanza: ante cualquier error hace `log.warn` con los ids y resuelve.
 */
export async function recordListOpen(
  db: ListOpensDb,
  ctx: TenantContext,
  log: FastifyBaseLogger,
  userId: number,
  scheduleId: number,
  sessionDate: string,
): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(schema.communityListOpens)
      .values(
        tenantValues(ctx, {
          userId,
          scheduleId,
          sessionDate,
          openCount: 1,
          firstOpenedAt: now,
          lastOpenedAt: now,
        }),
      )
      .onDuplicateKeyUpdate({
        set: {
          openCount: sql`${schema.communityListOpens.openCount} + 1`,
          lastOpenedAt: now,
        },
      });
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        tenantId: ctx.tenantId,
        userId,
        scheduleId,
        sessionDate,
      },
      "community list open: no se pudo registrar la apertura",
    );
  }
}
