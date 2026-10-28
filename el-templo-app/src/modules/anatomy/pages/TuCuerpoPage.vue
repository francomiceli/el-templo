<template>
  <q-page class="tu-cuerpo">
    <!-- Sin barra de arriba (2026-10-28): el título queda para lectores de pantalla y la flecha de
         volver va dentro de la card, arriba a la derecha; así la figura gana esos 50 px. -->
    <h1 class="tu-cuerpo__h1">Tus músculos</h1>

    <div ref="scroller" class="tu-cuerpo__scroll">
      <div v-if="!store.vista && !store.error" class="tu-cuerpo__estado">
        <TemploLoader />
      </div>

      <div v-else-if="!store.vista" class="tu-cuerpo__estado">
        <p class="tu-cuerpo__error">{{ store.error }}</p>
        <button type="button" class="tu-cuerpo__retry" @click="reintentar">Reintentar</button>
      </div>

      <div v-else class="tu-cuerpo__body">
        <!-- Todo el texto va sobre blanco (sketch 023 "Después"): la ayuda, el selector y la figura
             comparten una card; el crema queda solo de fondo. -->
        <div class="tu-cuerpo__card">
          <button
            type="button"
            class="tu-cuerpo__back"
            aria-label="Volver a la Guía"
            @click="volverALaGuia"
          >
            <q-icon name="arrow_back" size="20px" aria-hidden="true" />
          </button>
          <p v-show="!sheetOpen" class="tu-cuerpo__hint">Tocá un músculo</p>

          <div class="tu-cuerpo__flip" role="group" aria-label="Vista del cuerpo">
            <button
              v-for="op in VISTAS"
              :key="op.id"
              type="button"
              class="tu-cuerpo__flip-btn"
              :class="{ 'tu-cuerpo__flip-btn--on': vistaActual === op.id }"
              :aria-pressed="vistaActual === op.id"
              @click="girar(op.id)"
            >
              {{ op.label }}
            </button>
          </div>

          <div ref="figEl" class="tu-cuerpo__fig">
            <BodyFigure
              :side="vistaActual"
              interactive
              tap-style="cursor"
              :lit="zona ? [zona] : []"
              :selected="zona"
              :height="sheetOpen ? figHeightOpen : FIG_HEIGHT"
              @select-zone="onSelectZone"
            />
          </div>

          <!-- Equivalente accesible del cuerpo (el SVG es aria-hidden): se ve al enfocarlo con teclado -->
          <nav class="tu-cuerpo__zonas" aria-label="Zonas del cuerpo">
            <ul class="tu-cuerpo__zonas-lista">
              <li v-for="r in regionesVisibles" :key="r.slug">
                <button
                  type="button"
                  class="tu-cuerpo__pill"
                  @click="onSelectZone(r.slug, vistaDeRegion(r.vista))"
                >
                  {{ r.nombre }}
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>

    <AnatomySheet
      :model-value="sheetOpen"
      v-model:full="sheetFull"
      :bottom-offset="bottomOffset"
      :reset-key="resetKey"
      @update:model-value="onSheetUpdate"
    >
      <ZonaAlumno :zona="zona" @open-ruta="irAFicha" />
    </AnatomySheet>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D14 (sketch 020) + revisión 2026-10-23 (sketch 023): "Tus músculos", la figura grande en
 * tono alumno. Tocás una zona y se abre la hoja con qué hace cada músculo y en qué ejercicios lo
 * usás; los músculos profundos ("más adentro") ya vienen dentro de la hoja de la zona que tienen
 * encima. `?zona=<slug>` abre la hoja al entrar y gira a la vista de esa región (`?musculo=<id>` de un
 * profundo abre la hoja de su zona: son enlaces viejos); la zona elegida queda en la URL, así volver
 * desde la ficha de un ejercicio deja todo como estaba. Solo existe con ANATOMIA_ALUMNOS_ENABLED (la
 * ruta `tu-cuerpo` no se registra apagado). Slugs y ids de la URL se resuelven contra el store; si
 * no existen se ignoran.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import TemploLoader from 'src/components/TemploLoader.vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { isZoneSlug } from 'src/components/anatomy/zones'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import AnatomySheet from '../components/AnatomySheet.vue'
