import type { ConquerStateResponse } from '../types'

export type ConquerView = 'cargando' | 'bloqueado' | 'pedido' | 'inicio'

/**
 * Qué pantalla de Conquer corresponde al estado que mandó el API (D-12, D-17).
 * El app no decide nada: traduce `status` a una vista. 201-20 le suma `dia0`.
 */
export function resolveConquerView(state: ConquerStateResponse | null): ConquerView {
  if (!state) return 'cargando'
  switch (state.status) {
    case 'pedido':
      return 'pedido'
    case 'activo':
      return 'inicio'
    default:
      return 'bloqueado'
  }
}
