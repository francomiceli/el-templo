// Módulo: subscriptions — base heredada de una renovación (Fase 194-18, D-22)
//
// D-22 (CONFIRMADO por 194-02, prod 2026-10-06: 0 socios afectados): hasta la 194 la
// base que hereda una renovación sumaba de vuelta SOLO el descuento por referido
// (`pricePaid + referralDiscountAmount`). Un alta con AURA o con partner quedaba
// "pegada": la renovación partía del precio ya rebajado (90000 en vez de 100000) y la
// promo de UNA vez se perpetuaba ciclo tras ciclo. Con el árbitro (D-08/D-21) un cobro
// lleva UN solo descuento, pero las subs históricas pueden llevar varios compuestos.
// La base heredada es entonces el neto SIN ninguna promo: se devuelve el referido y el
// partner (montos guardados) y se reconstruye el descuento AURA a partir de su %.
//
// El descuento AURA solo guardó el % (`aura_discount` son los PUNTOS gastados, no
// plata) y el cobro lo calculó como `floor(base * pct / 100)`. Se invierte esa fórmula.
// `reconstructRenewalBase` es pura (se prueba en test/subscriptions/renewal-base.test.ts);
// `resolveRenewalBase` (extraída de `service.ts` en 194-18) lee la cadena de períodos.

import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { isMonthEndProratedPeriod } from "./month-end";
import type { PlanDetail, PriceType, RenewalBaseSource } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Datos de la sub del período anterior que hacen falta para reconstruir su base. */
export interface RenewalBaseInput {
  pricePaid: number;
  referralDiscountAmount: number | null;
  partnerDiscountAmount: number | null;
  /** % AURA aplicado en el alta (`aura_discount_percent`); null/0 = sin AURA. */
  auraDiscountPercent: number | null;
}

/**
 * Base PRE-AURA `b` tal que `b - floor(b * pct / 100) === neto`, o `null` si no hay
 * solución (pct fuera de rango o neto negativo).
 *
 * `f(b) = b - floor(b * pct / 100)` es no decreciente y crece de a 0 o 1, por lo que
 * todo neto >= 0 tiene solución y las soluciones son 1 o 2 enteros consecutivos dentro de
 * `((neto - 1) * 100 / (100 - pct), neto * 100 / (100 - pct)]`. Cuando hay dos (p. ej.
 * 99999 y 100000 dan ambos 90000 con pct 10) se devuelve la MAYOR: las listas de precios
 * son números redondos y la mayor es la que reproduce la lista. Diferencia máxima con la
 * otra: 1 unidad de moneda.
 */
function invertAuraDiscount(neto: number, pct: number): number | null {
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100 || neto < 0) return null;
  const upper = Math.floor((neto * 100) / (100 - pct));
  // Defensivo: la ventana exacta tiene como mucho 2 enteros; se revisan 3 hacia abajo.
  for (let b = upper; b >= Math.max(0, upper - 3); b--) {
    if (b - Math.floor((b * pct) / 100) === neto) return b;
  }
  return null;
}

/**
 * Precio base del mes completo que hereda una renovación: el `pricePaid` del período
 * anterior más TODO lo que se le descontó (referido, partner y AURA).
 *
 * Sin solución exacta para el AURA devuelve el neto sin sumarla (fail-safe: nunca cobra
 * de más) y avisa por `onAuraUnresolved` para que el llamador deje un warn en el log.
 */
export function reconstructRenewalBase(
  sub: RenewalBaseInput,
  onAuraUnresolved?: () => void,
): number {
  const neto =
    sub.pricePaid +
    (sub.referralDiscountAmount ?? 0) +
    (sub.partnerDiscountAmount ?? 0);
  const pct = sub.auraDiscountPercent ?? 0;
  if (pct <= 0) return neto;
  const base = invertAuraDiscount(neto, pct);
  if (base === null) {
    onAuraUnresolved?.();
    return neto;
  }
  return base;
}

