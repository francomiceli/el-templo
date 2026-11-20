import { api } from 'src/boot/axios'
import type { DayAttendees, SlotAttendees } from 'src/types/community'

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

  /**
   * Primeras caras de los anotados de todos los horarios de una sede en un día (fila de la
   * Reservas). No cuenta como "abrir la lista". Sin `branchId` el servidor usa la sede del alumno.
   */
  async function getDayAttendees(date: string, branchId?: number): Promise<DayAttendees> {
    const params: Record<string, string | number> = { date }
    if (branchId) params.branchId = branchId
    const response = await api.get<DayAttendees>('/members/scheduling/day-attendees', { params })
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

  return { getSlotAttendees, getDayAttendees, setVisibility, markNoticeSeen, reportPhoto, cleanup }
}
