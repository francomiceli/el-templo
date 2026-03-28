<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :maximized="$q.screen.lt.sm"
  >
    <q-card style="min-width: 500px; max-width: 700px; max-height: 80vh" class="column">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Vista Previa del Miembro</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="$emit('update:modelValue', false)" />
      </q-card-section>

      <!-- Level selector -->
      <q-card-section class="q-pt-sm q-pb-none">
        <q-select
          v-model="selectedLevel"
          :options="levelOptions"
          label="Nivel del miembro"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onLevelChange"
          style="max-width: 250px"
        />
      </q-card-section>

      <!-- Loading state -->
      <q-card-section v-if="loading" class="flex flex-center q-pa-xl col">
        <q-spinner-dots size="40px" color="primary" />
      </q-card-section>

      <!-- Error state -->
      <q-card-section v-else-if="error" class="text-center q-pa-lg col">
        <q-icon name="error" size="md" color="negative" />
        <div class="text-body2 q-mt-sm">{{ error }}</div>
        <q-btn flat dense color="primary" label="Reintentar" @click="loadPreview" class="q-mt-sm" />
      </q-card-section>

      <!-- Preview content -->
      <q-card-section v-else-if="preview" class="col scroll q-pt-sm">
        <!-- Session info -->
        <div class="text-caption text-grey q-mb-md">
          {{ formatWeekLabel(preview.week) }} - {{ dayLabel(preview.day) }} -
          {{ preview.memberLevel.charAt(0).toUpperCase() + preview.memberLevel.slice(1) }}
        </div>

        <!-- Blocks -->
        <div v-for="(block, idx) in preview.blocks" :key="block.id">
          <!-- Block separator -->
          <q-separator v-if="idx > 0" class="q-my-md" />

          <!-- Block header with colored left border -->
          <div :class="['q-pa-sm q-mb-xs', `preview-block-${blockColorName(block.role)}`]">
            <div class="row items-center justify-between">
              <div>
                <span class="text-subtitle2 text-weight-medium">{{ block.role }}</span>
                <span class="text-caption text-grey q-ml-sm">{{ block.route }}</span>
              </div>
              <q-badge :color="blockColorName(block.role)" :label="block.formatName" />
            </div>
          </div>

          <!-- Exercises -->
          <q-list dense class="q-pl-md">
            <q-item v-for="exercise in block.exercises" :key="exercise.id" dense class="q-px-none">
              <q-item-section>
                <q-item-label class="text-body2">
                  {{ exercise.exerciseName }}
                </q-item-label>
                <q-item-label caption>
                  <!-- Prescription -->
                  <span v-if="exercise.notes === 'PAUSA'">PAUSA</span>
                  <span v-else-if="exercise.increment"
                    >{{ exercise.reps || exercise.seconds || 0 }} -
                    {{ (exercise.reps || exercise.seconds || 0) + exercise.increment }} -
                    {{ (exercise.reps || exercise.seconds || 0) + exercise.increment * 2 }} -
                    ...</span
                  >
                  <span v-else-if="exercise.reps"
                    >{{ exercise.reps
                    }}<template v-if="exercise.repsMax"> · {{ exercise.repsMax }}</template>
                    reps</span
                  >
                  <span v-else-if="exercise.seconds"
                    >{{ exercise.seconds
                    }}<template v-if="exercise.secondsMax"> · {{ exercise.secondsMax }}</template
                    >s</span
                  >
                  <!-- Rest -->
                  <span v-if="exercise.rest && exercise.rest > 0" class="q-ml-sm">
                    Descanso: {{ exercise.rest }}s
                  </span>
                </q-item-label>
                <!-- Notes -->
                <q-item-label v-if="exercise.notes" caption class="text-italic text-grey-7">
                  {{ exercise.notes }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Empty state -->
        <div v-if="preview.blocks.length === 0" class="text-center text-grey q-pa-lg">
          No hay bloques en esta sesion
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useEditApi } from 'src/composables/useEditApi';
import { formatWeekLabel } from 'src/utils/weekDates';
import type { SessionPreview } from 'src/types/session';

const $q = useQuasar();

const props = defineProps<{
  modelValue: boolean;
  sessionId: number;
  currentMemberLevel: string;
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const editApi = useEditApi();

const selectedLevel = ref(props.currentMemberLevel);
const preview = ref<SessionPreview | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const levelOptions = [
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

// Watch dialog open state
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedLevel.value = props.currentMemberLevel;
      loadPreview();
    } else {
      preview.value = null;
      error.value = null;
    }
  }
);

function onLevelChange() {
  loadPreview();
}

async function loadPreview() {
  loading.value = true;
  error.value = null;
  preview.value = null;
  try {
    preview.value = await editApi.fetchPreview(props.sessionId, selectedLevel.value);
  } catch {
    error.value = editApi.error.value || 'Error cargando vista previa';
  } finally {
    loading.value = false;
  }
}

function blockColorName(role: string): string {
  const r = role?.toLowerCase() || '';
  if (r.includes('initium')) return 'brown-5';
  if (r.includes('nucleus')) return 'deep-orange-8';
  if (r.includes('deuteros')) return 'brown-8';
  if (r.includes('athlos') || r.includes('epikos')) return 'brown-6';
  return 'grey';
}

function dayLabel(day: string): string {
  const labels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
  };
  return labels[day] || day;
}
</script>

<style scoped>
.preview-block-brown-5 {
  border-left: 4px solid #795548;
  background: rgba(121, 85, 72, 0.05);
}
.preview-block-deep-orange-8 {
  border-left: 4px solid #d84315;
  background: rgba(216, 67, 21, 0.05);
}
.preview-block-brown-8 {
  border-left: 4px solid #4e342e;
  background: rgba(78, 52, 46, 0.05);
}
.preview-block-amber {
  border-left: 4px solid var(--q-amber);
  background: rgba(255, 193, 7, 0.05);
}
.preview-block-grey {
  border-left: 4px solid var(--q-grey);
  background: rgba(158, 158, 158, 0.05);
}
</style>
