<template>
  <q-page class="tu-cuerpo">
    <div class="tu-cuerpo__top">
      <button type="button" class="tu-cuerpo__back" @click="volverALaGuia">
        <q-icon name="chevron_left" size="22px" aria-hidden="true" />
        <span>Guía</span>
      </button>
      <h1 class="tu-cuerpo__h1">Tu cuerpo</h1>
    </div>

    <div ref="scroller" class="tu-cuerpo__scroll">
      <div v-if="!store.vista && !store.error" class="tu-cuerpo__estado">
        <TemploLoader />
      </div>

      <div v-else-if="!store.vista" class="tu-cuerpo__estado">
        <p class="tu-cuerpo__error">{{ store.error }}</p>
        <button type="button" class="tu-cuerpo__retry" @click="reintentar">Reintentar</button>
      </div>

      <div v-else class="tu-cuerpo__body">
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

        <div class="tu-cuerpo__fig">
          <BodyFigure
            :side="vistaActual"
            interactive
            tap-style="cursor"
            :lit="zona ? [zona] : []"
            :selected="zona"
            :height="sheetOpen ? 300 : 540"
            @select-zone="onSelectZone"
          />
        </div>

        <div v-show="!sheetOpen && store.profundos.length > 0" class="tu-cuerpo__deep">
          <p class="tu-cuerpo__deep-lbl">Los que no se ven (están más adentro):</p>
          <div class="tu-cuerpo__pills">
            <button
              v-for="m in store.profundos"
              :key="m.id"
              type="button"
              class="tu-cuerpo__pill"
              @click="onSelectProfundo(m.id)"
            >
              {{ m.nombre }}
            </button>
          </div>
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
      <ZonaAlumno :zona="zona" :musculo-id="musculoId" @open-ruta="irAFicha" />
    </AnatomySheet>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D14 (sketch 020, "Tu cuerpo"): la figura grande en tono alumno. Tocás una zona y se abre
 * la hoja con qué hace cada músculo y en qué ejercicios lo usás; los músculos profundos van como
 * pills. `?zona=<slug>` (o `?musculo=<id>` para un profundo) abre la hoja al entrar y gira a la vista
 * de esa región; la zona elegida queda en la URL, así volver desde la ficha de un ejercicio deja
 * todo como estaba. Solo existe con ANATOMIA_ALUMNOS_ENABLED (la ruta `tu-cuerpo` no se registra
 * apagado). Slugs y ids de la URL se resuelven contra el store; si no existen se ignoran.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import TemploLoader from 'src/components/TemploLoader.vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { isZoneSlug } from 'src/components/anatomy/zones'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import AnatomySheet from '../components/AnatomySheet.vue'
import ZonaAlumno from '../components/ZonaAlumno.vue'
import { useAnatomyStore } from '../stores/anatomyStore'

type VistaCuerpo = 'front' | 'back'

const VISTAS: readonly { id: VistaCuerpo; label: string }[] = [
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Espalda' },
]

// Alto de la tab bar del layout (móvil): la hoja se apoya encima.
const TAB_BAR_FALLBACK = 56

const store = useAnatomyStore()
const router = useRouter()
const route = useRoute()
const $q = useQuasar()

const scroller = ref<HTMLElement | null>(null)
const vistaActual = ref<VistaCuerpo>('front')
const zona = ref<ZoneSlug | null>(null)
const musculoId = ref<string | null>(null)
const sheetOpen = ref(false)
const sheetFull = ref(false)

const resetKey = computed(() => musculoId.value ?? zona.value)

const bottomOffset = computed(() => {
  if ($q.screen.width >= 768) return 0
  const footer = document.querySelector('.mobile-footer')
  return footer instanceof HTMLElement ? footer.offsetHeight : TAB_BAR_FALLBACK
})

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
}

function onSelectZone(slug: ZoneSlug, vista: VistaCuerpo): void {
  vistaActual.value = vista
  zona.value = slug
  musculoId.value = null
  abrirHoja()
  recordarSeleccion({ zona: slug })
}

function onSelectProfundo(id: string): void {
  zona.value = null
  musculoId.value = id
  abrirHoja()
  recordarSeleccion({ musculo: id })
}

// La hoja se abre/cierra (×, arrastre o handle): al cerrar suelta la selección y limpia la URL.
function onSheetUpdate(abierta: boolean): void {
  sheetOpen.value = abierta
  if (abierta) return
  zona.value = null
  musculoId.value = null
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

/** `?zona=` / `?musculo=` al entrar: abre la hoja y gira a la vista de la región. */
function aplicarQuery(): void {
  const slug = paramTexto(route.query.zona)
  if (slug !== null && isZoneSlug(slug)) {
    const region = store.region(slug)
    if (region) {
      vistaActual.value = region.vista === 'back' ? 'back' : 'front'
      zona.value = slug
      musculoId.value = null
      abrirHoja()
      return
    }
  }
  const id = paramTexto(route.query.musculo)
  if (id !== null) {
    const m = store.musculo(id)
    if (m && m.zona === null) {
      zona.value = null
      musculoId.value = id
      abrirHoja()
    }
  }
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

.tu-cuerpo__top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 50px;
  padding: 0 8px;
  background: $brand-cream;
  border-bottom: 1px solid $pd-light-line;
}

.tu-cuerpo__back {
  @include pd-hit-44;
  display: inline-flex;
  align-items: center;
  padding: 8px 6px;
  border: 0;
  background: none;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 15px;
  color: $pd-terra-ink;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

.tu-cuerpo__h1 {
  margin: 0 auto 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 17px;
  color: $pd-ink;
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
  padding: 8px 16px 20px;
}

.tu-cuerpo__hint {
  margin: 4px 0 2px;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  text-align: center;
  color: $pd-ink-2;
}

.tu-cuerpo__flip {
  display: flex;
  width: max-content;
  margin: 6px auto 4px;
  padding: 3px;
  border-radius: 999px;
  background: #e6ddd0;
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

.tu-cuerpo__deep {
  margin-top: 10px;
  text-align: center;
}

.tu-cuerpo__deep-lbl {
  margin: 0 0 6px;
  font-family: 'Geologica', sans-serif;
  font-size: 12.5px;
  color: $pd-ink-2;
}

.tu-cuerpo__pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
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
