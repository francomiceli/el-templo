<template>
  <div
    class="progress-dots"
    role="progressbar"
    :aria-valuenow="currentStep + 1"
    :aria-valuemax="totalSteps"
  >
    <div
      v-for="(_, i) in totalSteps"
      :key="i"
      :class="[
        'progress-dot',
        {
          'progress-dot--completed': i < currentStep,
          'progress-dot--active': i === currentStep,
          'progress-dot--upcoming': i > currentStep,
        },
      ]"
      :aria-label="`Pregunta ${i + 1} de ${totalSteps}`"
      :aria-current="i === currentStep ? 'step' : undefined"
    ></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    currentStep: number
    totalSteps?: number
  }>(),
  {
    totalSteps: 4,
  },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$cream: #f2ede5;

.progress-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
  z-index: 2;
  position: relative;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.2s ease;

  &--completed {
    background: $terracotta;
  }

  &--active {
    background: $terracotta;
    transform: scale(1.2);
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  &--upcoming {
    background: transparent;
    border: 1px solid rgba($cream, 0.25);
  }
}

@keyframes dot-pulse {
  0%,
  100% {
    transform: scale(1.2);
  }
  50% {
    transform: scale(1.4);
  }
}
</style>
