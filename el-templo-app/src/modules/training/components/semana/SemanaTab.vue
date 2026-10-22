<template>
  <div
    class="semana-tab"
    :class="{ 'semana-tab--sheet': touchedZone !== null }"
    :inert="interactive ? undefined : true"
  >
    <div class="semana-tab__weekbox">
      <WeekHeader
        :monday="monday"
        :can-prev="canPrev"
        :can-next="canNext"
        @prev="onPrev"
        @next="onNext"
      />
      <WeekDayStrip :days="days" :selected-date="selectedDate" :today="today" @select="onSelect" />
    </div>

    <SemanaHero
      :day="selectedDay"
      :today="today"
      :has-progress="hasProgress"
      @start="onStart"
      @summary="onSummary"
      @go-libre="onGoLibre"
    >
      <!-- Área de bloques (D-03): chips apilados + figura de 220 px y lista del bloque elegido -->
      <div v-if="activeBlock" class="semana-tab__blocks">
        <div ref="splitEl" class="semana-tab__split">
          <!-- Fase 200 D18: con la hoja abierta ningún chip queda elegido, los de los bloques que
               trabajan la zona se marcan y el resto se apaga -->
          <BlockChipStack
            :blocks="blocks"
            :selected="touchedZone ? -1 : selectedBlockIndex"
            :interactive="interactive"
            :hits="hitIndices"
            :dim-others="touchedZone !== null"
            @select="onSelectBlock"
          />
          <div class="semana-tab__stage">
            <span class="semana-tab__halo" aria-hidden="true" />
            <BodyFigure
              :gender="gender"
              :lit="figureLit"
              :lit2="figureLit2"
              :tone="completed ? 'sage' : 'terra'"
              :height="220"
              :interactive="tocable"
              tapStyle="cursor"
              :dim="touchedZone !== null"
              :selected="touchedZone"
              @select-zone="onSelectZone"
            />
            <!-- Fase 200 D16: pista del cuerpo tocable (se esconde con la hoja abierta) -->
            <p
              v-if="tocable"
              class="semana-tab__hint"
              :class="{ 'semana-tab__hint--oculto': touchedZone !== null }"
            >
              <q-icon name="touch_app" size="13px" aria-hidden="true" />
              <span>Tocá un músculo</span>
            </p>
          </div>
        </div>
        <BlockExercisesCard :block="activeBlock" />
      </div>
    </SemanaHero>

    <!-- Fase 200 D17, D19: hoja de Tu cuerpo, NO modal (seamless): los chips y otra zona siguen
         tocables -->
    <AnatomySheet
      v-if="tocable"
      :model-value="touchedZone !== null"
      v-model:full="sheetFull"
      :bottom-offset="bottomOffset"
      :reset-key="sheetZone"
      @update:model-value="onSheetUpdate"
    >
      <template v-if="sheetZone !== null">
        <ZonaAlumno
          v-if="anatomyStore.vista"
          :zona="sheetZone"
          :musculo-id="null"
          @open-ruta="onOpenRuta"
        >
          <template #antes>
            <HoyEnTuClase v-if="hoyProps" v-bind="hoyProps" />
          </template>
          <template #despues>
            <button type="button" class="semana-tab__ver" @click="onVerEnTuCuerpo">
              <span>Ver en Tu cuerpo</span>
              <q-icon name="chevron_right" size="18px" aria-hidden="true" />
            </button>
          </template>
        </ZonaAlumno>

        <template v-else>
          <HoyEnTuClase v-if="hoyProps" v-bind="hoyProps" />
          <p v-if="!anatomyStore.error" class="semana-tab__estado">Cargando…</p>
          <div v-else class="semana-tab__estado">
            <p class="semana-tab__estado-txt">No pudimos cargar</p>
            <button type="button" class="semana-tab__retry" @click="onReintentar">
              Reintentar
            </button>
          </div>
        </template>
      </template>
    </AnatomySheet>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import type { ZoneSlug } from 'src/components/anatomy/zones'
import { ANATOMIA_ALUMNOS_ENABLED } from 'src/config/featureFlags'
import AnatomySheet from 'src/modules/anatomy/components/AnatomySheet.vue'
import ZonaAlumno from 'src/modules/anatomy/components/ZonaAlumno.vue'
import { useAnatomyStore } from 'src/modules/anatomy/stores/anatomyStore'
import type { Block, WeekDay } from '../../types/session'
import { defaultBlockIndex, figureZones } from '../../utils/blockMeta'
import WeekHeader from './WeekHeader.vue'
import WeekDayStrip from './WeekDayStrip.vue'
import SemanaHero from './SemanaHero.vue'
import BlockChipStack from './BlockChipStack.vue'
import BlockExercisesCard from './BlockExercisesCard.vue'
import HoyEnTuClase from './HoyEnTuClase.vue'

