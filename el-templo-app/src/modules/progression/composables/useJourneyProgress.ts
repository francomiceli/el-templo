import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { useJourneyApi } from 'src/modules/journey/composables/useJourneyApi'
import type { JourneyProgress, ArchivedJourney, JourneyMetadata } from 'src/modules/journey/types'

const log = createLogger('JourneyProgress')

/**
 * Journey progress data for Mi Camino display.
 * Combines active journey + metadata for rich display.
 */
export interface JourneyProgressDisplay {
  activeJourney: JourneyProgress | null
  metadata: JourneyMetadata | null
  archivedJourneys: ArchivedJourney[]
  allMetadata: JourneyMetadata[]
}

/**
 * Composable for fetching journey progress data for Mi Camino.
 *
 * Fetches active journey, archived journeys, and metadata in parallel.
 * Exposes cleanup() per composable convention (no onUnmounted inside).
 */
export function useJourneyProgress() {
  const activeJourney = ref<JourneyProgress | null>(null)
  const archivedJourneys = ref<ArchivedJourney[]>([])
  const allMetadata = ref<JourneyMetadata[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let apiInstance: ReturnType<typeof useJourneyApi> | null = null

  /**
   * Fetch all journey data needed for Mi Camino display.
   * Loads active journey, archived journeys, and metadata in parallel.
   */
  async function fetchJourneyData(): Promise<void> {
    const api = useJourneyApi()
    apiInstance = api

    try {
      loading.value = true
      error.value = null

      const [active, archived, metadata] = await Promise.all([
        api.getActiveJourney(),
        api.getArchivedJourneys(),
        api.getMetadata(),
      ])

      activeJourney.value = active
      archivedJourneys.value = archived
      allMetadata.value = metadata

      log.debug('Journey progress loaded', {
        hasActive: active !== null,
        archivedCount: archived.length,
        metadataCount: metadata.length,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando datos de journey'
      log.error('Failed to fetch journey progress', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
      apiInstance = null
    }
  }

  /**
   * Get metadata for a specific journey type.
   */
  function getMetadataForType(journeyType: string): JourneyMetadata | undefined {
    return allMetadata.value.find((m) => m.type === journeyType)
  }

  /**
   * Cleanup: abort any in-flight requests.
   * Per composable convention: caller invokes cleanup() on unmount.
   */
  function cleanup(): void {
    if (apiInstance) {
      apiInstance.cleanup()
      apiInstance = null
    }
  }

  return {
    activeJourney,
    archivedJourneys,
    allMetadata,
    loading,
    error,
    fetchJourneyData,
    getMetadataForType,
    cleanup,
  }
}
