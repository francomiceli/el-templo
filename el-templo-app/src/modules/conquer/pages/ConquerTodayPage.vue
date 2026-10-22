<template>
  <CqSky class="cq-today">
    <CqPageHeader
      title="HOY"
      :subtitle="today?.label"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div v-if="!today || !form" class="cq-today__center" role="status" aria-live="polite">
      <template v-if="error">
        <p class="cq-sub" role="alert">{{ error }}</p>
        <button type="button" class="cq-small cq-small--fill" @click="reload">Reintentar</button>
      </template>
      <template v-else>
        <span class="cq-today__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando la sesión</span>
      </template>
    </div>

    <template v-else>
      <CqDayPicker
        :plan="pickerPlan"
        :selected="today.dayKey"
        :week-complete="today.weekComplete"
        :next-day-key="today.nextDayKey"
        @select="onSelectDay"
      />

      <div v-if="today.alreadySaved" class="cq-toast cq-today__saved" role="status">
        Ya guardaste este día hoy: si guardás de nuevo, se reemplaza.
      </div>

      <!-- D-18: el app SIEMPRE manda el opening cuando el día lo trae (precargado con el objetivo) -->
      <CqComboCard
        v-if="today.opening && form.opening"
        :combo="today.opening"
        title="Combo de apertura · al fallo"
        :hint="CQ_TEXTOS.combo"
        :rung-id="form.opening.rungId"
        :series-value="form.opening.series"
        :busy="changing || saving"
        @update:rung="setOpeningRung"
        @update:series="setOpeningSeries"
        @subir="onSubirOpening"
      />

      <CqExerciseCard
        v-for="(exercise, i) in today.exercises"
        :key="exercise.exerciseId"
        :exercise="exercise"
        :index="i + 1"
        :level="today.level"
        :values="form.values[exercise.exerciseId]"
        :busy="changing || saving"
        @update:value="(step, v) => setValue(exercise.exerciseId, step, v)"
        @change-step="(step, rungId, mode) => onChangeStep(exercise.exerciseId, step, rungId, mode)"
      />

      <div class="cq-card">
        <div class="cq-today__line">
          <div class="cq-today__label">
            <b>Finisher</b>
            <span>{{ finisherLine(today.finisher) }}</span>
          </div>
        </div>
        <div class="cq-today__line">
          <div class="cq-today__label">
            <b>Molestia articular</b>
            <span>0 a 10 · codo, hombro</span>
          </div>
          <CqCounter
            :model-value="form.pain"
            :max="10"
            label="Molestia articular"
            :disabled="saving"
            @update:model-value="setPain"
          />
        </div>
      </div>

      <div class="cq-grow" />

      <CqCloudButton label="Guardar sesión" :loading="saving" @click="onSave">
        <div class="cq-sub">{{ shortDate(today.date) }} · {{ today.label }}</div>
      </CqCloudButton>
    </template>

    <!-- El diálogo se monta fuera de la página (teleport): un solo nodo raíz para el router -->
    <CqSaveSheet
      v-model="sheetOpen"
      :lighting="lastSave?.lighting ?? null"
      :calibration="lastSave?.calibration ?? []"
      :techo="lastSave?.techo ?? []"
      :gender="gender"
      :resolving="resolving"
      @resolve="onResolve"
      @done="onDone"
    />
  </CqSky>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useUserStore } from 'src/stores/useUserStore'
import { useConquerStore } from '../stores/conquerStore'
import { useConquerToday } from '../composables/useConquerToday'
import { CQ_TEXTOS, finisherLine, shortDate } from '../utils/format'
import type { Mode, StepKey } from '../types'
import CqSky from '../components/brand/CqSky.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqCloudButton from '../components/brand/CqCloudButton.vue'
import CqCounter from '../components/today/CqCounter.vue'
import CqDayPicker from '../components/today/CqDayPicker.vue'
import CqComboCard from '../components/today/CqComboCard.vue'
import CqExerciseCard from '../components/today/CqExerciseCard.vue'
import CqSaveSheet from '../components/today/CqSaveSheet.vue'

