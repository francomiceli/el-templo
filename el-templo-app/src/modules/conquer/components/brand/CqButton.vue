<template>
  <button
    :type="type"
    class="cq-btn"
    :class="[`cq-btn--${variant}`, { 'cq-btn--small': small }]"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    @click="emit('click')"
  >
    <span v-if="loading" class="cq-button__spin" aria-hidden="true" />
    {{ label }}
  </button>
</template>

<script setup lang="ts">
import '../../styles/conquer.scss'

// Fase 201 DA-16: botón de Conquer (reemplaza al botón de nubes). El look sale de `.cq-btn--*` en
// `conquer.scss`: `primary` (azul noche con filete y destello), `on-night` (crema, para DENTRO de la
// pieza oscura), `secondary`, `ghost-night` ("Atrás" de la guía) y `subir` (el único verde).
// `loading` deshabilita el botón y muestra un spinner CSS propio (no `q-spinner`: el color primario de
// Quasar no es el de Conquer). Va dentro de un `.cq-root` (CqScreen).
withDefaults(
  defineProps<{
    label: string
    variant?: 'primary' | 'on-night' | 'secondary' | 'ghost-night' | 'subir'
    small?: boolean
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', small: false, loading: false, disabled: false, type: 'button' },
)

const emit = defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
.cq-button__spin {
  flex: none;
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
}

// El spinner queda quieto con `prefers-reduced-motion: reduce`
@media (prefers-reduced-motion: no-preference) {
  .cq-button__spin {
    animation: cq-button-spin 0.8s linear infinite;
  }
}

@keyframes cq-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
