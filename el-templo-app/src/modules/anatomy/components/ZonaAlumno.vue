<template>
  <div class="zona-alumno">
    <slot name="antes" />

    <p class="zona-alumno__kicker">{{ kicker }}</p>
    <h2 class="zona-alumno__ttl">{{ titulo }}</h2>

    <p v-if="musculos.length === 0" class="zona-alumno__vacio">
      Todavía no hay detalle para esta zona.
    </p>

    <section v-for="m in musculos" :key="m.id" class="zona-alumno__mus">
      <h3 v-if="musculos.length > 1" class="zona-alumno__mus-ttl">{{ m.nombre }}</h3>
      <p class="zona-alumno__hace">{{ m.queHace }}</p>

      <div
        v-for="g in gruposDe(m)"
        :key="g.id"
        class="zona-alumno__gr"
        :class="`zona-alumno__gr--${g.id}`"
      >
        <button
          type="button"
          class="zona-alumno__gr-lbl"
          :class="{ 'zona-alumno__gr-lbl--on': estaAbierto(m.id, g.id) }"
          :aria-expanded="estaAbierto(m.id, g.id)"
          :aria-controls="defId(m.id, g.id)"
          @click="alternar(m.id, g.id)"
        >
          <span class="zona-alumno__swatch" aria-hidden="true" />
          <span>{{ g.frase }}</span>
          <span class="zona-alumno__i" aria-hidden="true">i</span>
        </button>
        <p v-if="estaAbierto(m.id, g.id)" :id="defId(m.id, g.id)" class="zona-alumno__gr-def">
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
    </section>

    <slot name="despues" />

    <div class="zona-alumno__avisale">
      <q-icon name="record_voice_over" size="20px" class="zona-alumno__avisale-icon" />
      <span> ¿Te molesta o te duele acá? <b>Avisale a tu profe</b> antes de seguir. </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Fase 200 D14 (sketch 020 `alumno-ui.js` zonaAlumno / musAlumno): contenido de la hoja de Tu cuerpo
 * en tono alumno. Por músculo: qué hace en una frase y los tres grupos (trabaja fuerte · te sostiene ·
 * se estira) con su (i) y las rutas como pills que se abren con `open-ruta`. Sin códigos de ruta ni
 * contenido de profe: la vista de alumno ya viene recortada del server. Todo el texto va con
 * interpolación. Slots: `antes` ("Hoy en tu clase", plan 16) y `despues` ("Ver en Tu cuerpo ›").
 */
import { computed, ref, watch } from 'vue'
import { useAnatomyStore } from '../stores/anatomyStore'
import type { GrupoAlumno, MusculoAlumno, RutaAlumno } from '../types'

const props = defineProps<{
  /** Slug de la zona tocada (todos sus músculos). */
  zona: string | null
  /** Un músculo puntual (los que no se ven, o venir desde una ruta): gana a `zona`. */
  musculoId: string | null
}>()

const emit = defineEmits<{ 'open-ruta': [slug: string] }>()

const store = useAnatomyStore()

// Orden fijo de los grupos: primero lo que más trabaja.
const ORDEN_GRUPOS: readonly GrupoAlumno[] = ['fuerte', 'sostiene', 'estira']

interface GrupoVisible {
  id: GrupoAlumno
  frase: string
  definicion: string
  rutas: { slug: string; nombre: string }[]
}

const musculos = computed<MusculoAlumno[]>(() => {
  if (props.musculoId !== null) {
    const m = store.musculo(props.musculoId)
    return m ? [m] : []
  }
  return props.zona !== null ? store.musculosDeZona(props.zona) : []
})

const kicker = computed(() => {
  if (props.zona !== null) return store.region(props.zona)?.nombre ?? ''
  const zonaDelMusculo = musculos.value[0]?.zona
  if (zonaDelMusculo) return store.region(zonaDelMusculo.slug)?.nombre ?? ''
  return 'Más adentro'
})

const titulo = computed(() => {
  if (musculos.value.length > 1) return `${musculos.value.length} músculos en esta zona`
  return musculos.value[0]?.nombre ?? kicker.value
})

/** Grupos con rutas de un músculo, en orden; un músculo sin rutas no muestra ninguno. */
function gruposDe(m: MusculoAlumno): GrupoVisible[] {
  const visibles: GrupoVisible[] = []
  for (const id of ORDEN_GRUPOS) {
    const rutas = m.grupos[id]
      .map((slug) => store.ruta(slug))
      .filter((r): r is RutaAlumno => r !== null)
      .map((r) => ({ slug: r.slug, nombre: r.nombre }))
    const info = store.vista?.grupos.find((g) => g.id === id)
    if (rutas.length > 0 && info) {
      visibles.push({ id, frase: info.frase, definicion: info.definicion, rutas })
    }
  }
  return visibles
}

// (i) desplegados: clave `músculo:grupo`. Al cambiar de zona o de músculo se pliegan.
const abiertos = ref<ReadonlySet<string>>(new Set())

watch(
  () => [props.zona, props.musculoId],
  () => {
    abiertos.value = new Set()
  },
)

function clave(musculoId: string, grupo: GrupoAlumno): string {
  return `${musculoId}:${grupo}`
}

function defId(musculoId: string, grupo: GrupoAlumno): string {
  return `zona-alumno-def-${musculoId}-${grupo}`
}

function estaAbierto(musculoId: string, grupo: GrupoAlumno): boolean {
  return abiertos.value.has(clave(musculoId, grupo))
}

function alternar(musculoId: string, grupo: GrupoAlumno): void {
  const siguiente = new Set(abiertos.value)
  const k = clave(musculoId, grupo)
  if (siguiente.has(k)) siguiente.delete(k)
  else siguiente.add(k)
  abiertos.value = siguiente
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

.zona-alumno__kicker {
  @include pd-kicker-light;
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
  padding: 14px 0 6px;
  border-top: 1px solid $pd-light-line;

  &:first-of-type {
    border-top: 0;
  }
}

.zona-alumno__mus-ttl {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: $pd-ink;
}

.zona-alumno__hace {
  margin: 4px 0 8px;
  font-family: 'Geologica', sans-serif;
  font-size: 14.5px;
  line-height: 1.45;
  color: $pd-ink;
}

.zona-alumno__gr {
  margin: 6px 0 8px;
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
