/**
 * useIntroStoriesApi
 *
 * SPEC "Empezá acá" B (persistencia y métrica): registra en el servidor que
 * el socio abrió las historias por primera vez (`seen`) o que llegó al
 * último slide (`completed`), junto con el slide donde quedó. Backend:
 * `POST /auth/me/intro-stories` (el-templo-api, módulo auth).
 *
 * Best-effort en el llamado de apertura: si falla, se logea y no bloquea la
 * experiencia (el socio ya está viendo las historias, un fallo de red no
 * debería sacarlo de la pantalla). El componente decide qué hacer con el
 * resultado — acá solo se envuelve la llamada HTTP.
 */
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useIntroStoriesApi')

export interface IntroStoriesProgress {
  introStoriesSeenAt: string | null
  introStoriesCompletedAt: string | null
  introStoriesLastSlide: number | null
}

export function useIntroStoriesApi() {
  async function reportSeen(lastSlide: number): Promise<IntroStoriesProgress | null> {
    try {
      const response = await api.post<IntroStoriesProgress>('/auth/me/intro-stories', {
        event: 'seen',
        lastSlide,
      })
      return response.data
    } catch (err: unknown) {
      log.warn('reportSeen failed', { err: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  async function reportCompleted(lastSlide: number): Promise<IntroStoriesProgress | null> {
    try {
      const response = await api.post<IntroStoriesProgress>('/auth/me/intro-stories', {
        event: 'completed',
        lastSlide,
      })
      return response.data
    } catch (err: unknown) {
      log.warn('reportCompleted failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  function cleanup() {
    // No hay subscripciones ni timers que limpiar.
  }

  return { reportSeen, reportCompleted, cleanup }
}
