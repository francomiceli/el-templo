import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import type {
  PersonalizadaType,
  PersonalizadaDuration,
  PersonalizadaMetadata,
  PersonalizadaProgress,
  ArchivedPersonalizada,
  PersonalizadaSessionResponse,
  CycleStats,
} from '../types'

const log = createLogger('PersonalizadaApi')

interface SessionCompleteData {
  dayId: string
  personalizadaType: PersonalizadaType
  duration: PersonalizadaDuration
  date: string
  startedAt: string
  finishedAt: string
  blocksCompleted: string[]
  rpe: number | null
  notes: string | null
  exercisesCompleted: Record<string, number[]> | null
}

interface SessionCompleteResponse {
  success: boolean
  progress: PersonalizadaProgress
}

/**
 * Composable for personalizada API calls.
 *
 * Handles all HTTP communication with the personalizada endpoints.
 * Returns cleanup() per composable convention (no onUnmounted inside).
 */
export function usePersonalizadaApi() {
  let abortController: AbortController | null = null

  function createAbortSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  /**
   * Fetch static personalizada metadata for all 6 personalizadas.
   * GET /api/personalizadas/metadata
   */
  async function getMetadata(): Promise<PersonalizadaMetadata[]> {
    try {
      const response = await api.get<{ personalizadas: PersonalizadaMetadata[] }>(
        '/personalizadas/metadata',
        {
          signal: createAbortSignal(),
        },
      )
      return response.data.personalizadas
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch personalizada metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch the member's active personalizada progress.
   * GET /api/personalizadas/active
   * Returns null if no active personalizada.
   */
  async function getActivePersonalizada(): Promise<PersonalizadaProgress | null> {
    try {
      const response = await api.get<PersonalizadaProgress | null>('/personalizadas/active', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch active personalizada', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch archived/completed personalizadas for the member.
   * GET /api/personalizadas/archived
   */
  async function getArchivedPersonalizadas(): Promise<ArchivedPersonalizada[]> {
    try {
      const response = await api.get<ArchivedPersonalizada[]>('/personalizadas/archived', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch archived personalizadas', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch cycle progress stats for the member's active personalizada.
   * GET /api/personalizadas/stats
   * Returns null if no active personalizada.
   */
  async function getStats(): Promise<CycleStats | null> {
    try {
      const response = await api.get<{ stats: CycleStats | null }>('/personalizadas/stats', {
        signal: createAbortSignal(),
      })
      return response.data.stats
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch personalizada stats', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch a personalizada session for a specific week/day/duration.
   * GET /api/personalizadas/session
   */
  async function getSession(
    week: number,
    day: string,
    duration: PersonalizadaDuration,
  ): Promise<PersonalizadaSessionResponse | null> {
    try {
      const response = await api.get<PersonalizadaSessionResponse | null>(
        '/personalizadas/session',
        {
          params: { week, day, duration },
          signal: createAbortSignal(),
        },
      )
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch personalizada session', {
        error: err instanceof Error ? err.message : String(err),
        week,
        day,
        duration,
      })
      throw err
    }
  }

  /**
   * Complete a personalizada session and update progress.
   * POST /api/personalizadas/complete
   */
  async function completeSession(data: SessionCompleteData): Promise<SessionCompleteResponse> {
    try {
      const response = await api.post<SessionCompleteResponse>('/personalizadas/complete', data, {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      log.error('Failed to complete personalizada session', {
        error: err instanceof Error ? err.message : String(err),
        dayId: data.dayId,
      })
      throw err
    }
  }

  /**
   * Cleanup: abort any in-flight requests.
   * Per composable convention: caller invokes cleanup() on unmount.
   */
  function cleanup(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return {
    getMetadata,
    getActivePersonalizada,
    getArchivedPersonalizadas,
    getStats,
    getSession,
    completeSession,
    cleanup,
  }
}
