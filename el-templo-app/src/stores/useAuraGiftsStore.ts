import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuraGiftsApi } from 'src/composables/useAuraGiftsApi'
import { useUserStore } from 'src/stores/useUserStore'
import type { GiftUnavailableReason, GivenGift, PendingGift } from 'src/types/aura-gifts'
import { createLogger } from 'src/utils/logger'
import { giftCardState } from 'src/utils/gift-view'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'

const log = createLogger('useAuraGiftsStore')

/**
 * Regalos de Aura pendientes y ya dados hoy (fase 215, plan 16).
 *
 * Fuente única de la fila de regalo de la card de hoy y de la hoja "Dar Aura". La app NO
 * decide nada: pinta lo que manda `GET /members/aura/gifts/pending` (el servidor aplica la
 * ventana, la visibilidad D-07 y el tope semanal).
 *
 * - Fase 203, regla 1 ("una falla es 'no sé', nunca 'no'"): `load()` es fail-open. Si la
 *   consulta falla no se muestra nada nuevo. Un refresco fallido o en vuelo del MISMO día
 *   conserva el dato (sin parpadeo); el de otro día se descarta, nunca se muestra el de ayer.
 * - D-07: con el módulo de Aura apagado (`auraVisible` false) no consulta y vacía el estado.
 * - Solo se guardan pendientes y regalos dados de hoy: los candidatos viven en la hoja.
 * - Sin polling propio: lo dispara la página (plan 20) y vuelve a pedirlo la hoja (plan 21).
 */
export const useAuraGiftsStore = defineStore('auraGifts', () => {
  const api = useAuraGiftsApi()

  const pending = ref<PendingGift[]>([])
  const givenToday = ref<GivenGift[]>([])
  /** #31: el servidor dice que no puede dar solo porque está oculto; null en cualquier otro caso. */
  const unavailableReason = ref<GiftUnavailableReason | null>(null)
  const loaded = ref(false)
  /** La última carga falló: el estado tiene el último dato bueno del día o está vacío. */
  const loadFailed = ref(false)
  /** Día de la sede (YYYY-MM-DD) en el que se cargó el dato; null si no hay dato. */
  const localDate = ref<string | null>(null)

  /**
   * Se incrementa en cada `load()` y en `reset()`: una respuesta que vuelve cuando ya cambió
   * (logout a mitad de request o un `load()` más nuevo) se descarta.
   */
  let generation = 0

  function siteToday(): string {
    const tz = useUserStore().profile?.branchTimezone ?? DEFAULT_BRANCH_TZ
    return todayInTz(tz, new Date())
  }

  function clearData(): void {
    pending.value = []
    givenToday.value = []
    unavailableReason.value = null
    localDate.value = null
  }

  /** Un dato de otro día (o sin día resuelto) no se conserva. */
  function dropIfFromAnotherDay(): void {
    if (localDate.value !== null && localDate.value !== siteToday()) clearData()
  }

  async function load(): Promise<void> {
    if (!useUserStore().auraVisible) {
      // Invalida cualquier carga en vuelo y no deja datos de un módulo apagado.
      generation++
      clearData()
      loadFailed.value = false
      loaded.value = true
      return
    }
    const mine = ++generation
    dropIfFromAnotherDay()
    const askedOn = siteToday()
    try {
      const data = await api.getPending()
      if (mine !== generation) return
      pending.value = data.pending
      givenToday.value = data.givenToday
      unavailableReason.value = data.unavailableReason ?? null
      localDate.value = askedOn
      loadFailed.value = false
    } catch (err: unknown) {
      if (mine !== generation) return
      loadFailed.value = true
      dropIfFromAnotherDay()
      log.warn('No se pudieron cargar los regalos de Aura', {
        error: err instanceof Error ? err.message : String(err),
        keptPrevious: localDate.value !== null,
      })
    }
    loaded.value = true
  }

  /** Qué dibuja la fila de regalo de la card; `null` = sin fila (también tras una falla sin dato). */
  const cardState = computed(() => {
    if (!loaded.value) return null
    return giftCardState(pending.value, givenToday.value, unavailableReason.value)
  })

  /** Logout: limpia todo y deja sin efecto cualquier carga en vuelo. */
  function reset(): void {
    generation++
    clearData()
    loaded.value = false
    loadFailed.value = false
  }

  return {
    pending,
    givenToday,
    unavailableReason,
    loaded,
    loadFailed,
    localDate,
    cardState,
    load,
    reset,
  }
})
