import type { ConquerStateResponse } from '../types'

export type ConquerView = 'cargando' | 'bloqueado' | 'pedido' | 'dia0' | 'guia' | 'inicio'

/**
 * Qué pantalla de Conquer corresponde al estado que mandó el API (D-12, D-17, D-15).
 * El app no decide nada: traduce `status` y las banderas del control físico a una vista.
 * Un alumno activo al que el API le pide el día 0 (`mustPromptDay0`) ve primero el control físico.
 * Fase 201 DA-22: resuelto el día 0 (hecho o "Lo hago después"), la primera vez ve la guía
 * "¿Cómo funciona?" (`member.guideSeen === false`); el día 0 gana siempre y la guía nunca va antes.
 */
export function resolveConquerView(state: ConquerStateResponse | null): ConquerView {
  if (!state) return 'cargando'
  switch (state.status) {
    case 'pedido':
      return 'pedido'
    case 'activo':
      if (state.member?.bodyCheck.mustPromptDay0) return 'dia0'
      return state.member?.guideSeen === false ? 'guia' : 'inicio'
    default:
      return 'bloqueado'
  }
}
