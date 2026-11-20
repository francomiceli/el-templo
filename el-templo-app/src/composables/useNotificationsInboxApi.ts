import { api } from 'src/boot/axios'
import type { InboxPage, InboxUnreadCount } from 'src/types/notifications-inbox'

/** Avisos por página (la API acepta hasta su máximo; 30 alcanza para una pantalla y media). */
export const INBOX_PAGE_SIZE = 30

/**
 * Cliente de la bandeja de notificaciones (fase 215, plan 17). Los errores se propagan: cada
 * pantalla decide qué mostrar (la campana nunca muestra un error, la lista sí).
 */
export function useNotificationsInboxApi() {
  /** Primera página, o la siguiente con el `nextBefore` de la anterior. */
  async function list(before?: string): Promise<InboxPage> {
    const response = await api.get<InboxPage>('/members/notifications', {
      params: before ? { before, limit: INBOX_PAGE_SIZE } : { limit: INBOX_PAGE_SIZE },
    })
    return response.data
  }

  async function unreadCount(): Promise<number> {
    const response = await api.get<InboxUnreadCount>('/members/notifications/unread-count')
    return response.data.count
  }

  async function markRead(id: number): Promise<void> {
    await api.post(`/members/notifications/${id}/read`)
  }

  async function markAllRead(): Promise<void> {
    await api.post('/members/notifications/read-all')
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { list, unreadCount, markRead, markAllRead, cleanup }
}
