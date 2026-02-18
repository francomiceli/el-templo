<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :persistent="swapping"
  >
    <q-card style="width: 700px; max-width: 90vw; max-height: 90vh; display: block" class="column">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ dialogTitle }}</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="swapping" v-close-popup />
      </q-card-section>

      <!-- Current exercise info (swap mode only, not mobility) -->
      <q-card-section
        v-if="!isAddMode && !mobilityMode"
        class="q-pt-sm q-pb-none"
        style="justify-items: center"
      >
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

      <!-- Section toggle (not in mobility mode) -->
      <q-card-section v-if="!mobilityMode" class="q-py-sm q-pt-md" style="justify-self: center">
        <q-btn-toggle
          v-model="activeSection"
          no-caps
          rounded
          unelevated
          toggle-color="primary"
          color="white"
          text-color="primary"
          class="section-toggle"
          :options="[
            { label: 'Recomendados', value: 'recommended' },
            { label: 'Buscar en base de datos', value: 'database' },
          ]"
        />
      </q-card-section>

      <!-- Scrollable content -->
      <div style="overflow-y: auto; flex: 0 1 auto; min-height: 0">
        <!-- ===== SECTION 1: Recommended exercises for this block ===== -->
        <template v-if="activeSection === 'recommended' || mobilityMode">
          <!-- Contraction tabs -->
          <div class="filter-title q-ml-md q-mt-sm row items-center q-gutter-xs">
            <span class="text-subtitle2 text-weight-medium">Tipo de contraccion</span>
            <q-badge
              v-if="contractionTab"
              color="primary"
              :label="contractionTab"
              class="q-ml-xs"
            />
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
                <span v-if="contractionCounts.CON" class="text-caption"
                  >({{ contractionCounts.CON }})</span
                >
              </div>
            </q-tab>
            <q-tab name="EXC" :disable="loading">
              <div class="row items-center no-wrap q-gutter-xs">
                <q-badge color="teal" label="EXC" />
                <span v-if="contractionCounts.EXC" class="text-caption"
                  >({{ contractionCounts.EXC }})</span
                >
              </div>
            </q-tab>
            <q-tab name="ISO" :disable="loading">
              <div class="row items-center no-wrap q-gutter-xs">
                <q-badge color="orange" label="ISO" />
                <span v-if="contractionCounts.ISO" class="text-caption"
                  >({{ contractionCounts.ISO }})</span
                >
              </div>
            </q-tab>
          </q-tabs>
          <q-separator />

          <!-- Category chips (hidden in mobility mode) -->
          <q-card-section v-if="!mobilityMode" class="q-py-xs">
            <div class="filter-title row items-center q-gutter-xs q-mb-xs">
              <span class="text-subtitle2 text-weight-medium">Categoria</span>
              <q-badge
                v-if="selectedCategory"
                color="primary"
                :label="selectedCategory"
                class="q-ml-xs"
              />
            </div>
            <div class="row q-gutter-xs items-center" style="flex-wrap: wrap">
              <q-chip
                v-for="c in categoryChips"
                :key="c.name"
                :selected="selectedCategory === c.name"
                clickable
                dense
                :outline="selectedCategory !== c.name"
                :color="selectedCategory === c.name ? 'primary' : undefined"
                :text-color="selectedCategory === c.name ? 'white' : 'grey-8'"
                @click="selectedCategory = c.name"
              >
                {{ c.label }} ({{ c.count }})
              </q-chip>
            </div>
          </q-card-section>

          <!-- Pool search -->
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
                  {{ displayedExercises.length }} resultado{{
                    displayedExercises.length !== 1 ? 's' : ''
                  }}
                </span>
              </template>
            </q-input>
          </q-card-section>

          <!-- Pool exercise list -->
          <q-card-section class="q-pt-sm">
            <div v-if="loading" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="40px" color="primary" />
            </div>

            <div v-else-if="displayedExercises.length === 0" class="text-center q-pa-md text-grey">
              <q-icon name="info" size="md" class="q-mb-sm" />
              <div>No hay ejercicios disponibles</div>
            </div>

            <q-list v-else dense separator bordered class="rounded-borders exercise-pool-list">
              <exercise-pool-item
                v-for="ex in displayedExercises"
                :key="ex.id"
                :exercise="ex"
                :is-add-mode="isAddMode"
                :mobility-mode="mobilityMode"
                :disabled="swapping"
                :show-spinner="swappingId === ex.id"
                show-pattern-badge
                @select="handleAction(ex)"
              />
            </q-list>
          </q-card-section>
        </template>

        <!-- ===== SECTION 2: Search from database ===== -->
        <template v-if="activeSection === 'database' && !mobilityMode">
          <q-card-section class="q-pt-sm q-pb-none">
            <q-input
              v-model="dbSearchText"
              label="Buscar ejercicio..."
              dense
              outlined
              clearable
              debounce="300"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
              <template #append>
                <span
                  v-if="!dbSearchLoading && dbSearchResults.length > 0"
                  class="text-caption text-grey"
                >
                  {{ dbSearchResults.length }} resultado{{
                    dbSearchResults.length !== 1 ? 's' : ''
                  }}
                </span>
              </template>
            </q-input>
          </q-card-section>

          <q-card-section class="q-pt-sm">
            <!-- Minimum characters hint -->
            <div
              v-if="!dbSearchText || dbSearchText.length < 2"
              class="text-center q-pa-md text-grey"
            >
              <q-icon name="search" size="md" class="q-mb-sm" /><br />
              Escribe al menos 2 caracteres para buscar
            </div>

            <!-- Loading spinner -->
            <div v-else-if="dbSearchLoading" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="40px" color="primary" />
            </div>

            <!-- No results -->
            <div v-else-if="dbSearchResults.length === 0" class="text-center q-pa-md text-grey">
              <q-icon name="info" size="md" class="q-mb-sm" /><br />
              No se encontraron ejercicios
            </div>

            <!-- Results list -->
            <q-list v-else dense separator bordered class="rounded-borders exercise-pool-list">
              <exercise-pool-item
                v-for="ex in dbSearchResults"
                :key="'db-' + ex.id"
                :exercise="ex"
                :is-add-mode="isAddMode"
                :mobility-mode="false"
                :disabled="swapping"
                :show-spinner="swappingId === ex.id"
                @select="handleAction(ex)"
              />
            </q-list>
          </q-card-section>
        </template>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useEditApi } from 'src/composables/useEditApi';