// Fase 197 D-03: tab Semana presentacional (props + emits). La monta EntrenarView con datos de
// `useTrainingWeek` y la vidriera de D-06 con datos fijos (`interactive = false`: sin eventos y
// con `inert` en todo el contenido).
// Fase 200 D16..D20: con `ANATOMIA_ALUMNOS_ENABLED` el cuerpo se vuelve tocable. Todo el estado
// nuevo es local a este componente (nada en stores ni en la URL); con el flag apagado el
// render es el de la 197 (P1).
const props = withDefaults(
  defineProps<{
    days: WeekDay[]
    selectedDate: string | null
    /** Hoy en la zona de la sede */
    today: string
    /** Lunes de la semana que se ve */
    monday: string
    canPrev: boolean
    canNext: boolean
    hasProgress: boolean
    /** `users.gender`: elige la figura (D-07) */
    gender?: string | null
    interactive?: boolean
  }>(),
  {
    gender: null,
    interactive: true,
  },
)

const emit = defineEmits<{
  'select-date': [date: string]
  'prev-week': []
  'next-week': []
  start: [date: string]
  summary: []
  'go-libre': []
}>()

// Alto aproximado de la tab bar de MainLayout cuando todavía no se puede medir
const TAB_BAR_FALLBACK = 56

const router = useRouter()
const $q = useQuasar()
const anatomyStore = useAnatomyStore()

const selectedDay = computed(() => props.days.find((d) => d.date === props.selectedDate))

