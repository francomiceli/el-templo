// Módulo: conquer — estado del alumno y pedidos de desbloqueo (Fase 201)
//
// D-12: todo alumno ve la tab Conquer. Sin fila en `conquer_members` está
// "bloqueado"; al tocar "Quiero desbloquearlo" queda "pedido" (una sola vez);
// cuando owner/admin lo activan pasa a "activo".
// D-17: NADA acá exige plan activo ni inscripción del Templo: un alumno sin
// plan también pide y, si se lo activan, entrena Conquer.
//
// El app NUNCA recalcula nada: pinta lo que manda `getConquerState`
// (201-07 le suma `home`, 201-12 le suma `bodyCheck`).
import { and, asc, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { ConquerLevel } from "../../db/schema/conquer";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { blockWeek } from "./calendar";
import { bodyCheckSummary, type BodyCheckSummary } from "./body-check-service";
import { loadMemberContext } from "./history-loader";
import { buildHome, type HomeView } from "./today-service";

// Re-export: los tests y otros servicios importaban la función desde acá.
export { resolveMemberTimezone } from "./timezone";

type DbInstance = MySql2Database<typeof schema>;

export type ConquerStatus = "bloqueado" | "pedido" | "activo";

export interface ConquerMemberState {
  level: ConquerLevel | null;
  daysCount: number | null;
  incReps: number;
  incS: number;
  activationDate: string | null;
  blockWeek: number;
  cutStage: number;
  publishEnabled: boolean;
  publishNoFace: boolean;
  /** Fase 201 §7.1: resumen de Inicio (semana del plan y última sesión por día). */
  home: HomeView;
  /** Fase 201 §6, D-15: banderas del control físico (día 0 y vencimiento). */
  bodyCheck: BodyCheckSummary;
}

export interface ConquerStateResponse {
  status: ConquerStatus;
  requestedAt: string | null;
  member: ConquerMemberState | null;
}

export interface UnlockRequestRow {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  branchName: string | null;
  requestedAt: string;
}

/** `datetime` de Drizzle (Date) a ISO; `null` se conserva. */
function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Estado de Conquer del alumno `userId` (siempre de `request.user`).
 * Sin fila = bloqueado (D-12); no exige plan (D-17).
 */
export async function getConquerState(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<ConquerStateResponse> {
  const [row] = await db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return { status: "bloqueado", requestedAt: null, member: null };

  const requestedAt = toIso(row.requestedAt);
  if (row.status === "pedido") {
    return { status: "pedido", requestedAt, member: null };
  }

  // Activo: la semana del bloque se cuenta desde la activación, con "hoy" de
  // la sede del alumno (A16). Sin fecha de activación es la semana 1.
  // Fase 201 §7.1: `home` se arma con el contexto del alumno (que ya trae el
  // "hoy" de su sede) y reusa el cargador único de historiales.
  const mctx = await loadMemberContext(db, ctx, userId);
  const home = await buildHome(db, ctx, mctx);
  // Fase 201 D-15: banderas `mustPromptDay0` / `day0Pending` con UNA query más
  // (sin otro `loadMemberContext`).
  const bodyCheck = await bodyCheckSummary(
    db,
    ctx,
    userId,
    mctx.today,
    row.day0SkippedAt,
  );
  const week = row.activationDate
    ? blockWeek(row.activationDate, mctx.today)
    : 1;
  return {
    status: "activo",
    requestedAt,
    member: {
      level: row.level,
      daysCount: row.daysCount,
      incReps: row.incReps,
      incS: row.incS,
      activationDate: row.activationDate,
      blockWeek: week,
      cutStage: row.cutStage,
      publishEnabled: row.publishEnabled,
      publishNoFace: row.publishNoFace,
      home,
      bodyCheck,
    },
  };
}

/**
 * D-12: registra el pedido de desbloqueo UNA sola vez. Sin fila inserta
 * `status = 'pedido'` con `requested_at = NOW()`; con fila no cambia nada.
 * `INSERT IGNORE` sobre el UNIQUE (tenant, user) tolera el doble toque
 * concurrente (T-201-15): el segundo insert se descarta sin error.
 */
export async function requestUnlock(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<ConquerStateResponse> {
  await db
    .insert(schema.conquerMembers)
    .ignore()
    .values(
      tenantValues(ctx, {
        userId,
        status: "pedido" as const,
        requestedAt: sql`NOW()`,
      }),
    );
  return getConquerState(db, ctx, userId);
}

/** Pedidos pendientes (más viejo primero), para owner/admin. */
export async function listUnlockRequests(
  db: DbInstance,
  ctx: TenantContext,
): Promise<UnlockRequestRow[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      branchName: schema.branches.name,
      requestedAt: schema.conquerMembers.requestedAt,
    })
    .from(schema.conquerMembers)
    .innerJoin(
      schema.users,
      and(
        eq(schema.users.id, schema.conquerMembers.userId),
        tenantWhere(schema.users, ctx),
      ),
    )
    .leftJoin(
      schema.branches,
      and(
        eq(schema.branches.id, schema.users.branchId),
        tenantWhere(schema.branches, ctx),
      ),
    )
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.status, "pedido"),
      ),
    )
    .orderBy(
      asc(schema.conquerMembers.requestedAt),
      asc(schema.conquerMembers.id),
    );

  return rows.map((r) => ({
    userId: r.userId,
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    email: r.email ?? "",
    branchName: r.branchName,
    requestedAt: toIso(r.requestedAt) ?? "",
  }));
}

/** Contador de pedidos pendientes (badge del admin). */
export async function countUnlockRequests(
  db: DbInstance,
  ctx: TenantContext,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.status, "pedido"),
      ),
    );
  return Number(row?.total ?? 0);
}
