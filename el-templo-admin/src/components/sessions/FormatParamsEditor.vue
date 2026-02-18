<template>
  <div class="format-params-editor">
    <!-- AMRAP (regular - minutes only) -->
    <div v-if="localParams?.type === 'amrap'" class="row items-center q-gutter-sm">
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

    <!-- EMOM -->
    <div v-else-if="localParams?.type === 'emom'" class="row items-center q-gutter-sm">
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

    <!-- Complex -->
    <div v-else-if="localParams?.type === 'complex'" class="row items-center q-gutter-sm">
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

    <!-- Tabata -->
    <div v-else-if="localParams?.type === 'tabata'" class="row items-center q-gutter-sm">
      <q-input
        v-model.number="localParams.workSeconds"
        type="number"
        dense
        outlined
        :dark="dark"
        :min="5"
        :max="60"
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
        :max="60"
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

    <!-- Interval -->
    <div v-else-if="localParams?.type === 'interval'" class="row items-center q-gutter-sm">
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

    <!-- For Time -->
    <div v-else-if="localParams?.type === 'for_time'" class="row items-center q-gutter-sm">
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

    <!-- Buy-in/Cash-out -->
    <div v-else-if="localParams?.type === 'buy_in_cash_out'" class="row items-center q-gutter-sm">
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

    <!-- Cluster -->
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
        :min="10"
        :max="300"
        label="Descanso (seg)"
        style="min-width: 120px"
        @blur="onBlur"
        @keyup.enter="onBlur"
      />
    </div>

    <!-- Ladder -->
    <div v-else-if="localParams?.type === 'ladder'" class="row items-center q-gutter-sm">
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
    </div>

    <!-- Time Cap -->
    <div v-else-if="localParams?.type === 'time_cap'" class="row items-center q-gutter-sm">
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { NO_PARAMS_FORMATS } from 'src/constants/formats';

type FormatParamsLocal = Record<string, string | number | null>; // dynamic format param keys

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

// Deep copy to avoid mutating props. Typed as `any` record for v-model compatibility.
const localParams = ref<FormatParamsLocal | null>(
  props.formatParams ? JSON.parse(JSON.stringify(props.formatParams)) : null
);

// Watch for prop changes (e.g., after format change resets params)
watch(
  () => props.formatParams,
  (newVal) => {
    localParams.value = newVal ? JSON.parse(JSON.stringify(newVal)) : null;
    // Auto-initialize if null and format has configurable params
    if (!newVal) {
      autoInitIfNeeded();
    }
  },
  { deep: true }
);

const ladderOptions = [
  { label: 'Ascendente', value: 'ascending' },
  { label: 'Descendente', value: 'descending' },
];

// Snapshot for change detection
let lastEmitted = props.formatParams ? JSON.stringify(props.formatParams) : '';

function onBlur() {
  if (!localParams.value) return;
  const current = JSON.stringify(localParams.value);
  if (current !== lastEmitted) {
    lastEmitted = current;
    emit('update:formatParams', { ...localParams.value });
  }
}

const defaultsMap: Record<string, FormatParamsLocal> = {
  amrap: { type: 'amrap', minutes: 10 },
  amrap_series: { type: 'amrap_series', minutes: 10, rounds: 3 },
  emom: { type: 'emom', intervalSeconds: 60, totalMinutes: 5 },
  complex: { type: 'complex', rounds: 3 },
  tabata: { type: 'tabata', workSeconds: 20, restSeconds: 10, rounds: 8 },
  interval: { type: 'interval', workSeconds: 40, restSeconds: 20, rounds: 8 },
  for_time: { type: 'for_time' },
  chipper: { type: 'chipper' },
  buy_in_cash_out: { type: 'buy_in_cash_out' },
  cluster: { type: 'cluster' },
  ladder: { type: 'ladder', direction: 'ascending' },
  unbroken: { type: 'unbroken' },
  couplet: { type: 'couplet' },
  triplet: { type: 'triplet' },
  for_max: { type: 'for_max' },
  time_cap: { type: 'time_cap', minutes: 10 },
};

function resolveDefaults(): FormatParamsLocal {
  const normalized = props.formatName.toLowerCase().trim().replace(/\s+/g, '_');

  if (defaultsMap[normalized]) {
    return { ...defaultsMap[normalized] };
  }
  for (const [key, val] of Object.entries(defaultsMap)) {
    if (normalized.includes(key)) {
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

// Auto-initialize on mount if params are null
onMounted(() => {
  if (!localParams.value) {
    autoInitIfNeeded();
  }
});
</script>

<style scoped>
.format-params-editor {
  padding: 0;
}
</style>
