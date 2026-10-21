<template>
  <div
    class="anat-figure"
    :class="{ 'anat-figure--tap': interactive, 'anat-figure--both': view === 'both' }"
    :role="interactive ? 'group' : undefined"
    :aria-label="interactive ? 'Cuerpo: tocá una zona' : undefined"
  >
    <template v-if="figura">
      <figure v-for="v in vistas" :key="v.key" class="anat-figure__view">
        <svg
          :ref="(el) => setSvg(v.key, el)"
          class="anat-figure__svg"
          :style="svgStyle(v.key)"
          :viewBox="viewBoxes[v.key]"
          aria-hidden="true"
          focusable="false"
        >
          <g>
            <path class="anat-figure__outline" :d="v.contorno" />
            <g
              v-for="grupo in v.grupos"
              :key="grupo.slug"
              class="mu"
              :class="muClass(grupo.slug, v.key)"
              :data-zona="grupo.slug"
              :data-vista="v.key"
              @click="onPick(grupo.slug, v.key)"
            >
              <path v-for="(path, i) in grupo.p" :key="i" :d="path[0]" />
            </g>
          </g>
        </svg>
        <figcaption v-if="view === 'both'" class="anat-figure__caption">{{ v.titulo }}</figcaption>
      </figure>
    </template>
    <div v-else class="anat-figure__empty" :style="{ height: `${maxHeight}px` }" />
  </div>
</template>

<script setup lang="ts">
/**
 * Fase 200 D7/D11: figura del admin (MIT, ELABBASSI Hicham, geometría de tv/recorrido).
 * No usa figuras.ts/index.ts de la TV (presupuesto del kiosco).
 *
 * Figura de hombre (A6 del RESEARCH). Pinta cada zona según su rol (`roles`), marca la zona
 * elegida (`selected`) y, con `interactive`, emite la zona tocada junto con la vista en la que se
 * tocó. La geometría se carga con `cargarAnatomia()` (import dinámico, chunk propio). Las partes
 * no musculares (pelo, cabeza, cuello, manos, pies, tobillos, rodillas) no se tocan.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { createLogger } from 'src/utils/logger';
import { cargarAnatomia } from 'src/tv/recorrido/anatomia';
import type { Anatomia, GrupoAnatomico } from 'src/tv/recorrido/anatomia';
import type { Rol } from 'src/types/anatomy';

type VistaKey = 'front' | 'back';

const props = withDefaults(
  defineProps<{
    view?: 'front' | 'back' | 'both';
    /** Clave `slug` o `slug@front` / `slug@back` (la específica gana). */
    roles?: Record<string, Rol>;
    selected?: string | null;
    interactive?: boolean;
    maxHeight?: number;
  }>(),
  {
    view: 'both',
    roles: () => ({}),
    selected: null,
    interactive: false,
    maxHeight: 520,
  }
);

const emit = defineEmits<{ 'select-zone': [slug: string, view: 'front' | 'back'] }>();

const log = createLogger('AnatomyFigure');

// Partes no musculares: color de piel, no tocables (mismo set que SKIP del sketch 019).
const NO_MUSCULARES = new Set(['hair', 'head', 'neck', 'hands', 'feet', 'ankles', 'knees']);
// Pelo y cabeza no se dibujan (el sketch también los filtra).
const NO_SE_DIBUJAN = new Set(['hair', 'head']);

const anatomia = ref<Anatomia | null>(null);
const viewBoxes = ref<Record<VistaKey, string | undefined>>({ front: undefined, back: undefined });
const svgs: Record<VistaKey, SVGSVGElement | null> = { front: null, back: null };

interface VistaFigura {
  key: VistaKey;
  titulo: string;
  contorno: string;
  grupos: GrupoAnatomico[];
}

const figura = computed<{ front: VistaFigura; back: VistaFigura } | null>(() => {
  const a = anatomia.value;
  if (!a) return null;
  const visibles = (g: GrupoAnatomico[]) => g.filter((x) => !NO_SE_DIBUJAN.has(x.slug));
  return {
    front: { key: 'front', titulo: 'Frente', contorno: a.mOutline[0], grupos: visibles(a.mFront) },
    back: { key: 'back', titulo: 'Espalda', contorno: a.mOutline[1], grupos: visibles(a.mBack) },
  };
});

const vistas = computed<VistaFigura[]>(() => {
  const f = figura.value;
  if (!f) return [];
  if (props.view === 'front') return [f.front];
  if (props.view === 'back') return [f.back];
  return [f.front, f.back];
});

function setSvg(key: VistaKey, el: unknown): void {
  svgs[key] = el instanceof SVGSVGElement ? el : null;
}