import type { SessionExercise, PoolExercise } from 'src/types/session';
import {
  normalizeContraction,
  contractionLabel,
  contractionColor,
} from 'src/utils/contraction-helpers';
import ExercisePoolItem from './ExercisePoolItem.vue';

interface PoolExerciseWithSource extends PoolExercise {
  patternSource: 'pattern_1' | 'pattern_2';
}

interface PatternChip {
  name: string;
  label: string;
  count: number;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    sessionId: number;
    blockId: number;
    currentExercise: SessionExercise;
    blockRoute: string;
    blockPattern: string;
    mode?: 'swap' | 'add';
    mobilityMode?: boolean;
  }>(),
  {
    mode: 'swap',
    mobilityMode: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'swapped'): void;
  (e: 'added'): void;
  (e: 'swapped-mobility'): void;
}>();

const isAddMode = computed(() => props.mode === 'add' && !props.mobilityMode);

const dialogTitle = computed(() => {
  if (props.mobilityMode) return 'Cambiar Ejercicio de Movilidad';
  if (isAddMode.value) return 'Agregar Ejercicio';
  return 'Reemplazar Ejercicio';
});

const $q = useQuasar();
const editApi = useEditApi();

// === Pool state (Section 1) ===
const pool = ref<PoolExerciseWithSource[]>([]);
const loading = ref(false);
const swapping = ref(false);
const swappingId = ref<number | null>(null);
const contractionTab = ref<string>('');
const selectedCategory = ref<string>('');
const searchText = ref('');

// === Section toggle ===
const activeSection = ref<'recommended' | 'database'>('recommended');

// === Database search state (Section 2) ===
const dbSearchText = ref('');
const dbSearchResults = ref<PoolExerciseWithSource[]>([]);
const dbSearchLoading = ref(false);

// ── Pool derived data ──

const contractionCounts = computed(() => {
  const counts = { CON: 0, EXC: 0, ISO: 0 };
  for (const ex of pool.value) {
    const key = normalizeContraction(ex.effort);
    if (key in counts) counts[key as keyof typeof counts]++;
  }
  return counts;
});

const contractionFiltered = computed(() => {
  if (!contractionTab.value) return pool.value;
  return pool.value.filter((ex) => normalizeContraction(ex.effort) === contractionTab.value);
});

