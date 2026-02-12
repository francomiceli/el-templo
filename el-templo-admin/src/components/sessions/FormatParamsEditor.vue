<template>
  <div class="format-params-editor">
    <!-- Null state: pre-Phase 16 sessions with no formatParams -->
    <div v-if="!localParams" class="row items-center q-gutter-xs">
      <q-btn
        flat
        dense
        size="sm"
        icon="tune"
        color="grey-7"
        label="Configurar parametros"
        @click="initializeDefaults"
      />
    </div>

    <!-- AMRAP -->
    <div v-else-if="localParams.type === 'amrap'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">AMRAP:</span>
      <q-input
        v-model.number="localParams.minutes"
        type="number"
        dense
        outlined
        :min="1"
        :max="30"
        label="Minutos"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- EMOM -->
    <div v-else-if="localParams.type === 'emom'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">EMOM:</span>
      <q-input
        v-model.number="localParams.intervalSeconds"
        type="number"
        dense
        outlined
        :min="10"
        :max="180"
        label="Intervalo (seg)"
        style="max-width: 120px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.totalMinutes"
        type="number"
        dense
        outlined
        :min="1"
        :max="60"
        label="Minutos totales"
        style="max-width: 120px"
        @blur="onBlur"
      />
    </div>

    <!-- Complex -->
    <div v-else-if="localParams.type === 'complex'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Complex:</span>
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :min="1"
        :max="10"
        label="Rondas"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- Tabata -->
    <div v-else-if="localParams.type === 'tabata'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Tabata:</span>
      <q-input
        v-model.number="localParams.workSeconds"
        type="number"
        dense
        outlined
        :min="5"
        :max="60"
        label="Trabajo (seg)"
        style="max-width: 110px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.restSeconds"
        type="number"
        dense
        outlined
        :min="5"
        :max="60"
        label="Descanso (seg)"
        style="max-width: 120px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :min="1"
        :max="20"
        label="Rondas"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- Interval -->
    <div v-else-if="localParams.type === 'interval'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Interval:</span>
      <q-input
        v-model.number="localParams.workSeconds"
        type="number"
        dense
        outlined
        :min="5"
        :max="120"
        label="Trabajo (seg)"
        style="max-width: 110px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.restSeconds"
        type="number"
        dense
        outlined
        :min="5"
        :max="120"
        label="Descanso (seg)"
        style="max-width: 120px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :min="1"
        :max="20"
        label="Rondas"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- For Time -->
    <div v-else-if="localParams.type === 'for_time'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">For Time:</span>
      <q-input
        v-model.number="localParams.timeCapMinutes"
        type="number"
        dense
        outlined
        :min="1"
        :max="60"
        label="Tiempo limite (min)"
        clearable
        style="max-width: 140px"
        @blur="onBlur"
      />
    </div>

    <!-- Chipper -->
    <div v-else-if="localParams.type === 'chipper'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Chipper:</span>
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :min="1"
        :max="10"
        label="Rondas"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- Buy-in/Cash-out -->
    <div v-else-if="localParams.type === 'buy_in_cash_out'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Buy-in/Cash-out:</span>
      <q-input
        v-model.number="localParams.rounds"
        type="number"
        dense
        outlined
        :min="1"
        :max="10"
        label="Rondas"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- Cluster -->
    <div v-else-if="localParams.type === 'cluster'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Cluster:</span>
      <q-input
        v-model.number="localParams.clusterSize"
        type="number"
        dense
        outlined
        :min="1"
        :max="10"
        label="Reps por cluster"
        style="max-width: 120px"
        @blur="onBlur"
      />
      <q-input
        v-model.number="localParams.restBetweenClusters"
        type="number"
        dense
        outlined
        :min="10"
        :max="300"
        label="Descanso (seg)"
        style="max-width: 120px"
        @blur="onBlur"
      />
    </div>

    <!-- Ladder -->
    <div v-else-if="localParams.type === 'ladder'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Ladder:</span>
      <q-select
        v-model="localParams.direction"
        :options="ladderOptions"
        option-label="label"
        option-value="value"
        emit-value
        map-options
        dense
        outlined
        style="min-width: 150px"
        @update:model-value="onBlur"
      />
    </div>

    <!-- Time Cap -->
    <div v-else-if="localParams.type === 'time_cap'" class="row items-center q-gutter-sm">
      <span class="text-caption text-grey-7">Time Cap:</span>
      <q-input
        v-model.number="localParams.minutes"
        type="number"
        dense
        outlined
        :min="1"
        :max="60"
        label="Minutos"
        style="max-width: 100px"
        @blur="onBlur"
      />
    </div>

    <!-- Standard / Unbroken / Couplet / Triplet / For Max - no configurable params -->
    <div
      v-else-if="['standard', 'unbroken', 'couplet', 'triplet', 'for_max'].includes(localParams.type)"
      class="text-caption text-grey-6 q-py-xs"
    >
      Sin parametros configurables
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormatParamsLocal = Record<string, any>;

const props = defineProps<{
  formatParams: Record<string, unknown> | null;
  formatName: string;
  blockId: number;
  sessionId: number;
}>();

const emit = defineEmits<{
  (e: 'update:formatParams', params: Record<string, unknown>): void;
}>();

// Deep copy to avoid mutating props. Typed as `any` record for v-model compatibility.
const localParams = ref<FormatParamsLocal | null>(
  props.formatParams ? JSON.parse(JSON.stringify(props.formatParams)) : null
);

// Watch for prop changes (e.g., after format change resets params)
watch(() => props.formatParams, (newVal) => {
  localParams.value = newVal ? JSON.parse(JSON.stringify(newVal)) : null;
}, { deep: true });

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

function initializeDefaults() {
  // Map formatName to a basic default params object
  const normalized = props.formatName.toLowerCase().trim().replace(/\s+/g, '_');

  const defaultsMap: Record<string, FormatParamsLocal> = {
    amrap: { type: 'amrap', minutes: 10 },
    emom: { type: 'emom', intervalSeconds: 60, totalMinutes: 5 },
    complex: { type: 'complex', rounds: 3 },
    tabata: { type: 'tabata', workSeconds: 20, restSeconds: 10, rounds: 8 },
    interval: { type: 'interval', workSeconds: 40, restSeconds: 20, rounds: 8 },
    for_time: { type: 'for_time' },
    chipper: { type: 'chipper', rounds: 1 },
    buy_in_cash_out: { type: 'buy_in_cash_out', rounds: 3 },
    cluster: { type: 'cluster', clusterSize: 3, restBetweenClusters: 90 },
    ladder: { type: 'ladder', direction: 'ascending' },
    unbroken: { type: 'unbroken' },
    couplet: { type: 'couplet' },
    triplet: { type: 'triplet' },
    for_max: { type: 'for_max' },
    time_cap: { type: 'time_cap', minutes: 10 },
  };

  // Try matching with includes for partial names
  let defaultParams: FormatParamsLocal = { type: 'standard' };
  if (defaultsMap[normalized]) {
    defaultParams = defaultsMap[normalized];
  } else {
    for (const [key, val] of Object.entries(defaultsMap)) {
      if (normalized.includes(key)) {
        defaultParams = val;
        break;
      }
    }
  }

  localParams.value = { ...defaultParams };
  lastEmitted = JSON.stringify(localParams.value);
  emit('update:formatParams', { ...localParams.value });
}
</script>

<style scoped>
.format-params-editor {
  padding: 0;
}
</style>
