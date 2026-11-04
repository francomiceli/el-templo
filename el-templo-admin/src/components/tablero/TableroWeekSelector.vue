<template>
  <q-select
    :model-value="modelValue"
    :options="options"
    label="Semana"
    dense
    outlined
    emit-value
    map-options
    options-dense
    style="min-width: 260px"
    @update:model-value="onUpdate"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getWeekRange } from 'src/utils/renewals-week';
import { ddmm, weekOptions } from 'src/utils/weekly-board-format';

const props = defineProps<{ modelValue: string }>();

const emit = defineEmits<{ 'update:modelValue': [weekStart: string] }>();

const options = computed(() => {
  const base = weekOptions(12);
  if (base.some((o) => o.value === props.modelValue)) return base;
  // Semana que vino por la URL y no está entre las 12: se agrega para que se vea.
  // Anclada al mediodía UTC del lunes (misma hora de Argentina) para que `getWeekRange`
  // devuelva ese mismo lunes y su domingo.
  const { dateFrom, dateTo } = getWeekRange(0, new Date(`${props.modelValue}T12:00:00Z`));
  const extra = {
    value: props.modelValue,
    label: `Semana del ${ddmm(dateFrom)} al ${ddmm(dateTo)}`,
  };
  return [...base, extra].sort((a, b) => (a.value < b.value ? 1 : -1));
});

function onUpdate(value: string) {
  emit('update:modelValue', value);
}
</script>
