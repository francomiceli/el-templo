<template>
  <q-page class="ficha">
    <div class="ficha__top">
      <button type="button" class="ficha__back" @click="volver">
        <q-icon name="chevron_left" size="22px" aria-hidden="true" />
        <span>Tus músculos</span>
      </button>
    </div>

    <div class="ficha__scroll">
      <div v-if="!store.vista && !store.error" class="ficha__estado">
        <TemploLoader />
      </div>

      <div v-else-if="!store.vista" class="ficha__estado">
        <p class="ficha__aviso">{{ store.error }}</p>
        <button type="button" class="ficha__btn" @click="reintentar">Reintentar</button>
      </div>

      <div v-else-if="!ruta" class="ficha__estado">
        <p class="ficha__aviso">No encontramos este ejercicio</p>
        <button type="button" class="ficha__btn" @click="irATuCuerpo">Volver a Tus músculos</button>
      </div>

      <article v-else class="ficha__body">
        <!-- Una card blanca por sección (sketch 023, ficha A): el texto nunca queda suelto sobre el crema -->
        <section class="ficha__card">
          <p class="ficha__kicker">{{ patronLegible }}</p>
          <h2 class="ficha__ttl">{{ ruta.nombre }}</h2>
          <p v-if="ruta.fichaCorta?.que" class="ficha__que">{{ ruta.fichaCorta.que }}</p>
        </section>

        <section class="ficha__card">
          <div class="ficha__fig">
            <BodyFigure side="both" :lit="[]" :roles="roles" :height="230" />
          </div>
          <div class="ficha__leg">
            <span class="ficha__leg-item ficha__leg-item--fuerte">Hace el movimiento</span>
            <span v-if="ruta.sostiene.length > 0" class="ficha__leg-item ficha__leg-item--sostiene">
              Sostiene el movimiento
            </span>
          </div>

          <h3 class="ficha__h ficha__h--tras-fig">Hace el movimiento</h3>
          <p class="ficha__p">{{ fuerteTexto }}</p>

          <template v-if="ruta.sostiene.length > 0">
            <h3 class="ficha__h ficha__h--sep">Sostiene el movimiento</h3>
            <p class="ficha__p">{{ ruta.sostiene.join(' · ') }}</p>
          </template>
        </section>

        <section v-if="siente" class="ficha__card">
          <h3 class="ficha__h">Dónde lo tenés que sentir</h3>
          <p class="ficha__p">{{ siente }}</p>
        </section>

        <section v-if="tips.length > 0" class="ficha__card">
          <h3 class="ficha__h">Tips</h3>
          <ul class="ficha__list">
            <li v-for="(tip, i) in tips" :key="i">{{ tip }}</li>
          </ul>
        </section>

        <section v-if="errores.length > 0" class="ficha__card">
          <h3 class="ficha__h">Errores comunes</h3>
          <div class="ficha__errores">
            <div v-for="(e, i) in errores" :key="i" class="ficha__error">
              <b>{{ e.error }}</b>
              {{ e.texto }}
            </div>
          </div>
        </section>

        <div v-if="sinSecciones" class="ficha__pronto">
          Pronto: dónde se siente, tips y errores comunes.
        </div>

        <div class="ficha__avisale">
          <q-icon name="record_voice_over" size="20px" class="ficha__avisale-icon" />
          <span>Si algo te duele, <b>avisale a tu profe</b>.</span>
        </div>
      </article>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D15 (sketch 020 `rutaAlumno`) + revisión 2026-10-23 (sketch 023, ficha A): ficha corta de un
 * ejercicio en tono alumno, una card blanca por sección. Qué es, el cuerpo pintado (hace el movimiento /
 * sostiene el movimiento), dónde se siente, tips y errores comunes. Las secciones sin
 * contenido (`null`) se omiten; sin nada de eso va "Pronto". La vista de alumno ya viene sin códigos de
 * ruta ni contenido de profe. Todo el texto va con interpolación. El `:slug` se resuelve contra el
 * store: si no existe, "No encontramos este ejercicio".
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TemploLoader from 'src/components/TemploLoader.vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { useAnatomyStore } from '../stores/anatomyStore'
import type { PatronRuta, RutaAlumno } from '../types'

type Rol = 'fuerte' | 'sostiene'

// Patrón de movimiento en palabras de alumno (no el código del API).
const PATRON_LEGIBLE: Readonly<Record<PatronRuta, string>> = {
  PUSH: 'Push',
  PULL: 'Pull',
  LOWER: 'Piernas',
  CORE: 'Core',
  MOVILIDAD: 'Movilidad',
  FLOW: 'Flow',
}

const store = useAnatomyStore()
const route = useRoute()
const router = useRouter()

const ruta = computed<RutaAlumno | null>(() => {
  const slug = route.params.slug
  return typeof slug === 'string' ? store.ruta(slug) : null
})

