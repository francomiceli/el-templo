import { api } from 'src/boot/axios'
import type {
  GiftCandidatesResponse,
  GiveGiftBody,
  GiveGiftResponse,
  PendingGiftsResponse,
} from 'src/types/aura-gifts'

/**
 * Cliente del regalo de Aura entre alumnos (fase 215, plan 16). Los errores se propagan: cada
 * pantalla los mapea con `giveErrorOutcome` (detectando `axios.isAxiosError` y leyendo
 * `response.data.code`). Los candidatos no se guardan en ningún store.
 */
export function useAuraGiftsApi() {
  async function getPending(): Promise<PendingGiftsResponse> {
    const response = await api.get<PendingGiftsResponse>('/members/aura/gifts/pending')
    return response.data
  }

  async function getCandidates(attendanceId: number): Promise<GiftCandidatesResponse> {
    const response = await api.get<GiftCandidatesResponse>('/members/aura/gifts/candidates', {
      params: { attendanceId },
    })
    return response.data
  }

  async function give(body: GiveGiftBody): Promise<GiveGiftResponse> {
    const response = await api.post<GiveGiftResponse>('/members/aura/gifts', body)
    return response.data
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { getPending, getCandidates, give, cleanup }
}
