import { api } from 'src/boot/axios'
import type { AuraMovementsPage } from 'src/types/community'

/**
 * Cliente del detalle privado de Aura (fase 214). Solo de lectura y del propio socio: la ruta no
 * recibe ningún id de usuario. Con `/me` en `auraEarned: null` (módulo apagado) no se debe llamar:
 * el servidor responde 404.
 */
export function useAuraApi() {
  async function getMovements(
    params: { before?: number; limit?: number } = {},
  ): Promise<AuraMovementsPage> {
    const response = await api.get<AuraMovementsPage>('/members/aura/movements', { params })
    return response.data
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { getMovements, cleanup }
}
