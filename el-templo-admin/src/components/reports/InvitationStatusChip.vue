<!-- Estado de seguimiento de un invitado (chip + menú manual). El menú es el mismo
     que usa Renovaciones (`FollowupStatusMenu`): solo se abre cuando el invitado no
     compró y se puede registrar seguimiento (`followup.subscriptionId` no es nulo).
     Cualquier otro estado es una etiqueta; lo deriva el servidor. -->
<template>
  <span class="row inline items-center no-wrap">
    <FollowupStatusMenu
      :label="meta.label"
      :color="meta.color"
      :editable="editable"
      :negative="row.followStatus === 'no_sigue'"
      :reason-id="row.followup.reasonId"
      :reasons="reasons"
      negative-label="No sigue"
      reset-label="Volver a Para contactar"
      @reset="emit('change', { manualStatus: 'en_proceso' })"
      @negative="(reasonId) => emit('change', { manualStatus: 'no_renovo', reasonId })"
      @open-details="emit('open-details')"
    />
    <q-icon v-if="meta.tooltip" name="info" size="14px" color="grey-6" class="q-ml-xs">
      <q-tooltip>{{ meta.tooltip }}</q-tooltip>
    </q-icon>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FollowupStatusMenu from 'src/components/seguimiento/FollowupStatusMenu.vue';
import { followStatusMeta, hasPurchased } from 'src/utils/invitation-meta';
import type { RenewalReason } from 'src/types/renewals';
import type { InvitationFollowupUpdateInput, InvitationLeadRow } from 'src/types/report';

const props = defineProps<{
  row: InvitationLeadRow;
  reasons: RenewalReason[];
}>();

const emit = defineEmits<{
  change: [input: InvitationFollowupUpdateInput];
  'open-details': [];
}>();

const meta = computed(() => followStatusMeta(props.row));

const editable = computed(
  () => !hasPurchased(props.row) && props.row.followup.subscriptionId !== null
);
</script>
