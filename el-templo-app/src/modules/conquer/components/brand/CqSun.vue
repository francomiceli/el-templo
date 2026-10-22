<template>
  <div class="cq-sun" :class="{ 'cq-sun--tall': !!$slots.default }">
    <div class="cq-sun__rays" aria-hidden="true" />
    <h2 v-if="title" class="cq-display cq-sun__title">{{ title }}</h2>
    <div v-if="caps" class="cq-caps cq-sun__caps">{{ caps }}</div>
    <div class="cq-sun__disc">
      <slot />
      <span class="cq-sun__small">{{ small }}</span>
      <b class="cq-sun__big">{{ big }}</b>
    </div>
    <div class="cq-sun__mont" aria-hidden="true" />
    <div class="cq-sun__cloud cq-sun__cloud--left" aria-hidden="true" />
    <div class="cq-sun__cloud cq-sun__cloud--right" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
// Fase 201 D-09: cabecera "el sol asoma entre montañas y nubes" (prototipo `hero`). `big` es el
// texto grande del sol (p. ej. el nivel), `small` el rótulo de arriba ("Tu nivel"); el slot trae el
// ícono (CqLevelIcon) y alarga la cabecera. `title` y `caps` son opcionales (el título "CONQUER" y
// la línea "Semana 5" sobre el sol).
defineProps<{
  big: string
  small: string
  title?: string
  caps?: string
}>()
</script>

<style scoped lang="scss">
.cq-sun {
  position: relative;
  // Sangra hasta los bordes de la pantalla (CqSky define los márgenes)
  margin: calc(-1 * var(--cq-pad-top)) calc(-1 * var(--cq-pad-x)) 0;
  height: 244px;
  overflow: hidden;
  text-align: center;
  padding-top: 26px;

  &--tall {
    height: 286px;
  }

  &__title {
    position: relative;
    font-size: 36px;
  }

  &__caps {
    position: relative;
    margin-top: 8px;
    color: var(--cq-cream);
  }

  &__rays {
    position: absolute;
    left: 50%;
    top: 104px;
    width: 560px;
    height: 560px;
    margin-left: -280px;
    border-radius: 50%;
    opacity: 0.13;
    background: repeating-conic-gradient(
      from -9deg,
      var(--cq-cream) 0 18deg,
      transparent 18deg 40deg
    );
    -webkit-mask-image: radial-gradient(circle, #000 30%, transparent 62%);
    mask-image: radial-gradient(circle, #000 30%, transparent 62%);
  }

  &__disc {
    // El ícono de nivel pinta su "papel" con el color del sol
    --cq-paper: var(--cq-sun);
    position: absolute;
    left: 50%;
    top: 100px;
    width: 252px;
    height: 252px;
    margin-left: -126px;
    border-radius: 50%;
    background: var(--cq-sun);
    color: var(--cq-ink);
    padding-top: 24px;
    box-shadow:
      0 0 0 12px rgba(253, 241, 208, 0.07),
      0 0 70px rgba(253, 241, 208, 0.3);

    :deep(svg) {
      display: block;
      margin: 0 auto 2px;
    }
  }

  &--tall &__disc {
    padding-top: 12px;
  }

  &__small {
    display: block;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--cq-ink2);
  }

  &__big {
    display: block;
    font-family: var(--cq-display);
    font-style: italic;
    font-weight: 600;
    font-size: 40px;
    line-height: 1.05;
  }

  &__mont {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 62px;
    background: linear-gradient(180deg, #4a66b0, rgba(42, 66, 136, 0));
    clip-path: polygon(
      0 100%,
      0 46%,
      9% 12%,
      17% 50%,
      24% 30%,
      33% 78%,
      45% 100%,
      55% 100%,
      67% 74%,
      76% 26%,
      83% 52%,
      91% 8%,
      100% 44%,
      100% 100%
    );
  }

  &__cloud {
    position: absolute;
    width: 84px;
    height: 26px;
    border-radius: 13px;
    background: var(--cq-cloud);
    box-shadow: 0 4px 0 var(--cq-cloud3);

    &::before,
    &::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      background: var(--cq-cloud);
    }

    &::before {
      width: 30px;
      height: 30px;
      left: 12px;
      top: -14px;
    }

    &::after {
      width: 40px;
      height: 40px;
      left: 34px;
      top: -22px;
    }

    &--left {
      left: -16px;
      top: 158px;
    }

    &--right {
      right: -22px;
      top: 132px;
    }
  }
}

// El sol sube al aparecer la pantalla (solo con movimiento permitido)
@media (prefers-reduced-motion: no-preference) {
  .cq-sun__disc {
    animation: cq-sun-rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .cq-sun__rays {
    animation: cq-sun-spin 120s linear infinite;
  }
}

@keyframes cq-sun-rise {
  from {
    transform: translateY(46px);
  }
}

@keyframes cq-sun-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
