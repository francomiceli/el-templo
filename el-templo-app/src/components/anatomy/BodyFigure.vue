<template>
  <div
    class="body-figure"
    :class="{ 'body-figure--sage': tone === 'sage', 'body-figure--tap': interactive }"
  >
    <template v-if="figure">
      <figure v-for="view in views" :key="view.key" class="body-figure__view">
        <svg
          :ref="(el) => setSvg(view.key, el)"
          class="body-figure__svg"
          :style="svgStyle(view.key)"
          :viewBox="viewBoxes[view.key]"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient :id="gradientIdFor(view.key)" v-bind="RELIEVE">
              <stop offset="0" :stop-color="LIT[0]" />
              <stop offset="0.5" :stop-color="LIT[1]" />
              <stop offset="1" :stop-color="LIT[2]" />
            </radialGradient>
            <radialGradient :id="muscleIdFor(view.key)" v-bind="RELIEVE">
              <stop offset="0" :stop-color="MUSCLE[0]" :stop-opacity="MUSCLE_OP[0]" />
              <stop offset="0.55" :stop-color="MUSCLE[1]" :stop-opacity="MUSCLE_OP[1]" />
              <stop offset="1" :stop-color="MUSCLE[2]" :stop-opacity="MUSCLE_OP[2]" />
            </radialGradient>
          </defs>
          <g :style="{ '--mu-base': `url(#${muscleIdFor(view.key)})` }">
            <path class="body-figure__outline" :d="view.outline" />
            <g
              v-for="group in view.groups"
              :key="group.slug"
              class="mu"
              :class="muClass(group.slug, view.key)"
              :style="muStyle(group.slug, view.key)"
              @click="onPick(group.slug, view.key)"
            >
              <path v-for="(path, i) in group.p" :key="i" :d="path[0]" />
            </g>
          </g>
        </svg>
        <figcaption class="body-figure__caption">{{ view.caption }}</figcaption>
      </figure>
    </template>
    <div v-else class="body-figure__empty" :style="{ height: `${height}px` }" />
  </div>
</template>

<script setup lang="ts">
/**
 * Figura anatómica compartida (fase 197 D-01, D-03, D-04, D-07): frente y espalda.
 *
 * Intensidades: `lit` = bloque elegido (oro con relieve, o salvia si `tone="sage"`),
 * `lit2` = zonas de los otros bloques, resto = músculo sin trabajar. Con `interactive` los
 * músculos son tocables y emiten su GRUPO (D-10); `dim` atenúa lo que no está encendido.
 * Las partes no musculares (pelo, cabeza, cuello, manos, pies...) se pintan como piel y no se tocan.
 * La geometría se carga con `loadAnatomy()` (chunk propio, import dinámico).
 *
 * Fase 200 (props opcionales, sin ellas se comporta como en la 197): `side` deja una sola vista,
 * `roles` pinta por grupo de alumno (fuerte / sostiene / estira; clave `slug` o `slug@front|back`),
 * `selected` marca la zona elegida, `tapStyle="cursor"` hace tocable sin cambiar la paleta y
 * `select-zone` emite la zona (y su vista) junto al `select-group`.
 */
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { createLogger } from 'src/utils/logger'
import { figureFor, loadAnatomy } from './anatomia'
import type { Anatomia, FiguraElegida } from './anatomia'
import { NON_MUSCLE_SLUGS, groupOfSlug, isZoneSlug } from './zones'
import type { ZoneGroup, ZoneSlug } from './zones'

type ViewKey = 'front' | 'back'
type RoleKind = 'fuerte' | 'sostiene' | 'estira'

const props = withDefaults(
  defineProps<{
    gender?: string | null
    lit: readonly string[]
    lit2?: readonly string[]
    tone?: 'terra' | 'sage'
    interactive?: boolean
    dim?: boolean
    height?: number
    /** Fase 200: qué vistas se dibujan. */
    side?: 'both' | 'front' | 'back'
    /** Fase 200: grupo de alumno por zona (clave `slug` o `slug@front|back`); pinta por grupo. */
    roles?: Record<string, RoleKind>
    /** Fase 200: zona elegida (`slug` o `slug@front|back`), borde de tinta. */
    selected?: string | null
    /** Fase 200: `palette` = tocable como la tab Libre; `cursor` = tocable sin cambiar la paleta. */
    tapStyle?: 'palette' | 'cursor'
  }>(),
  {
    gender: null,
    lit2: () => [],
    tone: 'terra',
    interactive: false,
    dim: false,
    height: 220,
    side: 'both',
    roles: () => ({}),
    selected: null,
    tapStyle: 'palette',
  },
)

