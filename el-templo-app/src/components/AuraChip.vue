<template>
  <!-- Fase 214 (plan 23): ficha L1 de Aura del encabezado de Mi Templo (UI-SPEC, Pantalla 1, D-66).
       Es un botón: abre el detalle privado. El filete dorado va solo en el marco, nunca detrás de
       un texto. -->
  <button type="button" class="aura-chip" :aria-label="ariaLabel" @click="emit('open')">
    <span class="aura-chip__inner">
      <span class="aura-chip__num">{{ formatAura(value) }}</span>
      <span class="aura-chip__label"
        ><span class="aura-chip__spark" aria-hidden="true">✦</span> AURA</span
      >
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatAura } from 'src/utils/aura-format'

const props = defineProps<{
  /** Aura ganada del socio (0 se muestra como "0"). */
  value: number
}>()

const emit = defineEmits<{
  open: []
}>()

const ariaLabel = computed(() => `Tu Aura: ${formatAura(props.value)}. Ver el detalle`)
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.aura-chip {
  @include pd-aura-frame;

  flex: none;
  display: block;
  min-height: 44px;
  padding: 2px;
  border: none;
  border-radius: 16px;
  box-shadow: 0 6px 16px rgba(60, 40, 15, 0.22);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: no-preference) {
    &:active {
      transform: scale(0.97);
    }
  }

  &__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    padding: 8px 16px;
    border-radius: 14px;
    background: linear-gradient(180deg, $pd-aura-ivory-a, $pd-gold-tint);
  }

  &__num {
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 22px;
    line-height: 1;
    color: $pd-aura-deep;
    font-variant-numeric: tabular-nums;
  }

  &__label {
    @include pd-kicker-light;

    margin-top: 4px;
    letter-spacing: 0.18em;
    color: $pd-gold-ink;
    white-space: nowrap;
  }

  &__spark {
    color: $pd-aura-spark;
  }
}
</style>
