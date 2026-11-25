<template>
  <span v-if="aura" class="roster-aura text-aura" :aria-label="`${formatted} de Aura`">
    ✦ {{ formatted }}
    <q-tooltip>Aura ganada</q-tooltip>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatAura } from 'src/utils/aura-format';

/**
 * Aura ganada del alumno en el roster de Horarios (pedido de Franco, 2026-11-25). El server
 * manda null si es 0 o si el gimnasio no tiene Aura: en ese caso no se muestra nada.
 */
const props = defineProps<{ aura?: number | null }>();

const formatted = computed(() => formatAura(props.aura ?? 0));
</script>

<style scoped>
.roster-aura {
  font-weight: 600;
  white-space: nowrap;
}
</style>
