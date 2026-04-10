<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Ejercicios</div>
      <q-space />
      <q-btn
        label="Subida Masiva"
        icon="cloud_upload"
        outline
        color="primary"
        class="q-mr-sm"
        :loading="exercisesApi.loading.value && allExercises.length === 0"
        :disable="!uploadsEnabled"
        @click="openBulkUpload"
      >
        <q-tooltip v-if="!uploadsEnabled">Solo disponible en produccion</q-tooltip>
      </q-btn>
      <q-btn label="Crear Ejercicio" icon="add" color="primary" @click="showCreateDialog = true" />
    </div>

    <!-- Exercise data gap alerts -->
    <q-banner class="bg-warning text-white q-mb-sm" rounded>
      <template #avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-medium">Ruta SS — Esfuerzo sin especificar</div>
      <div class="text-caption q-mt-xs">
        13 de 19 ejercicios en la ruta SS (Sissy Squat) no tienen tipo de esfuerzo asignado
        (CON/EXC/ISO). Esto impide que el generador de sesiones personalizadas los encuentre.
        Filtrar por Ruta = SS y asignar el esfuerzo correspondiente a cada ejercicio.
      </div>
    </q-banner>

    <q-banner class="bg-warning text-white q-mb-md" rounded>
      <template #avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-weight-medium">Ruta HR — Ejercicios incompletos</div>
      <div class="text-caption q-mt-xs">
        La ruta HR (Core Posterior / Core Lateral) no tiene ejercicios para niveles Omega y Spartan,
        y le faltan variantes EXC en esos niveles. Esto impide generar sesiones personalizadas de
        Tren Superior cuando el bloque cae en HR para alumnos avanzados. Agregar ejercicios HR en
        niveles omega/spartan con esfuerzo CON, EXC e ISO para habilitarla.
      </div>
    </q-banner>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-3">
        <q-input
          v-model="filters.search"
          label="Buscar por nombre"
          dense
          outlined
          clearable
          debounce="300"
          @update:model-value="onFilterChange"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-6 col-sm">
        <q-select
          v-model="filters.category"
          :options="categoryOptions"
          label="Categoria"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-4 col-sm">
        <q-select
          v-model="filters.level"
          :options="levelOptions"
          label="Nivel"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-4 col-sm">
        <q-select
          v-model="filters.route"
          :options="routeOptions"
          label="Ruta"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-4 col-sm">
        <q-select
          v-model="filters.effort"
          :options="effortOptions"
          label="Contraccion"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-4 col-sm">
        <q-select
          v-model="filters.equipment"
          :options="equipmentFilterOptions"
          label="Equipo"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-12 col-sm-auto">
        <q-btn-toggle
          v-model="videoFilter"
          toggle-color="primary"
          :options="videoStatusOptions"
          dense
          unelevated
          spread
          @update:model-value="onVideoFilterChange"
        />
      </div>
    </div>

    <!-- QTable -->
    <q-table
      :rows="exercises"
      :columns="columns"
      row-key="id"
      :loading="exercisesApi.loading.value"
      :pagination="tablePagination"
      :rows-per-page-options="[25, 50, 100]"
      @request="onTableRequest"
    >
      <!-- Exercise name column: click to edit -->
      <template #body-cell-exercise="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <span
              v-if="editingNameId !== props.row.id"
              class="cursor-pointer"
              @click="startEditName(props.row)"
            >
              {{ props.row.exercise }}
              <q-icon name="edit" size="xs" color="grey-5" class="q-ml-xs" />
            </span>
            <q-input
              v-else
              v-model="editingNameValue"
              dense
              outlined
              autofocus
              class="q-mr-xs"
              style="min-width: 200px"
              @keyup.enter="saveEditName(props.row.id)"
              @keyup.escape="cancelEditName"
            >
              <template #after>
                <q-btn
                  flat
                  dense
                  icon="check"
                  color="positive"
                  @click="saveEditName(props.row.id)"
                />
                <q-btn flat dense icon="close" color="grey" @click="cancelEditName" />
              </template>
            </q-input>
          </div>
        </q-td>
      </template>

      <!-- Category column: inline editable select -->
      <template #body-cell-category="props">
        <q-td :props="props">
          <q-select
            :model-value="props.row.category"
            :options="createCategoryOptions"
            dense
            outlined
            emit-value
            map-options
            style="min-width: 140px"
            @update:model-value="(val: string) => onInlineCategoryChange(props.row.id, val)"
          />
        </q-td>
      </template>

      <!-- Effort column: inline select when empty -->
      <template #body-cell-effort="props">
        <q-td :props="props">
          <q-select
            v-if="!props.row.effort"
            :model-value="null"
            :options="inlineEffortOptions"
            label="Sin asignar"
            dense
            outlined
            emit-value
            map-options
            style="min-width: 110px"
            color="warning"
            @update:model-value="(val: string) => onInlineEffortChange(props.row.id, val)"
          />
          <span v-else>{{ props.row.effort }}</span>
        </q-td>
      </template>

      <!-- Equipment column: inline select, always editable -->
      <template #body-cell-equipment="props">
        <q-td :props="props">
          <q-select
            :model-value="props.row.equipment"
            :options="inlineEquipmentOptions"
            :label="props.row.equipment ? undefined : 'Sin asignar'"
            dense
            outlined
            emit-value
            map-options
            clearable
            style="min-width: 120px"
            :color="props.row.equipment ? 'primary' : 'warning'"
            @update:model-value="(val: string | null) => onInlineEquipmentChange(props.row.id, val)"
          />
        </q-td>
      </template>

      <!-- Video status column -->
      <template #body-cell-video="props">
        <q-td :props="props">
          <q-icon
            :name="props.row.videoUrl ? 'videocam' : 'videocam_off'"
            :color="props.row.videoUrl ? 'green' : 'grey-5'"
            size="sm"
          />
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-actions="props">
        <q-td :props="props">
          <!-- Uploading state -->
          <div
            v-if="videoUpload.isUploading(props.row.id)"
            class="row items-center no-wrap"
            style="min-width: 160px"
          >
            <q-linear-progress
              :value="videoUpload.getProgress(props.row.id) / 100"
              color="primary"
              class="q-mr-sm"
              style="flex: 1"
            />
            <span class="text-caption">{{ videoUpload.getProgress(props.row.id) }}%</span>
          </div>

          <!-- No video: Upload button -->
          <div v-else-if="!props.row.videoUrl" class="row no-wrap q-gutter-xs">
            <q-btn
              flat
              dense
              icon="upload"
              color="primary"
              label="Subir"
              :disable="!uploadsEnabled"
              @click="triggerUpload(props.row.id)"
            >
              <q-tooltip v-if="!uploadsEnabled">Solo disponible en produccion</q-tooltip>
            </q-btn>
          </div>

          <!-- Has video: View/Replace/Delete -->
          <div v-else class="row no-wrap q-gutter-xs">
            <q-btn
              flat
              dense
              icon="open_in_new"
              color="primary"
              @click="openVideo(props.row.videoUrl)"
            >
              <q-tooltip>Ver video</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="swap_horiz"
              color="positive"
              :disable="!uploadsEnabled"
              @click="triggerUpload(props.row.id)"
            >
              <q-tooltip>{{
                uploadsEnabled ? 'Reemplazar' : 'Solo disponible en produccion'
              }}</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="delete"
              color="negative"
              :disable="!uploadsEnabled"
              @click="confirmDeleteVideo(props.row.id, props.row.exercise)"
            >
              <q-tooltip>{{
                uploadsEnabled ? 'Eliminar video' : 'Solo disponible en produccion'
              }}</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </q-table>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".mp4,video/mp4"
      style="display: none"
      @change="onFileSelected"
    />

    <!-- Bulk Upload Dialog -->
    <BulkUploadDialog
      v-model="showBulkUpload"
      :exercises="allExercises"
      @upload-complete="loadExercises"
    />

    <!-- Create Exercise Dialog -->
    <q-dialog v-model="showCreateDialog">
      <q-card style="min-width: 540px; max-width: 600px">
        <q-card-section>
          <div class="text-h6">Crear Ejercicio</div>
        </q-card-section>
        <q-separator />

        <q-card-section class="q-pt-md">
          <!-- Name -->
          <q-input
            v-model="createForm.exercise"
            label="Nombre del ejercicio"
            outlined
            :rules="[(val) => !!val?.trim() || 'Requerido']"
            class="q-mb-sm"
          />

          <!-- Classification -->
          <div class="text-caption text-grey-7 q-mb-xs">Clasificacion</div>
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6">
              <q-select
                v-model="createForm.category"
                :options="createCategoryOptions"
                label="Categoria"
                outlined
                emit-value
                map-options
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="createForm.pattern"
                :options="createPatternOptions"
                label="Pattern"
                outlined
                emit-value
                map-options
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="createForm.route"
                :options="createRouteOptions"
                label="Ruta"
                outlined
                emit-value
                map-options
              />
            </div>
            <div v-if="!createForm.createVariants" class="col-6">
              <q-select
                v-model="createForm.effort"
                :options="createEffortOptions"
                label="Contraccion"
                outlined
                emit-value
                map-options
              />
            </div>
          </div>

          <!-- Contraction variants toggle -->
          <q-toggle
            v-model="createForm.createVariants"
            label="Crear con las 3 contracciones (CON / EXC / ISO)"
            class="q-mb-sm"
          />

          <!-- Level & Difficulty -->
          <div class="text-caption text-grey-7 q-mb-xs">Nivel y Dificultad</div>
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6">
              <q-select
                v-model="createForm.level"
                :options="createLevelOptions"
                label="Nivel"
                outlined
                emit-value
                map-options
                clearable
                @update:model-value="onLevelChange"
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="createForm.dificultadLineal"
                :options="difficultyOptions"
                :label="
                  createForm.createVariants ? 'Dificultad CON (la mas alta)' : 'Dificultad Lineal'
                "
                outlined
                emit-value
                map-options
                :disable="!createForm.level"
                :hint="!createForm.level ? 'Selecciona un nivel primero' : undefined"
              />
            </div>
          </div>

          <!-- Variant preview -->
          <div
            v-if="createForm.createVariants && createForm.level && createForm.dificultadLineal"
            class="q-mb-md q-pa-sm bg-grey-2 rounded-borders"
          >
            <div class="text-caption text-grey-8 q-mb-xs">Se crearan 3 ejercicios:</div>
            <div
              v-for="v in variantPreview"
              :key="v.effort"
              class="row items-center q-gutter-xs text-body2"
            >
              <q-badge
                :color="v.valid ? (v.differentLevel ? 'orange' : 'grey-7') : 'negative'"
                text-color="white"
                :label="v.effort"
              />
              <span>Dificultad {{ v.difficulty }}</span>
              <q-badge
                v-if="v.differentLevel && v.targetLevel"
                :label="v.targetLevel"
                color="orange"
                text-color="white"
                class="text-caption"
              />
              <span v-if="!v.valid" class="text-negative text-caption">(dificultad invalida)</span>
            </div>
          </div>

          <!-- Position -->
          <q-input
            v-model="createForm.position"
            label="Posicion"
            placeholder="Ej: O.A, O.L, TUCK, STRADDLE..."
            outlined
          />
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            :label="createForm.createVariants ? 'Crear 3 Ejercicios' : 'Crear Ejercicio'"
            icon="add"
            color="primary"
            :loading="creating"
            :disable="!createFormValid"
            @click="onCreateExercise"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { useExercisesApi } from 'src/composables/useExercisesApi';
