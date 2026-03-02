<template>
  <q-card class="q-mb-md" bordered>
    <!-- Colored header (shared across levels) -->
    <q-card-section :class="['text-white q-py-sm', `bg-${blockColor}`]">
      <div class="row items-center no-wrap q-gutter-sm">
        <q-select
          v-if="isAthlosEpikos"
          :model-value="blockGroup.role"
          :options="['ATHLOS', 'EPIKOS']"
          dense
          borderless
          dark
          class="role-select text-h6"
          @update:model-value="onRoleChange"
        />
        <div v-else class="text-h6">{{ blockGroup.role }}</div>

        <!-- Format dropdown (inline next to block name) -->
        <q-select
          v-model="selectedFormat"
          :options="formatOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          dense
          outlined
          dark
          :loading="formatsLoading"
          style="min-width: 140px"
          @update:model-value="onFormatChange"
        >
          <template #selected-item="scope">
            <q-badge color="white" :text-color="blockColor">
              {{ scope.opt?.label || displayFormatName(blockGroup.formatName) }}
            </q-badge>
          </template>
        </q-select>
        <div v-if="hasConfigurableParams && selectedBlock" class="q-py-xs bg-grey-1">
          <div class="row items-center q-gutter-sm">
            <span class="text-caption text-weight-bold text-grey-7">Parámetros</span>
            <format-params-editor
              :format-params="selectedBlock.formatParams"
              :format-name="selectedBlock.formatName"
              :block-id="selectedBlock.id"
              :session-id="selectedLevelBlock.sessionId"
              @update:format-params="onUpdateFormatParams"
            />
          </div>
        </div>
      </div>
    </q-card-section>

    <!-- Level tabs (hidden for INITIUM — single level only) -->
    <q-tabs
      v-if="!isInitium"
      v-model="selectedLevel"
      dense
      class="text-grey bg-grey-1"
      active-color="primary"
      indicator-color="primary"
      narrow-indicator
    >
      <q-tab v-for="lb in blockGroup.levelBlocks" :key="lb.memberLevel" :name="lb.memberLevel">
        <q-chip dense :color="levelColor(lb.memberLevel)" text-color="white" size="sm">
          {{ levelLabel(lb.memberLevel) }}
        </q-chip>
      </q-tab>
    </q-tabs>

    <!-- Block stats (per selected level) -->
    <q-card-section v-if="selectedBlock" class="q-py-sm bg-grey-2">
      <div class="row q-gutter-md text-caption items-center">
        <div>
          <q-icon name="directions" size="xs" />
          {{ selectedBlock.route }}
        </div>
        <div>
          <q-icon name="fitness_center" size="xs" />
          {{ selectedBlock.exercises.length }} ejercicios
          <q-icon
            v-if="exerciseCapWarning"
            name="warning"
            color="amber-8"
            size="xs"
            class="q-ml-xs"
          >
            <q-tooltip>Mas de 3 ejercicios en bloque no-INITIUM</q-tooltip>
          </q-icon>
        </div>
        <div v-if="selectedBlock.intensity">
          <q-icon name="speed" size="xs" />
          {{ selectedBlock.intensity }}% intensidad
        </div>
        <div v-if="selectedBlock.repsBudget">
          <q-icon name="track_changes" size="xs" />
          Reps recomendadas: {{ selectedBlock.repsBudget }}
        </div>
        <div v-if="avgDifficulty">
          <q-icon name="trending_up" size="xs" />
          Dif: {{ avgDifficulty.toFixed(1) }}
        </div>
      </div>

      <!-- Contraction mix badge -->
      <contraction-mix-badge
        :exercises="selectedBlock.exercises"
        :intensity="selectedBlock.intensity"
        :block-role="selectedBlock.role"
        :warning="contractionWarning"
        class="q-mt-sm"
      />
    </q-card-section>

    <!-- Editable exercises list (per selected level) -->
    <template v-if="selectedBlock">
      <q-list separator class="exercise-drag-list">
        <editable-exercise-row
          v-for="(exercise, idx) in selectedBlock.exercises"
          :key="exercise.id"
          :exercise="exercise"
          :session-id="selectedLevelBlock.sessionId"
          :block-id="selectedBlock.id"
          :block-route="selectedBlock.route"
          :block-format-name="selectedBlock.formatName"
          :format-type="(selectedBlock.formatParams as Record<string, unknown>)?.type as string"
          :is-first="idx === 0"
          :is-last="idx === selectedBlock.exercises.length - 1"
          draggable="true"
          :class="{ 'drag-over': dragOverId === exercise.id }"
          @dragstart="onDragStart($event, idx)"
          @dragover.prevent="onDragOver($event, exercise.id)"
          @dragleave="onDragLeave(exercise.id)"
          @drop.prevent="onDrop($event, idx)"
          @dragend="onDragEnd"
          @swap="onSwapExercise"
          @remove="onRemoveExercise"
          @update="onUpdatePrescription"
          @move="onMoveExercise"
        />
      </q-list>

      <!-- Footer actions (per selected level) -->
      <q-card-actions align="left" class="q-px-md">
        <q-btn
          flat
          dense
          icon="add"
          color="primary"
          label="Agregar Ejercicio"
          @click="emitAddExercise"
        />
        <q-space />
        <q-btn
          flat
          dense
          icon="swap_horiz"
          color="positive"
          label="Intercambiar Bloque"
          @click="emitSwapBlock"
        />
        <q-btn
          flat
          dense
          icon="bookmark_add"
          color="primary"
          label="Guardar Bloque"
          @click="onSaveBlock"
        />
      </q-card-actions>
    </template>

    <!-- Descanso Activo section (shared across all levels, outside level tabs) -->
    <template v-if="!isInitium && sharedMobility">
      <q-separator class="q-my-sm" />
      <div class="q-px-md q-pb-md">
        <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">DESCANSO ACTIVO</div>
        <div class="row items-center q-gutter-sm">
          <!-- Exercise name + contraction badge -->
          <div class="col">
            <div class="row items-center q-gutter-xs">
              <span class="text-body2 text-weight-medium">
                {{ sharedMobility.exerciseName }}
              </span>
              <q-badge :color="contractionColor(sharedMobility.contraction)">
                {{ contractionLabel(sharedMobility.contraction) }}
              </q-badge>
            </div>
            <!-- Prescription display (editable) -->
            <div class="row items-center q-gutter-sm q-mt-xs">
              <template v-if="sharedMobility.seconds && sharedMobility.seconds > 0">
                <q-input
                  :model-value="sharedMobility.seconds"
                  type="number"
                  dense
                  outlined
                  class="prescription-input"
                  suffix="seg"
                  @blur="onMobilityPrescriptionBlur('seconds', $event)"
                  @keyup.enter="onMobilityPrescriptionBlur('seconds', $event)"
                />
              </template>
              <template v-else>
                <q-input
                  :model-value="sharedMobility.reps"
                  type="number"
                  dense
                  outlined
                  class="prescription-input"
                  suffix="reps"
                  @blur="onMobilityPrescriptionBlur('reps', $event)"
                  @keyup.enter="onMobilityPrescriptionBlur('reps', $event)"
                />
              </template>
            </div>
          </div>
          <!-- Swap button -->
          <q-btn flat dense round icon="swap_horiz" color="positive" @click="onSwapMobility">
            <q-tooltip>Cambiar ejercicio de movilidad</q-tooltip>
          </q-btn>
        </div>
      </div>
    </template>

    <!-- Format change overlay -->
    <q-inner-loading :showing="formatChanging">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { SessionExercise, PrescriptionUpdate, CompatibleFormat } from 'src/types/session';