const categoryChips = computed<PatternChip[]>(() => {
  const counts = new Map<string, number>();
  for (const ex of contractionFiltered.value) {
    const cat = ex.category || 'Sin categoria';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  const chips: PatternChip[] = [];
  chips.push({
    name: '',
    label: 'Todos',
    count: contractionFiltered.value.length,
  });

  const sorted = [...counts.entries()].sort(([, ca], [, cb]) => cb - ca);
  for (const [name, count] of sorted) {
    chips.push({ name, label: name, count });
  }

  return chips;
});

const displayedExercises = computed(() => {
  let result = contractionFiltered.value;

  if (selectedCategory.value) {
    result = result.filter((ex) => (ex.category || 'Sin categoria') === selectedCategory.value);
  }

  if (searchText.value) {
    const term = searchText.value.toLowerCase();
    result = result.filter((ex) => ex.exercise.toLowerCase().includes(term));
  }

  if (props.mobilityMode) {
    return [...result].sort((a, b) => {
      const aRelevant = a.patternSource === 'pattern_1' ? 0 : 1;
      const bRelevant = b.patternSource === 'pattern_1' ? 0 : 1;
      if (aRelevant !== bRelevant) return aRelevant - bRelevant;
      return a.dificultadLineal - b.dificultadLineal;
    });
  }

  const targetDifficulty = props.currentExercise.dificultadLineal ?? 0;
  return [...result].sort(
    (a, b) =>
      Math.abs(a.dificultadLineal - targetDifficulty) -
      Math.abs(b.dificultadLineal - targetDifficulty)
  );
});

// ── Watchers ──

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      searchText.value = '';
      contractionTab.value = '';
      selectedCategory.value = '';
      activeSection.value = 'recommended';
      dbSearchText.value = '';
      dbSearchResults.value = [];
      await fetchPool();
    }
  },
  { immediate: true }
);

watch(contractionTab, () => {
  if (selectedCategory.value) {
    const categoryStillExists = categoryChips.value.some(
      (chip) => chip.name === selectedCategory.value
    );
    if (!categoryStillExists) {
      selectedCategory.value = '';
    }
  }
});

// Database search watcher
watch(dbSearchText, async (text) => {
  if (!text || text.length < 2) {
    dbSearchResults.value = [];
    return;
  }

  dbSearchLoading.value = true;
  try {
    const response = await editApi.searchExercises({
      q: text,
      blockId: props.blockId,
      contraction: contractionTab.value || undefined,
    });
    dbSearchResults.value = (response.exercises as PoolExerciseWithSource[]) || [];
  } catch {
    dbSearchResults.value = [];
  } finally {
    dbSearchLoading.value = false;
  }
});

// ── Methods ──

async function fetchPool() {
  loading.value = true;
  pool.value = [];
  try {
    if (props.mobilityMode) {
      const response = await editApi.fetchMobilityPool(props.blockRoute);
      pool.value = (response.exercises as PoolExerciseWithSource[]) || [];
    } else {
      const response = await editApi.fetchExercisePool({
        route: props.blockRoute,
        blockId: props.blockId,
        pattern: props.blockPattern,
      });
      pool.value = (response.exercises as PoolExerciseWithSource[]) || [];

      if (!isAddMode.value && pool.value.length > 0) {
        const currentInPool = pool.value.find((ex) => ex.id === props.currentExercise.exerciseId);
        if (currentInPool) {
          selectedCategory.value = currentInPool.category || 'Sin categoria';
        }
      }
    }
  } catch {
    $q.notify({
      type: 'negative',
      message: props.mobilityMode
        ? 'Error cargando ejercicios de movilidad'
        : 'Error cargando ejercicios disponibles',
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
    if (props.mobilityMode) {
      await editApi.swapMobilityExercise(props.sessionId, props.blockId, exercise.id);
      $q.notify({ type: 'positive', message: 'Ejercicio de movilidad cambiado' });
      emit('swapped-mobility');
    } else if (isAddMode.value) {
      await editApi.addExercise(props.sessionId, props.blockId, exercise.id);
      $q.notify({ type: 'positive', message: 'Ejercicio agregado al bloque' });
      emit('added');
    } else {
      await editApi.swapExercise(
        props.sessionId,
        props.blockId,
        props.currentExercise.id,
        exercise.id
      );
      $q.notify({ type: 'positive', message: 'Ejercicio reemplazado' });
      emit('swapped');
    }
    emit('update:modelValue', false);
  } catch {
    $q.notify({
      type: 'negative',
      message: props.mobilityMode
        ? 'Error cambiando ejercicio de movilidad'
        : isAddMode.value
          ? 'Error agregando ejercicio'
          : 'Error reemplazando ejercicio',
    });
  } finally {
    swapping.value = false;
    swappingId.value = null;
  }
}
</script>

<style scoped>
.exercise-pool-list {
  max-height: 250px;
  overflow-y: auto;
}
.section-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
  align-items: center;
}
</style>