import { useVideoUpload, uploadsEnabled } from 'src/composables/useVideoUpload';
import BulkUploadDialog from 'src/components/exercises/BulkUploadDialog.vue';
import type { Exercise } from 'src/types/exercise';

const $q = useQuasar();
const exercisesApi = useExercisesApi();
const videoUpload = useVideoUpload();

// =========================================================================
// State
// =========================================================================

const exercises = ref<Exercise[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadTargetId = ref<number | null>(null);
const videoFilter = ref<string>('all');
const showBulkUpload = ref(false);
const showCreateDialog = ref(false);
const creating = ref(false);
const allExercises = ref<Exercise[]>([]);
const editingNameId = ref<number | null>(null);
const editingNameValue = ref('');

const createForm = reactive({
  exercise: '',
  category: '',
  pattern: '',
  route: '',
  effort: 'CON',
  level: null as string | null,
  dificultadLineal: 1,
  position: '',
  createVariants: false,
});

const LEVEL_DIFFICULTY: Record<string, { min: number; max: number }> = {
  alfa: { min: 1, max: 3 },
  delta: { min: 4, max: 6 },
  sigma: { min: 7, max: 8 },
  omega: { min: 9, max: 10 },
  spartan: { min: 11, max: 12 },
};

/** Given a linear difficulty (1-12), return the level it belongs to */
function levelForDifficulty(d: number): string | null {
  for (const [level, range] of Object.entries(LEVEL_DIFFICULTY)) {
    if (d >= range.min && d <= range.max) return level;
  }
  return null;
}

const difficultyOptions = computed(() => {
  const level = createForm.level;
  if (!level || !LEVEL_DIFFICULTY[level]) return [];
  const { min, max } = LEVEL_DIFFICULTY[level];
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const val = min + i;
    return { label: String(val), value: val };
  });
});

