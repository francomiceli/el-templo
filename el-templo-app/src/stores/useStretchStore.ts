import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from 'src/boot/axios'
import { useUserStore } from 'src/stores/useUserStore'
import type {
  StretchCompleteResponse,
  StretchEventRequest,
  StretchStatus,
  StretchTodayResponse,
} from 'src/modules/training/types/stretch'
import { DEFAULT_BRANCH_TZ } from 'src/utils/check-in-window'
import { createLogger } from 'src/utils/logger'
import { todayInTz } from 'src/utils/tz'

const log = createLogger('useStretchStore')

/**
 * Oferta de estiramiento post-clase de hoy (fase 213, plan 09).
 *
 * Fuente única de la card de Mi Templo y del player del estiramiento. La app NO
 * elige nada: lo que muestra sale de `GET /sessions/stretch/today`.
 *
 * - D-09: la card lee `cardInput` (`status` + `minutes`) y nada más.
 * - D-15: `markCardSeen()` manda `card_seen` una sola vez por día de la sede.
 * - Fase 203, regla 1 ("una falla es 'no sé', nunca 'no'"): `load()` es fail-open.
 *   Si la consulta falla, la card queda como hoy (`status: 'none'`): jamás ofrece
 *   ni oculta por una falla. Un refresco fallido o en vuelo del MISMO día conserva
 *   el dato (sin parpadeo); el de otro día se descarta, nunca se muestra el de ayer.
 * - El "hoy" del descarte se calcula en la zona de la sede (como `useTodayBookingStore`),
 *   solo para comparar contra el `localDate` que devolvió el servidor; los textos y
 *   el id de la rutina usan siempre el `localDate` del servidor.
 * - No hace polling propio: lo dispara la página y el layout (plan 11).
 */
export const useStretchStore = defineStore('stretch', () => {
  const today = ref<StretchTodayResponse | null>(null)
  const loaded = ref(false)
  /** La última carga falló: `today` tiene el último dato bueno del día o está vacío. */
  const loadFailed = ref(false)
  /** `localDate` de los días en los que ya se mandó `card_seen` en esta sesión. */
  const cardSeenDates = new Set<string>()

  /**
   * Se incrementa en cada `load()` y en `reset()`: una respuesta que vuelve cuando
   * ya cambió (logout a mitad de request o un `load()` más nuevo) se descarta.
   */
  let generation = 0

  function siteToday(): string {
    const tz = useUserStore().profile?.branchTimezone ?? DEFAULT_BRANCH_TZ
    return todayInTz(tz, new Date())
  }

  /** T-213-28: un dato de otro día (o sin día resuelto) no se conserva. */
  function dropIfFromAnotherDay(): void {
    if (today.value && today.value.localDate !== siteToday()) {
      today.value = null
    }
  }

  async function load(): Promise<void> {
    const mine = ++generation
    dropIfFromAnotherDay()
    try {
      const res = await api.get<StretchTodayResponse>('/sessions/stretch/today')
      if (mine !== generation) return
      today.value = res.data
      loadFailed.value = false
    } catch (err: unknown) {
      if (mine !== generation) return
      loadFailed.value = true
      dropIfFromAnotherDay()
      log.warn('No se pudo cargar el estiramiento de hoy', {
        error: err instanceof Error ? err.message : String(err),
        keptPrevious: today.value !== null,
      })
    }
    loaded.value = true
  }

  /** Lo único que necesita la card (D-09). Sin dato o tras una falla sin dato: `none`. */
  const cardInput = computed<{ status: StretchStatus; minutes: number | null }>(() => {
    const t = today.value
    if (!loaded.value || !t) return { status: 'none', minutes: null }
    return { status: t.status, minutes: t.minutes }
  })

  /** D-15: `card_seen` una vez por día, solo con la oferta disponible. Nunca lanza. */
  async function markCardSeen(): Promise<void> {
    const t = today.value
    if (!t || t.status !== 'available') return
    if (cardSeenDates.has(t.localDate)) return
    // Se marca antes del await: llamadas simultáneas no mandan el evento dos veces.
    cardSeenDates.add(t.localDate)
    const body: StretchEventRequest = { type: 'card_seen' }
    try {
      await api.post('/sessions/stretch/events', body)
    } catch (err: unknown) {
      log.warn('No se pudo registrar card_seen del estiramiento', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** Al volver del player la card ya muestra "hecho" sin otra consulta (SPEC §5.3.5). */
  function applyCompletion(res: StretchCompleteResponse): void {
    const t = today.value
    if (!t) return
    today.value = {
      ...t,
      status: 'done',
      minutes: res.minutes,
      completedAt: res.completedAt,
      auraAwarded: res.auraAwarded,
    }
  }

  /** Logout (T-213-28): limpia todo y deja sin efecto cualquier carga en vuelo. */
  function reset(): void {
    generation++
    today.value = null
    loaded.value = false
    loadFailed.value = false
    cardSeenDates.clear()
  }

  return { today, loaded, loadFailed, cardInput, load, markCardSeen, applyCompletion, reset }
})
