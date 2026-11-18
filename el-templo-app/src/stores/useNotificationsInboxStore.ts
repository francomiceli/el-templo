import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useNotificationsInboxApi } from 'src/composables/useNotificationsInboxApi'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useNotificationsInboxStore')

/**
 * Contador de avisos sin leer de la bandeja (fase 215, plan 17). Alimenta el badge de la campana.
 *
 * - Fase 203, regla 1 ("una falla es 'no sé', nunca 'no'"): `refreshCount()` nunca lanza y, si la
 *   consulta falla, conserva el último número (no pone 0).
 * - Solo se guarda el número: la lista de avisos es de la pantalla y no persiste (T-215-17-01).
 * - `reset()` en el logout deja el contador en 0 y descarta respuestas en vuelo (T-215-17-03).
 * - No reemplaza a `useNotificationStore` (ruta pendiente del toque de una push).
 */
export const useNotificationsInboxStore = defineStore('notificationsInbox', () => {
  const api = useNotificationsInboxApi()

  const unreadCount = ref(0)

  /**
   * Se incrementa en cada `refreshCount()`, en `markAllReadLocal()` y en `reset()`: una respuesta
   * que vuelve cuando ya cambió (logout a mitad de request, "marcar todo" o una consulta más
   * nueva) se descarta para no pisar el número actual con uno viejo.
   */
  let generation = 0

  async function refreshCount(): Promise<void> {
    const mine = ++generation
    try {
      const count = await api.unreadCount()
      if (mine !== generation) return
      unreadCount.value = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
    } catch (err: unknown) {
      if (mine !== generation) return
      log.warn('No se pudo consultar el contador de notificaciones', {
        error: err instanceof Error ? err.message : String(err),
        kept: unreadCount.value,
      })
    }
  }

  /** Tocar un aviso sin leer: resta 1 sin bajar de 0 (la próxima consulta lo corrige si falló). */
  function markOneReadLocal(): void {
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  /** "Marcar todo como leído": 0 de una vez y se descarta cualquier consulta en vuelo. */
  function markAllReadLocal(): void {
    generation++
    unreadCount.value = 0
  }

  /** Logout: contador en 0 y sin efecto para cualquier consulta en vuelo. */
  function reset(): void {
    generation++
    unreadCount.value = 0
  }

  return { unreadCount, refreshCount, markOneReadLocal, markAllReadLocal, reset }
})
