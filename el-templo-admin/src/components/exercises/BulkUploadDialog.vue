<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="phase === 'uploading'"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card style="min-width: 700px; max-width: 900px">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Subida Masiva de Videos</div>
        <q-space />
        <q-btn v-if="phase !== 'uploading'" flat round dense icon="close" @click="closeDialog" />
      </q-card-section>

      <!-- Phase 1: File Selection -->
      <q-card-section v-if="phase === 'select'">
        <div class="text-body2 q-mb-md text-grey-7">
          Selecciona archivos MP4 o MOV con el formato <strong>{id}-{nombre}</strong> para asignar
          automaticamente a ejercicios. Los archivos MOV se convertiran a MP4 antes de subirse.
        </div>

        <div
          class="drop-area q-pa-xl text-center cursor-pointer"
          @click="triggerFileInput"
          @dragover.prevent
          @drop.prevent="onFileDrop"
        >
          <q-icon name="cloud_upload" size="48px" color="grey-5" />
          <div class="text-body1 q-mt-sm">Arrastra archivos aqui o haz clic para seleccionar</div>
          <div class="text-caption text-grey-6">MP4 o MOV (max 200MB)</div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          multiple
          accept=".mp4,.mov,video/mp4,video/quicktime"
          style="display: none"
          @change="onFilesSelected"
        />
      </q-card-section>

      <!-- Phase 2: Preview / Validation -->
      <q-card-section v-if="phase === 'preview'">
        <!-- Summary line -->
        <div class="row items-center q-mb-sm">
          <div class="text-body2">
            <span class="text-positive text-weight-medium">{{ matchedCount }} archivos listos</span
            >,
            <span v-if="unmatchedCount > 0" class="text-warning text-weight-medium">
              {{ unmatchedCount }} sin asignar</span
            >
            <span v-if="errorCount > 0" class="text-negative text-weight-medium">
              , {{ errorCount }} con errores</span
            >
          </div>
          <q-space />
          <q-btn flat dense icon="add" label="Agregar Archivos" @click="triggerFileInput" />
        </div>

        <!-- Preview table -->
        <q-table
          :rows="fileEntries"
          :columns="previewColumns"
          row-key="id"
          flat
          dense
          :pagination="{ rowsPerPage: 0 }"
          hide-bottom
          class="bulk-preview-table"
        >
          <!-- Status column -->
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-icon
                v-if="props.row.status === 'matched' || props.row.status === 'matched-manual'"
                name="check_circle"
                color="positive"
                size="xs"
              />
              <q-icon
                v-else-if="props.row.status === 'unmatched'"
                name="warning"
                color="warning"
                size="xs"
              />
              <q-icon
                v-else-if="props.row.status === 'error'"
                name="error"
                color="negative"
                size="xs"
              />
            </q-td>
          </template>

          <!-- Exercise column (manual assignment for unmatched) -->
          <template #body-cell-exercise="props">
            <q-td :props="props">
              <span v-if="props.row.status === 'matched'">{{ props.row.exerciseName }}</span>
              <span v-else-if="props.row.status === 'matched-manual'" class="text-positive">
                {{ props.row.exerciseName }}
              </span>
              <q-select
                v-else-if="props.row.status === 'unmatched'"
                v-model="props.row.selectedExercise"
                :options="filteredExerciseOptions"
                option-value="id"
                option-label="exercise"
                label="Asignar ejercicio"
                dense
                outlined
                use-input
                emit-value
                map-options
                style="min-width: 250px"
                @filter="onExerciseFilter"
                @update:model-value="onManualAssign(props.row, $event)"
              />
              <span v-else-if="props.row.status === 'error'" class="text-negative text-caption">
                {{ props.row.errorMessage }}
              </span>
            </q-td>
          </template>

          <!-- Size column -->
          <template #body-cell-size="props">
            <q-td :props="props">
              {{ formatFileSize(props.row.file.size) }}
            </q-td>
          </template>

          <!-- Remove column -->
          <template #body-cell-remove="props">
            <q-td :props="props">
              <q-btn flat dense round icon="close" size="sm" @click="removeFile(props.row.id)" />
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <!-- Phase 3: Upload Progress -->
      <q-card-section v-if="phase === 'uploading'">
        <!-- Overall progress -->
        <div class="q-mb-md">
          <div class="text-body2 q-mb-xs">
            Subiendo {{ completedUploads }} de {{ totalUploads }} videos
          </div>
          <q-linear-progress :value="overallProgress" color="primary" size="8px" rounded />
        </div>

        <!-- Per-file progress -->
        <div class="column q-gutter-xs" style="max-height: 400px; overflow-y: auto">
          <div
            v-for="entry in uploadableEntries"
            :key="entry.id"
            class="row items-center q-px-sm q-py-xs"
            :class="{
              'bg-green-1': entry.uploadStatus === 'done',
              'bg-red-1': entry.uploadStatus === 'failed',
            }"
          >
            <q-icon
              v-if="entry.uploadStatus === 'done'"
              name="check_circle"
              color="positive"
              size="xs"
              class="q-mr-sm"
            />
            <q-icon
              v-else-if="entry.uploadStatus === 'failed'"
              name="error"
              color="negative"
              size="xs"
              class="q-mr-sm"
            />
            <q-icon
              v-else-if="entry.uploadStatus === 'transcoding'"
              name="autorenew"
              color="amber-8"
              size="xs"
              class="q-mr-sm"
            />
            <q-icon
              v-else-if="entry.uploadStatus === 'uploading'"
              name="cloud_upload"
              color="primary"
              size="xs"
              class="q-mr-sm"
            />
            <q-icon v-else name="schedule" color="grey-5" size="xs" class="q-mr-sm" />

            <span class="text-caption ellipsis" style="flex: 1; min-width: 0">
              {{ entry.file.name }}
            </span>

            <span
              v-if="entry.uploadStatus === 'transcoding' || entry.uploadStatus === 'uploading'"
              class="text-caption text-grey-7 q-mr-sm"
            >
              {{ entry.uploadStatus === 'transcoding' ? 'Convirtiendo' : 'Subiendo' }}
            </span>
            <q-linear-progress
              v-if="entry.uploadStatus === 'transcoding' || entry.uploadStatus === 'uploading'"
              :value="entry.uploadProgress / 100"
              :color="entry.uploadStatus === 'transcoding' ? 'amber' : 'primary'"
              style="width: 120px"
              class="q-mx-sm"
            />
            <span
              v-if="entry.uploadStatus === 'transcoding' || entry.uploadStatus === 'uploading'"
              class="text-caption q-ml-xs"
            >
              {{ entry.uploadProgress }}%
            </span>
            <span v-if="entry.uploadStatus === 'failed'" class="text-caption text-negative q-ml-sm">
              Error
            </span>
          </div>
        </div>
      </q-card-section>

      <!-- Actions -->
      <q-card-actions align="right" class="q-pa-md">
        <template v-if="phase === 'preview'">
          <q-btn flat label="Cancelar" @click="closeDialog" />
          <q-btn
            :disable="matchedCount === 0"
            color="primary"
            :label="`Subir ${matchedCount} Videos`"
            icon="cloud_upload"
            @click="startBatchUpload"
          />
        </template>

        <template v-if="phase === 'uploading'">
          <q-btn
            :disable="!uploadComplete"
            color="primary"
            label="Cerrar"
            @click="finishAndClose"
          />
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { transcodeToMp4, isAlreadyMp4 } from 'src/utils/videoTranscoder';
import type { Exercise } from 'src/types/exercise';