function onLevelChange() {
  const level = createForm.level;
  if (level && LEVEL_DIFFICULTY[level]) {
    createForm.dificultadLineal = LEVEL_DIFFICULTY[level].min;
  }
}

const variantPreview = computed(() => {
  const base = createForm.dificultadLineal;
  const selectedLevel = createForm.level;
  if (!selectedLevel || !LEVEL_DIFFICULTY[selectedLevel]) return [];
  return [
    { effort: 'CON', difficulty: base },
    { effort: 'EXC', difficulty: base - 1 },
    { effort: 'ISO', difficulty: base - 2 },
  ].map((v) => {
    const targetLevel = levelForDifficulty(v.difficulty);
    return {
      ...v,
      targetLevel,
      valid: targetLevel !== null,
      differentLevel: targetLevel !== null && targetLevel !== selectedLevel,
    };
  });
});

const variantsValid = computed(() => {
  if (!createForm.createVariants) return true;
  return variantPreview.value.length === 3 && variantPreview.value.every((v) => v.valid);
});

const createFormValid = computed(
  () =>
    createForm.exercise.trim() !== '' &&
    createForm.category !== '' &&
    createForm.pattern !== '' &&
    createForm.route !== '' &&
    (createForm.createVariants || createForm.effort !== '') &&
    !!createForm.level &&
    createForm.dificultadLineal >= 1 &&
    variantsValid.value
);

