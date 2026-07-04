/**
 * Phase 141 — Caja hub tab constants (D-01).
 * Phase 152 — reorden: Movimientos de caja (portada) → Pendientes →
 * Historial de cobros (key `transacciones`) → Saldos → Cuentas.
 *
 * The `/caja` page is a q-tabs hub: Movimientos de caja (landing) / Pendientes /
 * Historial de cobros / Saldos / Cuentas. These names are the single source of
 * truth for the tab model + the optional `?tab=` query-param persistence, so
 * Plan 04 (and future 142) can reference tab names without re-declaring string
 * literals.
 *
 * The `transacciones` tab holds member-linked transactions (cobros/pagos/
 * reembolsos/ajustes/anticipos); `movimientosCaja` holds member-less internal
 * cash-register rows (traspasos inter-caja, egresos, ajustes).
 *
 * NOTE: the overdue threshold is NOT defined here — it is read from the bandeja
 * response payload (`thresholdDays`, server-side OVERDUE_DAYS) per UI-SPEC/D-08
 * so 142 can swap the constant for a finance_settings read without touching UI.
 */

export const CAJA_TABS = {
  pendientes: 'pendientes',
  saldos: 'saldos',
  transacciones: 'transacciones',
  movimientosCaja: 'movimientosCaja',
  cuentas: 'cuentas',
} as const;

export type CajaTab = (typeof CAJA_TABS)[keyof typeof CAJA_TABS];

/** Landing tab (Phase 152 / D-01): Movimientos de caja is the portada. */
export const CAJA_DEFAULT_TAB: CajaTab = CAJA_TABS.movimientosCaja;

/**
 * Valid tab names, for ?tab= query-param validation. Order (Phase 152 / D-01):
 * Movimientos de caja → Pendientes → Historial de cobros (`transacciones`) →
 * Saldos → Cuentas. The object keys stay immutable — the ?tab= contract.
 */
export const CAJA_TAB_NAMES: readonly CajaTab[] = [
  CAJA_TABS.movimientosCaja,
  CAJA_TABS.pendientes,
  CAJA_TABS.transacciones,
  CAJA_TABS.saldos,
  CAJA_TABS.cuentas,
];
