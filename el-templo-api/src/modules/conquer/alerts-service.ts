// Módulo: conquer — alertas por evento (Fase 201 §5, T-201-28)
//
// Una alerta por evento se identifica con `dedupe_key` y el UNIQUE
// (tenant, alumno, tipo, dedupe_key): repetir el evento no duplica la fila.
// 201-09 amplía este archivo con molestia, caída, paso de nivel y las derivadas.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

export type EventAlertType =
  | "molestia"
  | "caida"
  | "tope_escalera"
  | "paso_nivel";

export interface EventAlertKey {
  userId: number;
  type: EventAlertType;
  dedupeKey: string;
}

export interface EventAlertInput extends EventAlertKey {
  detail: Record<string, unknown>;
}

/**
 * Alta idempotente. Si la alerta ya existe solo se actualiza el `detail`. Si la
 * había auto-resuelto el sistema (`resuelta` con `resolved_by` NULL) se reabre;
 * una que resolvió el coach NO se reabre (decisión del orquestador, §5).
 */
export async function upsertEventAlert(
  db: DbInstance | Tx,
  ctx: TenantContext,
  input: EventAlertInput,
): Promise<void> {
  const { status, resolvedBy, resolvedAt } = schema.conquerAlerts;
  const autoResolved = sql`${status} = 'resuelta' AND ${resolvedBy} IS NULL`;
  await db
    .insert(schema.conquerAlerts)
    .values(
      tenantValues(ctx, {
        userId: input.userId,
        type: input.type,
        dedupeKey: input.dedupeKey,
        detail: input.detail,
      }),
    )
    .onDuplicateKeyUpdate({
      // MySQL evalúa las asignaciones de izquierda a derecha y cada una ve las
      // anteriores: `resolved_at` va ANTES que `status` para leer el estado viejo.
      set: {
        detail: input.detail,
        resolvedAt: sql`IF(${autoResolved}, NULL, ${resolvedAt})`,
        status: sql`IF(${autoResolved}, 'abierta', ${status})`,
      },
    });
}

/**
 * Auto-resolución por el sistema: `resuelta` con `resolved_by` NULL (NULL =
 * automática). Solo toca alertas `abierta` o `vista`.
 */
export async function autoResolveEventAlert(
  db: DbInstance | Tx,
  ctx: TenantContext,
  input: EventAlertKey,
): Promise<void> {
  await db
    .update(schema.conquerAlerts)
    .set({ status: "resuelta", resolvedBy: null, resolvedAt: sql`NOW()` })
    .where(
      and(
        tenantWhere(schema.conquerAlerts, ctx),
        eq(schema.conquerAlerts.userId, input.userId),
        eq(schema.conquerAlerts.type, input.type),
        eq(schema.conquerAlerts.dedupeKey, input.dedupeKey),
        inArray(schema.conquerAlerts.status, ["abierta", "vista"]),
      ),
    );
}
