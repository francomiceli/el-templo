<template>
  <div class="templo-loader" :class="`templo-loader--${size}`">
    <div class="templo-loader__spinner"></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)
</script>

<style lang="scss" scoped>
@import 'src/css/quasar.variables.scss';

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.templo-loader {
  display: flex;
  align-items: center;
  justify-content: center;
}

.templo-loader__spinner {
  border-radius: 50%;
  border-style: solid;
  border-color: rgba($primary, 0.15);
  border-top-color: $primary;
  animation: spin 0.9s linear infinite;
}

.templo-loader--sm .templo-loader__spinner {
  width: 24px;
  height: 24px;
  border-width: 3px;
}

.templo-loader--md .templo-loader__spinner {
  width: 40px;
  height: 40px;
  border-width: 4px;
}

.templo-loader--lg .templo-loader__spinner {
  width: 56px;
  height: 56px;
  border-width: 4px;
}
</style>
