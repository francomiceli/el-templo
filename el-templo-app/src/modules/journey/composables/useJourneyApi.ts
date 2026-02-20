import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import type {
  JourneyType,
  JourneyDuration,
  JourneyMetadata,
  JourneyProgress,
  ArchivedJourney,
  JourneySessionResponse,
} from '../types'

const log = createLogger('JourneyApi')

interface SessionCompleteData {
  dayId: string
  journeyType: JourneyType
  duration: JourneyDuration
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
  progress: JourneyProgress
}

/**
 * Composable for journey API calls.
 *
 * Handles all HTTP communication with the journey endpoints.
 * Returns cleanup() per composable convention (no onUnmounted inside).
 */
export function useJourneyApi() {
  let abortController: AbortController | null = null

  function createAbortSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  /**
   * Fetch static journey metadata for all 6 journeys.
   * GET /api/journeys/metadata
   */
  async function getMetadata(): Promise<JourneyMetadata[]> {
    try {
      const response = await api.get<{ journeys: JourneyMetadata[] }>('/journeys/metadata', {
        signal: createAbortSignal(),
      })
      return response.data.journeys
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch journey metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch the member's active journey progress.
   * GET /api/journeys/active
   * Returns null if no active journey.
   */
  async function getActiveJourney(): Promise<JourneyProgress | null> {
    try {
      const response = await api.get<JourneyProgress | null>('/journeys/active', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch active journey', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Select/start a new journey for the member.
   * POST /api/journeys/select
   * Archives any currently active journey.
   */
  async function selectJourney(type: JourneyType): Promise<JourneyProgress> {
    try {
      const response = await api.post<JourneyProgress>(
        '/journeys/select',
        { journeyType: type },
        { signal: createAbortSignal() },
      )
      return response.data
    } catch (err: unknown) {
      log.error('Failed to select journey', {
        error: err instanceof Error ? err.message : String(err),
        journeyType: type,
      })
      throw err
    }
  }

  /**
   * Fetch archived/completed journeys for the member.
   * GET /api/journeys/archived
   */
  async function getArchivedJourneys(): Promise<ArchivedJourney[]> {
    try {
      const response = await api.get<ArchivedJourney[]>('/journeys/archived', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch archived journeys', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch a journey session for a specific week/day/duration.
   * GET /api/journeys/session
   */
  async function getSession(
    week: number,
    day: string,
    duration: JourneyDuration,
  ): Promise<JourneySessionResponse | null> {
    try {
      const response = await api.get<JourneySessionResponse | null>('/journeys/session', {
        params: { week, day, duration },
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch journey session', {
        error: err instanceof Error ? err.message : String(err),
        week,
        day,
        duration,
      })
      throw err
    }
  }

  /**
   * Complete a journey session and update progress.
   * POST /api/journeys/complete
   */
  async function completeSession(data: SessionCompleteData): Promise<SessionCompleteResponse> {
    try {
      const response = await api.post<SessionCompleteResponse>('/journeys/complete', data, {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      log.error('Failed to complete journey session', {
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
    getActiveJourney,
    selectJourney,
    getArchivedJourneys,
    getSession,
    completeSession,
    cleanup,
  }
}
