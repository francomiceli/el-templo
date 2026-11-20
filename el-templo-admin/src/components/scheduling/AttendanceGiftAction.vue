<template>
  <!-- Regalo de Aura del profe en una fila de la asistencia (fase 215, D-15). Desde 2026-11-20 vive
       en el detalle de la clase de Horarios (`SlotDetailDialog`): el panel donde se había puesto
       (`SlotAttendancePanel`) ya no se abría desde ninguna pantalla y los profes no tenían cómo
       dar Aura. Qué se ve lo decide `coachGiftCellKind`; la ventana de dar Aura es una sola, en
       el diálogo que lo usa (evento `give`). -->
  <q-btn
    v-if="kind === 'give'"
    flat
    dense
    round
    icon="volunteer_activism"
    class="text-aura"
    size="sm"
    :aria-label="`Dar Aura a ${memberName}`"
    @click="$emit('give')"
  >
    <q-tooltip>Dar Aura</q-tooltip>
  </q-btn>
  <!-- El tooltip va en el contenedor: un botón deshabilitado no recibe el puntero. -->
  <span v-else-if="kind === 'disabled'" data-test="gift-disabled">
    <q-btn
      flat
      dense
      round
      disable
      icon="volunteer_activism"
      size="sm"
      :aria-label="`Dar Aura a ${memberName}. ${disabledNote}`"
    />
    <q-tooltip>{{ disabledNote }}</q-tooltip>
  </span>
  <q-chip
    v-else-if="kind === 'given' && gift"
    dense
    square
    class="text-aura"
    style="background-color: #f6efdc"
  >
    ✦ +{{ gift.amount }}
    <q-tooltip>{{ coachGiftGivenTooltip(gift.reason) }}</q-tooltip>
  </q-chip>
  <q-chip v-else-if="kind === 'voided'" dense square color="grey-4" text-color="grey-9">
    Anulado
    <q-tooltip>El regalo de hoy fue anulado y no se puede volver a dar.</q-tooltip>
  </q-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SlotAttendanceGift } from 'src/types/attendance';
import { coachGiftCellKind, coachGiftGivenTooltip } from 'src/utils/coach-gift-view';

const props = defineProps<{
  enabled: boolean;
  attendanceId: number | null;
  gift: SlotAttendanceGift | null | undefined;
  memberName: string;
  disabledNote: string;
}>();

defineEmits<{ give: [] }>();

const kind = computed(() =>
  coachGiftCellKind({
    enabled: props.enabled,
    attendanceId: props.attendanceId,
    gift: props.gift,
  }),
);
</script>
