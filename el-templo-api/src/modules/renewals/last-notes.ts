/**
 * Última nota (`member_notes`) por socio, para la columna "Observación" de las listas
 * de seguimiento: la comparten Renovaciones (`RenewalsService`) y la bandeja de
 * Invitaciones (`InvitationLeadList`), así la consulta y la forma de la nota no se duplican.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { RenewalLastNote } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Nombre completo de un usuario de staff, o `null` si no tiene ni nombre ni apellido. */
export function staffName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return name === "" ? null : name;
}

/**
 * Última `member_notes` por socio, en UNA query para todos los `userIds` — reducida
 * en JS (la primera fila de cada usuario, ordenadas de la más nueva a la más vieja).
 * Los socios sin notas no aparecen en el mapa.
 */
export async function fetchLastNotes(
  db: DbInstance,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, RenewalLastNote>> {
  const map = new Map<number, RenewalLastNote>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({
      userId: schema.memberNotes.userId,
      content: schema.memberNotes.content,
      createdAt: schema.memberNotes.createdAt,
      authorFirstName: schema.users.firstName,
      authorLastName: schema.users.lastName,
    })
    .from(schema.memberNotes)
    .leftJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.memberNotes.authorId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.memberNotes, ctx),
        inArray(schema.memberNotes.userId, userIds),
      ),
    )
    .orderBy(desc(schema.memberNotes.createdAt), desc(schema.memberNotes.id));

  for (const r of rows) {
    if (!map.has(r.userId)) {
      map.set(r.userId, {
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        authorName: staffName(r.authorFirstName, r.authorLastName),
      });
    }
  }
  return map;
}
