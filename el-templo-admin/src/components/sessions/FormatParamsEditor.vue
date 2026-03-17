<template>
  <div class="format-params-editor">
    <!-- Death By / Death By Unbroken (time cap + read-only pattern) -->
    <div
      v-if="localParams && ['death_by', 'death_by_unbroken'].includes(String(localParams.type))"
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.timeCapMinutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="30"
        label="Tiempo limite (min)"
        clearable
        style="min-width: 140px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <span class="text-caption text-grey-6">
        1-2-3-4-5... rep/min{{ localParams.type === 'death_by_unbroken' ? ' (unbroken)' : '' }}
      </span>
    </div>

    <!-- AMRAP (minutes only) -->
    <div v-else-if="localParams?.type === 'amrap'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.minutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="30"
        label="Minutos"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- AMRAP Series (minutes + rounds) -->
    <div v-else-if="localParams?.type === 'amrap_series'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.minutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="30"
        label="Minutos"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="10"
        label="Rondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- EMOM / Every X Seconds (intervalSeconds + totalMinutes) -->
    <div
      v-else-if="localParams && ['emom', 'every_x_seconds'].includes(String(localParams.type))"
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.intervalSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="10"
        :max="300"
        label="Intervalo (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.totalMinutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="60"
        label="Minutos totales"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- On the X:00 (intervalSeconds + rounds) -->
    <div v-else-if="localParams?.type === 'on_the_x'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.intervalSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="60"
        :max="300"
        label="Intervalo (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="20"
        label="Rondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Tabata / Interval / HIIT (workSeconds + restSeconds + rounds) -->
    <div
      v-else-if="localParams && ['tabata', 'interval', 'hiit'].includes(String(localParams.type))"
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.workSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="5"
        :max="120"
        label="Trabajo (seg)"
        style="min-width: 110px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.restSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="5"
        :max="120"
        label="Descanso (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="20"
        label="Rondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Complex / For Quality (rounds only) -->
    <div
      v-else-if="localParams && ['complex', 'for_quality'].includes(String(localParams.type))"
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="10"
        label="Rondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- For Time / For Max Reps / For Max Distancia (optional timeCapMinutes) -->
    <div
      v-else-if="
        localParams &&
        ['for_time', 'for_max_reps', 'for_max_distancia'].includes(String(localParams.type))
      "
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.timeCapMinutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="60"
        label="Tiempo limite (min)"
        clearable
        style="min-width: 140px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Time Cap / For Tech / Open Style (minutes only) -->
    <div
      v-else-if="
        localParams && ['time_cap', 'for_tech', 'open_style'].includes(String(localParams.type))
      "
      class="row items-center q-gutter-sm"
    >
      <q-input
        v-model.number="localParams.minutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="60"
        label="Minutos"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- I Go, You Go (totalRounds) -->
    <div v-else-if="localParams?.type === 'i_go_you_go'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.totalRounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="2"
        :max="40"
        label="Rondas totales"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Cluster (clusterSize + restBetweenClusters) -->
    <div v-else-if="localParams?.type === 'cluster'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.clusterSize"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="10"
        label="Reps por cluster"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.restBetweenClusters"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="5"
        :max="300"
        label="Descanso (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Ladder / Ladder Corta (direction + start + step + rounds) -->
    <div
      v-else-if="localParams && ['ladder', 'ladder_corta'].includes(String(localParams.type))"
      class="column q-gutter-sm"
    >
      <div class="row items-center q-gutter-sm">
        <q-select
          v-model="localParams.direction"
          :options="ladderOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          :dark="dark"
          style="min-width: 150px"
          @update:model-value="onBlur"
        />
        <q-input
          v-model.number="localParams.start"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="100"
          label="Inicio"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.step"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="20"
          label="Paso"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.rounds"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="2"
          :max="30"
          label="Rondas"
          style="min-width: 90px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
      </div>
      <div class="text-caption text-grey-6">{{ ladderPreview }}</div>
    </div>

    <!-- Ladder Block (direction + start + step + blockSize) -->
    <div v-else-if="localParams?.type === 'ladder_block'" class="column q-gutter-sm">
      <div class="row items-center q-gutter-sm">
        <q-select
          v-model="localParams.direction"
          :options="ladderOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          :dark="dark"
          style="min-width: 150px"
          @update:model-value="onBlur"
        />
        <q-input
          v-model.number="localParams.start"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="100"
          label="Inicio"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.step"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="20"
          label="Paso"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.blockSize"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="10"
          label="Reps/Bloque"
          style="min-width: 100px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
      </div>
      <div class="text-caption text-grey-6">{{ ladderBlockPreview }}</div>
    </div>

    <!-- Broken Ladder (direction + start + step + breakAfter) -->
    <div v-else-if="localParams?.type === 'broken_ladder'" class="column q-gutter-sm">
      <div class="row items-center q-gutter-sm">
        <q-select
          v-model="localParams.direction"
          :options="ladderOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          :dark="dark"
          style="min-width: 150px"
          @update:model-value="onBlur"
        />
        <q-input
          v-model.number="localParams.start"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="100"
          label="Inicio"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.step"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="1"
          :max="20"
          label="Paso"
          style="min-width: 80px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
        <q-input
          v-model.number="localParams.breakAfter"
          type="number"
          dense
          outlined
          :dark="dark"
          :min="2"
          :max="20"
          label="Corte cada"
          style="min-width: 100px"
          @blur="onBlur"
          @keyup.enter="onBlur"
        />
      </div>
      <div class="text-caption text-grey-6">{{ brokenLadderPreview }}</div>
    </div>

    <!-- Rounds for Time (rounds + optional timeCapMinutes) -->
    <div v-else-if="localParams?.type === 'rounds_for_time'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="20"
        label="Rondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.timeCapMinutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="60"
        label="Tiempo limite (min)"
        clearable
        style="min-width: 140px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Tempo Sets (tempo string) -->
    <div v-else-if="localParams?.type === 'tempo_sets'" class="row items-center q-gutter-sm">
      <q-input
        v-model="localParams.tempo"
        dense
        outlined
        :dark="dark"
        label="Tempo (ej. 3-1-1-0)"
        placeholder="3-1-1-0"
        style="min-width: 140px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Wave Loading (waves) -->
    <div v-else-if="localParams?.type === 'wave_loading'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.waves"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="5"
        label="Ondas"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Drop Set (drops) -->
    <div v-else-if="localParams?.type === 'drop_set'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.drops"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="5"
        label="Drops"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Rest-Pause (pauseSeconds) -->
    <div v-else-if="localParams?.type === 'rest_pause'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.pauseSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="5"
        :max="30"
        label="Pausa (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- EMOM + For Time hybrid (emomMinutes + intervalSeconds) -->
    <div v-else-if="localParams?.type === 'emom_for_time'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.emomMinutes"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="1"
        :max="30"
        label="EMOM (min)"
        style="min-width: 110px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
      <q-input
        v-model.number="localParams.intervalSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="10"
        :max="180"
        label="Intervalo (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Acropolis (phases) -->
    <div v-else-if="localParams?.type === 'acropolis'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.phases"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="2"
        :max="5"
        label="Fases"
        style="min-width: 100px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { NO_PARAMS_FORMATS, normalizeFormatName } from 'src/constants/formats';