const emit = defineEmits<{
  'select-group': [group: ZoneGroup]
  'select-zone': [slug: ZoneSlug, view: ViewKey]
}>()

const log = createLogger('BodyFigure')

// Mismos valores que $fig-lit-a/b/c y $fig-muscle-a/-/c de _brand.scss: el SVG necesita el color
// como atributo. Variante A2 (2026-10-27): cada músculo es una "almohada" con luz de arriba a la
// izquierda, como el recorrido de la TV.
const LIT = ['#d1bdab', '#b08d6e', '#6d5744'] as const
const MUSCLE = ['#fdfbf7', '#ece5d9', '#e6ddd0'] as const
// El músculo sin trabajar se funde en la piel: borde transparente (2026-10-27, cuerpos comunes).
const MUSCLE_OP = [1, 0.85, 0] as const
const RELIEVE = { cx: '.42', cy: '.36', r: '.74', fx: '.34', fy: '.26' } as const

// Degradés por vista (ids únicos en el documento); useId puede traer caracteres que rompen url(#...).
const gradientBase = `body-figure-${useId().replace(/[^\w-]/g, '')}`

function gradientIdFor(key: ViewKey): string {
  return `${gradientBase}-lit-${key}`
}

function muscleIdFor(key: ViewKey): string {
  return `${gradientBase}-mu-${key}`
}

const anatomy = ref<Anatomia | null>(null)
const viewBoxes = ref<Record<ViewKey, string | undefined>>({ front: undefined, back: undefined })
const svgs: Record<ViewKey, SVGSVGElement | null> = { front: null, back: null }

const figure = computed<FiguraElegida | null>(() =>
  anatomy.value ? figureFor(anatomy.value, props.gender) : null,
)

const views = computed(() => {
  const fig = figure.value
  if (!fig) return []
  const all = [
    { key: 'front' as const, caption: 'Frente', outline: fig.outline[0], groups: fig.front },
    { key: 'back' as const, caption: 'Espalda', outline: fig.outline[1], groups: fig.back },
  ]
  return props.side === 'both' ? all : all.filter((v) => v.key === props.side)
})

const litSet = computed(() => new Set(props.lit))
const lit2Set = computed(() => new Set(props.lit2))

function setSvg(key: ViewKey, el: unknown) {
  svgs[key] = el instanceof SVGSVGElement ? el : null
}

/** Grupo de alumno de una zona en una vista: la clave con vista gana a la clave sola. */
function roleOf(slug: string, key: ViewKey): RoleKind | undefined {
  return props.roles[`${slug}@${key}`] ?? props.roles[slug]
}

function isSelected(slug: string, key: ViewKey): boolean {
  return props.selected === slug || props.selected === `${slug}@${key}`
}

function muClass(slug: string, key: ViewKey): Record<string, boolean> {
  const muscle = !NON_MUSCLE_SLUGS.has(slug)
  const role = muscle ? roleOf(slug, key) : undefined
  const isLit = muscle && role === undefined && litSet.value.has(slug)
  const isLit2 = muscle && role === undefined && !isLit && lit2Set.value.has(slug)
  const isDim = muscle && role === undefined && !isLit && !isLit2 && props.dim
  return {
    'mu--x': !muscle,
    'mu--lit': isLit,
    'mu--lit2': isLit2,
    'mu--dim': isDim,
    'mu--r-fuerte': role === 'fuerte',
    'mu--r-sostiene': role === 'sostiene',
    'mu--r-estira': role === 'estira',
    'mu--sel': muscle && isSelected(slug, key),
    'mu--tap':
      muscle &&
      props.interactive &&
      props.tapStyle === 'palette' &&
      role === undefined &&
      !isLit &&
      !isLit2 &&
      !isDim,
    'mu--hit': muscle && props.interactive,
  }
}

// El degradé oro va inline (gana a las reglas del <style>); en salvia el elegido es sólido por CSS.
function muStyle(slug: string, key: ViewKey): Record<string, string> | undefined {
  if (props.tone !== 'terra' || NON_MUSCLE_SLUGS.has(slug)) return undefined
  const role = roleOf(slug, key)
  if (litSet.value.has(slug) || role === 'fuerte') {
    return { '--mu-fill': `url(#${gradientIdFor(key)})` }
  }
  return undefined
}

function svgStyle(key: ViewKey): Record<string, string> {
  const measured = viewBoxes.value[key] !== undefined
  return {
    height: `${props.height}px`,
    // Hasta medir el viewBox se reserva un ancho aproximado y la figura queda oculta.
    width: measured ? 'auto' : `${Math.round(props.height * 0.45)}px`,
    visibility: measured ? 'visible' : 'hidden',
  }
}

