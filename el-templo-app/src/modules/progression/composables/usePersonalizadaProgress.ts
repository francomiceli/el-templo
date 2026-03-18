import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { usePersonalizadaApi } from 'src/modules/personalizada/composables/usePersonalizadaApi'
import type {
  PersonalizadaProgress,
  ArchivedPersonalizada,
  PersonalizadaMetadata,
} from 'src/modules/personalizada/types'

const log = createLogger('PersonalizadaProgress')

/**
 * Personalizada progress data for Mi Camino display.
 * Combines active personalizada + metadata for rich display.
 */
export interface PersonalizadaProgressDisplay {
  activePersonalizada: PersonalizadaProgress | null
  metadata: PersonalizadaMetadata | null
  archivedPersonalizadas: ArchivedPersonalizada[]
  allMetadata: PersonalizadaMetadata[]
}

/**
 * Composable for fetching personalizada progress data for Mi Camino.
 *
 * Fetches active personalizada, archived personalizadas, and metadata in parallel.
 * Exposes cleanup() per composable convention (no onUnmounted inside).
 */
export function usePersonalizadaProgress() {
  const activePersonalizada = ref<PersonalizadaProgress | null>(null)
  const archivedPersonalizadas = ref<ArchivedPersonalizada[]>([])
  const allMetadata = ref<PersonalizadaMetadata[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let apiInstance: ReturnType<typeof usePersonalizadaApi> | null = null

  /**
   * Fetch all personalizada data needed for Mi Camino display.
   * Loads active personalizada, archived personalizadas, and metadata in parallel.
   */
  async function fetchPersonalizadaData(): Promise<void> {
    const api = usePersonalizadaApi()
    apiInstance = api

    try {
      loading.value = true
      error.value = null

      const [active, archived, metadata] = await Promise.all([
        api.getActivePersonalizada(),
        api.getArchivedPersonalizadas(),
        api.getMetadata(),
      ])

      activePersonalizada.value = active
      archivedPersonalizadas.value = archived
      allMetadata.value = metadata

      log.debug('Personalizada progress loaded', {
        hasActive: active !== null,
        archivedCount: archived.length,
        metadataCount: metadata.length,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando datos de personalizada'
      log.error('Failed to fetch personalizada progress', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
      apiInstance = null
    }
  }

  /**
   * Get metadata for a specific personalizada type.
   */
  function getMetadataForType(personalizadaType: string): PersonalizadaMetadata | undefined {
    return allMetadata.value.find((m) => m.type === personalizadaType)
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
    activePersonalizada,
    archivedPersonalizadas,
    allMetadata,
    loading,
    error,
    fetchPersonalizadaData,
    getMetadataForType,
    cleanup,
  }
}
