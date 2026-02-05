<template>
  <q-tabs
    v-model="selectedDay"
    align="justify"
    narrow-indicator
    dense
    class="text-grey"
    active-color="primary"
    indicator-color="primary"
  >
    <q-tab name="lunes" label="Lun" />
    <q-tab name="martes" label="Mar" />
    <q-tab name="miercoles" label="Mie" />
    <q-tab name="jueves" label="Jue" />
    <q-tab name="viernes" label="Vie" />
    <q-tab name="sabado" label="Sab" />
  </q-tabs>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const selectedDay = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});
</script>
