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
// Pura y sin I/O (se prueba en test/subscriptions/renewal-base.test.ts).

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
