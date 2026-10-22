// Módulo: conquer — una alerta puntual con su propuesta (Fase 201 §5.1, T-201-30)
//
// Respuesta de `PATCH /alerts/:id`. Vive aparte de `board-service.ts` para que
// ese archivo conserve su número fijo de queries (el gate de 201-09 cuenta sus
// `await`) y para no crear un ciclo con `alerts-service.ts`.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { toBoardAlert, type BoardAlert } from "./board-service";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Una alerta guardada con su propuesta de recorte (respuesta de
 * `PATCH /alerts/:id`). 404 si no es del gimnasio (T-201-30).
 */
export async function getBoardAlert(
  db: DbInstance,
  ctx: TenantContext,
  alertId: number,
): Promise<BoardAlert> {
  const [row] = await db
    .select()
    .from(schema.conquerAlerts)
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.id, alertId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(
      "No encontramos esa alerta",
      404,
      "CONQUER_ALERTA_NO_ENCONTRADA",
    );
  }
  const [member] = await db
    .select({
      level: schema.conquerMembers.level,
      cutStage: schema.conquerMembers.cutStage,
    })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, row.userId),
      ),
    )
    .limit(1);
  return toBoardAlert(row, {
    level: member?.level ?? "ternero",
    cutStage: member?.cutStage ?? 0,
  });
}
