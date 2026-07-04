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
} as const;
