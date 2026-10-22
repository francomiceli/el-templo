<template>
  <CqScreen class="cq-levels">
    <CqPageHeader
      title="El camino"
      subtitle="La leyenda de Milón de Crotona"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div class="cq-card">
      <div class="cq-meander" aria-hidden="true" />
      <p class="cq-levels__legend">{{ CQ_TEXTOS.leyenda_milon }}</p>
    </div>

    <h2 class="cq-block-title">Tres niveles, un método</h2>

    <div
      v-for="lv in LEVELS"
      :key="lv"
      class="cq-card cq-levels__lvl"
      :class="{ 'cq-dark': lv === currentLevel }"
    >
      <CqLevelIcon :level="lv" :size="48" />
      <div class="cq-levels__text">
        <p class="cq-kicker">{{ LEVEL_INFO[lv].kicker }}</p>
        <h3 class="cq-levels__name">
          {{ LEVEL_INFO[lv].name }}
          <span v-if="lv === currentLevel" class="cq-chip cq-levels__tag">Tu nivel</span>
        </h3>
        <p class="cq-levels__body">{{ LEVEL_INFO[lv].text }}</p>
      </div>
    </div>

    <p class="cq-sub cq-levels__note">
      En los tres niveles la sesión es la misma: 3 ejercicios × 3 series.
    </p>

    <CqButton label="Volver al inicio" variant="secondary" @click="goBack" />
  </CqScreen>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { CQ_TEXTOS, LEVEL_INFO } from '../utils/format'
import type { Level } from '../types'
import CqScreen from '../components/brand/CqScreen.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqLevelIcon from '../components/brand/CqLevelIcon.vue'
import CqButton from '../components/brand/CqButton.vue'

// Fase 201 D-22, DA-30, §7.1 Niveles: la leyenda de Milón y los tres niveles; el del alumno es la
// pieza oscura de la pantalla y va marcado "Tu nivel". Se abre desde Inicio; si se entra directo
// (recarga) pide el estado una vez.
const LEVELS: readonly Level[] = ['ternero', 'novillo', 'toro']
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }

const router = useRouter()
const store = useConquerStore()

const currentLevel = computed<Level | null>(() => store.state?.member?.level ?? null)

function goBack(): void {
  void router.push(BACK_TO)
}

onMounted(() => {
  if (!store.state) void store.loadState()
})

onUnmounted(() => {
  store.cleanup()
})
</script>

<style scoped lang="scss">
.cq-levels__legend {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  text-wrap: pretty;
  color: var(--cq-text);
}

// Una card por nivel: ícono a la izquierda y texto a la derecha (la card base es una columna)
.cq-levels__lvl.cq-card {
  flex-direction: row;
  align-items: center;
  gap: 14px;
}

.cq-levels__text {
  flex: 1;
  min-width: 0;
}

.cq-levels__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 2px 0 0;
  font-family: var(--cq-font-head);
  font-weight: 800;
  font-size: 22px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--cq-night);
}

.cq-levels__body {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--cq-text-2);
}

// En la card del alumno (oscura) todo el texto pasa a los tonos de la pieza oscura
.cq-dark .cq-levels__name {
  color: var(--cq-on-night-hi);
}

.cq-dark .cq-levels__body {
  color: var(--cq-on-night);
}

// Chip "Tu nivel": crema con texto azul noche (la regla doble le gana a `.cq-chip`)
.cq-levels__tag.cq-chip {
  height: 24px;
  padding: 0 10px;
  background: var(--cq-tint-cream);
  color: var(--cq-night);
  font-size: 11.5px;
  letter-spacing: 0;
}

.cq-levels__note {
  text-align: center;
}
</style>