import type { BlockGroup, LevelBlock } from 'src/types/block-group';
import { useEditApi } from 'src/composables/useEditApi';
import { useDragReorder } from 'src/composables/useDragReorder';
import EditableExerciseRow from './EditableExerciseRow.vue';
import ContractionMixBadge from './ContractionMixBadge.vue';
import FormatParamsEditor from './FormatParamsEditor.vue';
import { contractionLabel, contractionColor } from 'src/utils/contraction-helpers';
import { NO_PARAMS_FORMATS } from 'src/constants/formats';

const props = defineProps<{
  blockGroup: BlockGroup;
  levelGroup: string;
  siblingLevelBlocks?: LevelBlock[];
  initialFormats?: CompatibleFormat[];
}>();

const emit = defineEmits<{
  (
    e: 'swap-exercise',
    payload: {
      sessionId: number;
      blockId: number;
      exercise: SessionExercise;
      blockRoute: string;
      blockPattern: string;
    }
  ): void;
  (
    e: 'swap-block',
    payload: { sessionId: number; block: import('src/types/session').SessionBlock }
  ): void;
  (
    e: 'add-exercise',
    payload: {
      sessionId: number;
      blockId: number;
      blockRoute: string;
      blockPattern: string;
      blockRole: string;
    }
  ): void;
  (e: 'refresh'): void;
  (e: 'swap-mobility', payload: { sessionId: number; blockId: number; blockRoute: string }): void;
  (
    e: 'update-mobility-prescription',
    payload: {
      sessionId: number;
      blockId: number;
      prescriptionId: number;
      fields: PrescriptionUpdate;
    }
  ): void;
}>();

