import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { useUserStore } from 'src/stores/useUserStore'
import { useFreeBlocksStore } from '../stores/freeBlocksStore'
import type { FreeBlockCompleteRequest, FreeBlockCompleteResponse } from '../types/free-blocks'

const log = createLogger('useFreeBlockCompletion')

export interface UseFreeBlockCompletionReturn {
  /** true mientras el POST está en vuelo */
  isSubmitting: Ref<boolean>
  /** Mensaje del último cierre fallido */
  error: Ref<string | null>
  /** Cierra el bloque libre. Devuelve la respuesta del servidor o null si falló */
  complete: (req: FreeBlockCompleteRequest) => Promise<FreeBlockCompleteResponse | null>
  /** Resetea el estado (el componente lo llama al desmontarse) */
  cleanup: () => void
}

/**
 * Cierre del bloque libre.
 *
 * Fase 197 D-13: este cierre NO usa /sessions/complete: no toca racha, programa ni RPE.
 * El servidor calcula la duración y decide el AURA (D-12).
 */
export function useFreeBlockCompletion(): UseFreeBlockCompletionReturn {
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  async function complete(
    req: FreeBlockCompleteRequest,
  ): Promise<FreeBlockCompleteResponse | null> {
    if (isSubmitting.value) return null

    isSubmitting.value = true
    error.value = null

    try {
      const level = req.level ?? useUserStore().selectedLevel
      const body: FreeBlockCompleteRequest = level ? { ...req, level } : req
      const response = await api.post<FreeBlockCompleteResponse>(
        '/sessions/free-blocks/complete',
        body,
      )
      useFreeBlocksStore().applyCompletion(response.data)
      return response.data
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos guardar el bloque')
      if (isExpectedClientError(err)) {
        log.warn('Cierre de bloque libre rechazado por el servidor', { error: error.value })
      } else {
        log.error('Falló el cierre del bloque libre', { error: error.value })
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  function cleanup(): void {
    isSubmitting.value = false
    error.value = null
  }

  return { isSubmitting, error, complete, cleanup }
}
