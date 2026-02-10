<template>
  <q-card :class="['q-mb-md', `border-${blockColor}`]" bordered>
    <!-- Colored header -->
    <q-card-section :class="['text-white', `bg-${blockColor}`]">
      <div class="row items-center justify-between">
        <div>
          <div class="text-h6">{{ block.role }}</div>
          <div class="text-caption">{{ block.route }}</div>
        </div>
        <div class="row items-center q-gutter-sm">
          <!-- Save block button -->
          <q-btn
            flat
            dense
            round
            icon="bookmark_add"
            color="white"
            @click="onSaveBlock"
          >
            <q-tooltip>Guardar bloque para reutilizar</q-tooltip>
          </q-btn>
          <!-- Block swap button -->
          <q-btn
            flat
            dense
            round
            icon="swap_horiz"
            color="white"
            @click="$emit('swap-block', block)"
          >
            <q-tooltip>Intercambiar bloque</q-tooltip>
          </q-btn>
          <!-- Format dropdown -->
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
                {{ scope.opt?.label || block.formatName }}
              </q-badge>
            </template>
          </q-select>
        </div>
      </div>
    </q-card-section>

    <!-- Block stats -->
    <q-card-section class="q-py-sm bg-grey-2">
      <div class="row q-gutter-md text-caption items-center">
        <div>
          <q-icon name="fitness_center" size="xs" />
          {{ block.exercises.length }} ejercicios
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
        <div v-if="block.intensity">
          <q-icon name="speed" size="xs" />
          {{ block.intensity }}% intensidad
        </div>
        <div v-if="avgDifficulty">
          <q-icon name="trending_up" size="xs" />
          Dif: {{ avgDifficulty.toFixed(1) }}
        </div>
      </div>

      <!-- Budget bar -->
      <budget-bar
        v-if="block.repsBudget"
        :current-reps="currentReps"
        :original-budget="block.repsBudget"
        class="q-mt-sm"
      />

      <!-- Contraction mix badge -->
      <contraction-mix-badge
        :exercises="block.exercises"
        :intensity="block.intensity"
        :block-role="block.role"
        :warning="contractionWarning"
        class="q-mt-sm"
      />
    </q-card-section>

    <!-- Editable exercises list -->
    <q-list separator>
      <editable-exercise-row
        v-for="exercise in block.exercises"
        :key="exercise.id"
        :exercise="exercise"
        :session-id="sessionId"
        :block-id="block.id"
        :block-route="block.route"
        @swap="onSwapExercise"
        @remove="onRemoveExercise"
        @update="onUpdatePrescription"
      />
    </q-list>

    <!-- Footer actions -->
    <q-card-actions align="left" class="q-px-md q-pb-md">
      <q-btn
        flat
        dense
        icon="add"
        color="primary"
        label="Agregar Ejercicio"
        @click="$emit('add-exercise', { blockId: block.id, blockRoute: block.route, blockPattern: block.pattern, blockRole: block.role })"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { SessionBlock, SessionExercise, PrescriptionUpdate, CompatibleFormat } from 'src/types/session';
import { useEditApi } from 'src/composables/useEditApi';
import EditableExerciseRow from './EditableExerciseRow.vue';
import BudgetBar from './BudgetBar.vue';
import ContractionMixBadge from './ContractionMixBadge.vue';

const props = defineProps<{
  block: SessionBlock;
  sessionId: number;
  levelGroup: string;
}>();

const emit = defineEmits<{
  (e: 'swap-exercise', payload: { blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string }): void;
  (e: 'swap-block', block: SessionBlock): void;
  (e: 'add-exercise', payload: { blockId: number; blockRoute: string; blockPattern: string; blockRole: string }): void;
  (e: 'refresh'): void;
}>();

const $q = useQuasar();
const editApi = useEditApi();

// Format dropdown state
const compatibleFormats = ref<CompatibleFormat[]>([]);
const selectedFormat = ref<string>(props.block.formatName);
const formatsLoading = ref(false);

const blockColor = computed(() => {
  const role = props.block.role?.toLowerCase() || '';
  if (role.includes('initium')) return 'light-blue';
  if (role.includes('nucleus')) return 'deep-purple';
  if (role.includes('deuteros')) return 'teal';
  if (role.includes('athlos') || role.includes('epikos')) return 'amber';
  return 'grey';
});

const isInitium = computed(() => {
  return props.block.role?.toLowerCase().includes('initium') || false;
});

const avgDifficulty = computed(() => {
  const difficulties = props.block.exercises
    .map(e => e.dificultadLineal)
    .filter((d): d is number => d !== null && d !== undefined);
  if (difficulties.length === 0) return null;
  return difficulties.reduce((a, b) => a + b, 0) / difficulties.length;
});

