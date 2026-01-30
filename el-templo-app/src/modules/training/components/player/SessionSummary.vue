<template>
  <div class="session-summary fixed-full column">
    <!-- Header -->
    <div class="session-summary__header q-pa-md">
      <div class="text-h5 text-weight-bold">Resumen de Sesion</div>
      <div class="text-subtitle2 text-grey-3">{{ formattedDate }}</div>
    </div>

    <!-- Scrollable Content -->
    <div class="session-summary__content col q-pa-md">
      <!-- Days Stats Row: This Week / Total -->
      <div class="days-stats-row q-mb-lg">
        <div class="days-stat">
          <div class="text-h3 text-weight-bold text-primary">{{ daysCompletedThisWeek }}</div>
          <div class="text-body2 text-grey-7">esta semana</div>
        </div>
        <div class="days-divider"></div>
        <div class="days-stat">
          <div class="text-h3 text-weight-bold text-secondary">{{ totalDaysTrained }}</div>
          <div class="text-body2 text-grey-7">dias totales</div>
        </div>
      </div>

      <!-- Blocks Completed (Expandable) -->
      <div class="blocks-section q-mb-lg">
        <div class="text-subtitle2 text-grey-7 q-mb-sm">Bloques completados</div>
        <q-list class="blocks-expansion-list">
          <q-expansion-item
            v-for="block in blocksData"
            :key="block.role"
            :header-class="'block-header bg-' + getBlockColor(block.role)"
            expand-icon-class="text-white"
            dense
          >
            <template #header>
              <q-item-section avatar>
                <q-icon :name="getBlockIcon(block.role)" color="white" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-white text-weight-medium">
                  {{ getBlockName(block.role) }}
                </q-item-label>
                <q-item-label caption class="text-white-70">
                  {{ block.exercises.length }} ejercicios
                </q-item-label>
              </q-item-section>
            </template>

            <q-card class="block-exercises-card">
              <q-card-section class="q-pa-sm">
                <q-list dense separator>
                  <q-item v-for="(exercise, idx) in block.exercises" :key="idx" class="q-px-sm">
                    <q-item-section avatar class="exercise-number">
                      <span class="text-grey-6">{{ idx + 1 }}</span>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-body2">{{ exercise.name }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>
          </q-expansion-item>
        </q-list>
      </div>

      <!-- RPE Input -->
      <div class="rpe-section q-mb-lg">
        <RpeSlider v-model="rpeValue" />
      </div>

      <!-- Notes (optional) -->
      <div class="notes-section">
        <q-input
          v-model="notesValue"
          type="textarea"
          label="Notas (opcional)"
          outlined
          :rows="2"
          maxlength="500"
          counter
        />
      </div>
    </div>

    <!-- Fixed Footer -->
    <div class="session-summary__footer q-pa-md">
      <q-btn
        color="primary"
        unelevated
        label="Terminar Sesion"
        class="full-width"
        size="lg"
        :loading="isSubmitting"
        @click="onFinish"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import RpeSlider from './RpeSlider.vue';

interface BlockData {
  role: string;
  exercises: Array<{ name: string }>;
}

interface Props {
  /** Date of the session (YYYY-MM-DD) */
  date: string;
  /** Block data with exercises for expandable display */
  blocksData: BlockData[];
  /** Days completed this week */
  daysCompletedThisWeek: number;
  /** Cumulative days trained (from API response or 0 initially) */
  totalDaysTrained: number;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
}

interface Emits {
  (e: 'finish', data: { rpe: number | null; notes: string | null }): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSubmitting: false,
});
const emit = defineEmits<Emits>();

// Form state
const rpeValue = ref<number | null>(null);
const notesValue = ref<string>('');

// Computed
const formattedDate = computed(() => {
  const d = new Date(props.date + 'T00:00:00');
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

// Block display helpers
function getBlockName(role: string): string {
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros 1',
    DEUTEROS_2: 'Deuteros 2',
    ATHLOS: 'Athlos',
    EPIKOS: 'Epikos',
  };
  return names[role] || role;
}

function getBlockColor(_role: string): string {
  // All blocks use bronze in session summary
  return 'secondary';
}

function getBlockIcon(role: string): string {
  const icons: Record<string, string> = {
    INITIUM: 'wb_sunny',
    NUCLEUS: 'star',
    DEUTEROS_1: 'layers',
    DEUTEROS_2: 'layers',
    ATHLOS: 'local_fire_department',
    EPIKOS: 'local_fire_department',
  };
  return icons[role] || 'view_module';
}

// Actions
function onFinish(): void {
  emit('finish', {
    rpe: rpeValue.value,
    notes: notesValue.value.trim() || null,
  });
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.session-summary {
  background: $cream;
  z-index: 9998;
}

.session-summary__header {
  background: linear-gradient(135deg, #1a2a3e 0%, #2c3e5c 100%);
  color: white;

  .text-h5 {
    font-family: 'Cinzel', Georgia, serif;
    letter-spacing: 0.05em;
  }
}

.session-summary__content {
  overflow-y: auto;
  padding-bottom: 100px;
}

.session-summary__footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: $cream;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

.days-stats-row {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, rgba(245, 240, 232, 0.8) 0%, rgba(232, 224, 212, 0.6) 100%);
  border: 1px solid rgba(184, 149, 108, 0.3);
  border-radius: 16px;
  padding: 24px 16px;
}

.days-stat {
  flex: 1;
  text-align: center;
}

.days-divider {
  width: 1px;
  height: 48px;
  background: rgba(0, 0, 0, 0.12);
  margin: 0 8px;
}

.blocks-section {
  background: #f5f0e8;
  border-radius: 12px;
  padding: 16px;
}

.blocks-expansion-list {
  border-radius: 8px;
  overflow: hidden;

  :deep(.q-expansion-item) {
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.block-header) {
    border-radius: 8px;
    min-height: 56px;
  }

  :deep(.q-expansion-item--expanded .block-header) {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.block-exercises-card {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-top: none;
}

.exercise-number {
  min-width: 24px;
  font-size: 0.875rem;
}

.text-white-70 {
  color: rgba(255, 255, 255, 0.7);
}
</style>