const createCategoryOptions = [
  'PUSH HORIZONTAL',
  'PUSH VERTICAL',
  'PULL HORIZONTAL',
  'PULL VERTICAL',
  'KNEE DOMINANT',
  'HIP DOMINANT',
  'LUNGE',
  'CORE',
  'CORE ANTERIOR',
  'CORE POSTERIOR',
  'CORE LATERAL',
  'OBLICUOS',
  'BRIDGE',
  'PLYO',
  'POTENCIA',
  'CARDIO',
  'COORDINATIVO',
  'ESTABILIDAD',
  'MOVILIDAD',
  'DESPLAZAMIENTO',
  'SPAGAT',
  'UPPER',
].map((v) => ({ label: v, value: v }));

const createPatternOptions = [
  'PUSH',
  'PULL',
  'LOWER',
  'KL',
  'CORE',
  'PLYO',
  'CARDIO',
  'MOVILIDAD',
  'FLOW',
].map((v) => ({ label: v, value: v }));

const createRouteOptions = [
  'PL',
  'FL',
  'HT',
  'HS',
  'HSPU',
  'MU',
  'TTB',
  'OAP',
  'OAPU',
  'OAR',
  'PLPU',
  'PIKE',
  'SS',
  'SU',
  'PS',
  'DS',
  'QC',
  'BL',
  'AF',
  'NC',
  'FLR',
  'PHS',
  'L',
  'HR',
  'HD/ID',
  'MN/RP',
  'BRIDGE',
  'SPAGAT',
  'REVERSE HYPER',
  'SIDE PCK',
].map((v) => ({ label: v, value: v }));