import ZonaAlumno from '../components/ZonaAlumno.vue'
import { useAnatomyStore } from '../stores/anatomyStore'
import type { VistaFigura } from '../types'

type VistaCuerpo = 'front' | 'back'

const VISTAS: readonly { id: VistaCuerpo; label: string }[] = [
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Espalda' },
]

// Alto de la tab bar del layout (móvil): la hoja se apoya encima.
const TAB_BAR_FALLBACK = 56
// Figura sin hoja, y alto de la hoja cerrada a medias (`.anat-sheet` height: 54vh).
const FIG_HEIGHT = 540
const SHEET_VH = 0.54
// Con la hoja abierta la figura se achica a lo que queda visible encima de la hoja (antes un 300
// fijo quedaba tapado en pantallas bajas). Piso para que siga siendo tocable.
const FIG_HEIGHT_MIN = 160
const FIG_GAP_OVER_SHEET = 8

const store = useAnatomyStore()
const router = useRouter()
const route = useRoute()
const $q = useQuasar()

const scroller = ref<HTMLElement | null>(null)
const figEl = ref<HTMLElement | null>(null)
const figHeightOpen = ref(300)
const vistaActual = ref<VistaCuerpo>('front')
const zona = ref<ZoneSlug | null>(null)
const sheetOpen = ref(false)
const sheetFull = ref(false)

const resetKey = computed(() => zona.value)

const bottomOffset = computed(() => {
  if ($q.screen.width >= 768) return 0
  const footer = document.querySelector('.mobile-footer')
  return footer instanceof HTMLElement ? footer.offsetHeight : TAB_BAR_FALLBACK
})

// Zonas de la vista que se está mirando (las `both` salen en las dos), para la lista accesible.
const regionesVisibles = computed(() =>
  (store.vista?.regiones ?? []).filter((r) => r.vista === 'both' || r.vista === vistaActual.value),
)

/** Una zona `both` se abre en la vista que se está mirando; las demás, en la suya. */
function vistaDeRegion(vista: VistaFigura): VistaCuerpo {
  return vista === 'both' ? vistaActual.value : vista
}

function volverALaGuia(): void {
  void router.push({ name: 'guia-inicio' })
}

function reintentar(): void {
  void store.cargar()
}

function girar(vista: VistaCuerpo): void {
  vistaActual.value = vista
}

/** Deja la selección en la URL (replace, sin historia) para que volver desde la ficha la restaure. */
function recordarSeleccion(query: Record<string, string>): void {
  void router.replace({ name: 'tu-cuerpo', query })
}

function abrirHoja(): void {
  sheetFull.value = false
  sheetOpen.value = true
  if (scroller.value) scroller.value.scrollTop = 0
  void medirFiguraSobreHoja()
}

/** Alto de la figura para que entre entera entre su borde de arriba y el borde de la hoja. */
async function medirFiguraSobreHoja(): Promise<void> {
  await nextTick()
  if (!figEl.value) return
  const top = figEl.value.getBoundingClientRect().top
  const bordeHoja = window.innerHeight * (1 - SHEET_VH) - bottomOffset.value
  const libre = Math.floor(bordeHoja - top - FIG_GAP_OVER_SHEET)
  figHeightOpen.value = Math.max(FIG_HEIGHT_MIN, Math.min(FIG_HEIGHT, libre))
}

function onSelectZone(slug: ZoneSlug, vista: VistaCuerpo): void {
  vistaActual.value = vista
  zona.value = slug
  abrirHoja()
  recordarSeleccion({ zona: slug })
}

