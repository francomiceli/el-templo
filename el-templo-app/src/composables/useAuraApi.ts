import { api } from 'src/boot/axios'
import type { AuraMovementsPage } from 'src/types/community'
import type { CelebrationResponse } from 'src/types/aura-celebration'

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

  /**
   * Fase 215 (#33): lo que se sumó desde la última visita a Mi Templo. La primera vez el servidor
   * no devuelve nada y fija la marca. Con el módulo apagado responde 404.
   */
  async function getCelebration(): Promise<CelebrationResponse> {
    const response = await api.get<CelebrationResponse>('/members/aura/celebration')
    return response.data
  }

  /** Marca como celebrado hasta `upToId` (el `maxId` de la consulta). La marca nunca retrocede. */
  async function ackCelebration(upToId: number): Promise<void> {
    await api.post('/members/aura/celebration/ack', { upToId })
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { getMovements, getCelebration, ackCelebration, cleanup }
}
