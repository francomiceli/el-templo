// Módulo: referrals — etiqueta "invitado" del roster de una clase (para el profe)
//
// Un alumno es "invitado que todavía no compró" cuando tiene una invitación `active` SIN
// `converted_at` y sigue `users.status = 'prueba'` (mismo criterio de "invitación activa" que
// el chip `isInvited` del listado de alumnos, `hasActiveInvitationExpr` en members/service.ts,
// más "no convirtió" y "sigue en prueba"). Si tiene más de una, vale la más reciente.
//
// UNA consulta en lote por roster (sin N+1): la usan el roster de asistencia de un horario
// (`GET /admin/attendance/slot/:scheduleId/:date`) y el detalle de un slot de scheduling
// (`GET /admin/scheduling/schedules/:scheduleId/detail`, que alimenta SlotDetailDialog).
//
// AISLAMIENTO: `tenantWhere` en las tres tablas (invitaciones, usuario, sub de accesos).
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { accessesUsed } from "./invitation-states";
import type { InvitationExecutor } from "./invitation-rules";

/** Accesos usados / presupuesto de la invitación del alumno (`null` si la sub no tiene cupo). */
export interface InvitationRosterTag {
  accessesUsed: number | null;
  accessesBudget: number | null;
}

/** Mapa `userId -> etiqueta`; los alumnos que no son invitados sin comprar no aparecen. */
export async function loadInvitationRosterTags(
  exec: InvitationExecutor,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, InvitationRosterTag>> {
  const result = new Map<number, InvitationRosterTag>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return result;

  const rows = await exec
    .select({
      userId: schema.invitations.invitedUserId,
      classesBudget: schema.subscriptions.classesBudget,
      classesRemaining: schema.subscriptions.classesRemaining,
    })
    .from(schema.invitations)
    .innerJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.invitations.invitedUserId),
        eq(schema.users.status, "prueba"),
      ),
    )
    .leftJoin(
      schema.subscriptions,
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.id, schema.invitations.subscriptionId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.invitations, ctx),
        inArray(schema.invitations.invitedUserId, ids),
        eq(schema.invitations.status, "active"),
        isNull(schema.invitations.convertedAt),
      ),
    )
    // La más reciente primero: la primera fila de cada alumno gana.
    .orderBy(desc(schema.invitations.activatedAt), desc(schema.invitations.id));

  for (const row of rows) {
    if (result.has(row.userId)) continue;
    result.set(row.userId, {
      accessesUsed: accessesUsed(row.classesBudget, row.classesRemaining),
      accessesBudget: row.classesBudget,
    });
  }
  return result;
}