// Current total reps (sum of non-ISO exercises with reps > 0)
const currentReps = computed(() => {
  return props.block.exercises.reduce((sum, ex) => {
    return sum + (ex.reps || 0);
  }, 0);
});

// Exercise soft cap warning: > 3 exercises for non-INITIUM
const exerciseCapWarning = computed(() => {
  return !isInitium.value && props.block.exercises.length > 3;
});

// Contraction warning placeholder - can be set from server validation later
const contractionWarning = ref<string | undefined>(undefined);

// Format dropdown options sorted by compatibility score
const formatOptions = computed(() => {
  if (compatibleFormats.value.length === 0) {
    return [{ label: props.block.formatName, value: props.block.formatName }];
  }
  return [...compatibleFormats.value]
    .sort((a, b) => a.compatibility - b.compatibility)
    .map(f => ({
      label: `${f.formatName} (${f.compatibility})`,
      value: f.formatName,
      formatId: f.formatId,
    }));
});

async function loadCompatibleFormats() {
  formatsLoading.value = true;
  try {
    const response = await editApi.fetchCompatibleFormats({
      blockRole: props.block.role,
      level: props.levelGroup,
      intensity: props.block.intensity,
    });
    compatibleFormats.value = response.formats;
  } catch {
    // Silent fail - dropdown will show current format only
  } finally {
    formatsLoading.value = false;
  }
}

async function onFormatChange(newFormat: string) {
  if (newFormat === props.block.formatName) return;

  const format = compatibleFormats.value.find(f => f.formatName === newFormat);
  if (!format) return;

  try {
    await editApi.changeBlockFormat(props.sessionId, props.block.id, format.formatId, format.formatName);
    $q.notify({
      type: 'positive',
      message: `Formato cambiado a ${format.formatName}. Ejercicios re-prescritos.`,
    });
    emit('refresh');
  } catch {
    $q.notify({ type: 'negative', message: 'Error al cambiar formato' });
    // Revert selection
    selectedFormat.value = props.block.formatName;
  }
}

function onSwapExercise(payload: { exercise: SessionExercise }) {
  emit('swap-exercise', {
    blockId: props.block.id,
    exercise: payload.exercise,
    blockRoute: props.block.route,
    blockPattern: props.block.pattern,
  });
}

async function onRemoveExercise(payload: { prescriptionId: number }) {
  $q.dialog({
    title: 'Eliminar Ejercicio',
    message: 'Se eliminara este ejercicio del bloque. Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await editApi.removeExercise(props.sessionId, props.block.id, payload.prescriptionId);
      $q.notify({ type: 'positive', message: 'Ejercicio eliminado' });
      emit('refresh');
    } catch {
      $q.notify({ type: 'negative', message: 'Error al eliminar ejercicio' });
    }
  });
}

async function onUpdatePrescription(payload: { prescriptionId: number; fields: PrescriptionUpdate }) {
  try {
    await editApi.updatePrescription(props.sessionId, props.block.id, payload.prescriptionId, payload.fields);
    // Targeted reactive update: update the exercise in-place
    const exercise = props.block.exercises.find(e => e.id === payload.prescriptionId);
    if (exercise) {
      Object.assign(exercise, payload.fields);
    }
    $q.notify({ type: 'positive', message: 'Prescripcion actualizada', color: 'green', timeout: 1500 });
    // NO emit('refresh') -- no reload, no scroll reset
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar prescripcion' });
  }
}

function onSaveBlock() {
  $q.dialog({
    title: 'Guardar Bloque',
    message: 'Nombre para este bloque:',
    prompt: {
      model: `${props.block.role} - ${props.block.formatName}`,
      type: 'text',
    },
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Guardar', color: 'primary' },
  }).onOk(async (name: string) => {
    try {
      await editApi.saveBlock(props.block.id, name);
      $q.notify({ type: 'positive', message: 'Bloque guardado para reutilizacion' });
    } catch {
      $q.notify({ type: 'negative', message: 'Error al guardar bloque' });
    }
  });
}

onMounted(loadCompatibleFormats);
</script>

<style scoped>
.border-light-blue {
  border-left: 4px solid var(--q-light-blue) !important;
}
.border-deep-purple {
  border-left: 4px solid var(--q-deep-purple) !important;
}
.border-teal {
  border-left: 4px solid var(--q-teal) !important;
}
.border-amber {
  border-left: 4px solid var(--q-amber) !important;
}
.border-grey {
  border-left: 4px solid var(--q-grey) !important;
}
</style>
