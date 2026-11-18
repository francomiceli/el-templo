// Module: scheduling (fase 214, comunidad)
//
// Estado de visibilidad del alumno en la lista de anotados (D-05, D-06, D-07,
// D-09, D-11, D-47). Las reglas viven en `community-visibility.ts` (puras); este
// servicio las alimenta con lo que hay en la base:
//
// - `getViewerCommunityState`: preferencia guardada, aviso visto, visibilidad
//   efectiva y si tiene un plan en vigor. El plan en vigor NUNCA sale de
//   `users.status` (se desfasa cuando una suscripcion vence sin recompute): va
//   por `activeMemberExists`, en una consulta APARTE con `.where()` (dentro de
//   un `.select()` resolveria columnas sin calificar y daria siempre falso).
// - `setCommunityVisibility` y `markCommunityNoticeSeen`: upserts sobre
//   `member_profiles`. Un socio freemium puede no tener fila todavia.
//
// El `userId` sale siempre del JWT: ninguna ruta acepta el id de otra persona.

import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { NotFoundError } from "../shared/errors";
import { ALL_STAFF_ROLES } from "../shared/permissions";
import { activeMemberExists } from "../shared/active-member";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { effectiveVisible } from "./community-visibility";

type DbInstance = MySql2Database<typeof schema>;

export interface ViewerCommunityState {
  /** Visibilidad efectiva: la preferencia si existe, si no la regla por defecto. */
  visible: boolean;
  /** Preferencia guardada (`null` = rige la regla por defecto). */
  preference: boolean | null;
  noticeSeen: boolean;
  isStaff: boolean;
  /** Plan en vigor segun `activeMemberExists`, nunca `users.status`. */
  hasPlanInEffect: boolean;
  branchId: number;
  branchCountry: string;
}

const STAFF_ROLES: readonly string[] = ALL_STAFF_ROLES;

export async function getViewerCommunityState(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<ViewerCommunityState> {
  const [row] = await db
    .select({
      role: schema.users.role,
      branchId: schema.users.branchId,
      dateOfBirth: schema.users.dateOfBirth,
      branchCountry: schema.branches.country,
      branchTimezone: schema.branches.timezone,
      preference: schema.memberProfiles.communityVisible,
      noticeSeenAt: schema.memberProfiles.communityNoticeSeenAt,
    })
    .from(schema.users)
    .leftJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.users.branchId),
      ),
    )
    .leftJoin(
      schema.memberProfiles,
      and(
        tenantWhere(schema.memberProfiles, ctx),
        eq(schema.memberProfiles.userId, schema.users.id),
      ),
    )
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);

  if (!row) throw new NotFoundError("Usuario no encontrado");

  // Consulta aparte: `activeMemberExists` es un EXISTS correlacionado y no va
  // dentro de un `.select()`.
  const planRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, userId),
        activeMemberExists(schema.users.id, ctx),
      ),
    )
    .limit(1);

  const branchCountry = row.branchCountry ?? "AR";
  const todayLocal = todayInTz(row.branchTimezone ?? DEFAULT_TENANT_TIMEZONE);
  const preference = row.preference ?? null;

  return {
    visible: effectiveVisible({
      preference,
      dateOfBirth: row.dateOfBirth,
      branchCountry,
      todayLocal,
    }),
    preference,
    noticeSeen: row.noticeSeenAt !== null,
    isStaff: STAFF_ROLES.includes(row.role),
    hasPlanInEffect: planRows.length > 0,
    branchId: row.branchId,
    branchCountry,
  };
}

/** Guarda la preferencia del alumno (D-05) y devuelve el estado releido. */
export async function setCommunityVisibility(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  visible: boolean,
): Promise<ViewerCommunityState> {
  // Upsert sin mirar `affectedRows` (mysql2 usa FOUND_ROWS): un socio freemium
  // puede no tener fila de `member_profiles`.
  await db
    .insert(schema.memberProfiles)
    .values(tenantValues(ctx, { userId, communityVisible: visible }))
    .onDuplicateKeyUpdate({ set: { communityVisible: visible } });
  return getViewerCommunityState(db, ctx, userId);
}

/**
 * Marca que el alumno vio el aviso de visibilidad (D-06). Idempotente: la
 * primera marca no se pisa (`COALESCE`).
 */
export async function markCommunityNoticeSeen(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  // Redondeado al segundo: TIMESTAMP no guarda fraccion y MySQL redondea.
  const now = new Date(Math.round(Date.now() / 1000) * 1000);
  await db
    .insert(schema.memberProfiles)
    .values(tenantValues(ctx, { userId, communityNoticeSeenAt: now }))
    .onDuplicateKeyUpdate({
      set: {
        communityNoticeSeenAt: sql`COALESCE(community_notice_seen_at, VALUES(community_notice_seen_at))`,
      },
    });
}