function onPick(slug: string, key: ViewKey) {
  if (!props.interactive) return
  const group = groupOfSlug(slug)
  if (group === null) return
  emit('select-group', group)
  if (isZoneSlug(slug)) emit('select-zone', slug, key)
}

// Como `fitFigures` del sketch: el viewBox sale del bbox real de la figura (+2 px de margen).
function measure() {
  for (const key of ['front', 'back'] as const) {
    // Ya medida: la geometría no cambia al girar (refit la borra cuando cambia el género).
    if (viewBoxes.value[key] !== undefined) continue
    const svg = svgs[key]
    const g = svg?.querySelector(':scope > g')
    if (!(g instanceof SVGGraphicsElement)) continue
    try {
      const bb = g.getBBox()
      if (bb.width > 0) {
        viewBoxes.value[key] = `${bb.x - 2} ${bb.y - 2} ${bb.width + 4} ${bb.height + 4}`
      }
    } catch (err: unknown) {
      // getBBox puede tirar si el SVG no está renderizado todavía: queda oculto y no rompe la pantalla.
      log.warn('No se pudo medir la figura', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function refit() {
  viewBoxes.value = { front: undefined, back: undefined }
  await nextTick()
  measure()
}

onMounted(async () => {
  try {
    anatomy.value = await loadAnatomy()
  } catch (err: unknown) {
    // Caja vacía del mismo alto: la pantalla sigue funcionando sin la figura.
    log.error('No se pudo cargar la figura anatómica', {
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }
  await refit()
})

// Cambia el género del perfil: otra geometría, hay que volver a medir.
watch(
  () => props.gender === 'female',
  async () => {
    if (anatomy.value) await refit()
  },
)

// Fase 200: con `side` solo hay un svg montado; al girar se monta el de la otra vista y hay que medirlo.
watch(
  () => props.side,
  async () => {
    if (!anatomy.value) return
    await nextTick()
    measure()
  },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

.body-figure {
  display: flex;
  justify-content: center;
  gap: 4px;
  width: 100%;
}

.body-figure__view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 0;
}

.body-figure__svg {
  overflow: visible;
}

.body-figure__empty {
  width: 100%;
}

.body-figure__caption {
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $pd-ink-2;
}

.body-figure__outline {
  fill: $fig-skin;
  stroke: $fig-skin-edge;
  stroke-width: 1.2;
}

// Músculo sin trabajar (estado base): relieve que se funde en la piel (inline --mu-base), sin
// línea. Los demás estados ponen su propio borde.
.mu path {
  fill: var(--mu-base, $fig-muscle);
  stroke: none;
  stroke-width: 0.8;
}

// Partes no musculares: piel, con el borde del contorno (sin él la cabeza se perdía en el fondo)
.mu--x path {
  fill: $fig-skin;
  stroke: $fig-skin-edge;
  stroke-width: 0.8;
}

// Bloque elegido: oro con relieve (inline --mu-fill) o salvia sólido
.mu--lit path {
  fill: var(--mu-fill, $fig-lit-b);
  stroke: $fig-lit-edge;
  stroke-width: 1.1;
}

.mu--lit2 path {
  fill: $fig-lit2;
  stroke: $fig-lit2-edge;
}

.body-figure--sage .mu--lit path {
  fill: $fig-done-lit;
  stroke: $fig-done-lit-edge;
}

.body-figure--sage .mu--lit2 path {
  fill: $fig-done-lit2;
  stroke: $fig-done-lit2-edge;
}

// Modo tocable: grupo encendido, resto atenuado
.mu--tap path {
  fill: $fig-tap;
  stroke: $fig-tap-edge;
}

.mu--dim path {
  fill: $fig-dim;
  stroke: $fig-dim-edge;
}

// Fase 200: figura pintada por grupo de alumno (sketch 020 `.r-M` / `.r-Est` / `.r-Al`)
.mu--r-fuerte path {
  fill: var(--mu-fill, $fig-lit-b);
  stroke: $fig-lit-edge;
  stroke-width: 1.1;
}

.mu--r-sostiene path {
  fill: $fig-sost;
  stroke: $fig-lit2-edge;
}

.mu--r-estira path {
  fill: $fig-estira;
  stroke: $fig-estira-edge;
  stroke-width: 2.5;
  stroke-dasharray: 6 5;
}

// Zona elegida: borde de tinta (va después de los roles para ganarles)
.mu--sel path {
  stroke: $pd-ink;
  stroke-width: 3;
  stroke-dasharray: none;
}

.mu--hit {
  cursor: pointer;
}

@media (prefers-reduced-motion: no-preference) {
  .mu path {
    transition: fill 0.35s;
  }
}
</style>