function rolDe(slug: string, vista: VistaKey): Rol | undefined {
  return props.roles[`${slug}@${vista}`] ?? props.roles[slug];
}

function muClass(slug: string, vista: VistaKey): Record<string, boolean> {
  const muscular = !NO_MUSCULARES.has(slug);
  const rol = muscular ? rolDe(slug, vista) : undefined;
  return {
    'mu--x': !muscular,
    'mu--motor': rol === 'motor',
    'mu--sinergista': rol === 'sinergista',
    'mu--estabilizador': rol === 'estabilizador',
    'mu--estira': rol === 'estira',
    'mu--antagonista': rol === 'antagonista',
    'mu--sel': muscular && props.selected === slug,
    'mu--hit': muscular && props.interactive,
  };
}

// D7: en vista única la figura ocupa el ancho disponible (Pitfall 8: zonas chicas tocables).
function svgStyle(key: VistaKey): Record<string, string> {
  const medido = viewBoxes.value[key] !== undefined;
  return {
    maxHeight: `${props.maxHeight}px`,
    width: '100%',
    // Hasta medir el viewBox se reserva el alto y la figura queda oculta.
    height: medido ? 'auto' : `${props.maxHeight}px`,
    visibility: medido ? 'visible' : 'hidden',
  };
}

function onPick(slug: string, vista: VistaKey): void {
  if (!props.interactive || NO_MUSCULARES.has(slug)) return;
  emit('select-zone', slug, vista);
}

// Como `fitFigures` del sketch: el viewBox sale del bbox real de la figura (+2 px de margen).
function medir(): void {
  for (const key of ['front', 'back'] as const) {
    if (viewBoxes.value[key] !== undefined) continue;
    const g = svgs[key]?.querySelector(':scope > g');
    if (!(g instanceof SVGGraphicsElement)) continue;
    try {
      const bb = g.getBBox();
      if (bb.width > 0) {
        viewBoxes.value[key] = `${bb.x - 2} ${bb.y - 2} ${bb.width + 4} ${bb.height + 4}`;
      }
    } catch (err: unknown) {
      // getBBox puede tirar si el SVG todavía no se renderizó: queda oculto y no rompe la pantalla.
      log.warn('No se pudo medir la figura', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function ajustar(): Promise<void> {
  await nextTick();
  medir();
}

onMounted(async () => {
  try {
    anatomia.value = await cargarAnatomia();
  } catch (err: unknown) {
    // Caja vacía del alto pedido: la pantalla sigue funcionando sin la figura.
    log.error('No se pudo cargar la figura anatómica', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  await ajustar();
});

// Al girar, el svg de la otra vista se monta recién ahora: hay que medirlo.
watch(
  () => props.view,
  async () => {
    if (anatomia.value) await ajustar();
  }
);
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.anat-figure {
  display: flex;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.anat-figure__view {
  flex: 1;
  min-width: 0;
  margin: 0;
  text-align: center;
}

.anat-figure__svg {
  display: block;
  overflow: visible;
}

.anat-figure__empty {
  width: 100%;
}

.anat-figure__caption {
  margin-top: 2px;
  font-size: 11px;
  color: $anat-ink-2;
}

.anat-figure__outline {
  fill: $anat-ol-fill;
  stroke: $anat-ol;
  stroke-width: 2;
}

// Músculo sin rol: color base
.mu path {
  fill: $anat-base;
  stroke: #fff;
  stroke-width: 1.2;
}

// Partes no musculares: piel
.mu--x path {
  fill: $anat-skip;
}

.mu--motor path {
  fill: $anat-r-motor;
}

.mu--sinergista path {
  fill: $anat-r-sinergista;
}

.mu--estabilizador path {
  fill: $anat-r-estabilizador;
}

// Se estira y antagonista: relleno claro con borde punteado terracota
.mu--estira path,
.mu--antagonista path {
  fill: $anat-r-estira;
  stroke: $anat-terra;
  stroke-width: 2.5;
  stroke-dasharray: 6 5;
}

// Zona elegida: borde oscuro sólido (gana al punteado)
.mu--sel path {
  stroke: $anat-ink;
  stroke-width: 4;
  stroke-dasharray: none;
}

.mu--hit {
  cursor: pointer;
}

.anat-figure--tap .mu--hit:hover path {
  filter: brightness(0.93);
}

@media (prefers-reduced-motion: no-preference) {
  .anat-figure__svg {
    transition: max-height 0.25s;
  }

  .mu path {
    transition: fill 0.15s;
  }
}
</style>