const createEffortOptions = [
  { label: 'CON (Concentrico)', value: 'CON' },
  { label: 'EXC (Excentrico)', value: 'EXC' },
  { label: 'ISO (Isometrico)', value: 'ISO' },
];

const createLevelOptions = [
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

const filters = reactive({
  search: '',
  category: '',
  level: '',
  route: '',
  effort: '',
  equipment: '',
});

const tablePagination = ref({
  page: 1,
  rowsPerPage: 50,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// =========================================================================
// Filter options
// =========================================================================

const categoryOptions = [{ label: 'Todas', value: '' }, ...createCategoryOptions];

const levelOptions = [
  { label: 'Todos', value: '' },
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

const routeOptions = [{ label: 'Todas', value: '' }, ...createRouteOptions];

const inlineEffortOptions = [
  { label: 'CON', value: 'CON' },
  { label: 'EXC', value: 'EXC' },
  { label: 'ISO', value: 'ISO' },
];

const effortOptions = [
  { label: 'Todos', value: '' },
  { label: 'Sin asignar', value: 'empty' },
  { label: 'CON', value: 'CON' },
  { label: 'EXC', value: 'EXC' },
  { label: 'ISO', value: 'ISO' },
];

const equipmentFilterOptions = [
  { label: 'Todos', value: '' },
  { label: 'Sin asignar', value: 'empty' },
  { label: 'Barras', value: 'barras' },
  { label: 'Anillas', value: 'anillas' },
  { label: 'Paralelas', value: 'paralelas' },
  { label: 'Cajon', value: 'cajon' },
  { label: 'Ninguno', value: 'ninguno' },
];

const inlineEquipmentOptions = [
  { label: 'Barras', value: 'barras' },
  { label: 'Anillas', value: 'anillas' },
  { label: 'Paralelas', value: 'paralelas' },
  { label: 'Cajon', value: 'cajon' },
  { label: 'Ninguno', value: 'ninguno' },
];

const videoStatusOptions = [
  { label: 'Todos', value: 'all' },
  { label: 'Con Video', value: 'with' },
  { label: 'Sin Video', value: 'without' },
];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'id', label: 'ID', field: 'id', align: 'left', sortable: false, style: 'width: 60px' },
  { name: 'exercise', label: 'Nombre', field: 'exercise', align: 'left', sortable: false },
  { name: 'category', label: 'Categoria', field: 'category', align: 'left', sortable: false },
  { name: 'level', label: 'Nivel', field: 'level', align: 'left', sortable: false },
  { name: 'route', label: 'Ruta', field: 'route', align: 'left', sortable: false },
  { name: 'effort', label: 'Contraccion', field: 'effort', align: 'left', sortable: false },
  {
    name: 'equipment',
    label: 'Equipo',
    field: 'equipment',
    align: 'left',
    sortable: false,
    style: 'width: 130px',
  },
  {
    name: 'video',
    label: 'Video',
    field: 'videoUrl',
    align: 'center',
    sortable: false,
    style: 'width: 60px',
  },
  {
    name: 'actions',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 200px',
  },
];

// =========================================================================
// Data loading
// =========================================================================

async function loadExercises() {
  try {
    const hasVideoValue =
      videoFilter.value === 'with' ? true : videoFilter.value === 'without' ? false : undefined;

    const result = await exercisesApi.fetchExercises({
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
      search: filters.search || undefined,
      category: filters.category || undefined,
      level: filters.level || undefined,
      route: filters.route || undefined,
      effort: filters.effort || undefined,
      equipment: filters.equipment || undefined,
      hasVideo: hasVideoValue ?? null,
    });

    exercises.value = result.exercises;
    tablePagination.value.rowsNumber = result.total;
  } catch {
    // Error already handled by composable
  }
}

// =========================================================================
// Event handlers
// =========================================================================

function startEditName(row: Exercise) {
  editingNameId.value = row.id;
  editingNameValue.value = row.exercise;
}

function cancelEditName() {
  editingNameId.value = null;
  editingNameValue.value = '';
}

async function saveEditName(exerciseId: number) {
  const newName = editingNameValue.value.trim();
  if (!newName) return;
  try {
    await exercisesApi.updateExercise(exerciseId, { exercise: newName });
    $q.notify({ type: 'positive', message: 'Nombre actualizado' });
    cancelEditName();
    loadExercises();
  } catch {
    // Error handled by composable
  }
}

async function onInlineCategoryChange(exerciseId: number, category: string) {
  try {
    await exercisesApi.updateExercise(exerciseId, { category });
    $q.notify({ type: 'positive', message: `Categoria actualizada a ${category}` });
    loadExercises();
  } catch {
    // Error handled by composable
  }
}

async function onInlineEffortChange(exerciseId: number, effort: string) {
  try {
    await exercisesApi.updateExercise(exerciseId, { effort });
    $q.notify({ type: 'positive', message: `Contraccion actualizada a ${effort}` });
    loadExercises();
  } catch {
    // Error handled by composable
  }
}

async function onInlineEquipmentChange(exerciseId: number, equipment: string | null) {
  try {
    await exercisesApi.updateExercise(exerciseId, { equipment });
    $q.notify({
      type: 'positive',
      message: equipment ? `Equipo actualizado a ${equipment}` : 'Equipo removido',
    });
    loadExercises();
  } catch {
    // Error handled by composable
  }
}

function onFilterChange() {
  tablePagination.value.page = 1;
  loadExercises();
}

function onVideoFilterChange() {
  tablePagination.value.page = 1;
  loadExercises();
}

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadExercises();
}

function triggerUpload(exerciseId: number) {
  uploadTargetId.value = exerciseId;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || uploadTargetId.value == null) return;

  videoUpload.uploadVideo(uploadTargetId.value, file, () => {
    loadExercises();
  });
}

