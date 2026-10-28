import {
  ENTRENAR_DESAFIOS_ENABLED,
  ENTRENAR_TABS_ENABLED,
  FREE_BLOCKS_ENABLED,
} from 'src/config/featureFlags'

export type TabKey = 'semana' | 'libre' | 'desafios' | 'conquer'

export interface TabFlags {
  tabs: boolean
  libre: boolean
  desafios: boolean
}

/** Los flags reales de la build: un solo lugar para EntrenarTabs, EntrenarView y la vidriera */
export const ENTRENAR_TAB_FLAGS: TabFlags = {
  tabs: ENTRENAR_TABS_ENABLED,
  libre: FREE_BLOCKS_ENABLED,
  desafios: ENTRENAR_DESAFIOS_ENABLED,
}

/**
 * Fase 201 D-10: tabs visibles de Entrenar, en orden. Sin tabs solo existe Semana. Libre y
 * Desafíos solo aparecen con su flag (apagados no se ven ni como "pronto").
 */
export function visibleTabKeys(flags: TabFlags): TabKey[] {
  if (!flags.tabs) return ['semana']
  const keys: TabKey[] = ['semana']
  if (flags.libre) keys.push('libre')
  if (flags.desafios) keys.push('desafios')
  keys.push('conquer')
  return keys
}

/** Valores que `?tab=` puede pedir: las visibles menos Semana (que es el valor por defecto) */
export function queryTabKeys(flags: TabFlags): TabKey[] {
  return visibleTabKeys(flags).filter((key) => key !== 'semana')
}

/** Lista blanca (T-197-45, T-201-53): cualquier valor que no esté permitido abre Semana */
export function tabFromQuery(raw: unknown, allowed: readonly TabKey[]): TabKey {
  const value = Array.isArray(raw) ? raw[0] : raw
  return allowed.find((tab) => tab === value) ?? 'semana'
}
