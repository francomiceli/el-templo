<!-- Badge de estado de Renovaciones con menú para cambiarlo a mano
     (feedback 2026-09-29: "poder marcar 'no renueva' sin entrar a la ficha,
     trabajamos las dos sobre la misma planilla").

     Solo En proceso ⇄ No renueva es manual. Renovó / Volvió tarde / Pausada se
     derivan de las membresías (ver docblock del service en la API): el menú
     lo explica en vez de ofrecer una opción que el sistema pisaría. El motivo
     sigue siendo obligatorio (alimenta los KPIs), por eso "No renueva" abre
     un submenú con los motivos activos — dos clicks.

     El menú en sí es genérico (`FollowupStatusMenu`, lo comparte con Invitaciones):
     acá solo se traduce la fila de Renovaciones a sus props. -->
<template>
  <FollowupStatusMenu
    :label="renewalStatusLabel(row)"
    :color="meta.color"
    :editable="isManual"
    :negative="row.status === 'no_renovo'"
    :reason-id="row.reasonId"
    :reasons="reasons"
    negative-label="No renueva"
    reset-label="Volver a En proceso"
    :explanation="derivedExplanation"
    @reset="setEnProceso"
    @negative="setNoRenueva"
    @open-details="emit('open-details')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { renewalStatusMeta, renewalStatusLabel } from 'src/utils/renewal-status';
import FollowupStatusMenu from 'src/components/seguimiento/FollowupStatusMenu.vue';
import type { RenewalRow, RenewalReason, RenewalFollowupUpdateInput } from 'src/types/renewals';

const props = defineProps<{
  row: RenewalRow;
  reasons: RenewalReason[];
}>();

const emit = defineEmits<{
  change: [input: RenewalFollowupUpdateInput];
  'open-details': [];
}>();

const meta = computed(() => renewalStatusMeta(props.row.status));

/** Solo En proceso / No renueva se cambian a mano — el resto lo detecta el sistema. */
const isManual = computed(
  () => props.row.status === 'en_proceso' || props.row.status === 'no_renovo'
);

const derivedExplanation = computed(() => {
  switch (props.row.status) {
    case 'renovo':
      return 'Se detecta solo: tiene una membresía nueva cargada dentro de la ventana.';
    case 'volvio_tarde':
      return 'Se detecta solo: cargó una membresía nueva después de la ventana de 5 días.';
    case 'pausada':
      return 'Se detecta sola: la membresía está pausada. Se cambia desde la ficha del alumno.';
    default:
      return '';
  }
});

function setEnProceso() {
  emit('change', { manualStatus: 'en_proceso' });
}

function setNoRenueva(reasonId: number) {
  emit('change', { manualStatus: 'no_renovo', reasonId });
}
</script>
