import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useUserStore } from 'src/stores/useUserStore'
import type { ZoneGroup, ZoneSlug } from 'src/components/anatomy/zones'
import type {
  FreeBlockCompleteResponse,
  FreeBlockDetail,
  FreeBlockItem,
  FreeBlocksPage,
} from '../types/free-blocks'

const log = createLogger('freeBlocksStore')

const PAGE_SIZE = 20
const LOAD_ERROR = 'No pudimos cargar los bloques'

/**
 * Store de la canasta de bloques libres (fase 197 D-04, D-14).
 *
 * La lista se trae de a 20 con "ver más" y se filtra por grupo. Lo comparten la tab Libre
 * (197-18) y el player libre (197-15..17).
 */
export const useFreeBlocksStore = defineStore('freeBlocks', () => {
  const userStore = useUserStore()

  // State
  const items = ref<FreeBlockItem[]>([])
  const total = ref(0)
  const page = ref(0)
  const limit = ref(PAGE_SIZE)
  /** Filtro de grupo activo (null = todos) */
  const group = ref<ZoneGroup | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  /** false cuando ya cobró el AURA del bloque libre hoy (D-12) */
  const auraAvailableToday = ref(true)
  const todayZones = ref<ZoneSlug[] | null>(null)
  const weekWorkedZones = ref<ZoneSlug[]>([])
  /** true después de la primera respuesta aplicada */
  const loaded = ref(false)

  /**
   * Contador de pedidos de lista: cada pedido toma el siguiente número y su respuesta solo se
   * aplica si sigue siendo el último (T-197-35: un cambio rápido de grupo descarta lo viejo).
   */
  let requestSeq = 0

  // Getters
  const hasMore = computed(() => items.value.length < total.value)

  // Helpers
  function buildParams(pageNumber: number): Record<string, string | number> {
    const params: Record<string, string | number> = { page: pageNumber, limit: limit.value }
    if (group.value) params.group = group.value
    if (userStore.selectedLevel) params.level = userStore.selectedLevel
    return params
  }

  function applyMeta(data: FreeBlocksPage): void {
    total.value = data.total
    page.value = data.page
    limit.value = data.limit
    auraAvailableToday.value = data.auraAvailableToday
    todayZones.value = data.todayZones
    weekWorkedZones.value = data.weekWorkedZones
  }

  // Actions
  /** Trae la página 1 del grupo activo y reemplaza la lista */
  async function loadFirstPage(): Promise<void> {
    const seq = ++requestSeq
    loading.value = true
    loadingMore.value = false
    error.value = null

    try {
      const response = await api.get<FreeBlocksPage>('/sessions/free-blocks', {
        params: buildParams(1),
      })
      if (seq !== requestSeq) return
      items.value = response.data.items
      applyMeta(response.data)
      loaded.value = true
    } catch (err: unknown) {
      if (seq !== requestSeq) return
      error.value = extractError(err, LOAD_ERROR)
      log.error('No se pudo cargar la canasta', { error: error.value })
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  /** Cambia el filtro de grupo y recarga desde la página 1 */
  async function setGroup(g: ZoneGroup | null): Promise<void> {
    group.value = g
    await loadFirstPage()
  }

  /** "Ver más": trae la página siguiente y la suma sin duplicar por blockId */
  async function loadMore(): Promise<void> {
    if (loading.value || loadingMore.value || !hasMore.value) return

    const seq = ++requestSeq
    loadingMore.value = true
    error.value = null

    try {
      const response = await api.get<FreeBlocksPage>('/sessions/free-blocks', {
        params: buildParams(page.value + 1),
      })
      if (seq !== requestSeq) return
      const known = new Set(items.value.map((b) => b.blockId))
      const fresh = response.data.items.filter((b) => !known.has(b.blockId))
      items.value = [...items.value, ...fresh]
      applyMeta(response.data)
    } catch (err: unknown) {
      if (seq !== requestSeq) return
      error.value = extractError(err, LOAD_ERROR)
      log.error('No se pudo traer más bloques de la canasta', { error: error.value })
    } finally {
      if (seq === requestSeq) loadingMore.value = false
    }
  }

  /**
   * Busca un bloque por id: primero en la lista cargada y, si no está (recarga de la página
   * en el player), lo pide al API. Devuelve null si no está disponible (404).
   */
  async function fetchBlock(blockId: string): Promise<FreeBlockItem | null> {
    const cached = items.value.find((b) => b.blockId === blockId)
    if (cached) return cached

    try {
      const params: Record<string, string> = {}
      if (userStore.selectedLevel) params.level = userStore.selectedLevel
      const response = await api.get<FreeBlockDetail>(
        `/sessions/free-blocks/${encodeURIComponent(blockId)}`,
        { params },
      )
      auraAvailableToday.value = response.data.auraAvailableToday
      return response.data.item
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null
      error.value = extractError(err, LOAD_ERROR)
      log.error('No se pudo cargar el bloque libre', { blockId, error: error.value })
      return null
    }
  }

  /** Tras cerrar un bloque libre: el cupo de AURA del día lo informa el servidor */
  function applyCompletion(res: FreeBlockCompleteResponse): void {
    auraAvailableToday.value = res.auraAvailableToday
  }

  function reset(): void {
    // Invalida cualquier pedido en vuelo
    requestSeq++
    items.value = []
    total.value = 0
    page.value = 0
    limit.value = PAGE_SIZE
    group.value = null
    loading.value = false
    loadingMore.value = false
    error.value = null
    auraAvailableToday.value = true
    todayZones.value = null
    weekWorkedZones.value = []
    loaded.value = false
  }

  return {
    items,
    total,
    page,
    limit,
    group,
    loading,
    loadingMore,
    error,
    auraAvailableToday,
    todayZones,
    weekWorkedZones,
    loaded,
    hasMore,
    loadFirstPage,
    setGroup,
    loadMore,
    fetchBlock,
    applyCompletion,
    reset,
  }
})
