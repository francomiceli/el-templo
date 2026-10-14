/**
 * Validación compartida del alcance por sede de las superficies de
 * Comunicaciones (avisos de TV, novedades): cada id tiene que ser una sede
 * EXISTENTE DEL TENANT. Una sede ajena es 400 y nunca se persiste (T-193-27).
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { branches } from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { BadRequestError } from "../shared/errors";

type DbInstance = MySql2Database<typeof schema>;

export async function assertBranchesBelongToTenant(
  db: DbInstance,
  ctx: TenantContext,
  branchIds: number[] | null | undefined,
): Promise<void> {
  if (!branchIds || branchIds.length === 0) return;

  const rows = await db
    .select({ id: branches.id })
    .from(branches)
    .where(tenantWhere(branches, ctx));
  const validIds = new Set(rows.map((row) => row.id));

  const invalid = branchIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new BadRequestError(
      `Las sedes [${invalid.join(", ")}] no pertenecen a este gimnasio`,
    );
  }
}
