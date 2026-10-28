<!--
  Progreso del alumno en la ficha de Conquer (fase 201, §7.2): KPIs (sesiones, acierto del modelo,
  delta) y, por día, por ejercicio y por escalón, el peldaño actual, el modo, la última marca, el
  próximo objetivo y el estado que calcula el motor. El coach corrige un escalón con los
  desplegables (`changeStep`); el API devuelve la ficha completa y se la pasa a la página con
  `updated` (se reemplaza el estado, no se recompone). Las opciones de peldaño salen del catálogo:
  los activos de la escalera del ejercicio más el actual aunque esté desactivado. En 390 px cada
  escalón es un bloque apilado.
-->
<template>
  <div>
    <!-- KPIs -->
    <div class="row q-col-gutter-sm q-mb-md" data-test="conquer-ficha-kpis">
      <div v-for="k in kpis" :key="k.label" class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section class="q-pa-sm">
            <div class="text-caption text-grey-8">{{ k.label }}</div>
            <div class="text-h6">{{ k.value }}</div>
            <div v-if="k.hint" class="text-caption text-grey-8">{{ k.hint }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div
      v-if="subirText.length > 0"
      class="q-mb-md text-body2 text-accent"
      data-test="conquer-ficha-subir"
    >
      <q-icon name="trending_up" class="q-mr-xs" />
      Listo para subir: {{ subirText.join(' · ') }}
    </div>

    <div v-if="days.length === 0" class="text-grey-8 q-pa-md text-center">
      Este alumno todavía no tiene progresiones cargadas.
    </div>

    <q-card v-for="day in days" :key="day.dayKey" flat bordered class="q-mb-md">
      <q-card-section class="q-pb-none">
        <div class="text-subtitle1 text-weight-medium">{{ day.label }}</div>
        <div class="text-caption text-grey-8">
          {{ day.sessionsCount }} {{ day.sessionsCount === 1 ? 'sesión' : 'sesiones' }}
        </div>
      </q-card-section>

      <q-card-section v-for="ex in day.exercises" :key="ex.exerciseId" class="q-pt-md">
        <div class="text-body1 text-weight-medium">{{ ex.name }}</div>
        <div v-if="ex.e1Curve.length > 1" class="text-caption text-grey-8">
          Curva del E1: {{ ex.e1Curve.join(' · ') }}
        </div>

        <div
          v-for="s in ex.steps"
          :key="s.step"
          class="conquer-step q-mt-sm q-pa-sm"
          data-test="conquer-step-row"
        >
          <div class="row q-col-gutter-sm items-center">
            <div class="col-12 col-sm-2 text-weight-medium">{{ STEP_LABELS[s.step] }}</div>

            <div class="col-12" :class="s.step === 'hold' ? 'col-sm-6' : 'col-sm-4'">
              <q-select
                :model-value="s.rungId"
                :options="rungOptions(ex.exerciseId, s.rungId)"
                emit-value
                map-options
                dense
                outlined
                options-dense
                label="Progresión"
                :disable="busyKey !== null"
                :loading="busyKey === keyOf(ex.exerciseId, s.step)"
                data-test="conquer-step-rung"
                @update:model-value="(v: number) => change(ex.exerciseId, s.step, v, s.mode)"
              />
            </div>

            <div v-if="s.step !== 'hold'" class="col-12 col-sm-2">
              <q-select
                :model-value="s.mode"
                :options="MODE_OPTIONS"
                emit-value
                map-options
                dense
                outlined
                options-dense
                label="Modo"
                :disable="busyKey !== null"
                data-test="conquer-step-mode"
                @update:model-value="(v: Mode) => change(ex.exerciseId, s.step, s.rungId, v)"
              />
            </div>

            <div class="col-12 col-sm-4 text-body2">
              <div>
                Última: <strong>{{ markText(s.last, ex.unit, s.unilateral) }}</strong>
              </div>
              <div v-if="s.step !== 'hold'">
                Próximo objetivo: <strong>{{ markText(s.target, ex.unit, s.unilateral) }}</strong>
              </div>
              <q-chip
                v-if="s.step !== 'hold'"
                dense
                square
                :color="estadoColor(s.estado)"
                :text-color="estadoTextColor(s.estado)"
                :label="ESTADO_LABELS[s.estado ?? 'sin_datos']"
                class="q-ma-none q-mt-xs"
              />
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminCatalog, Estado, FichaResponse, Mode, StepKey } from 'src/types/conquer';
import { ESTADO_LABELS, MODE_LABELS, markText } from 'src/utils/conquer-format';

