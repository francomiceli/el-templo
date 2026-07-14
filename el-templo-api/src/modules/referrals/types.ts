// Module: referrals — tipos de retorno del servicio (fase 157, milestone v5.5).
// El servicio centraliza la mecánica "de la plata" del sistema de referidos:
// generación de código legible, cómputo del descuento simétrico condicional
// topeado (DESC-02/03/04) y registro auditable sin inflar saldo (AURA-01).

/**
 * Calibración del sistema de referidos, leída con fallback desde
 * aura_config['referral'].default_amount (% por vínculo) y
 * system_settings['referral.max_percent_cap'] (tope). Ambas perillas son
 * ajustables sin deploy (D-12/D-22).
 */
export interface ReferralConfig {
  /** % de descuento que aporta cada vínculo activo. Fallback 10 (D-12). */
  percentPerLink: number;
  /** Tope máximo acumulable de descuento por referidos. Fallback 40 (D-12). */
  maxPercentCap: number;
}

/**
 * Vista de un vínculo de referido para las pantallas de visibilidad (fase 158,
 * VIS-01/VIS-03). El `state` es DERIVADO con `deriveCoveredUntil` de la
 * contraparte (D-28), nunca con `users.status`; los vínculos `revoked` no se
 * exponen. `fullName` es intencional (D-29: las partes del vínculo se conocen).
 */
export interface ReferralLinkView {
  /** userId de la contraparte del vínculo (el otro extremo, no el consultante). */
  userId: number;
  /** Nombre completo de la contraparte (`firstName lastName`, D-29). */
  fullName: string;
  /**
   * Estado derivado (D-28): `pending` = aún no pagó su primer plan;
   * `active` = qualified + contraparte cubierta hoy; `suspended` = qualified +
   * contraparte vencida (se reactiva si vuelve).
   */
  state: "pending" | "active" | "suspended";
}

/**
 * Descuento vigente del socio con desglose pedagógico (D-27.2). `percent` NO se
 * recalcula acá: se obtiene LLAMANDO a `computeReferralDiscountPercent` (D-30,
 * reuso obligatorio) para que no pueda divergir del cómputo del cobro.
 */
export interface ReferralDiscountView {
  /** % vigente = `computeReferralDiscountPercent(userId)` (reuso D-30). */
  percent: number;
  /** Cantidad de vínculos con `state === "active"` (ambas direcciones). */
  activeCount: number;
  /** % que aporta cada vínculo activo, desde `getReferralConfig` (fallback 10). */
  perLinkPercent: number;
  /** Tope máximo acumulable, desde `getReferralConfig` (fallback 40). */
  capPercent: number;
}

/**
 * Shape único que consumen la pantalla "Mis referidos" (app) y la ficha del
 * admin (fase 158). Composición pura sobre `generateReferralCode` +
 * `getReferralConfig` + `computeReferralDiscountPercent` + `deriveCoveredUntil`.
 */
export interface ReferralOverview {
  /** Código legible del socio, generado lazy si falta (`generateReferralCode`). */
  referralCode: string;
  /** Descuento vigente con desglose. */
  discount: ReferralDiscountView;
  /** Vínculos donde el socio es referidor ("Trajiste a" / admin "Trajo a"). */
  referred: ReferralLinkView[];
  /** El único vínculo donde el socio es referido ("Te trajo"), o null. */
  referredBy: ReferralLinkView | null;
}

/**
 * A/B copy test de la card de referidos (v5.5 follow-up) — números por variante
 * para el tab de Analíticas. `exposedMembers` es el denominador (socios activos
 * por paridad de id, proxy justo entre variantes). `ctr` y `qualifiedRate` son
 * fracciones [0,1] calculadas sobre `exposedMembers`.
 */
export interface ReferralAbVariantResult {
  variant: "A" | "B";
  /** Socios activos (status='activo', role='member') en el bucket de la variante. */
  exposedMembers: number;
  /** Socios distintos que tocaron "Compartir código" con esta variante. */
  uniqueClickers: number;
  /** Taps totales (incluye repetidos del mismo socio). */
  totalClicks: number;
  /** Vínculos de referido creados con esta variante estampada. */
  referralsCreated: number;
  /** De los creados, los que llegaron a `qualified` (conversión real). */
  referralsQualified: number;
  /** uniqueClickers / exposedMembers. */
  ctr: number;
  /** referralsQualified / exposedMembers. */
  qualifiedRate: number;
}

export interface ReferralAbResults {
  variants: ReferralAbVariantResult[];
}