const log = createLogger('BulkUploadDialog');

// =========================================================================
// Props / Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  exercises: Exercise[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'upload-complete': [];
}>();

// =========================================================================
// Types
// =========================================================================

type FileStatus = 'matched' | 'unmatched' | 'matched-manual' | 'error';
type UploadStatus = 'pending' | 'transcoding' | 'uploading' | 'done' | 'failed';

interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  exerciseId: number | null;
  exerciseName: string | null;
  errorMessage: string | null;
  selectedExercise: number | null;
  uploadStatus: UploadStatus;
  uploadProgress: number;
}

// =========================================================================
// Constants
// =========================================================================

const MAX_INPUT_SIZE = 200 * 1024 * 1024; // 200 MB (before transcode)

// =========================================================================
// State
// =========================================================================

const phase = ref<'select' | 'preview' | 'uploading'>('select');
const fileEntries = ref<FileEntry[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const exerciseFilterText = ref('');

// =========================================================================
// Filename parsing
// =========================================================================

function parseFilename(filename: string): {
  exerciseId: number | null;
  slug: string;
} {
  const match = filename.match(/^(\d+)-(.+)\.(mp4|mov)$/i);
  if (!match) return { exerciseId: null, slug: filename };
  return { exerciseId: parseInt(match[1], 10), slug: match[2] };
}

// =========================================================================
// File processing
// =========================================================================

function processFiles(files: FileList | File[]) {
  const existingIds = new Set(fileEntries.value.map((e) => e.id));
  const newEntries: FileEntry[] = [];

  for (const file of files) {
    // Deduplicate by filename
    const fileKey = `${file.name}-${file.size}`;
    if (existingIds.has(fileKey)) continue;

    // Client-side validation
    if (file.size > MAX_INPUT_SIZE) {
      newEntries.push({
        id: fileKey,
        file,
        status: 'error',
        exerciseId: null,
        exerciseName: null,
        errorMessage: `Archivo demasiado grande (${formatFileSize(file.size)}, max 200MB)`,
        selectedExercise: null,
        uploadStatus: 'pending',
        uploadProgress: 0,
      });
      continue;
    }

    const lowerName = file.name.toLowerCase();
    const isAccepted =
      file.type === 'video/mp4' ||
      file.type === 'video/quicktime' ||
      lowerName.endsWith('.mp4') ||
      lowerName.endsWith('.mov');
    if (!isAccepted) {
      newEntries.push({
        id: fileKey,
        file,
        status: 'error',
        exerciseId: null,
        exerciseName: null,
        errorMessage: 'Solo se aceptan archivos MP4 o MOV',
        selectedExercise: null,
        uploadStatus: 'pending',
        uploadProgress: 0,
      });
      continue;
    }

    // Parse filename and match exercise
    const parsed = parseFilename(file.name);
    let status: FileStatus = 'unmatched';
    let exerciseId: number | null = null;
    let exerciseName: string | null = null;

    if (parsed.exerciseId !== null) {
      const found = props.exercises.find((e) => e.id === parsed.exerciseId);
      if (found) {
        status = 'matched';
        exerciseId = found.id;
        exerciseName = found.exercise;
      }
    }

    newEntries.push({
      id: fileKey,
      file,
      status,
      exerciseId,
      exerciseName,
      errorMessage: null,
      selectedExercise: null,
      uploadStatus: 'pending',
      uploadProgress: 0,
    });
  }

  fileEntries.value = [...fileEntries.value, ...newEntries];

  if (fileEntries.value.length > 0) {
    phase.value = 'preview';
  }
}

// =========================================================================
// File input handlers
// =========================================================================

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFiles(input.files);
  }
}