type FormatParamsLocal = Record<string, string | number | null>;

const props = defineProps<{
  formatParams: Record<string, unknown> | null;
  formatName: string;
  blockId: number;
  sessionId: number;
  dark?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:formatParams', params: Record<string, unknown>): void;
}>();

const localParams = ref<FormatParamsLocal | null>(
  props.formatParams ? JSON.parse(JSON.stringify(props.formatParams)) : null
);

watch(
  () => props.formatParams,
  (newVal) => {
    localParams.value = newVal ? JSON.parse(JSON.stringify(newVal)) : null;
    if (!newVal) {
      autoInitIfNeeded();
      return;
    }
    // Re-initialize stale "standard" params for formats that now have proper types
    const type = (newVal as Record<string, unknown>).type;
    if (type === 'standard') {
      autoInitIfNeeded();
    }
  }
);

const ladderOptions = [
  { label: 'Ascendente', value: 'ascending' },
  { label: 'Descendente', value: 'descending' },
];

// Pattern preview computeds for structure-dictated formats
const ladderPreview = computed(() => {
  if (!localParams.value || !['ladder', 'ladder_corta'].includes(String(localParams.value.type)))
    return '';
  const start = Number(localParams.value.start) || 1;
  const step = Number(localParams.value.step) || 1;
  const rounds = Number(localParams.value.rounds) || 10;
  const dir = String(localParams.value.direction);
  const values: number[] = [];
  for (let i = 0; i < rounds; i++) {
    values.push(dir === 'ascending' ? start + i * step : start - i * step);
  }
  return values.join('-');
});

