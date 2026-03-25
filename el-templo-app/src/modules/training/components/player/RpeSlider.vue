<template>
  <div class="rpe-slider">
    <div class="rpe-slider__label text-subtitle2 q-mb-sm">Esfuerzo Percibido (RPE)</div>

    <q-slider
      v-model="internalValue"
      :min="1"
      :max="10"
      :step="1"
      :markers="true"
      :marker-labels="markerLabels"
      label
      label-always
      color="primary"
      thumb-size="24px"
      class="q-px-md"
    />

    <div class="rpe-slider__description text-center q-mt-md text-body2">
      <template v-if="hasInteracted">
        <span class="text-weight-medium">{{ internalValue }}</span>
        <span class="text-grey-7"> - {{ rpeDescriptions[internalValue] }}</span>
      </template>
      <template v-else>
        <span class="text-grey-6">Desliza para indicar tu esfuerzo</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  /** Current RPE value (1-10 or null) */
  modelValue: number | null
}

interface Emits {
  (e: 'update:modelValue', value: number | null): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Internal value starts at 5 if null (center of slider) but doesn't emit until user interacts
const internalValue = ref<number>(props.modelValue ?? 5)
const hasInteracted = ref(props.modelValue !== null)

// Marker labels per CONTEXT.md: every 2 numbers (2, 4, 6, 8, 10)
const markerLabels: Record<number, string> = {
  2: 'Facil',
  4: 'Moderado',
  6: 'Duro',
  8: 'Muy Duro',
  10: 'Maximo',
}

// Full descriptions for all values
const rpeDescriptions: Record<number, string> = {
  1: 'Muy facil, apenas esfuerzo',
  2: 'Facil',
  3: 'Facil a moderado',
  4: 'Moderado',
  5: 'Moderado a duro',
  6: 'Duro',
  7: 'Duro a muy duro',
  8: 'Muy duro',
  9: 'Extremadamente duro',
  10: 'Esfuerzo máximo',
}

// Watch for user interaction and emit
watch(internalValue, (newValue) => {
  hasInteracted.value = true
  emit('update:modelValue', newValue)
})

// Sync from parent if changed externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== null) {
      internalValue.value = newValue
      hasInteracted.value = true
    }
  },
)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.rpe-slider {
  padding: 16px 8px;
  background: rgba($secondary, 0.05);
  border-radius: 12px;
}

.rpe-slider__label {
  color: $primary;
  font-family: 'Montserrat', sans-serif;
  letter-spacing: 0.05em;
}

.rpe-slider__description {
  min-height: 24px;
}
</style>
