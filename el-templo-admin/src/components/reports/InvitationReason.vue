<!-- Motivo del "No sigue" (con su nota debajo, en chico). Vacío en cualquier otro estado. -->
<template>
  <div v-if="row.followStatus === 'no_sigue' && row.followup.reasonLabel">
    {{ row.followup.reasonLabel }}
    <div v-if="row.followup.reasonNote" class="text-caption text-grey-7 reason-note">
      {{ row.followup.reasonNote }}
    </div>
  </div>
  <span v-else class="text-grey-5">—</span>
</template>

<script setup lang="ts">
import type { InvitationLeadRow } from 'src/types/report';

defineProps<{ row: InvitationLeadRow }>();
</script>

<style scoped lang="scss">
.reason-note {
  max-width: 220px;
  white-space: pre-wrap;
}
</style>