const patronLegible = computed(() => (ruta.value ? PATRON_LEGIBLE[ruta.value.patron] : ''))

const fuerteTexto = computed(() => {
  const nombres = ruta.value?.fuerte ?? []
  return nombres.length > 0 ? nombres.join(' · ') : '—'
})

// Roles de la figura: clave `slug@vista`. El API ya resuelve fuerte > sostiene por (zona, vista)
// y no manda `both` (WR-01); si llegara una, se abre en frente y espalda.
// Si una misma clave llega con dos grupos, gana "fuerte".
const roles = computed<Record<string, Rol>>(() => {
  const out: Record<string, Rol> = {}
  for (const z of ruta.value?.zonas ?? []) {
    const vistas = z.vista === 'both' ? (['front', 'back'] as const) : [z.vista]
    for (const v of vistas) {
      const clave = `${z.slug}@${v}`
      if (out[clave] !== 'fuerte') out[clave] = z.grupo
    }
  }
  return out
})

const siente = computed(() => ruta.value?.fichaCorta?.siente ?? null)
const tips = computed(() => ruta.value?.fichaCorta?.tips ?? [])
const errores = computed(() => ruta.value?.fichaCorta?.errores ?? [])

// Sin ficha corta, o con la ficha vacía: "Pronto".
const sinSecciones = computed(
  () => siente.value === null && tips.value.length === 0 && errores.value.length === 0,
)

/** ¿Hay una pantalla anterior dentro de la app? (vue-router guarda `back` en history.state). */
function hayPantallaAnterior(): boolean {
  const st: unknown = window.history.state
  return typeof st === 'object' && st !== null && 'back' in st && typeof st.back === 'string'
}

function irATuCuerpo(): void {
  void router.push({ name: 'tu-cuerpo' })
}

function volver(): void {
  if (hayPantallaAnterior()) router.back()
  else irATuCuerpo()
}

function reintentar(): void {
  void store.cargar()
}

onMounted(() => {
  void store.cargar()
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

.ficha {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: $brand-cream;
}

.ficha__top {
  flex: none;
  display: flex;
  align-items: center;
  height: 50px;
  padding: 0 8px;
  background: $brand-cream;
  border-bottom: 1px solid $pd-light-line;
}

.ficha__back {
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

.ficha__scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.ficha__estado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
}

.ficha__aviso {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 15px;
  text-align: center;
  color: $pd-ink-2;
}

.ficha__btn {
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

.ficha__body {
  padding: 6px 14px 30px;
  font-family: 'Geologica', sans-serif;
  color: $pd-ink;
}

// Una card blanca por sección
.ficha__card {
  padding: 14px 16px;
  border: 1px solid $pd-light-line;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(150, 89, 58, 0.06);

  & + & {
    margin-top: 12px;
  }
}

// Kicker del patrón ("PUSH", "PULL") en sans bold, como el rol de los bloques: no Cinzel
.ficha__kicker {
  @include pd-role-label;
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.1em;
}

.ficha__ttl {
  margin: 6px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: $pd-ink;
  overflow-wrap: anywhere;
}

.ficha__que {
  margin: 8px 0 0;
  font-size: 15px;
  line-height: 1.5;
  color: $pd-ink-2;
}

.ficha__fig {
  margin-top: 4px;
}

.ficha__leg {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 6px;
  font-size: 12.5px;
  color: $pd-ink-2;
}

.ficha__leg-item::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 5px;
  border-radius: 3px;
  box-sizing: border-box;
  vertical-align: -1px;
}

.ficha__leg-item--fuerte::before {
  background: linear-gradient(135deg, $fig-lit-a, $fig-lit-b);
}

.ficha__leg-item--sostiene::before {
  background: $fig-sost;
  border: 1px solid $fig-lit2-edge;
}

.ficha__h {
  margin: 0 0 6px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $pd-terra-ink;
}

// Debajo de la leyenda de la figura, y separando "Sostiene" de "Hace" dentro de la misma card
.ficha__h--tras-fig {
  margin-top: 12px;
}

.ficha__h--sep {
  margin-top: 14px;
}

.ficha__p {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}

.ficha__list {
  margin: 0;
  padding-left: 18px;
  font-size: 15px;
  line-height: 1.5;
}

// Errores: una fila por error, separadas por una línea (ya están dentro de su card)
.ficha__error {
  padding: 9px 0;
  border-top: 1px solid $pd-light-line;
  font-size: 14px;
  line-height: 1.4;

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }

  b {
    display: block;
  }
}

.ficha__pronto {
  margin-top: 12px;
  padding: 14px;
  border: 1px dashed $pd-light-edge;
  border-radius: 14px;
  background: #fff;
  font-size: 14px;
  text-align: center;
  color: $pd-ink-2;
}

.ficha__avisale {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: #f6efe6;
  font-size: 13.5px;
  line-height: 1.4;
}

.ficha__avisale-icon {
  flex: none;
  color: $pd-terra-ink;
}
</style>
