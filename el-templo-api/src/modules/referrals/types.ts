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
