<template>
  <div class="zona-alumno">
    <p class="zona-alumno__kicker">Zona</p>
    <h2 class="zona-alumno__ttl">{{ nombreZona }}</h2>

    <!-- "En esta clase" (Entrenar) va entre la zona y sus músculos -->
    <slot name="antes" />

    <p v-if="musculos.length === 0" class="zona-alumno__vacio">
      Todavía no hay detalle para esta zona.
    </p>

    <template v-else-if="elegido">
      <p class="zona-alumno__kicker zona-alumno__kicker--seccion">Músculos</p>
      <div class="zona-alumno__mus">
        <!-- Pills de los músculos: una fila que se desplaza. La elegida se funde con el globo. -->
        <div
          ref="filaEl"
          class="zona-alumno__fila"
          role="group"
          aria-label="Músculos de esta zona"
          @scroll.passive="alinearFlecha"
        >
          <button
            v-for="m in musculos"
            :key="m.id"
            type="button"
            class="zona-alumno__mus-pill"
            :class="{
              'zona-alumno__mus-pill--on': m.id === elegido.id,
              'zona-alumno__mus-pill--adentro': m.adentro,
            }"
            :aria-pressed="m.id === elegido.id"
            @click="elegir(m.id)"
          >
            <span>{{ m.nombre }}</span>
            <small v-if="m.adentro" class="zona-alumno__adentro">adentro</small>
          </button>
        </div>

        <!-- Globo: lo que hace el músculo elegido, con la flecha apuntando a su pill. -->
        <div
          ref="globoEl"
          class="zona-alumno__globo"
          :style="{ '--flecha-x': `${flechaX}px` }"
          aria-live="polite"
        >
          <p class="zona-alumno__hace">{{ textoQueHace(elegido) }}</p>
        </div>
      </div>

      <div
        v-for="g in grupos"
        :key="g.id"
        class="zona-alumno__gr"
        :class="`zona-alumno__gr--${g.id}`"
      >
        <button
          type="button"
          class="zona-alumno__gr-lbl"
          :class="{ 'zona-alumno__gr-lbl--on': estaAbierto(g.id) }"
          :aria-expanded="estaAbierto(g.id)"
          :aria-controls="defId(g.id)"
          @click="alternar(g.id)"
        >
          <span class="zona-alumno__swatch" aria-hidden="true" />
          <span>{{ g.frase }}</span>
          <span class="zona-alumno__i" aria-hidden="true">i</span>
        </button>
        <p v-if="estaAbierto(g.id)" :id="defId(g.id)" class="zona-alumno__gr-def">
          {{ g.definicion }}
        </p>
        <div class="zona-alumno__pills">
          <button
            v-for="r in g.rutas"
            :key="r.slug"
            type="button"
            class="zona-alumno__pill"
            @click="emit('open-ruta', r.slug)"
          >
            {{ r.nombre }}
          </button>
        </div>
      </div>
    </template>

    <slot name="despues" />

    <div class="zona-alumno__avisale">
      <q-icon name="record_voice_over" size="20px" class="zona-alumno__avisale-icon" />
      <span> ¿Te molesta o te duele acá? <b>Avisale a tu profe</b> antes de seguir. </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Fase 200 D14 + revisión 2026-10-23 (sketch 024 b · C): contenido de la hoja de una zona en tono
 * alumno. Arriba el kicker "N músculos" y el nombre de la zona; después una fila de pills con los
 * músculos (los de "más adentro" van al final, con borde punteado). Siempre hay uno elegido, el
 * principal: su explicación sale en un globo pegado a la pill (la flecha la sigue) y abajo van SUS
 * ejercicios en "Hace el movimiento en / Sostiene el movimiento en / Se estira en", con su (i) y las
 * rutas como pills que se abren con `open-ruta`. Arriba va la zona y siempre hay un músculo elegido
 * (también si es uno solo); el globo no repite su nombre, que ya está en la pill. Sin códigos de ruta ni contenido de profe: la vista de alumno ya viene
 * recortada del server. Todo el texto va con interpolación. Slots: `antes` ("Hoy en tu clase") y
 * `despues` ("Ver en Tus músculos ›"). La lógica de elegir/agrupar vive en `../utils/zonaSheet.ts`.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAnatomyStore } from '../stores/anatomyStore'
import type { GrupoAlumno, MusculoAlumno } from '../types'
import {
  gruposDelMusculo,
  musculoElegido,
  posicionFlecha,
  scrollParaPill,
  textoQueHace,
} from '../utils/zonaSheet'

const props = defineProps<{
  /** Slug de la zona tocada (todos sus músculos, los de adentro al final). */
  zona: string | null
}>()

const emit = defineEmits<{ 'open-ruta': [slug: string] }>()

const store = useAnatomyStore()

const musculos = computed<MusculoAlumno[]>(() =>
  props.zona !== null ? store.musculosDeZona(props.zona) : [],
)

const nombreZona = computed(() =>
  props.zona !== null ? (store.region(props.zona)?.nombre ?? '') : '',
)

// Músculo elegido: `null` = el principal. Al cambiar de zona vuelve al principal.
const seleccionId = ref<string | null>(null)
const elegido = computed(() => musculoElegido(musculos.value, seleccionId.value))

const grupos = computed(() =>
  elegido.value
    ? gruposDelMusculo(elegido.value, store.vista?.grupos ?? [], (slug) => store.ruta(slug))
    : [],
)

// ─── Flecha del globo: apunta al centro de la pill elegida ───────────────
const filaEl = ref<HTMLElement | null>(null)
const globoEl = ref<HTMLElement | null>(null)
const flechaX = ref(40)

function pillElegida(): HTMLElement | null {
  return filaEl.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null
}