function onFileDrop(event: DragEvent) {
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    processFiles(files);
  }
}

function removeFile(id: string) {
  fileEntries.value = fileEntries.value.filter((e) => e.id !== id);
  if (fileEntries.value.length === 0) {
    phase.value = 'select';
  }
}

// =========================================================================
// Manual exercise assignment
// =========================================================================

const filteredExerciseOptions = ref<Exercise[]>([]);

function onExerciseFilter(val: string, update: (fn: () => void) => void) {
  exerciseFilterText.value = val;
  update(() => {
    if (!val) {
      filteredExerciseOptions.value = props.exercises.slice(0, 50);
    } else {
      const needle = val.toLowerCase();
      filteredExerciseOptions.value = props.exercises
        .filter((e) => e.exercise.toLowerCase().includes(needle) || String(e.id).includes(needle))
        .slice(0, 50);
    }
  });
}

function onManualAssign(entry: FileEntry, exerciseId: number) {
  const found = props.exercises.find((e) => e.id === exerciseId);
  if (found) {
    entry.status = 'matched-manual';
    entry.exerciseId = found.id;
    entry.exerciseName = found.exercise;
  }
}

// =========================================================================
// Preview table
// =========================================================================

const previewColumns = [
  {
    name: 'filename',
    label: 'Archivo',
    field: (row: FileEntry) => row.file.name,
    align: 'left' as const,
    style: 'max-width: 200px; overflow: hidden; text-overflow: ellipsis',
  },
  {
    name: 'status',
    label: 'Estado',
    field: 'status',
    align: 'center' as const,
    style: 'width: 60px',
  },
  {
    name: 'exercise',
    label: 'Ejercicio',
    field: 'exerciseName',
    align: 'left' as const,
  },
  {
    name: 'size',
    label: 'Tamano',
    field: (row: FileEntry) => row.file.size,
    align: 'right' as const,
    style: 'width: 80px',
  },
  {
    name: 'remove',
    label: '',
    field: 'id',
    align: 'center' as const,
    style: 'width: 40px',
  },
];

