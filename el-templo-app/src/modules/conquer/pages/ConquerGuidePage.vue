<template>
  <div class="cq-root cq-guide" role="region" aria-label="Cómo funciona Conquer">
    <template v-if="ready && screen">
      <div class="cq-guide__top">
        <div class="cq-guide__bars" :style="barsStyle" aria-hidden="true">
          <i
            v-for="(item, i) in screens"
            :key="item.key"
            class="cq-guide__bar"
            :class="{ 'cq-guide__bar--on': i <= index }"
          />
        </div>
        <button
          type="button"
          class="cq-guide__skip"
          :class="{ 'cq-guide__skip--hidden': last }"
          :disabled="finishing"
          @click="finish"
        >
          Saltar
        </button>
      </div>

      <div ref="bodyEl" class="cq-guide__body">
        <p class="cq-kicker cq-guide__kicker">
          ¿Cómo funciona? · {{ index + 1 }} de {{ screens.length }}
        </p>
        <h2 ref="titleEl" class="cq-guide__title" tabindex="-1">{{ screen.title }}</h2>
        <CqGuideRuns class="cq-guide__lead" :runs="screen.lead" />
        <div class="cq-guide__art" role="img" :aria-label="screen.artLabel">
          <CqGuideArt :screen="screen.key" :level="level" />
        </div>
        <CqGuideRuns v-if="screen.foot.length > 0" class="cq-guide__foot" :runs="screen.foot" />
        <CqGuideRuns v-if="last" class="cq-guide__foot" :runs="REVISIT_NOTE" />
      </div>

      <div class="cq-guide__nav">
        <div class="cq-guide__back" :class="{ 'cq-guide__back--hidden': index === 0 }">
          <CqButton label="Atrás" variant="ghost-night" :disabled="finishing" @click="prev" />
        </div>
        <CqButton
          :label="last ? 'Listo, a entrenar' : 'Siguiente'"
          variant="on-night"
          :loading="last && finishing"
          :disabled="finishing"
          @click="next"
        />
      </div>
    </template>

    <div v-else class="cq-guide__wait" role="status" aria-live="polite">
      <span class="cq-guide__spin" aria-hidden="true" />
      <span>Cargando</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { guideScreens } from '../utils/guide'
import type { GuideRun } from '../utils/guide'
import type { Level } from '../types'
import CqButton from '../components/brand/CqButton.vue'
import CqGuideArt from '../components/guide/CqGuideArt.vue'
import CqGuideRuns from '../components/guide/CqGuideRuns.vue'
import '../styles/conquer.scss'

// Fase 201 DA-23, DA-26, DA-27 (hallazgo 1 del UAT): la guía "¿Cómo funciona?", una pieza oscura a
// pantalla completa (sketch 022 B). Es una PÁGINA y no un diálogo de Quasar: los diálogos se
// teletransportan fuera de `.cq-root` (pierden los tokens) y la página deja el "atrás" del sistema. La dispara la tab Conquer una vez después
// del día 0 (`view === 'guia'`) y Inicio la vuelve a abrir (201-30), sin llamar al API.
const TAB_ROUTE = { path: '/training', query: { tab: 'conquer' } }

// Última pantalla: dónde volver a verla
const REVISIT_NOTE: GuideRun[] = [
  { text: 'La volvés a ver cuando quieras en Inicio › ' },
  { text: '¿Cómo funciona?', strong: true },
]

const router = useRouter()
const store = useConquerStore()

const index = ref(0)
const ready = ref(false)
const finishing = ref(false)
const bodyEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)

const member = computed(() => store.state?.member ?? null)
const level = computed<Level | null>(() => member.value?.level ?? null)
const screens = computed(() => guideScreens(level.value))
const screen = computed(() => screens.value[index.value] ?? null)
const last = computed(() => index.value === screens.value.length - 1)
const barsStyle = computed(() => ({
  gridTemplateColumns: `repeat(${screens.value.length}, minmax(0, 1fr))`,
}))