function alinearFlecha(): void {
  const pill = pillElegida()
  const globo = globoEl.value
  if (!pill || !globo) return
  const p = pill.getBoundingClientRect()
  const g = globo.getBoundingClientRect()
  flechaX.value = posicionFlecha(p, g)
}

/** La pill elegida se corre al principio de la fila (p. ej. el músculo de adentro, que va último). */
function mostrarPillElegida(): void {
  const pill = pillElegida()
  const fila = filaEl.value
  if (!pill || !fila || typeof fila.scrollTo !== 'function') return
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  fila.scrollTo({
    left: scrollParaPill(
      fila.scrollLeft,
      pill.getBoundingClientRect().left,
      fila.getBoundingClientRect().left,
      parseFloat(getComputedStyle(fila).paddingLeft) || 0,
    ),
    behavior: reducido ? 'auto' : 'smooth',
  })
}

function elegir(id: string): void {
  seleccionId.value = id
}

// (i) desplegados: clave = grupo. Al cambiar de zona o de músculo se pliegan.
const abiertos = ref<ReadonlySet<GrupoAlumno>>(new Set())

// Cambió de zona: vuelve al principal.
watch(
  () => props.zona,
  () => {
    seleccionId.value = null
  },
)

// Tras cada cambio de músculo o de zona: pliega las (i), deja la pill a la vista y la flecha apuntándole.
watch(
  () => [props.zona, elegido.value?.id],
  async () => {
    abiertos.value = new Set()
    await nextTick()
    mostrarPillElegida()
    alinearFlecha()
  },
)

onMounted(() => {
  void nextTick(alinearFlecha)
})

function defId(grupo: GrupoAlumno): string {
  return `zona-alumno-def-${elegido.value?.id ?? 'x'}-${grupo}`
}

function estaAbierto(grupo: GrupoAlumno): boolean {
  return abiertos.value.has(grupo)
}

function alternar(grupo: GrupoAlumno): void {
  const siguiente = new Set(abiertos.value)
  if (siguiente.has(grupo)) siguiente.delete(grupo)
  else siguiente.add(grupo)
  abiertos.value = siguiente
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

// Kicker en sans bold (como el rol de los bloques), no Cinzel: se lee mejor sobre la hoja blanca.
.zona-alumno__kicker {
  @include pd-role-label;
  margin: 0;
  font-size: 11.5px;
  letter-spacing: 0.1em;

  &--seccion {
    margin-top: 14px;
  }
}

.zona-alumno__ttl {
  margin: 6px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: $pd-ink;
}

.zona-alumno__vacio {
  margin: 14px 0 0;
  font-family: 'Geologica', sans-serif;
  font-size: 14.5px;
  line-height: 1.45;
  color: $pd-ink-2;
}

.zona-alumno__mus {
  margin-top: 12px;
}

// Fila de pills de músculos: se desplaza sin barra; se estira a los bordes de la hoja.
.zona-alumno__fila {
  display: flex;
  gap: 6px;
  margin: 0 -18px;
  padding: 0 18px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.zona-alumno__mus-pill {
  @include pd-hit-44;
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid $pd-light-edge;
  border-radius: 999px;
  background: #fff;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 13.5px;
  color: $pd-ink-2;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

// La elegida se funde con el globo: mismo fondo arena.
.zona-alumno__mus-pill--on {
  border-color: #f3ede4;
  background: #f3ede4;
  color: $pd-ink;
}

// Los que no se ven: borde punteado y marca "adentro".
.zona-alumno__mus-pill--adentro {
  border-style: dashed;
}

.zona-alumno__adentro {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $pd-terra-ink;
}

.zona-alumno__globo {
  --flecha-x: 40px;
  position: relative;
  margin-top: 9px;
  padding: 11px 13px 12px;
  border-radius: 14px;
  background: #f3ede4;

  // Flecha que apunta a la pill elegida y la sigue
  &::before {
    content: '';
    position: absolute;
    top: -8px;
    left: calc(var(--flecha-x) - 9px);
    border: 9px solid transparent;
    border-top: 0;
    border-bottom-color: #f3ede4;
  }
}

.zona-alumno__hace {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 15px;
  line-height: 1.45;
  color: $pd-ink;
}

.zona-alumno__gr {
  margin: 10px 0 8px;
}

.zona-alumno__gr-lbl {
  @include pd-hit-44;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border: 0;
  background: none;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 13px;
  color: $pd-ink-2;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

.zona-alumno__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  box-sizing: border-box;
}

.zona-alumno__gr--fuerte .zona-alumno__swatch {
  background: linear-gradient(135deg, $fig-lit-a, $fig-lit-b);
}

.zona-alumno__gr--sostiene .zona-alumno__swatch {
  background: $fig-sost;
  border: 1px solid $fig-lit2-edge;
}

.zona-alumno__gr--estira .zona-alumno__swatch {
  background: $fig-estira;
  border: 1.5px dashed $fig-estira-edge;
}

.zona-alumno__i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border: 1.3px solid $pd-terra-ink;
  border-radius: 50%;
  font:
    italic 600 10px/1 Georgia,
    serif;
  color: $pd-terra-ink;
}

.zona-alumno__gr-lbl--on .zona-alumno__i {
  background: $pd-terra-ink;
  color: #fff;
}

.zona-alumno__gr-def {
  margin: 4px 0 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f3ede4;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: $pd-ink-2;
}

.zona-alumno__pills {
  display: flex;
  flex-wrap: wrap;
  margin: 2px -3px 0;
}

.zona-alumno__pill {
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

.zona-alumno__avisale {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: #f6efe6;
  font-family: 'Geologica', sans-serif;
  font-size: 13.5px;
  line-height: 1.4;
  color: $pd-ink;
}

.zona-alumno__avisale-icon {
  flex: none;
  color: $pd-terra-ink;
}
</style>
