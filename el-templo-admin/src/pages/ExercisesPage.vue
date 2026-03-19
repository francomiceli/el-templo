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

    <!-- HR route data gap alert -->
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-1">
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
      <div class="col-12 col-sm-2">
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
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">Crear Ejercicio</div>
        </q-card-section>

        <q-card-section class="column q-gutter-sm">
          <q-input v-model="createForm.exercise" label="Nombre del ejercicio *" dense outlined />
          <div class="row q-gutter-sm">
            <q-select
              v-model="createForm.category"
              :options="createCategoryOptions"
              label="Categoria *"
              dense
              outlined
              emit-value
              map-options
              class="col"
            />
            <q-select
              v-model="createForm.pattern"
              :options="createPatternOptions"
              label="Pattern *"
              dense
              outlined
              emit-value
              map-options
              class="col"
            />
          </div>
          <div class="row q-gutter-sm">
            <q-select
              v-model="createForm.route"
              :options="createRouteOptions"
              label="Ruta *"
              dense
              outlined
              emit-value
              map-options
              class="col"
            />
            <q-select
              v-model="createForm.effort"
              :options="createEffortOptions"
              label="Contraccion *"
              dense
              outlined
              emit-value
              map-options
              class="col"
            />
          </div>
          <div class="row q-gutter-sm">
            <q-select
              v-model="createForm.level"
              :options="createLevelOptions"
              label="Nivel"
              dense
              outlined
              emit-value
              map-options
              clearable
              class="col"
            />
            <q-input
              v-model.number="createForm.dificultadLineal"
              type="number"
              label="Dificultad (1-12)"
              dense
              outlined
              :min="1"
              :max="12"
              class="col"
            />
          </div>
          <q-input v-model="createForm.position" label="Posicion (opcional)" dense outlined />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            label="Crear"
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

const createForm = reactive({
  exercise: '',
  category: '',
  pattern: '',
  route: '',
  effort: 'CON',
  level: null as string | null,
  dificultadLineal: 1,
  position: '',
});

const createFormValid = computed(
  () =>
    createForm.exercise.trim() !== '' &&
    createForm.category !== '' &&
    createForm.pattern !== '' &&
    createForm.route !== '' &&
    createForm.effort !== ''
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

const effortOptions = [
  { label: 'Todos', value: '' },
  { label: 'CON', value: 'CON' },
  { label: 'EXC', value: 'EXC' },
  { label: 'ISO', value: 'ISO' },
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
    await exercisesApi.createExercise({
      exercise: createForm.exercise.trim(),
      category: createForm.category,
      pattern: createForm.pattern,
      route: createForm.route,
      effort: createForm.effort,
      level: createForm.level ?? undefined,
      dificultadLineal: createForm.dificultadLineal,
      difficulty: createForm.dificultadLineal,
      position: createForm.position.trim() || undefined,
    });
    $q.notify({ type: 'positive', message: 'Ejercicio creado' });
    showCreateDialog.value = false;
    createForm.exercise = '';
    createForm.position = '';
    createForm.dificultadLineal = 1;
    createForm.level = null;
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