/** Cambia de pantalla, vuelve el scroll arriba y lleva el foco al título (lectores de pantalla). */
async function go(to: number): Promise<void> {
  if (to < 0 || to >= screens.value.length) return
  index.value = to
  await nextTick()
  if (bodyEl.value) bodyEl.value.scrollTop = 0
  titleEl.value?.focus()
}

function prev(): void {
  void go(index.value - 1)
}

function next(): void {
  if (last.value) void finish()
  else void go(index.value + 1)
}

/**
 * Cierra la guía (Listo o Saltar, DA-26): si el API todavía no la tiene vista la marca (el store la
 * marca en memoria aunque falle, T-201-106) y vuelve a la tab. Si ya estaba vista (entró desde
 * Inicio) no llama al API. `finishing` frena el doble toque (T-201-107).
 */
async function finish(): Promise<void> {
  if (finishing.value) return
  finishing.value = true
  try {
    if (member.value?.guideSeen === false) await store.markGuideSeen()
    await router.replace(TAB_ROUTE)
  } finally {
    finishing.value = false
  }
}

// Abierta en frío (recarga o enlace) el estado puede no estar: se pide una vez. Sin alumno activo no
// hay guía que mostrar y la tab explica el motivo (Bloqueado, pedido o error de carga, lección 201-20).
onMounted(async () => {
  if (!store.state) await store.loadState()
  if (store.view === 'bloqueado' || store.view === 'pedido' || store.view === 'cargando') {
    await router.replace(TAB_ROUTE)
    return
  }
  ready.value = true
})

onBeforeUnmount(() => {
  store.cleanup()
})
</script>

<style scoped lang="scss">
.cq-guide {
  // Alto del área de contenido (como la vidriera de Entrenar): el cuerpo hace scroll adentro y los
  // botones quedan siempre a la vista
  height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--cq-night);
  color: var(--cq-on-night);
}

// Sobre azul noche el aro de foco es dorado claro; el título (foco por código) no necesita aro
.cq-guide :deep(:focus-visible) {
  outline-color: var(--cq-on-night-hi);
}

.cq-guide__top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 8px 0 16px;
}

.cq-guide__bars {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}

.cq-guide__bar {
  height: 4px;
  border-radius: 4px;
  background: var(--cq-night-2);
}

.cq-guide__bar--on {
  background: var(--cq-on-night-hi);
}

.cq-guide__skip {
  flex: none;
  min-width: 64px;
  min-height: 44px;
  border: 0;
  background: none;
  color: var(--cq-on-night);
  font-family: var(--cq-font-body);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

// En la última pantalla no hay nada que saltar (el lugar se conserva para que la barra no se mueva)
.cq-guide__skip--hidden {
  visibility: hidden;
}

.cq-guide__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: 10px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.cq-guide .cq-guide__kicker {
  color: var(--cq-on-night-gold);
}

.cq-guide__title {
  margin: 0;
  font-family: var(--cq-font-head);
  font-weight: 700;
  font-size: 28px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--cq-on-night-hi);
  text-wrap: balance;
  overflow-wrap: anywhere;

  &:focus {
    outline: none;
  }
}

.cq-guide__lead {
  font-size: 16px;
  line-height: 1.45;
  color: var(--cq-on-night);
}

.cq-guide__foot {
  font-size: 14px;
  line-height: 1.45;
  color: var(--cq-on-night-2);
}

// La ilustración es la card blanca de la guía (sketch `.ill`)
.cq-guide__art {
  min-width: 0;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--cq-line);
  background: var(--cq-surface);
}

.cq-guide__nav {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 10px;
  padding: 12px 20px 22px;
}

.cq-guide__back {
  min-width: 0;
}

// En la primera pantalla no hay "Atrás": se oculta sin sacar el lugar
.cq-guide__back--hidden {
  visibility: hidden;
}

.cq-guide__wait {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 13px;
  color: var(--cq-on-night-2);
}

.cq-guide__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--cq-on-night-hi);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-guide__spin {
    animation: cq-guide-spin 0.8s linear infinite;
  }
}

@keyframes cq-guide-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