const $q = useQuasar();
const editApi = useEditApi();

// Level tab state
const selectedLevel = ref(props.blockGroup.levelBlocks[0]?.memberLevel || '');

// Format dropdown state
const compatibleFormats = ref<CompatibleFormat[]>([]);
const selectedFormat = ref<string>(props.blockGroup.formatName);
watch(
  () => props.blockGroup.formatName,
  (v) => {
    selectedFormat.value = v;
  }
);
const formatsLoading = ref(false);
const formatChanging = ref(false);

// Computed: selected level's block
const selectedLevelBlock = computed(
  () =>
    props.blockGroup.levelBlocks.find((lb) => lb.memberLevel === selectedLevel.value) ||
    props.blockGroup.levelBlocks[0]
);

const selectedBlock = computed(() => selectedLevelBlock.value?.block ?? null);

const blockColor = computed(() => {
  const role = props.blockGroup.role?.toLowerCase() || '';
  if (role.includes('initium')) return 'brown-5';
  if (role.includes('nucleus')) return 'deep-orange-8';
  if (role.includes('deuteros')) return 'brown-8';
  if (role.includes('athlos') || role.includes('epikos')) return 'brown-6';
  return 'grey';
});

const isInitium = computed(() => props.blockGroup.role?.toLowerCase().includes('initium') || false);

const isAthlosEpikos = computed(() => {
  const role = props.blockGroup.role?.toUpperCase();
  return role === 'ATHLOS' || role === 'EPIKOS';
});

// NO_PARAMS_FORMATS imported from src/constants/formats

const hasConfigurableParams = computed(() => {
  if (props.blockGroup.formatParams) {
    const type = (props.blockGroup.formatParams as Record<string, unknown>).type as string;
    return !NO_PARAMS_FORMATS.includes(type);
  }
  const normalized = props.blockGroup.formatName.toLowerCase().trim().replace(/\s+/g, '_');
  return !NO_PARAMS_FORMATS.includes(normalized);
});

// Shared mobility exercise (from first level block — same for all levels)
const sharedMobility = computed(
  () => props.blockGroup.levelBlocks[0]?.block?.mobilityExercise ?? null
);

const avgDifficulty = computed(() => {
  if (!selectedBlock.value) return null;
  const difficulties = selectedBlock.value.exercises
    .map((e) => e.dificultadLineal)
    .filter((d): d is number => d !== null && d !== undefined);
  if (difficulties.length === 0) return null;
  return difficulties.reduce((a, b) => a + b, 0) / difficulties.length;
});

const exerciseCapWarning = computed(
  () => !isInitium.value && (selectedBlock.value?.exercises.length ?? 0) > 3
);

const contractionWarning = ref<string | undefined>(undefined);

// Display-name mapping
function displayFormatName(name: string): string {
  if (name.toLowerCase() === 'interval training') return 'HIIT';
  return name;
}

// Format dropdown options
const formatOptions = computed(() => {
  if (compatibleFormats.value.length === 0) {
    return [
      { label: displayFormatName(props.blockGroup.formatName), value: props.blockGroup.formatName },
    ];
  }
  return [...compatibleFormats.value]
    .filter((f) => f.formatName.toLowerCase() !== 'hiit')
    .sort((a, b) => a.compatibility - b.compatibility)
    .map((f) => ({
      label: `${displayFormatName(f.formatName)} (${f.compatibility})`,
      value: f.formatName,
      formatId: f.formatId,
    }));
});

// Level helpers
function levelColor(level: string): string {
  switch (level) {
    case 'alfa':
      return 'brown-4';
    case 'delta':
      return 'deep-orange-6';
    case 'sigma':
      return 'deep-orange-9';
    case 'omega':
      return 'orange';
    case 'spartan':
      return 'red';
    default:
      return 'grey';
  }
}

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