// La hoja se abre/cierra (×, arrastre o handle): al cerrar suelta la selección y limpia la URL.
function onSheetUpdate(abierta: boolean): void {
  sheetOpen.value = abierta
  if (abierta) return
  zona.value = null
  sheetFull.value = false
  recordarSeleccion({})
}

function irAFicha(slug: string): void {
  void router.push({ name: 'tu-cuerpo-ficha', params: { slug } })
}

/** Primer valor string de un query param (vue-router puede darlo como array o null). */
function paramTexto(valor: unknown): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor
  return typeof v === 'string' && v !== '' ? v : null
}

/** Abre la hoja de una región conocida y gira a su vista. */
function abrirRegion(slug: ZoneSlug): boolean {
  const region = store.region(slug)
  if (!region) return false
  vistaActual.value = region.vista === 'back' ? 'back' : 'front'
  zona.value = slug
  abrirHoja()
  return true
}

/** `?zona=` al entrar (o `?musculo=` de un profundo: enlace viejo, abre la hoja de su zona). */
function aplicarQuery(): void {
  const slug = paramTexto(route.query.zona)
  if (slug !== null && isZoneSlug(slug) && abrirRegion(slug)) return
  const id = paramTexto(route.query.musculo)
  const debajoDe = id !== null ? store.musculo(id)?.debajoDe : null
  if (debajoDe) abrirRegion(debajoDe)
}

onMounted(async () => {
  await store.cargar()
  if (store.vista) aplicarQuery()
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

// El q-page ya reserva el alto entre header y footer: la barra queda fija arriba y solo el cuerpo
// scrollea (no hay precedente de `position: sticky` bajo el q-header fijo).
.tu-cuerpo {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: $brand-cream;
}

// Título solo para lectores de pantalla (la barra de arriba se fue).
.tu-cuerpo__h1 {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tu-cuerpo__scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.tu-cuerpo__estado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
}

.tu-cuerpo__error {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 14.5px;
  text-align: center;
  color: $pd-ink-2;
}

.tu-cuerpo__retry {
  @include pd-hit-44;
  padding: 8px 20px;
  border: 1.5px solid $pd-terra-ink;
  border-radius: 12px;
  background: #fff;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 15px;
  color: $pd-terra-ink;
  cursor: pointer;
}

.tu-cuerpo__body {
  padding: 12px 14px 20px;
}

// Sobre blanco: la ayuda, el selector y la figura (el crema queda solo de fondo)
.tu-cuerpo__card {
  position: relative;
  padding: 10px 10px 14px;
  border: 1px solid $pd-light-line;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(150, 89, 58, 0.06);
}

// Volver a la Guía: círculo de 36 como la × de la hoja, área tocable de 44.
.tu-cuerpo__back {
  @include pd-hit-44;
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #f3ede4;
  color: $pd-ink;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

.tu-cuerpo__hint {
  margin: 4px 0 2px;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 15px;
  text-align: center;
  color: $pd-ink;
}

.tu-cuerpo__flip {
  display: flex;
  width: max-content;
  margin: 6px auto 4px;
  padding: 3px;
  border-radius: 999px;
  background: #f3ede4;
}

.tu-cuerpo__flip-btn {
  @include pd-hit-44;
  padding: 7px 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: $pd-ink-2;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

.tu-cuerpo__flip-btn--on {
  background: #fff;
  color: $pd-ink;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

// El rótulo Frente/Espalda de la figura sobra: ya lo dice el selector.
.tu-cuerpo__fig :deep(.body-figure__caption) {
  display: none;
}

// Lista de zonas para teclado y lector de pantalla: invisible hasta que algo recibe el foco.
.tu-cuerpo__zonas:not(:focus-within) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tu-cuerpo__zonas-lista {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.tu-cuerpo__pill {
  @include pd-hit-44;
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  margin: 3px;
  padding: 0 13px;
  border: 1px solid $pd-light-edge;
  border-radius: 999px;
  background: #fff;
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 13.5px;
  color: $pd-ink;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: $pd-terra-ink;
    color: $pd-terra-ink;
  }

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}
</style>
