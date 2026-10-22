<template>
  <div class="cq-foot" :class="{ 'cq-foot--plain': plain }">
    <button
      type="button"
      class="cq-cta"
      :class="{ 'cq-cta--ghost': ghost }"
      :disabled="disabled || loading"
      :aria-busy="loading ? 'true' : undefined"
      @click="emit('click')"
    >
      <span v-if="loading" class="cq-cloud-button__spin" aria-hidden="true" />
      {{ label }}
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
import '../../styles/conquer.scss'

// Fase 201 D-09: el botón principal de Conquer sobre el pie de nubes blancas (prototipo `.foot` +
// `.cta`). Alto de 54 px (hitbox ≥ 44). El slot cae debajo del botón: una línea de ayuda
// (`<div class="cq-sub">`) o un segundo botón (`<button class="cq-cta cq-cta--ghost">`).
// `plain` quita el borde de nubes (pantallas cuyo pie va pegado a una imagen).
withDefaults(
  defineProps<{
    label: string
    loading?: boolean
    disabled?: boolean
    ghost?: boolean
    plain?: boolean
  }>(),
  { loading: false, disabled: false, ghost: false, plain: false },
)

const emit = defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
.cq-cloud-button__spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 10px;
  vertical-align: -2px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-cloud-button__spin {
    animation: cq-cloud-button-spin 0.8s linear infinite;
  }

  .cq-cta:active:not(:disabled) {
    transform: scale(0.985);
  }
}

@keyframes cq-cloud-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
