<template>
  <q-badge :color="badgeColor" :label="badgeLabel" class="q-pa-xs">
    <q-icon v-if="bySystem && status === 'approved'" name="schedule" size="xs" class="q-ml-xs" />
  </q-badge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SessionStatus } from 'src/types/session';

const props = defineProps<{
  status: SessionStatus;
  bySystem?: boolean;
}>();

const badgeColor = computed(() => {
  switch (props.status) {
    case 'pending_review':
      return 'warning';
    case 'approved':
      return props.bySystem ? 'brown-4' : 'positive';
    default:
      return 'grey';
  }
});

const badgeLabel = computed(() => {
  switch (props.status) {
    case 'pending_review':
      return 'Pendiente';
    case 'approved':
      return props.bySystem ? 'Auto-aprobada' : 'Aprobada';
    default:
      return props.status;
  }
});
</script>
