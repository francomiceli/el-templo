<!-- Diálogo "Ajustes" de Comunicaciones (Fase 193, Plan B, pedido de Franco
     2026-09-03): el bloque de WhatsApp de ventas (`AjustesVentas.vue`) deja
     de vivir dentro de la pestaña Tarjetas y pasa a un botón con ícono de
     engranaje en la cabecera de la página. -->
<template>
  <q-dialog v-model="localOpen">
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section class="row items-center">
        <q-icon name="settings" size="24px" class="q-mr-sm" />
        <div class="text-h6">Ajustes</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />
      <q-card-section>
        <AjustesVentas />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AjustesVentas from 'src/components/comunicaciones/AjustesVentas.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
</script>
