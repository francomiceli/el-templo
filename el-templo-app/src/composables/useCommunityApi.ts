import { api } from 'src/boot/axios'
import type { SlotAttendees } from 'src/types/community'

/**
 * Cliente de la comunidad (fase 214): anotados de un horario, visibilidad propia, aviso visto y
 * reporte de foto. Los errores se propagan: cada pantalla mapea 404 / 429 a su texto.
 * Las listas de anotados no se guardan en ningún store.
 */
export function useCommunityApi() {
  async function getSlotAttendees(scheduleId: number, date: string): Promise<SlotAttendees> {
    const response = await api.get<SlotAttendees>(
      `/members/scheduling/slots/${scheduleId}/${date}/attendees`,
    )
    return response.data
  }

  async function setVisibility(
    visible: boolean,
  ): Promise<{ visible: boolean; noticeSeen: boolean }> {
    const response = await api.put<{ visible: boolean; noticeSeen: boolean }>(
      '/members/scheduling/attendees/visibility',
      { visible },
    )
    return response.data
  }

  async function markNoticeSeen(): Promise<void> {
    await api.post('/members/scheduling/attendees/notice-seen')
  }

  async function reportPhoto(photoId: number): Promise<void> {
    await api.post(`/members/profile-photos/${photoId}/report`)
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { getSlotAttendees, setVisibility, markNoticeSeen, reportPhoto, cleanup }
}
