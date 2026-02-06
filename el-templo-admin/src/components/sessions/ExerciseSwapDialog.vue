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

      <!-- Contraction tabs -->
      <div class="filter-title q-ml-md q-mt-sm row items-center q-gutter-xs">
        <span class="text-subtitle2 text-weight-medium">Tipo de contraccion</span>
        <q-badge v-if="contractionTab" color="primary" :label="contractionTab" class="q-ml-xs" />
      </div>
      <q-tabs
        v-model="contractionTab"
        dense
        class="text-grey q-mt-xs"
        active-color="primary"
        indicator-color="primary"
        align="justify"
        narrow-indicator
      >
        <q-tab name="" label="Todos" :disable="loading" />
        <q-tab name="CON" :disable="loading">
          <div class="row items-center no-wrap q-gutter-xs">
            <q-badge color="blue-grey" label="CON" />
            <span v-if="contractionCounts.CON" class="text-caption">({{ contractionCounts.CON }})</span>
          </div>
        </q-tab>
        <q-tab name="EXC" :disable="loading">
          <div class="row items-center no-wrap q-gutter-xs">
            <q-badge color="teal" label="EXC" />
            <span v-if="contractionCounts.EXC" class="text-caption">({{ contractionCounts.EXC }})</span>
          </div>
        </q-tab>
        <q-tab name="ISO" :disable="loading">
          <div class="row items-center no-wrap q-gutter-xs">
            <q-badge color="orange" label="ISO" />
            <span v-if="contractionCounts.ISO" class="text-caption">({{ contractionCounts.ISO }})</span>
          </div>
        </q-tab>
      </q-tabs>
      <q-separator />

      <!-- Pattern chips -->
      <q-card-section class="q-py-xs">
        <div class="filter-title row items-center q-gutter-xs q-mb-xs">
          <span class="text-subtitle2 text-weight-medium">Patron</span>
          <q-badge v-if="selectedGroup" color="primary" :label="selectedGroup" class="q-ml-xs" />
        </div>
        <div class="row q-gutter-xs items-center" style="flex-wrap: wrap">
          <q-chip
            v-for="p in patternChips"
            :key="p.name"
            :selected="selectedGroup === p.name"
            clickable
            dense
            :outline="selectedGroup !== p.name"
            :color="selectedGroup === p.name ? 'primary' : undefined"
            :text-color="selectedGroup === p.name ? 'white' : 'grey-8'"
            @click="selectedGroup = p.name"
          >
            {{ p.label }} ({{ p.count }})
          </q-chip>
        </div>
      </q-card-section>

      <!-- Search -->
      <q-card-section class="q-pt-none q-pb-none">
        <div class="filter-title row items-center q-gutter-xs q-mb-xs">
          <span class="text-subtitle2 text-weight-medium">Nombre del ejercicio</span>
          <q-badge v-if="searchText" color="primary" :label="searchText" class="q-ml-xs" />
        </div>
        <q-input
          v-model="searchText"
          label="Buscar ejercicio"
          dense
          outlined
          clearable
          debounce="300"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
          <template #append>
            <span v-if="!loading" class="text-caption text-grey">
              {{ displayedExercises.length }} resultado{{ displayedExercises.length !== 1 ? 's' : '' }}
            </span>
          </template>
        </q-input>
      </q-card-section>

      <!-- Exercise list -->
      <q-card-section class="q-pt-sm">
        <div v-if="loading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="40px" color="primary" />
        </div>

        <div
          v-else-if="displayedExercises.length === 0"
          class="text-center q-pa-lg text-grey"
        >
          <q-icon name="info" size="md" class="q-mb-sm" />
          <div>No hay ejercicios disponibles</div>
        </div>

        <q-list v-else dense separator bordered class="rounded-borders exercise-pool-list">
          <q-item
            v-for="ex in displayedExercises"
            :key="ex.id"
            clickable
            :disable="swapping"
            @click="handleAction(ex)"
            class="exercise-item"
          >
            <q-item-section>
              <q-item-label class="text-weight-medium text-body2">
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
                  {{ ex.route }}
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

interface PoolExerciseWithSource extends PoolExercise {
  patternSource: 'pattern_1' | 'pattern_2';
}

