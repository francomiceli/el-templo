// Módulo: conquer — galería de antes y después para owner/admin (Fase 201 §6, §7.2)
//
// Lista a los alumnos activos que tienen al menos un control CON contenido
// (`checkHasContentSql`: un día 0 vacío no cuenta) con su "antes" y su
// "después", y se filtra por "autorizados" (`publish_enabled`, A19). En DOS
// queries: los alumnos (⨝ users) y todos sus controles con contenido.
//
// T-201-48: la respuesta NO lleva claves ni URLs de fotos (solo `photos:
// { frente, perfil, espalda }` booleanos); las URLs firmadas se piden de a una
// por la ruta de fotos del admin. A19: el flag de publicación no restringe quién
// ve, solo alimenta el filtro.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { ConquerLevel } from "../../db/schema/conquer";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  compareChecks,
  defaultComparePair,
  type CheckComparison,
} from "./body-check-rules";
import { checkHasContentSql } from "./body-check-content";
import { toComparable, toView, type BodyCheckView } from "./body-check-service";

type DbInstance = MySql2Database<typeof schema>;

export interface GalleryItem {
  userId: number;
  firstName: string;
  lastName: string;
  level: ConquerLevel | null;
  publishEnabled: boolean;
  publishNoFace: boolean;
  publishChangedAt: string | null;
  /** El control con contenido MÁS VIEJO (el "antes"; el día 0 si lo hizo). */
  day0: BodyCheckView | null;
  /** El MÁS NUEVO; `null` si el alumno solo tiene un control. */
  last: BodyCheckView | null;
  compare: CheckComparison | null;
}

export interface GalleryResponse {
  items: GalleryItem[];
}

interface GalleryMemberRow {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  level: ConquerLevel | null;
  publishEnabled: boolean;
  publishNoFace: boolean;
  publishChangedAt: Date | null;
}

/** Query 1: alumnos activos con su nombre, por apellido; filtro de autorizados opcional. */
async function loadGalleryMembers(
  db: DbInstance,
  ctx: TenantContext,
  authorized: boolean | null,
): Promise<GalleryMemberRow[]> {
  return db
    .select({
      userId: schema.conquerMembers.userId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      level: schema.conquerMembers.level,
      publishEnabled: schema.conquerMembers.publishEnabled,
      publishNoFace: schema.conquerMembers.publishNoFace,
      publishChangedAt: schema.conquerMembers.publishChangedAt,
    })
    .from(schema.conquerMembers)
    .innerJoin(
      schema.users,
      and(
        eq(schema.users.id, schema.conquerMembers.userId),
        tenantWhere(schema.users, ctx),
      ),
    )
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.status, "activo"),
        authorized === null
          ? undefined
          : eq(schema.conquerMembers.publishEnabled, authorized),
      ),
    )
    .orderBy(
      asc(schema.users.lastName),
      asc(schema.users.firstName),
      asc(schema.conquerMembers.userId),
    );
}

/** Query 2: los controles CON contenido de esos alumnos, de más viejo a más nuevo. */
async function loadContentChecks(
  db: DbInstance,
  ctx: TenantContext,
  userIds: number[],
): Promise<Map<number, BodyCheckView[]>> {
  const byUser = new Map<number, BodyCheckView[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select()
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        inArray(schema.conquerBodyChecks.userId, userIds),
        checkHasContentSql(),
      ),
    )
    .orderBy(
      asc(schema.conquerBodyChecks.checkDate),
      asc(schema.conquerBodyChecks.id),
    );
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(toView(row));
    byUser.set(row.userId, list);
  }
  return byUser;
}

function toGalleryItem(
  member: GalleryMemberRow,
  checks: readonly BodyCheckView[],
): GalleryItem {
  const pair = defaultComparePair(checks);
  return {
    userId: member.userId,
    firstName: member.firstName ?? "",
    lastName: member.lastName ?? "",
    level: member.level,
    publishEnabled: member.publishEnabled,
    publishNoFace: member.publishNoFace,
    publishChangedAt: member.publishChangedAt
      ? member.publishChangedAt.toISOString()
      : null,
    day0: checks[0] ?? null,
    last: pair ? pair[1] : null,
    compare: pair
      ? compareChecks(toComparable(pair[0]), toComparable(pair[1]))
      : null,
  };
}

/**
 * Galería del coach. `authorized: true` = solo los que activaron el permiso,
 * `false` = solo los que no, `null` = todos. Solo aparecen alumnos con al menos
 * un control con contenido.
 */
export async function buildGallery(
  db: DbInstance,
  ctx: TenantContext,
  opts: { authorized: boolean | null },
): Promise<GalleryResponse> {
  const members = await loadGalleryMembers(db, ctx, opts.authorized);
  const checks = await loadContentChecks(
    db,
    ctx,
    members.map((m) => m.userId),
  );
  const items = members
    .filter((m) => (checks.get(m.userId)?.length ?? 0) > 0)
    .map((m) => toGalleryItem(m, checks.get(m.userId) ?? []));
  return { items };
}
