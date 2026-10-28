// Módulo: conquer — zona horaria del alumno (Fase 201 §4.4)
//
// Vive aparte de `member-service.ts` para que `history-loader.ts` y
// `activation-service.ts` puedan usarla sin un import circular
// (member-service -> today-service -> history-loader -> activation-service).
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Zona horaria del alumno: `users.branchId` -> `branches.timezone`, con la del
 * gimnasio por defecto si no tiene sede. "Hoy" del alumno es SIEMPRE el de su
 * sede, nunca UTC (§4.4).
 */
export async function resolveMemberTimezone(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<string> {
  const [row] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.users)
    .innerJoin(
      schema.branches,
      and(
        eq(schema.branches.id, schema.users.branchId),
        tenantWhere(schema.branches, ctx),
      ),
    )
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);
  return row?.timezone || DEFAULT_TENANT_TIMEZONE;
}
