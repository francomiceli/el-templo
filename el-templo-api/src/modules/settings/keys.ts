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

// Phase 179-12 (D-01/D-04/D-20): URLs de las tiendas que codifican los QRs de
// la tarjeta física de partners. Franco las carga desde el admin sin deploy
// (la de iOS necesita el Apple ID numérico, que no vive en el repo). Ambas
// arrancan sin fila (null) hasta el checkpoint humano del plan 179-17 — el
// admin lo muestra explícitamente en vez de generar un QR roto.
export const APP_STORE_SETTINGS_KEYS = {
  /** URL pública de Play Store para el QR de Android. */
  android: "app.store_url.android",
  /** URL pública de App Store para el QR de iOS. */
  ios: "app.store_url.ios",
} as const;
