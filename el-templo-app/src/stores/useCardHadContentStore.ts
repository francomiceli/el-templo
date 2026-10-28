import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  useCardHadContentStorage,
  type CardHadContentMap,
  type CardKey,
} from 'src/composables/useCardHadContentStorage'

/**
 * Flag "tuvo contenido" por card y por socio (fase 203, D-02 + D-03).
 *
 * - Se precarga en el boot (`boot/auth.ts`, una lectura local de Preferences) para que el
 *   PRIMER frame ya lo tenga: `hadContent()` es síncrono. Antes de `hydrate()` devuelve false
 *   (default seguro: no reservar lugar).
 * - Solo guarda booleanos por card, nunca contenido (D-03).
 * - `record()` se llama SOLO cuando la fuente respondió bien (2xx), nunca tras un error:
 *   esa responsabilidad es del que llama (un error no significa "no hay contenido").
 * - `reset()` al desloguear (MainLayout): el flag de un socio no se arrastra al siguiente.
 */
export const useCardHadContentStore = defineStore('cardHadContent', () => {
  const storage = useCardHadContentStorage()

  const mapState = ref<CardHadContentMap>({})
  const hydratedFor = ref<number | null>(null)
  // Computed (no readonly(ref)): Pinia trata un ref devuelto como state escribible vía $patch;
  // un computed queda como getter de solo lectura.
  const mapView = computed<Readonly<CardHadContentMap>>(() => mapState.value)

  // Cada hydrate/reset invalida las lecturas en vuelo (otro socio, o logout durante la lectura).
  let generation = 0
  let inFlight: { userId: number; promise: Promise<void> } | null = null

  async function hydrate(userId: number): Promise<void> {
    if (hydratedFor.value === userId) return
    if (inFlight?.userId === userId) return inFlight.promise
    generation++
    const myGeneration = generation
    if (hydratedFor.value !== null) {
      // Otro socio: nada de su mapa puede verse mientras se lee el nuevo.
      mapState.value = {}
      hydratedFor.value = null
    }
    const promise = storage.read(userId).then((loaded) => {
      if (myGeneration !== generation) return
      mapState.value = loaded
      hydratedFor.value = userId
    })
    const entry = { userId, promise }
    inFlight = entry
    try {
      await promise
    } finally {
      if (inFlight === entry) inFlight = null
    }
  }

  function hadContent(card: CardKey): boolean {
    return mapState.value[card] === true
  }

  function record(card: CardKey, has: boolean): void {
    if (mapState.value[card] === has) return
    // Se reemplaza el objeto (no se muta) para que mapView y los watchers reaccionen.
    mapState.value = { ...mapState.value, [card]: has }
    if (hydratedFor.value !== null) {
      void storage.write(hydratedFor.value, mapState.value)
    }
  }

  function reset(): void {
    generation++
    inFlight = null
    mapState.value = {}
    hydratedFor.value = null
  }

  return { map: mapView, hydratedFor, hydrate, hadContent, record, reset }
})
