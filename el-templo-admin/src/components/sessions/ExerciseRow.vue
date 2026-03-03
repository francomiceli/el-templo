<template>
  <q-item>
    <q-item-section>
      <q-item-label class="text-weight-medium">
        {{ exercise.exerciseName }}
      </q-item-label>
      <q-item-label caption>
        <q-chip
          dense
          size="sm"
          :color="contractionColor"
          text-color="white"
          :label="contractionLabel"
        />
        <q-badge
          v-if="exercise.route"
          :color="exercise.route === blockRoute ? 'green' : 'deep-orange'"
          text-color="white"
          class="q-ml-xs"
        >
          {{ exercise.route }}
        </q-badge>
        <span class="q-ml-sm">
          <template v-if="exercise.notes === 'PAUSA'">PAUSA</template>
          <template v-else-if="exercise.increment">{{ deathBySeq }}</template>
          <template v-else-if="exercise.reps"
            >{{ exercise.reps
            }}<template v-if="exercise.repsMax"> · {{ exercise.repsMax }}</template> reps</template
          >
          <template v-else-if="exercise.seconds"
            >{{ exercise.seconds
            }}<template v-if="exercise.secondsMax"> · {{ exercise.secondsMax }}</template
            >s</template
          >
        </span>
      </q-item-label>
    </q-item-section>

    <q-item-section side v-if="exercise.dificultadLineal">
      <div class="text-caption text-grey">Dif: {{ exercise.dificultadLineal }}</div>
    </q-item-section>

    <q-item-section side v-if="exercise.notes">
      <q-icon name="info" color="grey">
        <q-tooltip>{{ exercise.notes }}</q-tooltip>
      </q-icon>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionExercise } from 'src/types/session';
import {
  normalizeContraction,
  contractionColor as getContractionColor,
} from 'src/utils/contraction-helpers';

const props = defineProps<{
  exercise: SessionExercise;
  blockRoute: string;
}>();

const deathBySeq = computed(() => {
  const start = props.exercise.reps || props.exercise.seconds || 0;
  const inc = props.exercise.increment || 0;
  return `${start} - ${start + inc} - ${start + inc * 2} - ...`;
});

const contractionLabel = computed(() => normalizeContraction(props.exercise.contraction) || '-');
const contractionColor = computed(() => getContractionColor(props.exercise.contraction));
</script>