async function loadCompatibleFormats() {
  if (!selectedBlock.value) return;
  formatsLoading.value = true;
  try {
    const response = await editApi.fetchCompatibleFormats({
      blockRole: props.blockGroup.role,
      level: props.levelGroup,
      intensity: selectedBlock.value.intensity,
    });
    compatibleFormats.value = response.formats;
  } catch {
    $q.notify({ type: 'warning', message: 'No se pudieron cargar formatos compatibles' });
  } finally {
    formatsLoading.value = false;
  }
}

// Format change cascades to ALL levels
async function onFormatChange(newFormat: string) {
  if (newFormat === props.blockGroup.formatName) return;

  const format = compatibleFormats.value.find((f) => f.formatName === newFormat);
  if (!format) return;

  formatChanging.value = true;
  try {
    // Change format for ALL level blocks in this group + sibling (DEUTEROS sync)
    const allLevelBlocks = [...props.blockGroup.levelBlocks, ...(props.siblingLevelBlocks || [])];
    await Promise.all(
      allLevelBlocks.map((lb) =>
        editApi.changeBlockFormat(lb.sessionId, lb.block.id, format.formatId, format.formatName)
      )
    );
    $q.notify({
      type: 'positive',
      message: `Formato cambiado a ${format.formatName} en todos los niveles`,
    });
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al cambiar formato' });
    selectedFormat.value = props.blockGroup.formatName;
  } finally {
    formatChanging.value = false;
  }
}

// Role change cascades to ALL levels
async function onRoleChange(newRole: 'ATHLOS' | 'EPIKOS') {
  if (newRole === props.blockGroup.role) return;
  formatChanging.value = true;
  try {
    await Promise.all(
      props.blockGroup.levelBlocks.map((lb) =>
        editApi.updateBlockRole(lb.sessionId, lb.block.id, newRole)
      )
    );
    $q.notify({
      type: 'positive',
      message: `Rol cambiado a ${newRole} en todos los niveles`,
      timeout: 1500,
    });
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al cambiar rol del bloque' });
  } finally {
    formatChanging.value = false;
  }
}

// Format params update cascades to ALL levels + sibling deuteros
async function onUpdateFormatParams(newParams: Record<string, unknown>) {
  formatChanging.value = true;
  try {
    const allLevelBlocks = [...props.blockGroup.levelBlocks, ...(props.siblingLevelBlocks || [])];
    await Promise.all(
      allLevelBlocks.map((lb) => editApi.updateFormatParams(lb.sessionId, lb.block.id, newParams))
    );
    $q.notify({
      type: 'positive',
      message: 'Parametros de formato actualizados en todos los niveles',
      color: 'green',
      timeout: 1500,
    });
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar parametros de formato' });
  } finally {
    formatChanging.value = false;
  }
}

// Per-level exercise actions
function onSwapExercise(payload: { exercise: SessionExercise }) {
  if (!selectedBlock.value) return;
  emit('swap-exercise', {
    sessionId: selectedLevelBlock.value.sessionId,
    blockId: selectedBlock.value.id,
    exercise: payload.exercise,
    blockRoute: selectedBlock.value.route,
    blockPattern: selectedBlock.value.pattern,
  });
}

async function onRemoveExercise(payload: { prescriptionId: number }) {
  if (!selectedBlock.value) return;
  $q.dialog({
    title: 'Eliminar Ejercicio',
    message: 'Se eliminara este ejercicio del bloque. Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await editApi.removeExercise(
        selectedLevelBlock.value.sessionId,
        selectedBlock.value!.id,
        payload.prescriptionId
      );
      $q.notify({ type: 'positive', message: 'Ejercicio eliminado' });
      emit('refresh');
    } catch {
      $q.notify({ type: 'negative', message: 'Error al eliminar ejercicio' });
    }
  });
}

async function onUpdatePrescription(payload: {
  prescriptionId: number;
  fields: PrescriptionUpdate;
}) {
  if (!selectedBlock.value) return;
  try {
    await editApi.updatePrescription(
      selectedLevelBlock.value.sessionId,
      selectedBlock.value.id,
      payload.prescriptionId,
      payload.fields
    );
    const exercise = selectedBlock.value.exercises.find((e) => e.id === payload.prescriptionId);
    if (exercise) {
      Object.assign(exercise, payload.fields);
    }
    $q.notify({
      type: 'positive',
      message: 'Prescripcion actualizada',
      color: 'green',
      timeout: 1500,
    });
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar prescripcion' });
  }
}

