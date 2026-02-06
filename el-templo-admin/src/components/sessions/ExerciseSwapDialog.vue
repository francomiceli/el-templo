<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :persistent="swapping"
  >
    <q-card style="width: 700px; max-width: 90vw">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ isAddMode ? 'Agregar Ejercicio' : 'Reemplazar Ejercicio' }}</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="swapping" v-close-popup />
      </q-card-section>

      <!-- Current exercise info (swap mode only) -->
      <q-card-section v-if="!isAddMode" class="q-pt-sm q-pb-none">
        <div class="text-caption text-grey">Reemplazando:</div>
        <div class="text-body2 row items-center q-gutter-xs q-mt-xs">
          <span class="text-weight-medium">{{ currentExercise.exerciseName }}</span>
          <q-badge :color="contractionColor(currentExercise.contraction)">
            {{ contractionLabel(currentExercise.contraction) }}
          </q-badge>
          <q-badge outline color="grey-7">
            Dif: {{ currentExercise.dificultadLineal ?? '-' }}
          </q-badge>
        </div>
      </q-card-section>

      <!-- Filters -->
      <q-card-section class="q-pt-sm q-pb-none">
        <div class="row q-gutter-sm items-end">
          <q-select
            v-model="contractionFilter"
            :options="contractionOptions"
            label="Tipo contraccion"
            dense
            outlined
            emit-value
            map-options
            style="min-width: 150px"
          />
          <q-input
            v-model="searchText"
            label="Buscar ejercicio"
            dense
            outlined
            clearable
            debounce="300"
            class="col"
          >
            <template #prepend>
              <q-icon name="search" />
            </template>
          </q-input>
        </div>
      </q-card-section>

      <!-- Exercise pool list -->
      <q-card-section class="q-pt-sm">
        <!-- Loading state -->
        <div v-if="loading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="40px" color="primary" />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="filteredAndSortedPool.length === 0"
          class="text-center q-pa-lg text-grey"
        >
          <q-icon name="info" size="md" class="q-mb-sm" />
          <div>No hay ejercicios disponibles</div>
        </div>

        <!-- Exercise list -->
        <q-list
          v-else
          separator
          bordered
          class="rounded-borders exercise-pool-list"
        >
          <q-item
            v-for="ex in filteredAndSortedPool"
            :key="ex.id"
            clickable
            :disable="swapping"
            @click="handleAction(ex)"
          >
            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ ex.exercise }}
              </q-item-label>
              <q-item-label caption>
                <q-badge
                  :color="contractionColor(ex.effort)"
                  class="q-mr-xs"
                >
                  {{ contractionLabel(ex.effort) }}
                </q-badge>
                <q-badge outline color="grey-7" class="q-mr-xs">
                  Dif: {{ ex.dificultadLineal }}
                </q-badge>
                <q-badge
                  v-if="ex.patternSource === 'pattern_2'"
                  color="deep-orange"
                  text-color="white"
                  class="q-mr-xs"
                >
                  Cruce
                </q-badge>
                <q-badge
                  v-else
                  outline
                  color="blue-grey"
                  class="q-mr-xs"
                >
                  {{ truncatePattern(ex.pattern) }}
                </q-badge>
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <q-spinner-dots
                v-if="swappingId === ex.id"
                size="24px"
                color="primary"
              />
              <q-btn
                v-else
                flat
                dense
                round
                :icon="isAddMode ? 'add_circle' : 'swap_horiz'"
                color="primary"
                :disable="swapping"
                @click.stop="handleAction(ex)"
              >
                <q-tooltip>{{ isAddMode ? 'Agregar este ejercicio' : 'Reemplazar con este ejercicio' }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useEditApi } from 'src/composables/useEditApi';
import type { SessionExercise, PoolExercise } from 'src/types/session';

// Extended PoolExercise with patternSource from the API
interface PoolExerciseWithSource extends PoolExercise {
  patternSource: 'pattern_1' | 'pattern_2';
}

const props = withDefaults(defineProps<{
  modelValue: boolean;
  sessionId: number;
  blockId: number;
  currentExercise: SessionExercise;
  blockRoute: string;
  blockPattern: string;
  mode?: 'swap' | 'add';
}>(), {
  mode: 'swap',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'swapped'): void;
  (e: 'added'): void;
}>();