const props = defineProps<{
  ficha: FichaResponse;
  catalog: AdminCatalog;
}>();

const emit = defineEmits<{
  /** La ficha que devolvió el API tras corregir un escalón. */
  updated: [ficha: FichaResponse];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const STEP_LABELS: Record<StepKey, string> = {
  e1: 'Escalón 1 (E1)',
  e2: 'Escalón 2 (E2)',
  e3: 'Escalón 3 (E3)',
  hold: 'Hold final',
};

// El hold no tiene modo (el API exige 'hold'): el desplegable solo ofrece los de las reps.
const MODE_OPTIONS = (['completa', 'negativa'] as const).map((m) => ({
  label: MODE_LABELS[m],
  value: m,
}));

// Clave del escalón que se está guardando: bloquea el resto para no pisar respuestas.
const busyKey = ref<string | null>(null);

function keyOf(exerciseId: number, step: StepKey): string {
  return `${exerciseId}:${step}`;
}

// El sábado de Toro viene sin ejercicios: no se pinta.
const days = computed(() => props.ficha.progress.days.filter((d) => d.exercises.length > 0));

const kpis = computed(() => {
  const { sessionsCount, accuracy } = props.ficha.progress;
  const pct = accuracy.pct === null ? '—' : `${accuracy.pct}%`;
  // Δ = promedio de (marca - objetivo anterior), en reps o segundos.
  let delta = '—';
  if (accuracy.delta !== null) {
    delta = `${accuracy.delta > 0 ? '+' : ''}${String(accuracy.delta).replace('.', ',')}`;
  }
  return [
    { label: 'Sesiones', value: String(sessionsCount), hint: null },
    { label: 'Acierto del modelo', value: pct, hint: `${accuracy.hits} de ${accuracy.n}` },
    { label: 'Δ promedio sobre el objetivo', value: delta, hint: null },
  ];
});

const subirText = computed(() => {
  const { subir, comboSubir } = props.ficha.progress;
  return [
    ...subir.map((s) => `${s.exerciseName} ${s.step.toUpperCase()}`),
    ...comboSubir.map((c) => c.label),
  ];
});

// Peldaños de la escalera del ejercicio, del más difícil al más fácil. El actual siempre está,
// aunque se haya desactivado después.
function rungOptions(
  exerciseId: number,
  currentRungId: number
): { label: string; value: number }[] {
  const exercise = props.catalog.exercises.find((e) => e.id === exerciseId);
  const ladder = exercise ? props.catalog.ladders.find((l) => l.id === exercise.ladderId) : null;
  const rungs = (ladder?.rungs ?? [])
    .filter((r) => r.isActive || r.id === currentRungId)
    .sort((a, b) => a.position - b.position);
  return rungs.map((r) => ({
    label: r.isActive ? r.name : `${r.name} (desactivado)`,
    value: r.id,
  }));
}

function estadoColor(estado: Estado | null): string {
  if (estado === 'subir') return 'positive';
  if (estado === 'techo1' || estado === 'bajo') return 'warning';
  return 'grey-3';
}

function estadoTextColor(estado: Estado | null): string {
  return estado === 'subir' || estado === 'techo1' || estado === 'bajo' ? 'white' : 'accent';
}

async function change(
  exerciseId: number,
  step: StepKey,
  rungId: number,
  mode: Mode
): Promise<void> {
  busyKey.value = keyOf(exerciseId, step);
  try {
    // El hold no admite otro modo que 'hold'.
    const body = { rungId, mode: step === 'hold' ? ('hold' as const) : mode };
    const ficha = await conquerApi.changeStep(props.ficha.member.userId, exerciseId, step, body);
    $q.notify({ type: 'positive', message: 'Progresión corregida' });
    emit('updated', ficha);
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos corregir la progresión',
    });
  } finally {
    busyKey.value = null;
  }
}
</script>

<style scoped lang="scss">
.conquer-step {
  border: 1px solid $grey-4;
  border-radius: 6px;
}
</style>
