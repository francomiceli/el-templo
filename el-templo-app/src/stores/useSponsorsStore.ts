import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useSponsorsStore')

/**
 * Una marca del feed del socio (`GET /members/sponsors`). Calca el response schema
 * del server (`modules/sponsors/schemas.ts`, `SponsorMemberItem`).
 * `redeemCode` es `null` si la marca es de tipo `carnet` o si el socio no puede
 * canjear (sin plan activo): el server nunca manda el código en esos casos.
 */
export interface Sponsor {
  id: number
  name: string
  category: string
  logoUrl: string | null
  icon: string | null
  bgColor: string
  textColor: string
  benefit: string
  detail: string
  conditions: string | null
  redeemType: 'code' | 'carnet'
  redeemCode: string | null
}

interface SponsorsResponse {
  sponsors: Sponsor[]
  canRedeem: boolean
}

type SponsorEventType = 'seen' | 'tapped' | 'redeem'

/**
 * Patrocinadores de Mi Templo (Fase 199, D-20/D-21/D-25).
 *
 * - D-21: todos los socios ven las marcas (con o sin plan); el canje exige plan.
 *   El server decide y NO manda el código sin plan (`canRedeem` solo informa a la UI).
 * - `load()` es fail-open: ante cualquier error deja la lista vacía y loguea; el
 *   carrusel simplemente no se muestra.
 * - D-25: los eventos `seen`/`tapped`/`redeem` son fail-open (un error de red nunca
 *   llega al socio, solo `log.warn`) y sin reintentos. `markSeen` deduplica por marca
 *   por sesión; si el POST falla se saca del `Set` para poder reintentar la próxima
 *   vez que la marca esté en pantalla.
 * - `reset()` al desloguear (MainLayout): el feed de un socio no se ve al loguear otro,
 *   y una respuesta en vuelo se descarta.
 * - Fase 203 (D-02/D-07): `loaded` = la fuente respondió al menos una vez (2xx
 *   o error fail-open) y NO vuelve a false en un refresco; `lastLoadOk` distingue
 *   "vacío" (true) de "falló" (false) para no escribir el flag D-02 tras un error.
 *   Ambos respetan `generation`: una respuesta vieja no los toca.
 */
export const useSponsorsStore = defineStore('sponsors', () => {
  const sponsors = ref<Sponsor[]>([])
  const canRedeem = ref(false)
  const loading = ref(false)
  const loaded = ref(false)
  const lastLoadOk = ref<boolean | null>(null)
  /** Ids de marcas ya reportadas como vistas en esta sesión. */
  const reportedSeen = new Set<number>()
  /** Se incrementa en cada `load()` y en `reset()`: una respuesta vieja se descarta. */
  let generation = 0

  async function load(): Promise<void> {
    const mine = ++generation
    loading.value = true
    try {
      const { data } = await api.get<SponsorsResponse>('/members/sponsors')
      if (mine !== generation) return
      sponsors.value = Array.isArray(data?.sponsors) ? data.sponsors : []
      canRedeem.value = data?.canRedeem === true
      lastLoadOk.value = true
    } catch (err: unknown) {
      if (mine !== generation) return
      sponsors.value = []
      canRedeem.value = false
      lastLoadOk.value = false
      log.warn('Failed to load sponsors', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (mine === generation) {
        loading.value = false
        loaded.value = true
      }
    }
  }

  async function reportEvent(id: number, type: SponsorEventType): Promise<boolean> {
    try {
      await api.post(`/members/sponsors/${id}/event`, { type })
      return true
    } catch (err: unknown) {
      log.warn('Failed to report sponsor event', {
        sponsorId: id,
        type,
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  /** La marca estuvo en pantalla (D-25). Una sola vez por marca por sesión. */
  async function markSeen(id: number): Promise<void> {
    if (reportedSeen.has(id)) return
    reportedSeen.add(id)
    const ok = await reportEvent(id, 'seen')
    if (!ok) reportedSeen.delete(id)
  }

  /** El socio tocó la card (D-25). */
  async function markTapped(id: number): Promise<void> {
    await reportEvent(id, 'tapped')
  }

  /** El socio usó el beneficio (D-25). El server responde 400 si no tiene plan: se ignora. */
  async function markRedeem(id: number): Promise<void> {
    await reportEvent(id, 'redeem')
  }

  /** Al desloguear: la próxima sesión arranca de cero. */
  function reset(): void {
    generation++
    sponsors.value = []
    canRedeem.value = false
    loading.value = false
    loaded.value = false
    lastLoadOk.value = null
    reportedSeen.clear()
  }

  return {
    sponsors,
    canRedeem,
    loading,
    loaded,
    lastLoadOk,
    load,
    markSeen,
    markTapped,
    markRedeem,
    reset,
  }
})
