<!-- "Terminó": cuándo se le terminaron los accesos y por qué (se gastó el cupo o se
     venció el plazo); mientras todavía tiene, cuándo vencen. -->
<template>
  <div v-if="row.endedOn">
    {{ formatDate(row.endedOn) }}
    <div v-if="row.endReason" class="text-caption text-grey-7">
      {{ END_REASON_LABEL[row.endReason] }}
    </div>
  </div>
  <span v-else class="text-grey-7">Vence el {{ formatDate(row.accessExpiresOn) }}</span>
</template>

<script setup lang="ts">
import { formatDate } from 'src/utils/format-date';
import { END_REASON_LABEL } from 'src/utils/invitation-meta';
import type { InvitationLeadRow } from 'src/types/report';

defineProps<{ row: InvitationLeadRow }>();
</script>