const ladderBlockPreview = computed(() => {
  if (localParams.value?.type !== 'ladder_block') return '';
  const start = Number(localParams.value.start) || 2;
  const step = Number(localParams.value.step) || 2;
  const blockSize = Number(localParams.value.blockSize) || 3;
  const dir = String(localParams.value.direction);
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const reps = dir === 'ascending' ? start + i * step : start - i * step;
    parts.push(`${reps}x${blockSize}`);
  }
  return parts.join(' - ') + '...';
});

const brokenLadderPreview = computed(() => {
  if (localParams.value?.type !== 'broken_ladder') return '';
  const start = Number(localParams.value.start) || 1;
  const step = Number(localParams.value.step) || 1;
  const breakAfter = Number(localParams.value.breakAfter) || 3;
  const dir = String(localParams.value.direction);
  const segments: string[] = [];
  for (let seg = 0; seg < 2; seg++) {
    const values: number[] = [];
    for (let i = 0; i < breakAfter; i++) {
      values.push(dir === 'ascending' ? start + i * step : start - i * step);
    }
    segments.push(values.join('-'));
  }
  return segments.join(' | ') + ' | ...';
});

let lastEmitted = props.formatParams ? JSON.stringify(props.formatParams) : '';

function onBlur() {
  if (!localParams.value) return;
  const current = JSON.stringify(localParams.value);
  if (current !== lastEmitted) {
    lastEmitted = current;
    emit('update:formatParams', { ...localParams.value });
  }
}

