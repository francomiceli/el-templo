import type { ConquerStateResponse } from '../types'

export type ConquerView = 'cargando' | 'bloqueado' | 'pedido' | 'dia0' | 'inicio'

/**
 * Qué pantalla de Conquer corresponde al estado que mandó el API (D-12, D-17, D-15).
 * El app no decide nada: traduce `status` y las banderas del control físico a una vista.
 * Un alumno activo al que el API le pide el día 0 (`mustPromptDay0`) ve primero el control físico.
 */
export function resolveConquerView(state: ConquerStateResponse | null): ConquerView {
  if (!state) return 'cargando'
  switch (state.status) {
    case 'pedido':
      return 'pedido'
    case 'activo':
      return state.member?.bodyCheck.mustPromptDay0 ? 'dia0' : 'inicio'
    default:
      return 'bloqueado'
  }
}
