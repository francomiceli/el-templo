// Módulo: subscriptions — derivaciones de "covered-until" (cobertura de ACCESO,
// de MEMBRESÍA y de RECORDATORIOS). Standalone (solo `db`), SIN dependencias hacia
// `subscriptions/service` ni `referrals/*`: es una hoja del grafo de imports. Vivían
// en `service.ts`; se movieron acá (Fase 194, ME-02) para que `referrals/invitation-*`
// y el árbitro de descuentos no tengan que importar el servicio de 8k líneas (ciclo
// de importaciones). `service.ts` las re-exporta para los llamadores históricos.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import { membershipPlanCondition } from "../shared/membership";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/**
 * Phase 144-01 (D-00, D-13, D-14) — the single DRY "covered-until" derivation.
 *
 * Returns the furthest `end_date` across the member's chained active+scheduled
 * subscriptions (the date until which the member is covered), or `null` when no
 * such date exists (no subs / only cancelled|expired / all-NULL end_date).
 *
 * Standalone (db-only) so the notification cron can reuse it without paying the
 * heavy `SubscriptionService` DI; `SubscriptionService.getCoveredUntil`
 * delegates here so booking-service and routes (which hold the service) share
 * ONE derivation — never re-derive the chain in three places.
 *
 * D-14 guard: rows with a NULL `end_date` are excluded, so a covered-until is
 * never derived from NULL (legacy/manual rows) — the result is NULL, and
 * downstream consumers treat NULL as "never block / never suppress".
 *
 * Par con `shared/covered-until.ts` (FA-10): esta función responde "¿le mando el
 * push?" para UN socio; el helper de allá es la expresión SQL correlacionada que
 * pinta el pill "Venc" sobre un listado sin caer en N+1. La diferencia de set es
 * deliberada: el pill incluye 'paused' (un socio pausado igual muestra su
 * vencimiento), el push no (una sub pausada no debe suprimir el aviso). Si
 * cambiás la semántica de cobertura, tocá los dos.
 */
/**
 * Fase 174.1-05b: `ctx` OPCIONAL al final — mismo Pattern D provisorio que
 * `promoteWaitlist`/`countActiveBookings` (booking-service.ts). Esta función
 * standalone la llaman 3 módulos (subscriptions/service.ts, referrals/service.ts,
 * jobs/notification-cron.ts).
 *
 * Fase 175-04: los 3 call sites externos (`referrals/service.ts` x2,
 * `jobs/notification-cron.ts::runPlanRenewalWarnings`) ya threadean `ctx` real —
 * cierra la deuda anotada en 174.1-05b. El parámetro sigue OPCIONAL (no
 * required) porque `test/subscriptions/covered-until.test.ts` ejercita
 * deliberadamente el fallback Pattern D (`isNotNull`) como caso de cobertura
 * propio; forzar `ctx` ahí no es parte del alcance de esta fase.
 */
export async function deriveCoveredUntil(
  db: MySql2Database<typeof schema>,
  userId: number,
  ctx?: TenantContext,
): Promise<string | null> {
  // Fase 194 D-03: cobertura de ACCESO. Cuenta TODAS las subs (incluidas las
  // `is_trial`); la semántica es exactamente la de antes del refactor.
  const map = await deriveCoveredUntilBatchImpl(db, [userId], ctx, {
    membershipOnly: false,
  });
  return map.get(userId) ?? null;
}

/**
 * Versión batcheada de {@link deriveCoveredUntil}: resuelve el covered-until de
 * MUCHOS socios en UNA sola query (`WHERE userId IN (...) GROUP BY userId`), para
 * evitar el N+1 cuando un consumidor necesita la cobertura de una lista entera
 * (p. ej. un referidor prolífico en `/mis-referidos`). Misma semántica exacta que
 * la versión de a uno (mismo set de estados, mismo guard de `end_date` NULL): si
 * cambiás una, cambiá la otra.
 *
 * Devuelve un Map de userId → covered-until. Un userId sin filas cubiertas NO
 * aparece en el Map; los consumidores tratan la ausencia como `null` ("nunca
 * cubierto"), idéntico a lo que devuelve la versión de a uno.
 *
 * Tenancy (reconciliación tren v6.0): `subscriptions` es tabla strict, así que
 * el filtro de tenant es OBLIGATORIO — mismo patrón que la versión de a uno:
 * `ctx` real ⇒ `tenantWhere` (aislamiento por gimnasio); sin `ctx` ⇒ fallback
 * `isNotNull(tenantId)` (tenant-blind pero visible al sentinel). El fix N+1 de
 * master llegó sin este filtro y habría tirado TenantSentinelError en strict.
 *
 * Fase 194 D-03 — cobertura de ACCESO (reservas, pill "Venc", `/coverage`):
 * CUENTA las subs `is_trial`, porque un invitado tiene que poder reservar dentro
 * de su vigencia y no después. Para "¿es miembro?" (descuento, estado de vínculo)
 * usar {@link deriveMembershipCoveredUntilBatch}.
 */
export async function deriveCoveredUntilBatch(
  db: MySql2Database<typeof schema>,
  userIds: number[],
  ctx?: TenantContext,
): Promise<Map<number, string | null>> {
  return deriveCoveredUntilBatchImpl(db, userIds, ctx, {
    membershipOnly: false,
  });
}

/**
 * Fase 194 D-03 / D-10d — cobertura de MEMBRESÍA de UN socio: igual que
 * {@link deriveCoveredUntil} pero IGNORA las subs de planes `is_trial` (un
 * acceso de invitación no es membresía). La usan el descuento por vínculo y el
 * estado del vínculo. NO usar para bloquear reservas (eso es ACCESO).
 */
