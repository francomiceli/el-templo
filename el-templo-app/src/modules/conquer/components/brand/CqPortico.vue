<template>
  <section class="cq-dark cq-portico">
    <div class="cq-portico__halo" aria-hidden="true" />
    <svg
      v-if="columns"
      class="cq-portico__cols"
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 34 60 8l52 26z" />
      <rect x="10" y="38" width="100" height="8" />
      <path d="M20 50v58M40 50v58M60 50v58M80 50v58M100 50v58M6 112h108" />
    </svg>
    <div class="cq-portico__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import '../../styles/conquer.scss'

// Fase 201 DA-16: la pieza oscura de cada pantalla (pórtico del nivel en Inicio, cabecera de cada
// ejercicio en Hoy, KPIs en Progreso…): superficie azul noche con línea luminosa dorada abajo
// (`.cq-dark`), el halo y la columnata del sketch 022 B detrás del contenido. Va dentro de un
// `.cq-root` (CqScreen). `columns` apaga la columnata en piezas chicas.
withDefaults(
  defineProps<{
    columns?: boolean
  }>(),
  { columns: true },
)
</script>

<style scoped lang="scss">
.cq-portico {
  border-radius: 20px;
  padding: 18px 16px;
}

// Las dos decoraciones quedan detrás del contenido y no capturan toques
.cq-portico__halo {
  position: absolute;
  z-index: 0;
  right: -40px;
  top: -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(207, 174, 107, 0.22), transparent 65%);
  pointer-events: none;
}

.cq-portico__cols {
  position: absolute;
  z-index: 0;
  right: -18px;
  top: -14px;
  width: 170px;
  height: 170px;
  opacity: 0.3;
  pointer-events: none;

  path,
  rect {
    fill: none;
    stroke: var(--cq-deco-gold);
    stroke-width: 2;
  }
}

.cq-portico__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

// El halo respira como el de la card de hoy; con `reduce` queda quieto
@media (prefers-reduced-motion: no-preference) {
  .cq-portico__halo {
    animation: cq-portico-breathe 7s ease-in-out infinite;
  }
}

@keyframes cq-portico-breathe {
  0%,
  100% {
    opacity: 0.75;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}
</style>
