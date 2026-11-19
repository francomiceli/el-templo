<!-- Etiqueta "Invitación · 2/3" para el profe en la lista de una clase: el alumno viene
     con una invitación y todavía no compró un plan. Mismo estilo que el chip
     "Invitación" de Alumnos. Sin invitación (null/undefined) no muestra nada. -->
<template>
  <q-badge v-if="invitation" v-bind="$attrs" outline color="primary" :label="label">
    <q-tooltip>{{ tooltip }}</q-tooltip>
  </q-badge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RosterInvitation } from 'src/types/attendance';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  invitation: RosterInvitation | null | undefined;
}>();

// Sin contadores (vínculo heredado sin accesos) solo dice "Invitación".
const counters = computed(() => {
  const used = props.invitation?.accessesUsed;
  const budget = props.invitation?.accessesBudget;
  return used == null || budget == null ? null : { used, budget };
});

const label = computed(() =>
  counters.value ? `Invitación · ${counters.value.used}/${counters.value.budget}` : 'Invitación'
);

const tooltip = computed(() =>
  counters.value
    ? `Viene con una invitación: usó ${counters.value.used} de ${counters.value.budget} accesos`
    : 'Viene con una invitación'
);
</script>