// Bloques de la sesión elegida, por orden de la sesión
const blocks = computed<Block[]>(() =>
  [...(selectedDay.value?.session?.blocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
)

// Bloque tocado por el socio (por id: sobrevive a una recarga de la semana). Se descarta al
// cambiar de día: NUCLEUS vuelve a ser el elegido (D-03), y siempre hay uno elegido.
const pickedBlockId = ref<string | null>(null)

// Fase 200 D18: zona tocada. Define el modo "zona" (el cuerpo muestra solo esa zona); null = modo
// bloque, como en la 197. No toca al bloque elegido (`activeBlock` no depende de esto, D19).
const touchedZone = ref<ZoneSlug | null>(null)

watch(
  () => props.selectedDate,
  () => {
    pickedBlockId.value = null
    // Fase 200 D19: otro día, otra clase: la zona tocada y su hoja se sueltan
    touchedZone.value = null
  },
)

const selectedBlockIndex = computed(() => {
  const picked = blocks.value.findIndex((b) => b.blockId === pickedBlockId.value)
  return picked >= 0 ? picked : defaultBlockIndex(blocks.value)
})

const activeBlock = computed<Block | undefined>(() => blocks.value[selectedBlockIndex.value])

const zones = computed(() => figureZones(blocks.value, selectedBlockIndex.value))

const completed = computed(() => selectedDay.value?.state === 'completed')

// ── Fase 200 D16..D19: cuerpo tocable ──

// D16: tocable solo con el flag prendido y en la pantalla real (la vidriera no es interactive)
const tocable = computed(() => ANATOMIA_ALUMNOS_ENABLED && props.interactive)

// Zona que muestra la hoja: se queda mientras la hoja se cierra, así no se vacía a mitad de la animación
const sheetZone = ref<ZoneSlug | null>(null)
const sheetFull = ref(false)
const bottomOffset = ref(TAB_BAR_FALLBACK)
const splitEl = ref<HTMLElement | null>(null)

// Precarga: cuando el cuerpo se vuelve tocable la hoja ya abre con datos (cargar() no repite)
watch(
  tocable,
  (activo) => {
    if (activo) void anatomyStore.cargar()
  },
  { immediate: true },
)

// Si el día se queda sin bloques (la semana se recarga) no queda una zona tocada colgada
watch(
  () => blocks.value.length,
  (n) => {
    if (n === 0) touchedZone.value = null
  },
)

// D18: con una zona tocada el cuerpo muestra SOLO esa zona; sin zona, las del bloque elegido (197)
const figureLit = computed<readonly string[]>(() =>
  touchedZone.value ? [touchedZone.value] : zones.value.lit,
)
const figureLit2 = computed<readonly string[]>(() => (touchedZone.value ? [] : zones.value.lit2))

// D17, D20: bloques que trabajan la zona tocada, según el `zoneHits` que calcula el API
const hitIndices = computed<number[]>(() => {
  const zona = touchedZone.value
  if (zona === null) return []
  const indices: number[] = []
  blocks.value.forEach((b, i) => {
    if (b.zoneHits?.[zona]) indices.push(i)
  })
  return indices
})

const esHoy = computed(() => props.selectedDate === props.today)

// Textos de "Hoy en tu clase": en un día que no es hoy habla de "esta clase"
const hoyProps = computed(() => {
  const zona = sheetZone.value
  if (zona === null) return null
  return {
    zona,
    blocks: blocks.value,
    kicker: esHoy.value ? 'Hoy en tu clase' : 'En esta clase',
    vacio: esHoy.value ? 'Hoy tu clase no trabaja esta zona.' : 'Esta clase no trabaja esta zona.',
  }
})

function medirTabBar(): number {
  if ($q.screen.width >= 768) return 0
  const footer = document.querySelector('.mobile-footer')
  return footer instanceof HTMLElement ? footer.offsetHeight : TAB_BAR_FALLBACK
}

function onSelectZone(slug: ZoneSlug): void {
  if (!tocable.value) return
  if (touchedZone.value === null) sheetFull.value = false
  touchedZone.value = slug
  sheetZone.value = slug
  bottomOffset.value = medirTabBar()
  // Cuerpo y chips suben para quedar arriba de la hoja (cuando ya está el espacio de abajo)
  void nextTick(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    splitEl.value?.scrollIntoView({ block: 'start', behavior: reducido ? 'auto' : 'smooth' })
  })
}

function onSheetUpdate(abierta: boolean): void {
  if (abierta) return
  touchedZone.value = null
  sheetFull.value = false
}

function onReintentar(): void {
  void anatomyStore.cargar()
}

function onVerEnTuCuerpo(): void {
  const zona = sheetZone.value
  if (zona === null) return
  touchedZone.value = null
  void router.push({ name: 'tu-cuerpo', query: { zona } })
}

function onOpenRuta(slug: string): void {
  touchedZone.value = null
  void router.push({ name: 'tu-cuerpo-ficha', params: { slug } })
}

function onSelectBlock(index: number): void {
  if (!props.interactive) return
  const block = blocks.value[index]
  if (block) pickedBlockId.value = block.blockId
  // Fase 200 D19: tocar un chip cambia de bloque y cierra la hoja (la lista de ejercicios no se recarga)
  touchedZone.value = null
}

function onSelect(date: string): void {
  if (props.interactive) emit('select-date', date)
}

function onPrev(): void {
  if (props.interactive) emit('prev-week')
}

function onNext(): void {
  if (props.interactive) emit('next-week')
}

function onStart(date: string): void {
  if (props.interactive) emit('start', date)
}

function onSummary(): void {
  if (props.interactive) emit('summary')
}

function onGoLibre(): void {
  if (props.interactive) emit('go-libre')
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.semana-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 24px;

  // Fase 200 D17: con la hoja abierta hay espacio de sobra abajo para subir cuerpo y chips
  &--sheet {
    padding-bottom: calc(54vh + 24px);
  }

  &__weekbox {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__blocks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    // scrollIntoView no deja el bloque debajo del header fijo
    scroll-margin-top: 60px;
  }

  // Halo decorativo detrás de la figura (solo adorno, sin texto)
  &__stage {
    position: relative;
    isolation: isolate;
  }

  &__halo {
    position: absolute;
    top: 52%;
    left: 50%;
    z-index: -1;
    width: 200px;
    height: 220px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(163, 95, 60, 0.16), transparent);
    pointer-events: none;
  }

  // Fase 200 D16: "Tocá un músculo" debajo del cuerpo
  &__hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    margin: 4px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    color: $pd-ink-2;

    &--oculto {
      visibility: hidden;
    }
  }

  // Fase 200 D17: "Ver en Tu cuerpo ›" al pie de la hoja
  &__ver {
    @include pd-hit-44;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    padding: 6px 0;
    border: 0;
    background: none;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: $pd-terra-ink;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
    }
  }

  // Cargando / error de la vista de alumno, dentro de la hoja
  &__estado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin: 16px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 14.5px;
    color: $pd-ink-2;
  }

  &__estado-txt {
    margin: 0;
  }

  &__retry {
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
}
</style>
