/**
 * Fase 209 (Egresos) — constantes de las sub-pestañas de Caja → Egresos (DI-17; `?sub=` desde 2026-11-13).
 *
 * La página es un hub `q-tabs`: Gastos (portada) / Por pagar / Resumen /
 * Resultado / Rubros. Estos nombres son la fuente única del modelo de pestañas y del
 * `?tab=` de la URL (mismo patrón que `constants/caja.ts`), así los planes
 * 209-12 a 209-16 los referencian sin repetir literales.
 *
 * Resultado (fase 211, resultado por sede) y Rubros (ABM de rubros de egreso)
 * son solo owner/admin: la página oculta la pestaña a los demás roles y un
 * `?tab=resultado` o `?tab=rubros` pegado en la URL cae al default.
 */

export const EGRESOS_TABS = {
  gastos: 'gastos',
  porPagar: 'por-pagar',
  resumen: 'resumen',
  resultado: 'resultado',
  rubros: 'rubros',
} as const;

export type EgresosTab = (typeof EGRESOS_TABS)[keyof typeof EGRESOS_TABS];

/** Pestaña de entrada: Gastos es la portada. */
export const EGRESOS_DEFAULT_TAB: EgresosTab = EGRESOS_TABS.gastos;

/** Nombres válidos, para validar el `?tab=`. Orden = orden visual de las pestañas. */
export const EGRESOS_TAB_NAMES: readonly EgresosTab[] = [
  EGRESOS_TABS.gastos,
  EGRESOS_TABS.porPagar,
  EGRESOS_TABS.resumen,
  EGRESOS_TABS.resultado,
  EGRESOS_TABS.rubros,
];
