<template>
  <CqSky class="cq-progress">
    <CqPageHeader title="PROGRESO" :back-to="BACK_TO" back-label="Volver al inicio de Conquer" />

    <div v-if="!progress" class="cq-progress__center" role="status" aria-live="polite">
      <template v-if="error">
        <p class="cq-sub" role="alert">{{ error }}</p>
        <button type="button" class="cq-small cq-small--fill" @click="reload">Reintentar</button>
      </template>
      <template v-else>
        <span class="cq-progress__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando tu progreso</span>
      </template>
    </div>

    <template v-else>
      <div class="cq-progress__kpis">
        <div class="cq-progress__kpi">
          <b class="cq-num">{{ progress.sessionsCount }}</b>
          <span>sesiones</span>
        </div>
        <div class="cq-progress__kpi">
          <b class="cq-num">{{ accuracyText(progress.accuracy.pct) }}</b>
          <span>acierto del modelo</span>
          <small v-if="progress.accuracy.delta !== null" class="cq-num">
            Δ {{ deltaText(progress.accuracy.delta) }} en promedio
          </small>
        </div>
      </div>

      <div v-if="progress.sessionsCount === 0" class="cq-card cq-progress__empty">
        <p class="cq-sub">Todavía no hay sesiones cargadas. Cargá la primera en Hoy.</p>
        <router-link :to="{ name: 'conquer-hoy' }" class="cq-small cq-small--fill">
          Ir a Hoy
        </router-link>
      </div>

      <template v-else>
        <CqSubirCard
          v-if="progress.subir.length > 0 || progress.comboSubir.length > 0"
          :steps="progress.subir"
          :combos="progress.comboSubir"
          :busy-key="busyKey"
          @subir="onSubir"
          @subir-combo="onSubirCombo"
        />

        <div v-for="item in progress.calibrations" :key="item.exerciseId" class="cq-card">
          <div class="cq-caps">Calibración</div>
          <div class="cq-progress__calib-text">{{ calibrationText(item) }}</div>
          <div v-if="canResolveCalibration(item)" class="cq-progress__calib-actions">
            <button
              type="button"
              class="cq-small cq-small--fill"
              :disabled="busyKey !== null"
              :aria-busy="busyKey === calibrationKey(item.exerciseId) ? 'true' : undefined"
              @click="onCalibration(item.exerciseId, true)"
            >
              Aceptar
            </button>
            <button
              type="button"
              class="cq-small"
              :disabled="busyKey !== null"
              @click="onCalibration(item.exerciseId, false)"
            >
              Ahora no
            </button>
          </div>
        </div>

        <!-- D-13 b: BodyFigure mide con getBBox; se monta recién con los datos ya cargados -->
        <div class="cq-caps cq-rule">Tu semana</div>
        <div class="cq-card cq-progress__week">
          <CqBodyMap
            v-if="weekHasZones"
            :primary="progress.weekLighting.primary"
            :secondary="progress.weekLighting.secondary"
            :gender="gender"
            :height="230"
          />
          <p v-else class="cq-sub cq-progress__week-empty">
            Todavía no trabajaste ninguna zona esta semana.
          </p>
        </div>

        <div v-for="day in days" :key="day.dayKey" class="cq-card">
          <div class="cq-row">
            <h2 class="cq-display cq-progress__day">{{ day.label.toUpperCase() }}</h2>
            <span class="cq-sub">{{ sessionsText(day.sessionsCount) }}</span>
          </div>
          <CqExerciseProgress
            v-for="exercise in day.exercises"
            :key="exercise.exerciseId"
            :exercise="exercise"
          />
        </div>
      </template>
    </template>
  </CqSky>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useUserStore } from 'src/stores/useUserStore'
import { useConquerProgress } from '../composables/useConquerProgress'
import { calibrationText, canResolveCalibration } from '../utils/format'
import { accuracyText, calibrationKey, deltaText, sessionsText } from '../utils/progressView'
import type { ComboKey, CountedStep } from '../types'
import CqSky from '../components/brand/CqSky.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqBodyMap from '../components/CqBodyMap.vue'
import CqSubirCard from '../components/progress/CqSubirCard.vue'
import CqExerciseProgress from '../components/progress/CqExerciseProgress.vue'

// Fase 201 §7.1 Progreso, S12-5, S12-4, D-13 b: sesiones y acierto del modelo, "Hoy toca subir" con
// el botón Subir (sin aprobación del coach), las calibraciones pendientes, la figura de la semana
// (solo las zonas trabajadas, sin números ni rojo) y el detalle por ejercicio y escalón con la curva
// del E1. El app pinta lo que manda `GET /progress`: no recalcula nada.
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }

const $q = useQuasar()
const userStore = useUserStore()
const { progress, busyKey, error, load, subir, subirCombo, resolveCalibration, cleanup } =
  useConquerProgress()

const gender = computed(() => userStore.profile?.gender ?? null)

const weekHasZones = computed(() => {
  const lighting = progress.value?.weekLighting
  return !!lighting && lighting.primary.length + lighting.secondary.length > 0
})

// Un día sin ejercicios (p. ej. el sábado de Toro, que son combos) no tiene detalle por escalón
const days = computed(() => (progress.value?.days ?? []).filter((d) => d.exercises.length > 0))

function reload(): void {
  void load()
}

async function onSubir(exerciseId: number, step: CountedStep): Promise<void> {
  if (await subir(exerciseId, step))
    $q.notify({ type: 'positive', message: 'Subiste de progresión' })
}

async function onSubirCombo(comboKey: ComboKey): Promise<void> {
  if (await subirCombo(comboKey)) $q.notify({ type: 'positive', message: 'Subiste el combo' })
}

async function onCalibration(exerciseId: number, accept: boolean): Promise<void> {
  await resolveCalibration(exerciseId, accept)
}

// Los errores de las acciones van a un Notify con el texto que mandó el API (ya en español)
watch(error, (message) => {
  if (message && progress.value) $q.notify({ type: 'negative', message })
})

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
.cq-progress.cq-sky {
  // Alto de la pantalla menos el header y la barra de abajo (igual que Hoy)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-progress__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-progress__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--cq-gold);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-progress__spin {
    animation: cq-progress-spin 0.9s linear infinite;
  }
}

@keyframes cq-progress-spin {
  to {
    transform: rotate(360deg);
  }
}

.cq-progress__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.cq-progress__kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--cq-hair2);
  background: var(--cq-glass);
  text-align: center;

  b {
    font-family: var(--cq-display);
    font-size: 26px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--cq-gold-hi);
  }

  span {
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cq-muted);
  }

  small {
    font-size: 12px;
    color: var(--cq-gold);
  }
}

.cq-progress__empty {
  align-items: center;
  text-align: center;

  p {
    margin: 0;
  }

  .cq-small {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
}

.cq-progress__calib-text {
  font-size: 14px;
  color: var(--cq-cream);
}

.cq-progress__calib-actions {
  display: flex;
  gap: 8px;

  button {
    flex: 1;
  }
}

.cq-progress__week {
  align-items: center;
}

.cq-progress__week-empty {
  margin: 0;
  text-align: center;
}

.cq-progress__day {
  font-size: 20px;
}
</style>
