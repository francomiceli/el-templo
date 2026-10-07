// Módulo: referrals — sedes donde entrenó un invitado (Fase 194-19 / 194-20, D-18)
//
// "Sedes donde entrenó" = DISTINCT de las sedes de `attendance` del invitado entre
// el inicio y el vencimiento de sus accesos (`invitations.access_starts_on` ..
// `access_expires_on`). UNA query agrupada para N invitaciones (sin N+1): la usan
// el bloque `invitedBy` del overview (194-19) y el listado de leads del admin
// (194-20), así que vive acá y no en ninguno de los dos.
//
// AISLAMIENTO: `tenantWhere` en las 3 tablas (invitations, attendance, branches).
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { InvitationExecutor } from "./invitation-rules";

/**
 * Mapa `invitationId -> nombres de sede` (ordenados por nombre, sin repetir).
 * Las invitaciones sin asistencias no aparecen en el mapa: el llamador usa `[]`.
 */
export async function loadTrainedBranches(
  exec: InvitationExecutor,
  ctx: TenantContext,
  invitationIds: number[],
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (invitationIds.length === 0) return result;

  const i = schema.invitations;
  const rows = await exec
    .select({
      invitationId: i.id,
      branchId: schema.branches.id,
      branchName: schema.branches.name,
    })
    .from(i)
    .innerJoin(
      schema.attendance,
      and(
        tenantWhere(schema.attendance, ctx),
        // `attendance.member_id` es el invitado (users.id).
        eq(schema.attendance.memberId, i.invitedUserId),
        gte(schema.attendance.sessionDate, i.accessStartsOn),
        lte(schema.attendance.sessionDate, i.accessExpiresOn),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.attendance.branchId),
      ),
    )
    .where(and(tenantWhere(i, ctx), inArray(i.id, invitationIds)))
    .groupBy(i.id, schema.branches.id, schema.branches.name)
    .orderBy(asc(i.id), asc(schema.branches.name));

  for (const row of rows) {
    const names = result.get(row.invitationId) ?? [];
    names.push(row.branchName);
    result.set(row.invitationId, names);
  }
  return result;
}