// Fase 201 §7.1 Hoy, D-13 a, D-16, D-18, S12-2, S12-4: la sesión del día. Abre en el día que toca
// (`GET /today` sin `day`) o en el de la query `?day=`; el alumno lo cambia con un toque. Todo viene
// precargado con el objetivo del motor, así que guardar sin tocar nada cuenta como cumplido. Al
// guardar abre la hoja con la figura de hoy y la calibración. El app no recalcula nada.
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }
const SATURDAY_ROUTE = 'conquer-sabado'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const conquerStore = useConquerStore()
const {
  today,
  form,
  saving,
  changing,
  error,
  lastSave,
  load,
  setValue,
  setPain,
  setOpeningRung,
  setOpeningSeries,
  changeStep,
  save,
  resolveCalibration,
  subirOpening,
  cleanup,
} = useConquerToday()

const sheetOpen = ref(false)
const resolving = ref(false)

const gender = computed(() => userStore.profile?.gender ?? null)

/** El sábado de Toro solo se ofrece si existe su pantalla (201-19). */
const hasSaturday = computed(() => router.hasRoute(SATURDAY_ROUTE))
const pickerPlan = computed(() =>
  (today.value?.plan ?? []).filter((d) => d.dayKey !== 'sabado' || hasSaturday.value),
)

function queryDay(): string | undefined {
  const day = route.query.day
  return typeof day === 'string' && day.length > 0 ? day : undefined
}

/**
 * D-16: un Toro con los 4 días hechos tiene `nextDayKey = sabado` y la respuesta de Hoy llega con
 * el sábado. Se manda a su pantalla; si todavía no existe, se recarga con el primer día del plan.
 */
async function loadDay(): Promise<void> {
  await load(queryDay())
  if (today.value?.dayKey !== 'sabado') return
  if (hasSaturday.value) {
    await router.replace({ name: SATURDAY_ROUTE })
    return
  }
  const first = today.value.plan.find((d) => d.dayKey !== 'sabado')
  if (first) await router.replace({ query: { day: first.dayKey } })
}

function reload(): void {
  void loadDay()
}

function onSelectDay(dayKey: string): void {
  if (dayKey === 'sabado' && hasSaturday.value) {
    void router.push({ name: SATURDAY_ROUTE })
    return
  }
  if (dayKey === today.value?.dayKey) return
  void router.replace({ query: { day: dayKey } })
}

async function onChangeStep(
  exerciseId: number,
  step: StepKey,
  rungId: number,
  mode: Mode,
): Promise<void> {
  await changeStep(exerciseId, step, rungId, mode)
}

async function onSubirOpening(): Promise<void> {
  await subirOpening()
}

async function onSave(): Promise<void> {
  if (await save()) sheetOpen.value = true
}

async function onResolve(exerciseId: number, accept: boolean): Promise<void> {
  if (resolving.value) return
  resolving.value = true
  try {
    await resolveCalibration(exerciseId, accept)
  } finally {
    resolving.value = false
  }
}

function onDone(): void {
  sheetOpen.value = false
  void conquerStore.loadState()
  void router.push(BACK_TO)
}

// Los errores de las acciones van a un Notify con el texto que mandó el API (ya en español)
watch(error, (message) => {
  if (message && today.value) $q.notify({ type: 'negative', message })
})

// Cambiar de día (picker o link de Inicio) vuelve a pedir la sesión
watch(
  () => route.query.day,
  () => {
    if (route.name === 'conquer-hoy') void loadDay()
  },
)

onMounted(() => {
  void loadDay()
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
.cq-today.cq-sky {
  // Alto de la pantalla menos el header y la barra de abajo (igual que Niveles)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-today__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-today__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--cq-gold);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-today__spin {
    animation: cq-today-spin 0.9s linear infinite;
  }
}

@keyframes cq-today-spin {
  to {
    transform: rotate(360deg);
  }
}

.cq-today__saved {
  text-align: center;
}

.cq-today__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  & + & {
    padding-top: 12px;
    border-top: 1px solid var(--cq-hair2);
  }
}

.cq-today__label {
  min-width: 0;
  display: flex;
  flex-direction: column;

  b {
    font-size: 14px;
    font-weight: 500;
  }

  span {
    font-size: 12px;
    color: var(--cq-gold);
  }
}
</style>
