<template>
  <CqSky class="cq-levels">
    <CqPageHeader
      title="EL CAMINO"
      subtitle="La leyenda de Milón de Crotona"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <p class="cq-levels__legend">
      Milón cargó un ternero todos los días. El ternero creció, y Milón con él, hasta cargar un
      toro.
    </p>

    <div class="cq-caps cq-rule">Tres niveles, un método</div>

    <div
      v-for="lv in LEVELS"
      :key="lv"
      class="cq-levels__lvl"
      :class="{ 'cq-levels__lvl--on': lv === currentLevel }"
    >
      <CqLevelIcon :level="lv" :size="58" />
      <div class="cq-levels__text">
        <div class="cq-caps">{{ LEVEL_INFO[lv].kicker }}</div>
        <b class="cq-levels__name">
          {{ LEVEL_INFO[lv].name }}
          <span v-if="lv === currentLevel" class="cq-levels__tag">Tu nivel</span>
        </b>
        <p>{{ LEVEL_INFO[lv].text }}</p>
      </div>
    </div>

    <div class="cq-sub cq-levels__note">
      En los tres niveles la sesión es la misma: 3 ejercicios × 3 series.
    </div>

    <div class="cq-grow" />

    <CqCloudButton label="Volver al inicio" @click="goBack" />
  </CqSky>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { LEVEL_INFO } from '../utils/format'
import type { Level } from '../types'
import CqSky from '../components/brand/CqSky.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqLevelIcon from '../components/brand/CqLevelIcon.vue'
import CqCloudButton from '../components/brand/CqCloudButton.vue'

// Fase 201 D-22, §7.1 Niveles: la leyenda de Milón y los tres niveles; el del alumno va marcado
// "Tu nivel". Se abre desde Inicio; si se entra directo (recarga) pide el estado una vez.
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
.cq-levels.cq-sky {
  // Alto de la pantalla menos el header y la barra de abajo (igual que la vidriera de Entrenar)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-levels__legend {
  margin: 0;
  font-family: var(--cq-display);
  font-style: italic;
  font-size: 20px;
  line-height: 1.3;
  text-align: center;
  text-wrap: balance;
  color: var(--cq-cream);
}

.cq-levels__lvl {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--cq-hair2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.035));
  color: var(--cq-muted);

  &--on {
    border-color: var(--cq-gold);
    color: var(--cq-gold-hi);
    box-shadow: 0 0 30px rgba(253, 241, 208, 0.12);
  }

  p {
    margin: 3px 0 0;
    font-size: 13px;
    color: var(--cq-muted);
  }
}

.cq-levels__text {
  min-width: 0;
}

.cq-levels__name {
  display: block;
  font-family: var(--cq-display);
  font-size: 25px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--cq-cream);
}

.cq-levels__tag {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cq-sun);
  color: var(--cq-ink);
  font-family: var(--cq-body);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  vertical-align: middle;
}

.cq-levels__note {
  text-align: center;
}
</style>