// =========================================================================
// Computed counts
// =========================================================================

const matchedCount = computed(
  () =>
    fileEntries.value.filter((e) => e.status === 'matched' || e.status === 'matched-manual').length
);

const unmatchedCount = computed(
  () => fileEntries.value.filter((e) => e.status === 'unmatched').length
);

const errorCount = computed(() => fileEntries.value.filter((e) => e.status === 'error').length);

const uploadableEntries = computed(() =>
  fileEntries.value.filter((e) => e.status === 'matched' || e.status === 'matched-manual')
);

const totalUploads = computed(() => uploadableEntries.value.length);

const completedUploads = computed(
  () =>
    uploadableEntries.value.filter((e) => e.uploadStatus === 'done' || e.uploadStatus === 'failed')
      .length
);

const overallProgress = computed(() => {
  if (totalUploads.value === 0) return 0;
  return completedUploads.value / totalUploads.value;
});

const uploadComplete = computed(() => completedUploads.value === totalUploads.value);

// =========================================================================
// Batch upload
// =========================================================================

async function startBatchUpload() {
  phase.value = 'uploading';

  const entries = uploadableEntries.value;

  // Upload sequentially to avoid overwhelming R2 / API
  for (const entry of entries) {
    if (entry.exerciseId === null) continue;

    try {
      // Step 0: Transcode to MP4 if needed
      let uploadFile = entry.file;
      if (!isAlreadyMp4(entry.file)) {
        entry.uploadStatus = 'transcoding';
        entry.uploadProgress = 0;
        uploadFile = await transcodeToMp4(entry.file, (pct) => {
          entry.uploadProgress = pct;
        });
      }

      entry.uploadStatus = 'uploading';
      entry.uploadProgress = 0;

      // Step 1: Get presigned URL
      const { data } = await api.post<{ uploadUrl: string; key: string }>(
        `/admin/exercises/${entry.exerciseId}/upload-url`
      );

      // Step 2: Upload to R2
      await axios.put(data.uploadUrl, uploadFile, {
        headers: { 'Content-Type': 'video/mp4' },
        onUploadProgress: (e) => {
          if (e.total) {
            entry.uploadProgress = Math.round((e.loaded / e.total) * 100);
          }
        },
      });

      // Step 3: Confirm upload
      await api.post(`/admin/exercises/${entry.exerciseId}/upload-complete`, {
        key: data.key,
      });

      entry.uploadStatus = 'done';
      entry.uploadProgress = 100;
    } catch (err: unknown) {
      log.error('Bulk upload failed for file', {
        filename: entry.file.name,
        exerciseId: entry.exerciseId,
        phase: entry.uploadStatus,
        error: err instanceof Error ? err.message : String(err),
      });
      entry.uploadStatus = 'failed';
    }
  }
}

// =========================================================================
// Dialog lifecycle
// =========================================================================

function closeDialog() {
  resetState();
  emit('update:modelValue', false);
}

function finishAndClose() {
  resetState();
  emit('update:modelValue', false);
  emit('upload-complete');
}

function resetState() {
  phase.value = 'select';
  fileEntries.value = [];
  exerciseFilterText.value = '';
}

// =========================================================================
// Utilities
// =========================================================================

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
</script>

<style scoped>
.drop-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  transition: border-color 0.2s;
}

.drop-area:hover {
  border-color: var(--q-primary);
}

.bulk-preview-table {
  max-height: 400px;
}
</style>