/** Default params keyed by BOTH type names AND normalized DB format names */
const defaultsMap: Record<string, FormatParamsLocal> = {
  // Time-based
  amrap: { type: 'amrap', minutes: 10 },
  amrap_series: { type: 'amrap_series', minutes: 10, rounds: 3 },
  emom: { type: 'emom', intervalSeconds: 60, totalMinutes: 5 },
  tabata: { type: 'tabata', workSeconds: 20, restSeconds: 10, rounds: 8 },
  interval: { type: 'interval', workSeconds: 40, restSeconds: 20, rounds: 8 },
  interval_training: { type: 'interval', workSeconds: 40, restSeconds: 20, rounds: 8 },
  hiit: { type: 'hiit', workSeconds: 30, restSeconds: 30, rounds: 8 },
  time_cap: { type: 'time_cap', minutes: 10 },
  every_x_seconds: { type: 'every_x_seconds', intervalSeconds: 45, totalMinutes: 10 },
  on_the_x: { type: 'on_the_x', intervalSeconds: 120, rounds: 6 },
  'on_the_2:00_/_3:00': { type: 'on_the_x', intervalSeconds: 120, rounds: 6 },
  for_time: { type: 'for_time' },
  for_max_tiempo: { type: 'for_max_tiempo' },
  'for_max_(tiempo)': { type: 'for_max_tiempo' },

  // Volume-based
  chipper: { type: 'chipper' },
  death_by: { type: 'death_by', timeCapMinutes: null },
  death_by_unbroken: { type: 'death_by_unbroken', timeCapMinutes: null },
  ladder: { type: 'ladder', direction: 'ascending', start: 1, step: 1, rounds: 10 },
  ladder_block: { type: 'ladder_block', direction: 'ascending', start: 2, step: 2, blockSize: 3 },
  ladder_corta: { type: 'ladder_corta', direction: 'ascending', start: 1, step: 1, rounds: 5 },
  pyramid: { type: 'pyramid', step: 2, peak: 10 },
  accumulate: { type: 'accumulate', target: 50, unit: 'reps' },
  accumulate_x: { type: 'accumulate', target: 50, unit: 'reps' },
  for_max_reps: { type: 'for_max_reps' },
  'for_max_(reps)': { type: 'for_max_reps' },
  for_max_carga: { type: 'for_max_carga' },
  'for_max_(carga)': { type: 'for_max_carga' },
  for_max_distancia: { type: 'for_max_distancia' },
  'for_max_(distancia)': { type: 'for_max_distancia' },
  unbroken_reps: { type: 'unbroken_reps' },
  unbroken_chipper: { type: 'unbroken_chipper' },
  ub_test: { type: 'ub_test' },

  // Technical
  complex: { type: 'complex', rounds: 3 },
  for_quality: { type: 'for_quality', rounds: 3 },
  for_tech: { type: 'for_tech', minutes: 12 },
  tempo_sets: { type: 'tempo_sets', tempo: '3-1-1-0' },
  flow_guiado: { type: 'flow_guiado' },
  cluster: { type: 'cluster', clusterSize: 3, restBetweenClusters: 90 },

  // Structure-based
  rounds_for_time: { type: 'rounds_for_time', rounds: 5 },
  couplet: { type: 'couplet' },
  triplet: { type: 'triplet' },
  singlet: { type: 'singlet' },
  benchmark: { type: 'benchmark_wod' },
  benchmark_wod: { type: 'benchmark_wod' },
  hero_wod: { type: 'hero_wod' },
  buy_in_cash_out: { type: 'buy_in_cash_out' },
  'buy-in_/_cash-out': { type: 'buy_in_cash_out' },
  i_go_you_go: { type: 'i_go_you_go', totalRounds: 10 },
  'i_go,_you_go': { type: 'i_go_you_go', totalRounds: 10 },
  floater_wod: { type: 'floater_wod' },
  acropolis: { type: 'acropolis', phases: 3 },

  // Hybrid
  wave_loading: { type: 'wave_loading', waves: 2 },
  drop_set: { type: 'drop_set', drops: 3 },
  rest_pause: { type: 'rest_pause', pauseSeconds: 15 },
  'rest-pause': { type: 'rest_pause', pauseSeconds: 15 },
  open_style: { type: 'open_style', minutes: 20 },
  emom_for_time: { type: 'emom_for_time', emomMinutes: 6, intervalSeconds: 60 },
  'emom_+_for_time': { type: 'emom_for_time', emomMinutes: 6, intervalSeconds: 60 },
  broken_ladder: {
    type: 'broken_ladder',
    direction: 'ascending',
    start: 1,
    step: 1,
    breakAfter: 3,
  },
  task_priority: { type: 'task_priority' },
  task_priority_vs_time_priority: { type: 'task_priority' },
  circuito_cooperativo: { type: 'circuito_cooperativo' },
};

function resolveDefaults(): FormatParamsLocal {
  const normalized = normalizeFormatName(props.formatName);

  // Exact match first
  if (defaultsMap[normalized]) {
    return { ...defaultsMap[normalized] };
  }

  // Substring fallback for DB names that don't normalize cleanly
  // Sort keys longest-first to avoid partial matches (e.g. "death_by" before "death_by_unbroken")
  const entries = Object.entries(defaultsMap).sort(([a], [b]) => b.length - a.length);
  for (const [key, val] of entries) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...val };
    }
  }

  return { type: 'standard' };
}

function autoInitIfNeeded() {
  const defaults = resolveDefaults();
  if (NO_PARAMS_FORMATS.includes(String(defaults.type))) return;

  localParams.value = defaults;
  lastEmitted = JSON.stringify(localParams.value);
  emit('update:formatParams', { ...localParams.value });
}

onMounted(() => {
  if (!localParams.value) {
    autoInitIfNeeded();
    return;
  }
  // Re-initialize if stored params are stale (e.g., "standard" for a format
  // that now has proper params after the bible expansion)
  const storedType = String(localParams.value.type ?? '');
  if (storedType === 'standard') {
    const defaults = resolveDefaults();
    if (!NO_PARAMS_FORMATS.includes(String(defaults.type))) {
      localParams.value = defaults;
      lastEmitted = JSON.stringify(localParams.value);
      emit('update:formatParams', { ...localParams.value });
    }
  }
});
</script>

<style scoped>
.format-params-editor {
  padding: 0;
}
</style>
