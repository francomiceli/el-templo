/**
 * Phase 153 — Deudas hub tab constants (D-01/D-03).
 *
 * The `/deudas` page is a q-tabs hub (analog of CajaPage, fase 152): Por socio
 * (landing) / Por deuda / Vencidos. These names are the single source of truth
 * for the tab model + the optional `?tab=` query-param persistence, so plans
 * can reference tab names without re-declaring string literals.
 *
 * - `porSocio`: aggregated table (member + currency → total a cobrar) — the
 *   fast door-collection view (D-01), coach-visible.
 * - `porDeuda`: detailed row-per-debt report moved from Reportes, with motivo /
 *   período / fecha de registro (DEUDA-01/02/03). Gestión/admin/owner only.
 * - `vencidos`: expired-without-renewal leads (DEUDA-04). Wired by plan 153-04;
 *   included here now so the `?tab=` contract is stable. Gestión/admin/owner only.
 *
 * The object keys are the immutable `?tab=` contract.
 */

export const DEUDAS_TABS = {
  porSocio: 'porSocio',
  porDeuda: 'porDeuda',
  vencidos: 'vencidos',
} as const;

export type DeudasTab = (typeof DEUDAS_TABS)[keyof typeof DEUDAS_TABS];

/** Landing tab (D-03): Por socio is the portada (collecting is the frequent use). */
export const DEUDAS_DEFAULT_TAB: DeudasTab = DEUDAS_TABS.porSocio;

/**
 * Valid tab names, for ?tab= query-param validation. Order: Por socio → Por
 * deuda → Vencidos. The object keys stay immutable — the ?tab= contract.
 */
export const DEUDAS_TAB_NAMES: readonly DeudasTab[] = [
  DEUDAS_TABS.porSocio,
  DEUDAS_TABS.porDeuda,
  DEUDAS_TABS.vencidos,
];
