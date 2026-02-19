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
      <q-btn label="Crear Ejercicio" icon="add" color="primary" disable>
        <q-tooltip>Proximamente</q-tooltip>
      </q-btn>
    </div>

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
      <!-- Video/Image status column -->
      <template #body-cell-video="props">
        <q-td :props="props">
          <q-icon
            :name="
              isImageExercise(props.row.effort)
                ? props.row.videoUrl
                  ? 'image'
                  : 'hide_image'
                : props.row.videoUrl
                  ? 'videocam'
                  : 'videocam_off'
            "
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

          <!-- No media: Upload button -->
          <div v-else-if="!props.row.videoUrl" class="row no-wrap q-gutter-xs">
            <q-btn
              flat
              dense
              icon="upload"
              color="primary"
              :label="isImageExercise(props.row.effort) ? 'Subir Foto' : 'Subir Video'"
              :disable="!uploadsEnabled"
              @click="triggerUpload(props.row.id, props.row.effort)"
            >
              <q-tooltip v-if="!uploadsEnabled">Solo disponible en produccion</q-tooltip>
            </q-btn>
          </div>

          <!-- Has media: View/Replace/Delete -->
          <div v-else class="row no-wrap q-gutter-xs">
            <q-btn
              flat
              dense
              icon="open_in_new"
              color="primary"
              @click="openVideo(props.row.videoUrl)"
            >
              <q-tooltip>{{
                isImageExercise(props.row.effort) ? 'Ver foto' : 'Ver video'
              }}</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="swap_horiz"
              color="primary"
              :disable="!uploadsEnabled"
              @click="triggerUpload(props.row.id, props.row.effort)"
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
              @click="confirmDeleteVideo(props.row.id, props.row.exercise, props.row.effort)"
            >
              <q-tooltip>{{
                uploadsEnabled
                  ? isImageExercise(props.row.effort)
                    ? 'Eliminar foto'
                    : 'Eliminar video'
                  : 'Solo disponible en produccion'
              }}</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </q-table>

    <!-- Hidden file input (accept set dynamically in triggerUpload) -->
    <input
      ref="fileInputRef"
      type="file"
      :accept="acceptedFileTypes(uploadTargetEffort)"
      style="display: none"
      @change="onFileSelected"
    />

    <!-- Bulk Upload Dialog -->
    <BulkUploadDialog
      v-model="showBulkUpload"
      :exercises="allExercises"
      @upload-complete="loadExercises"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { useExercisesApi } from 'src/composables/useExercisesApi';
import {
  useVideoUpload,
  isImageExercise,
  acceptedFileTypes,
  uploadsEnabled,
} from 'src/composables/useVideoUpload';
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
const uploadTargetEffort = ref<string>('CON');
const videoFilter = ref<string>('all');
const showBulkUpload = ref(false);
const allExercises = ref<Exercise[]>([]);

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

const categoryOptions = [
  { label: 'Todas', value: '' },
  { label: 'Fuerza', value: 'Fuerza' },
  { label: 'Halterofilia', value: 'Halterofilia' },
  { label: 'Gimnasia', value: 'Gimnasia' },
  { label: 'Movilidad', value: 'Movilidad' },
  { label: 'Cardio', value: 'Cardio' },
];

const levelOptions = [
  { label: 'Todos', value: '' },
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

const routeOptions = [
  { label: 'Todas', value: '' },
  { label: 'PL', value: 'PL' },
  { label: 'HT', value: 'HT' },
  { label: 'FL', value: 'FL' },
  { label: 'GN', value: 'GN' },
  { label: 'MX', value: 'MX' },
  { label: 'CD', value: 'CD' },
  { label: 'MV', value: 'MV' },
];

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
    label: 'Media',
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

async function triggerUpload(exerciseId: number, effort = 'CON') {
  uploadTargetId.value = exerciseId;
  uploadTargetEffort.value = effort;
  // Wait for Vue to flush the DOM so the file input's accept attribute is updated
  await nextTick();
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || uploadTargetId.value == null) return;

  videoUpload.uploadVideo(
    uploadTargetId.value,
    file,
    () => {
      loadExercises();
    },
    uploadTargetEffort.value
  );
}

function openVideo(url: string) {
  window.open(url, '_blank');
}

function confirmDeleteVideo(exerciseId: number, exerciseName: string, effort = 'CON') {
  const isImage = isImageExercise(effort);
  const mediaLabel = isImage ? 'foto' : 'video';
  $q.dialog({
    title: `Eliminar ${isImage ? 'Foto' : 'Video'}`,
    message: `Eliminar ${mediaLabel === 'foto' ? 'la foto' : 'el video'} de "${exerciseName}"? Esta accion no se puede deshacer.`,
    cancel: true,
    persistent: true,
    ok: {
      label: 'Eliminar',
      color: 'negative',
    },
  }).onOk(async () => {
    try {
      await exercisesApi.deleteVideo(exerciseId);
      $q.notify({ type: 'positive', message: `${isImage ? 'Foto eliminada' : 'Video eliminado'}` });
      loadExercises();
    } catch {
      // Error already handled by composable
    }
  });
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