/**
 * Tope de saltos hacia atrás por `previousSubscriptionId` al buscar el último
 * período completo (resolveRenewalBase). Dos períodos parciales seguidos ya son
 * raros; el tope solo acota el peor caso de una cadena corrupta.
 */
const MAX_RENEWAL_BASE_HOPS = 6;

/** Campos de la sub que renueva `renewSubscription` que hacen falta para resolver su base. */
export interface RenewalBaseSub extends RenewalBaseInput {
  planId: number;
  startDate: string;
  endDate: string | null;
  priceTypeApplied: string;
  previousSubscriptionId: number | null;
}

/**
 * Base PRE-descuento de referido del MES COMPLETO que hereda una renovación,
 * antes de la normalización WR-04 y de cualquier override o prorrateo de ESTA
 * renovación.
 *
 * Por defecto es lo que el socio venía pagando (`pricePaid` + add-back del
 * referido — caso Pomilio: preserva precios negociados). Excepción: si el
 * período actual fue PARCIAL (alta o renovación prorrateada hasta fin de mes)
 * su `pricePaid` es un proporcional, y heredarlo renovaba el mes completo al
 * precio de los días sueltos (caso BCN sept 2026: alta del 25 al 30/9 por 12 €
 * y la renovación ofrecía 12 € por el mes, con el prorrateo topeado en 12).
 * Ahí se busca hacia atrás el último período COMPLETO del mismo plan y tipo de
 * precio (preserva el negociado de quien pasó por una renovación prorrateada);
 * si no hay (el parcial fue el alta), el precio de lista del plan.
 */
export async function resolveRenewalBase(
  deps: { db: DbInstance; log: FastifyBaseLogger },
  ctx: TenantContext,
  userId: number,
  currentSub: RenewalBaseSub,
  plan: Pick<PlanDetail, "durationDays">,
  /** Precio de lista del plan para un tipo de precio. */
  basePriceOf: (priceType: PriceType) => number,
): Promise<{ base: number; source: RenewalBaseSource }> {
  // Fase 194-18 (D-22): la base heredada devuelve TODA promo del período anterior
  // (referido, partner y AURA), no solo el referido: ninguna promo queda "pegada".
  const inheritedBase = (sub: RenewalBaseInput) =>
    reconstructRenewalBase(sub, () =>
      deps.log.warn(
        { userId, planId: currentSub.planId, pricePaid: sub.pricePaid },
        "renovación: no se pudo reconstruir la base pre-AURA, se hereda el neto sin AURA",
      ),
    );

  if (
    !isMonthEndProratedPeriod(
      currentSub.startDate,
      currentSub.endDate,
      plan.durationDays,
    )
  ) {
    return { base: inheritedBase(currentSub), source: "inherited" };
  }

  let previousId = currentSub.previousSubscriptionId;
  for (let hop = 0; previousId !== null && hop < MAX_RENEWAL_BASE_HOPS; hop++) {
    const [previous] = await deps.db
      .select({
        planId: schema.subscriptions.planId,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
        referralDiscountAmount: schema.subscriptions.referralDiscountAmount,
        partnerDiscountAmount: schema.subscriptions.partnerDiscountAmount,
        auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, previousId),
          eq(schema.subscriptions.userId, userId),
        ),
      )
      .limit(1);
    // Otro plan u otro tipo de precio: lo que pagaba ahí no es la base de
    // este plan → precio de lista.
    if (
      !previous ||
      previous.planId !== currentSub.planId ||
      previous.priceTypeApplied !== currentSub.priceTypeApplied
    ) {
      break;
    }
    if (
      !isMonthEndProratedPeriod(
        previous.startDate,
        previous.endDate,
        plan.durationDays,
      )
    ) {
      return { base: inheritedBase(previous), source: "previous_period" };
    }
    previousId = previous.previousSubscriptionId;
  }

  return {
    base: basePriceOf(currentSub.priceTypeApplied as PriceType),
    source: "plan_price",
  };
}