const isAddMode = computed(() => props.mode === 'add');

const $q = useQuasar();
const editApi = useEditApi();

// State
const pool = ref<PoolExerciseWithSource[]>([]);
const loading = ref(false);
const swapping = ref(false);
const swappingId = ref<number | null>(null);
const contractionFilter = ref<string>('');
const searchText = ref('');

// Contraction filter options
const contractionOptions = [
  { label: 'Todos', value: '' },
  { label: 'CON', value: 'CON' },
  { label: 'EXC', value: 'EXC' },
  { label: 'ISO', value: 'ISO' },
];

// Filtered and sorted pool
const filteredAndSortedPool = computed(() => {
  let result = pool.value;

  // Client-side search filter
  if (searchText.value) {
    const term = searchText.value.toLowerCase();
    result = result.filter(ex =>
      ex.exercise.toLowerCase().includes(term)
    );
  }

  // Sort by difficulty proximity to current exercise
  const targetDifficulty = props.currentExercise.dificultadLineal ?? 0;
  return [...result].sort(
    (a, b) =>
      Math.abs(a.dificultadLineal - targetDifficulty) -
      Math.abs(b.dificultadLineal - targetDifficulty)
  );
});

// Fetch pool when dialog opens
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      searchText.value = '';
      contractionFilter.value = '';
      await fetchPool();
    }
  }
);

// Re-fetch pool when contraction filter changes
watch(contractionFilter, () => {
  if (props.modelValue) {
    fetchPool();
  }
});

async function fetchPool() {
  loading.value = true;
  pool.value = [];
  try {
    const params: {
      route: string;
      blockId: number;
      contraction?: string;
      pattern?: string;
    } = {
      route: props.blockRoute,
      blockId: props.blockId,
      pattern: props.blockPattern,
    };
    if (contractionFilter.value) {
      params.contraction = contractionFilter.value;
    }

    const response = await editApi.fetchExercisePool(params);
    // The API returns exercises with patternSource from the backend
    pool.value = (response.exercises as PoolExerciseWithSource[]) || [];
  } catch {
    $q.notify({
      type: 'negative',
      message: 'Error cargando ejercicios disponibles',
    });
  } finally {
    loading.value = false;
  }
}

async function handleAction(exercise: PoolExerciseWithSource) {
  if (swapping.value) return;

  swapping.value = true;
  swappingId.value = exercise.id;
  try {
    if (isAddMode.value) {
      await editApi.addExercise(
        props.sessionId,
        props.blockId,
        exercise.id
      );
      $q.notify({
        type: 'positive',
        message: 'Ejercicio agregado al bloque',
      });
      emit('added');
    } else {
      await editApi.swapExercise(
        props.sessionId,
        props.blockId,
        props.currentExercise.id,
        exercise.id
      );
      $q.notify({
        type: 'positive',
        message: 'Ejercicio reemplazado',
      });
      emit('swapped');
    }
    emit('update:modelValue', false);
  } catch {
    $q.notify({
      type: 'negative',
      message: isAddMode.value ? 'Error agregando ejercicio' : 'Error reemplazando ejercicio',
    });
  } finally {
    swapping.value = false;
    swappingId.value = null;
  }
}

// Helpers
function contractionLabel(contraction: string | null | undefined): string {
  switch (contraction?.toLowerCase()) {
    case 'con':
    case 'concentrico':
      return 'CON';
    case 'exc':
    case 'excentrico':
      return 'EXC';
    case 'iso':
    case 'isometrico':
      return 'ISO';
    default:
      return contraction || '-';
  }
}

function contractionColor(contraction: string | null | undefined): string {
  switch (contraction?.toLowerCase()) {
    case 'con':
    case 'concentrico':
      return 'blue-grey';
    case 'exc':
    case 'excentrico':
      return 'teal';
    case 'iso':
    case 'isometrico':
      return 'orange';
    default:
      return 'grey';
  }
}

function truncatePattern(pattern: string): string {
  if (pattern.length > 18) {
    return pattern.slice(0, 16) + '...';
  }
  return pattern;
}
</script>

<style scoped>
.exercise-pool-list {
  max-height: 400px;
  overflow-y: auto;
}
</style>
