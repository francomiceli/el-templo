<template>
  <!-- Fase 214 (plan 23): ficha L1 de Aura del encabezado de Mi Templo (UI-SPEC, Pantalla 1, D-66).
       Es un botón: abre el detalle privado. El filete dorado va solo en el marco, nunca detrás de
       un texto. -->
  <button
    type="button"
    class="aura-chip"
    :class="{ 'aura-chip--pulse': pulse }"
    :aria-label="ariaLabel"
    @click="emit('open')"
  >
    <!-- Fase 215 (#33): el "+N" que sube de la ficha durante la celebración de Aura. -->
    <span v-if="plus" class="aura-chip__plus" aria-hidden="true">+{{ plus }}</span>
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
  /** Celebración de Aura: la ficha late. */
  pulse?: boolean
  /** Celebración de Aura: el "+N" que sube; null o ausente = no hay. */
  plus?: number | null
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

  position: relative;
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

  // Fase 215 (#33): latido de la celebración (el CSS de movimiento reducido lo anula abajo).
  &--pulse {
    animation: aura-chip-pulse 1.1s ease-out;
  }

  &__plus {
    position: absolute;
    top: 4px;
    left: 50%;
    z-index: 5;
    font-family: 'Montserrat', sans-serif;
    font-size: 20px;
    font-weight: 800;
    color: $pd-gold-bright;
    text-shadow: 0 1px 3px rgba(44, 35, 24, 0.85);
    pointer-events: none;
    transform: translateX(-50%);
    animation: aura-chip-rise 1.4s ease-out forwards;
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

@keyframes aura-chip-pulse {
  0% {
    transform: scale(1);
    box-shadow:
      0 6px 16px rgba(60, 40, 15, 0.22),
      0 0 0 0 rgba(240, 213, 143, 0.9);
  }

  30% {
    transform: scale(1.09);
    box-shadow:
      0 6px 16px rgba(60, 40, 15, 0.22),
      0 0 0 10px rgba(240, 213, 143, 0);
  }

  100% {
    transform: scale(1);
    box-shadow:
      0 6px 16px rgba(60, 40, 15, 0.22),
      0 0 0 0 rgba(240, 213, 143, 0);
  }
}

@keyframes aura-chip-rise {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px);
  }

  20% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -34px);
  }
}

// Movimiento reducido: sin latido ni "+N" que sube.
@media (prefers-reduced-motion: reduce) {
  .aura-chip--pulse,
  .aura-chip__plus {
    animation: none;
  }

  .aura-chip__plus {
    display: none;
  }
}
</style>
