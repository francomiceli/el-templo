// Module: settings — canonical setting keys
//
// Single source of truth for the pricing-related system_settings keys. Phase 154
// (ALUM-03): the card-surcharge rule lives here so front (CobrosPage /
// AssignPlanDialog / PlanFormDialog) and back (subscriptions/service getBasePrice
// gate, plans 02+) all reference ONE literal. Do NOT re-declare this string
// anywhere else in the repo — import it from this module.

export const PRICING_SETTINGS_KEYS = {
  /** system_settings key gating the credit-card surcharge (`'on'` / `'off'`). */
  cardSurcharge: "pricing.card_surcharge_enabled",
  /** system_settings key gating the "Zero" price type (`'on'` / `'off'`). */
  zeroPrice: "pricing.zero_price_enabled",
} as const;

// Phase 163 (AUTO-02 / D-05, D-06): single source of truth for the lead
// state-machine settings keys. The window is seeded (p90 histórico, fallback 14)
// by migration 0182 and read each cron run via SettingsService.getPerdidoWindowDays.
// Do NOT re-declare this literal anywhere else — import it from this module.
export const LEADS_SETTINGS_KEYS = {
  /** días de ventana antes de vencer En seguimiento → Perdido (entero en días). */
  perdidoWindowDays: "leads.perdido_window_days",
} as const;
