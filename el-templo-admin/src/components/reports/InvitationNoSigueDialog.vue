<!-- "No sigue" con motivo y nota opcional: la versión completa del submenú de motivos
     del chip de estado (mismo gesto que "Más opciones" en Renovaciones). El motivo es
     obligatorio: alimenta los números del seguimiento. -->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card style="min-width: 360px; max-width: 520px; width: 100%">
      <q-card-section class="row items-center">
        <div class="text-h6">No sigue</div>
        <q-space />
        <q-btn flat round dense icon="close" :disable="saving" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-card-section v-if="row">
        <div class="text-body2 q-mb-sm">{{ row.invitee.firstName }} {{ row.invitee.lastName }}</div>
        <q-select
          v-model="selectedReasonId"
          :options="reasonOptions"
          emit-value
          map-options
          dense
          outlined
          label="Motivo"
          class="q-mb-sm"
        />
        <q-input
          v-model="noteDraft"
          type="textarea"
          :rows="2"
          dense
          outlined
          label="Nota (opcional)"
          maxlength="500"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" :disable="saving" v-close-popup />
        <q-btn
          color="negative"
          label="Marcar No sigue"
          :disable="selectedReasonId === null"
          :loading="saving"
          @click="onSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RenewalReason } from 'src/types/renewals';
import type { InvitationFollowupUpdateInput, InvitationLeadRow } from 'src/types/report';

const props = defineProps<{
  modelValue: boolean;
  row: InvitationLeadRow | null;
  reasons: RenewalReason[];
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [input: InvitationFollowupUpdateInput];
}>();

const reasonOptions = computed(() => props.reasons.map((r) => ({ label: r.label, value: r.id })));

const selectedReasonId = ref<number | null>(null);
const noteDraft = ref('');

// Al abrir se precarga el motivo y la nota actuales (si ya estaba en "No sigue").
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    selectedReasonId.value = props.row?.followup.reasonId ?? null;
    noteDraft.value = props.row?.followup.reasonNote ?? '';
  }
);

function onSave() {
  if (selectedReasonId.value === null) return;
  emit('save', {
    manualStatus: 'no_renovo',
    reasonId: selectedReasonId.value,
    reasonNote: noteDraft.value.trim() || null,
  });
}
</script>
