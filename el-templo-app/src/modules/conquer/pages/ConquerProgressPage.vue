<template>
  <CqScreen>
    <CqPageHeader
      title="Progreso"
      :subtitle="weekSubtitle"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div v-if="!progress" class="cq-progress__center" role="status" aria-live="polite">
      <template v-if="error">
        <p class="cq-notice" role="alert">{{ error }}</p>
        <CqButton label="Reintentar" variant="secondary" small @click="reload" />
      </template>
      <template v-else>
        <span class="cq-progress__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando tu progreso</span>
      </template>
    </div>

    <template v-else>
      <!-- DA-35: los dos KPIs son piezas oscuras -->
      <div class="cq-progress__kpis">
        <div class="cq-progress__kpi cq-dark">
          <b class="cq-num">{{ progress.sessionsCount }}</b>
          <span class="cq-sub">sesiones</span>
        </div>
        <div class="cq-progress__kpi cq-dark">
          <b class="cq-num">{{ accuracyText(progress.accuracy.pct) }}</b>
          <span class="cq-sub">acierto del modelo</span>
          <small v-if="progress.accuracy.delta !== null" class="cq-sub">
            Δ {{ deltaText(progress.accuracy.delta) }} en promedio
          </small>
        </div>
      </div>

      <div v-if="progress.sessionsCount === 0" class="cq-card cq-progress__empty">
        <p class="cq-sub">Todavía no hay sesiones cargadas. Cargá la primera en Hoy.</p>
        <router-link :to="{ name: 'conquer-hoy' }" class="cq-textlink">Ir a Hoy</router-link>
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
          <p class="cq-kicker">Calibración</p>
          <div class="cq-progress__calib-text">{{ calibrationText(item) }}</div>
          <div v-if="canResolveCalibration(item)" class="cq-progress__calib-actions">
            <CqButton
              label="Aceptar"
              small
              :disabled="busyKey !== null"
              :loading="busyKey === calibrationKey(item.exerciseId)"
              @click="onCalibration(item.exerciseId, true)"
            />
            <CqButton
              label="Ahora no"
              variant="secondary"
              small
              :disabled="busyKey !== null"
              @click="onCalibration(item.exerciseId, false)"
            />
          </div>
        </div>

        <!-- D-13 b: BodyFigure mide con getBBox; se monta recién con los datos ya cargados -->
        <h2 class="cq-block-title">Tu semana</h2>
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
          <div class="cq-progress__dayh">
            <h2 class="cq-block-title">{{ day.label }}</h2>
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
  </CqScreen>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useUserStore } from 'src/stores/useUserStore'
import { useConquerProgress } from '../composables/useConquerProgress'
import { useConquerStore } from '../stores/conquerStore'
import { calibrationText, canResolveCalibration } from '../utils/format'
import { accuracyText, calibrationKey, deltaText, sessionsText } from '../utils/progressView'
import type { ComboKey, CountedStep } from '../types'
import CqScreen from '../components/brand/CqScreen.vue'
import CqButton from '../components/brand/CqButton.vue'
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
const conquerStore = useConquerStore()
const { progress, busyKey, error, load, subir, subirCombo, resolveCalibration, cleanup } =
  useConquerProgress()

// Solo lee lo que el store ya tiene (no dispara carga): sin estado cargado, sin subtítulo
const weekSubtitle = computed(() => {
  const week = conquerStore.state?.member?.blockWeek
  return week ? `Semana ${week} del bloque` : ''
})

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
  // Abierta en frío no hay estado: sin él falta "Semana N del bloque" en el subtítulo
  if (!conquerStore.state) void conquerStore.loadState()
  // Fase 201 D-25, DA-49: los tutoriales cargan una vez por sesión y sin esperar; si fallan, no hay botones
  void conquerStore.loadTutorials()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
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
  border: 2px solid var(--cq-edge-gold);
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
  gap: 10px;
}

// Pieza oscura suelta: radio 16 y padding 14 16 (dos clases en el mismo elemento le ganan a
// `.cq-root .cq-dark`; el número y los textos de abajo, con la clase del padre adelante)
.cq-progress__kpi.cq-dark {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 14px 16px;
  border-radius: 16px;

  .cq-num {
    font-size: 36px;
    line-height: 1.05;
    color: var(--cq-on-night-hi);
  }

  .cq-sub {
    font-size: 13px;
    color: var(--cq-on-night-2);
  }
}

.cq-progress__empty {
  align-items: center;
  text-align: center;
}

.cq-progress__calib-text {
  font-size: 14px;
  color: var(--cq-text);
}

.cq-progress__calib-actions {
  display: flex;
  gap: 8px;

  > * {
    flex: 1;
  }
}

.cq-progress__week {
  align-items: center;
}

.cq-progress__week-empty {
  text-align: center;
}

.cq-progress__dayh {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
</style>