export async function deriveMembershipCoveredUntil(
  db: MySql2Database<typeof schema> | TxHandle,
  userId: number,
  ctx?: TenantContext,
): Promise<string | null> {
  const map = await deriveCoveredUntilBatchImpl(db, [userId], ctx, {
    membershipOnly: true,
  });
  return map.get(userId) ?? null;
}

/**
 * Fase 194 D-03 / D-10d — versión batcheada de
 * {@link deriveMembershipCoveredUntil}. Misma query y misma semántica de tenancy
 * que {@link deriveCoveredUntilBatch} más la exclusión de planes `is_trial`.
 */
export async function deriveMembershipCoveredUntilBatch(
  db: MySql2Database<typeof schema> | TxHandle,
  userIds: number[],
  ctx?: TenantContext,
): Promise<Map<number, string | null>> {
  return deriveCoveredUntilBatchImpl(db, userIds, ctx, {
    membershipOnly: true,
  });
}

/**
 * Implementación común de las 4 coberturas (DRY): `membershipOnly` agrega el
 * filtro "el plan NO es `is_trial`" (invariante D-03, `shared/membership.ts`).
 */
async function deriveCoveredUntilBatchImpl(
  db: MySql2Database<typeof schema> | TxHandle,
  userIds: number[],
  ctx: TenantContext | undefined,
  opts: { membershipOnly: boolean },
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: schema.subscriptions.userId,
      coveredUntil: sql<string | null>`MAX(${schema.subscriptions.endDate})`,
    })
    .from(schema.subscriptions)
    .where(
      and(
        ctx
          ? tenantWhere(schema.subscriptions, ctx)
          : isNotNull(schema.subscriptions.tenantId),
        inArray(schema.subscriptions.userId, userIds),
        inArray(schema.subscriptions.status, ["active", "scheduled"]),
        isNotNull(schema.subscriptions.endDate),
        opts.membershipOnly ? membershipPlanCondition() : undefined,
      ),
    )
    .groupBy(schema.subscriptions.userId);

  for (const row of rows) {
    result.set(row.userId, row.coveredUntil ?? null);
  }
  return result;
}

/**
 * Duración mínima (en días) de un plan para que su vencimiento merezca
 * recordatorios de renovación. Un plan más corto ("Clase única": 1 día, 1
 * clase, precio acordado) termina por diseño: avisarle al socio "tu membresía
 * vence hoy, renovala" no tiene sentido y suena a error.
 */
export const EXPIRY_REMINDER_MIN_DURATION_DAYS = 7;

/**
 * Covered-until PARA RECORDATORIOS DE VENCIMIENTO, batcheado. Misma cadena que
 * {@link deriveCoveredUntilBatch} (active+scheduled con end_date), con una
 * regla extra: si la suscripción que define el covered-until (la de mayor
 * end_date) pertenece a un plan corto (`duration_days` <
 * {@link EXPIRY_REMINDER_MIN_DURATION_DAYS}), el socio se devuelve con `null`
 * ("nada que recordar"). Si dos suscripciones empatan en el end_date máximo,
 * alcanza con que UNA sea de plan normal para recordar.
 *
 * Consumidores: el push `plan_renewal_warning_*` (notification-cron), el pop-up
 * `plan_expiry` del app (communications/prompt-service) y el trigger
 * `plan_expires_in_days` de las reglas propias (notifications/rules). El
 * bloqueo de reservas y el pill "Venc" del admin siguen usando la cobertura
 * cruda: un plan corto sigue venciendo, solo no se anuncia.
 *
 * `ctx` OBLIGATORIO: los tres consumidores ya lo threadean (no hay fallback
 * Pattern D que preservar como en `deriveCoveredUntil`).
 */
export async function deriveReminderCoveredUntilBatch(
  db: MySql2Database<typeof schema>,
  userIds: number[],
  ctx: TenantContext,
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      userId: schema.subscriptions.userId,
      endDate: schema.subscriptions.endDate,
      durationDays: schema.subscriptionPlans.durationDays,
    })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        inArray(schema.subscriptions.userId, userIds),
        inArray(schema.subscriptions.status, ["active", "scheduled"]),
        isNotNull(schema.subscriptions.endDate),
      ),
    );

  // Pasada 1: covered-until crudo por socio (MAX(end_date), string
  // zero-padded YYYY-MM-DD → comparación lexicográfica segura).
  const coveredUntil = new Map<number, string>();
  for (const row of rows) {
    if (row.endDate === null) continue;
    const prev = coveredUntil.get(row.userId);
    if (prev === undefined || row.endDate > prev) {
      coveredUntil.set(row.userId, row.endDate);
    }
  }

  // Pasada 2: la cobertura solo se recuerda si alguna suscripción que TERMINA
  // en el covered-until es de un plan normal (>= mínimo).
  const remindable = new Set<number>();
  for (const row of rows) {
    if (
      row.endDate === coveredUntil.get(row.userId) &&
      row.durationDays >= EXPIRY_REMINDER_MIN_DURATION_DAYS
    ) {
      remindable.add(row.userId);
    }
  }

  for (const [userId, until] of coveredUntil) {
    result.set(userId, remindable.has(userId) ? until : null);
  }
  return result;
}

/** Versión de a uno de {@link deriveReminderCoveredUntilBatch}. */
export async function deriveReminderCoveredUntil(
  db: MySql2Database<typeof schema>,
  userId: number,
  ctx: TenantContext,
): Promise<string | null> {
  const map = await deriveReminderCoveredUntilBatch(db, [userId], ctx);
  return map.get(userId) ?? null;
}