function openVideo(url: string) {
  window.open(url, '_blank');
}

function confirmDeleteVideo(exerciseId: number, exerciseName: string) {
  $q.dialog({
    title: 'Eliminar Video',
    message: `Eliminar el video de "${exerciseName}"? Esta accion no se puede deshacer.`,
    cancel: true,
    persistent: true,
    ok: {
      label: 'Eliminar',
      color: 'negative',
    },
  }).onOk(async () => {
    try {
      await exercisesApi.deleteVideo(exerciseId);
      $q.notify({ type: 'positive', message: 'Video eliminado' });
      loadExercises();
    } catch {
      // Error already handled by composable
    }
  });
}

async function onCreateExercise() {
  creating.value = true;
  try {
    const base = {
      exercise: createForm.exercise.trim(),
      category: createForm.category,
      pattern: createForm.pattern,
      route: createForm.route,
      level: createForm.level ?? undefined,
      position: createForm.position.trim() || undefined,
    };

    if (createForm.createVariants) {
      for (const v of variantPreview.value) {
        await exercisesApi.createExercise({
          ...base,
          effort: v.effort,
          level: v.targetLevel ?? base.level,
          dificultadLineal: v.difficulty,
          difficulty: v.difficulty,
        });
      }
      $q.notify({ type: 'positive', message: '3 ejercicios creados (CON / EXC / ISO)' });
    } else {
      await exercisesApi.createExercise({
        ...base,
        effort: createForm.effort,
        dificultadLineal: createForm.dificultadLineal,
        difficulty: createForm.dificultadLineal,
      });
      $q.notify({ type: 'positive', message: 'Ejercicio creado' });
    }

    showCreateDialog.value = false;
    createForm.exercise = '';
    createForm.position = '';
    createForm.dificultadLineal = 1;
    createForm.level = null;
    createForm.createVariants = false;
    loadExercises();
  } catch {
    // Error already handled by composable
  } finally {
    creating.value = false;
  }
}

async function openBulkUpload() {
  try {
    allExercises.value = await exercisesApi.fetchAllExercises();
    showBulkUpload.value = true;
  } catch {
    // Error already handled by composable
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadExercises();
});
</script>