// Move exercise up/down
async function onMoveExercise(payload: { prescriptionId: number; direction: 'up' | 'down' }) {
  if (!selectedBlock.value) return;
  try {
    await editApi.reorderExercise(
      selectedLevelBlock.value.sessionId,
      selectedBlock.value.id,
      payload.prescriptionId,
      payload.direction
    );
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al mover ejercicio' });
  }
}

// Drag & drop (extracted to composable)
const { dragOverId, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd } = useDragReorder({
  getExercises: () => selectedBlock.value?.exercises ?? [],
  reorder: (prescriptionId, direction) =>
    editApi.reorderExercise(
      selectedLevelBlock.value.sessionId,
      selectedBlock.value!.id,
      prescriptionId,
      direction
    ),
  onComplete: () => emit('refresh'),
});

function emitAddExercise() {
  if (!selectedBlock.value) return;
  emit('add-exercise', {
    sessionId: selectedLevelBlock.value.sessionId,
    blockId: selectedBlock.value.id,
    blockRoute: selectedBlock.value.route,
    blockPattern: selectedBlock.value.pattern,
    blockRole: selectedBlock.value.role,
  });
}

function emitSwapBlock() {
  if (!selectedBlock.value) return;
  emit('swap-block', {
    sessionId: selectedLevelBlock.value.sessionId,
    block: selectedBlock.value,
  });
}

function onSaveBlock() {
  if (!selectedBlock.value) return;
  $q.dialog({
    title: 'Guardar Bloque',
    message: 'Nombre para este bloque:',
    prompt: {
      model: `${selectedBlock.value.role} - ${selectedBlock.value.formatName}`,
      type: 'text',
    },
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Guardar', color: 'primary' },
  }).onOk(async (name: string) => {
    try {
      await editApi.saveBlock(selectedBlock.value!.id, name);
      $q.notify({ type: 'positive', message: 'Bloque guardado para reutilizacion' });
    } catch {
      $q.notify({ type: 'negative', message: 'Error al guardar bloque' });
    }
  });
}

// Contraction display helpers
// Mobility event handlers (shared — always use first level block)
function onSwapMobility() {
  const firstLb = props.blockGroup.levelBlocks[0];
  if (!firstLb?.block) return;
  emit('swap-mobility', {
    sessionId: firstLb.sessionId,
    blockId: firstLb.block.id,
    blockRoute: firstLb.block.route,
  });
}

function onMobilityPrescriptionBlur(field: 'seconds' | 'reps', event: Event) {
  const firstLb = props.blockGroup.levelBlocks[0];
  if (!firstLb?.block) return;
  const input = event.target as HTMLInputElement;
  const mobility = firstLb.block.mobilityExercise;
  if (!mobility) return;

  const currentValue = field === 'seconds' ? mobility.seconds : mobility.reps;

  // Revert to previous value if input is empty or non-numeric
  const raw = input.value.trim();
  if (raw === '' || !Number.isFinite(Number(raw))) {
    input.value = String(currentValue ?? '');
    return;
  }

  const newValue = Math.round(Number(raw));
  if (newValue === currentValue) return;

  const fields: PrescriptionUpdate = {};
  if (field === 'seconds') {
    fields.seconds = newValue;
  } else {
    fields.reps = newValue;
  }
  emit('update-mobility-prescription', {
    sessionId: firstLb.sessionId,
    blockId: firstLb.block.id,
    prescriptionId: mobility.id,
    fields,
  });
}

onMounted(() => {
  if (props.initialFormats && props.initialFormats.length > 0) {
    compatibleFormats.value = props.initialFormats;
  } else {
    loadCompatibleFormats();
  }
});
</script>

<style scoped>
.prescription-input {
  max-width: 100px;
}
.role-select {
  min-width: 120px;
}
.role-select :deep(.q-field__native) {
  font-size: 1.25rem;
  font-weight: 500;
  color: white;
  padding: 0;
}
.role-select :deep(.q-field__append) {
  color: white;
}
.exercise-drag-list [draggable='true'] {
  cursor: grab;
}
.exercise-drag-list [draggable='true']:active {
  cursor: grabbing;
}
.drag-over {
  background: rgba(25, 118, 210, 0.08);
  border-top: 2px solid var(--q-primary);
}
</style>