interface PatternChip {
  name: string;
  label: string;
  count: number;
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
const contractionTab = ref<string>('');
const selectedGroup = ref<string>('');
const searchText = ref('');

// ── Helpers ──

/** Extract first word of exercise name as group key (e.g., "HT", "P.U", "LUNGE") */
function exerciseGroup(name: string): string {
  return name.split(' ')[0] || '';
}

// ── Derived data ──

// Contraction counts (from full pool, before group filter)
const contractionCounts = computed(() => {
  const counts = { CON: 0, EXC: 0, ISO: 0 };
  for (const ex of pool.value) {
    const key = normalizeContraction(ex.effort);
    if (key in counts) counts[key as keyof typeof counts]++;
  }
  return counts;
});

// Pool filtered by contraction only (for group chip counts)
const contractionFiltered = computed(() => {
  if (!contractionTab.value) return pool.value;
  return pool.value.filter(ex =>
    normalizeContraction(ex.effort) === contractionTab.value
  );
});

// Group chips based on first word of exercise name, with counts
const patternChips = computed<PatternChip[]>(() => {
  const counts = new Map<string, number>();
  for (const ex of contractionFiltered.value) {
    const g = exerciseGroup(ex.exercise);
    counts.set(g, (counts.get(g) || 0) + 1);
  }

  const chips: PatternChip[] = [];

  // "Todos" chip first
  chips.push({
    name: '',
    label: 'Todos',
    count: contractionFiltered.value.length,
  });

  // Group chips sorted by count descending
  const sorted = [...counts.entries()].sort(([, ca], [, cb]) => cb - ca);

  for (const [name, count] of sorted) {
    chips.push({
      name,
      label: name || '?',
      count,
    });
  }

  return chips;
});

// Final displayed exercises: contraction + group + search, sorted by difficulty proximity
const displayedExercises = computed(() => {
  let result = contractionFiltered.value;

  // Filter by selected group (first word)
  if (selectedGroup.value) {
    result = result.filter(ex => exerciseGroup(ex.exercise) === selectedGroup.value);
  }

  // Filter by search text
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

// ── Watchers ──

// Fetch all exercises once when dialog opens
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      searchText.value = '';
      // Default to all contractions
      contractionTab.value = '';
      // Default to current exercise's group (first word of name)
      selectedGroup.value = isAddMode.value
        ? ''
        : exerciseGroup(props.currentExercise.exerciseName);
      await fetchPool();
    }
  },
  { immediate: true }
);

// Reset group selection when contraction tab changes if selected group disappears
watch(contractionTab, () => {
  if (selectedGroup.value) {
    const groupStillExists = contractionFiltered.value.some(
      ex => exerciseGroup(ex.exercise) === selectedGroup.value
    );
    if (!groupStillExists) {
      selectedGroup.value = '';
    }
  }
});

// ── Methods ──

async function fetchPool() {
  loading.value = true;
  pool.value = [];
  try {
    const response = await editApi.fetchExercisePool({
      route: props.blockRoute,
      blockId: props.blockId,
      pattern: props.blockPattern,
    });
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

// ── Helpers ──

function normalizeContraction(contraction: string | null | undefined): string {
  switch (contraction?.toUpperCase()) {
    case 'CON':
    case 'CONCENTRICO':
      return 'CON';
    case 'EXC':
    case 'EXCENTRICO':
      return 'EXC';
    case 'ISO':
    case 'ISOMETRICO':
      return 'ISO';
    default:
      return contraction?.toUpperCase() || '';
  }
}

function contractionLabel(contraction: string | null | undefined): string {
  return normalizeContraction(contraction) || '-';
}

function contractionColor(contraction: string | null | undefined): string {
  switch (normalizeContraction(contraction)) {
    case 'CON': return 'blue-grey';
    case 'EXC': return 'teal';
    case 'ISO': return 'orange';
    default: return 'grey';
  }
}
</script>

<style scoped>
.exercise-pool-list {
  max-height: 350px;
  overflow-y: auto;
}
.exercise-item {
  padding-top: 6px;
  padding-bottom: 6px;
}
</style>
