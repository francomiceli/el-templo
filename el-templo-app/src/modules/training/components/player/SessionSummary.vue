<template>
  <div class="session-summary fixed-full column">
    <!-- Header -->
    <div class="session-summary__header q-pa-md">
      <div class="text-h5 text-weight-bold">Resumen de Sesion</div>
      <div class="text-subtitle2 text-grey-3">{{ formattedDate }}</div>
    </div>

    <!-- Scrollable Content -->
    <div class="session-summary__content col q-pa-md">
      <!-- Total Days Trained (prominent) -->
      <div class="days-trained q-mb-lg text-center">
        <div class="text-h2 text-weight-bold text-primary">{{ totalDaysTrained }}</div>
        <div class="text-body1 text-grey-7">dias entrenados</div>
      </div>

      <!-- Session Stats -->
      <div class="stats-row q-mb-lg">
        <div class="stat-item">
          <q-icon name="view_module" size="32px" color="secondary" />
          <div class="stat-value">{{ blocksCompletedCount }}</div>
          <div class="stat-label">Bloques</div>
        </div>
      </div>

      <!-- Blocks Completed List -->
      <div class="blocks-list q-mb-lg">
        <div class="text-subtitle2 text-grey-7 q-mb-sm">Bloques completados</div>
        <div class="blocks-chips">
          <q-chip
            v-for="block in blocksCompleted"
            :key="block"
            :color="getBlockColor(block)"
            text-color="white"
            size="md"
          >
            {{ getBlockName(block) }}
          </q-chip>
        </div>
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

interface Props {
  /** Date of the session (YYYY-MM-DD) */
  date: string;
  /** Array of completed block roles */
  blocksCompleted: string[];
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

const blocksCompletedCount = computed(() => props.blocksCompleted.length);

// Block display helpers
function getBlockName(role: string): string {
  const names: Record<string, string> = {
    INITIUM: 'Initium',
    NUCLEUS: 'Nucleus',
    DEUTEROS_1: 'Deuteros 1',
    DEUTEROS_2: 'Deuteros 2',
    ATHLOS_EPIKOS: 'Athlos',
  };
  return names[role] || role;
}

function getBlockColor(role: string): string {
  const colors: Record<string, string> = {
    INITIUM: 'light-blue',
    NUCLEUS: 'purple',
    DEUTEROS_1: 'teal',
    DEUTEROS_2: 'deep-orange',
    ATHLOS_EPIKOS: 'amber-8',
  };
  return colors[role] || 'grey';
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
.session-summary {
  background: white;
  z-index: 9998;
}

.session-summary__header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
}

.session-summary__content {
  overflow-y: auto;
  padding-bottom: 100px; // Space for fixed footer
}

.session-summary__footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

.days-trained {
  background: linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%);
  border-radius: 16px;
  padding: 32px 24px;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 32px;
}

.stat-item {
  text-align: center;

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 8px 0 4px;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #757575;
    text-transform: uppercase;
  }
}

.blocks-list {
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
}

.blocks-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
