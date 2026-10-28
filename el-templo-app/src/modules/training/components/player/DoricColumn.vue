<template>
  <!-- Columna dórica tumbada de la plani de la TV: capiteles con su proporción en los extremos y el
       fuste en el medio, con contorno dorado. Con `shine`, una banda de luz la cruza cada tanto. -->
  <div class="doric-column" :style="{ height: `${height}px` }" aria-hidden="true">
    <div class="doric-column__piezas">
      <i class="doric-column__cap doric-column__cap--izq" />
      <i class="doric-column__fuste" />
      <i class="doric-column__cap doric-column__cap--der" />
    </div>
    <div v-if="shine" class="doric-column__brillo" />
  </div>
</template>

<script setup lang="ts">
// Mismas piezas que `el-templo-admin/src/pages/TvScreenPage.vue` (.columnaDorica): tv-col-*.png
// copiadas a src/assets/tv. Separador del formato en el player y columna del "¡VAMOS!".
withDefaults(
  defineProps<{
    /** Alto en px (el ancho lo pone quien la usa) */
    height?: number
    /** Banda de brillo que la cruza cada 12 s, como en la TV */
    shine?: boolean
  }>(),
  { height: 14, shine: false },
)
</script>

<style scoped lang="scss">
.doric-column {
  position: relative;
}

// El glow (filter) vive en un wrapper propio, fuera del brillo animado: así el filtro se pinta una
// vez y no se recalcula en cada frame del barrido (mismo criterio que en la TV).
.doric-column__piezas {
  display: flex;
  align-items: stretch;
  height: 100%;
  filter: drop-shadow(0 0 1.2px rgba(255, 238, 196, 0.95))
    drop-shadow(0 0 4px rgba(232, 205, 150, 0.5));
}

.doric-column__cap,
.doric-column__fuste {
  height: 100%;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
}

.doric-column__cap {
  flex: 0 0 auto;
}

.doric-column__cap--izq {
  aspect-ratio: 43 / 69;
  background-image: url('../../../../assets/tv/tv-col-cap-izq.png');
}

.doric-column__cap--der {
  aspect-ratio: 45 / 69;
  background-image: url('../../../../assets/tv/tv-col-cap-der.png');
}

.doric-column__fuste {
  flex: 1 1 auto;
  background-image: url('../../../../assets/tv/tv-col-fuste.png');
}

// Banda de luz: cruza rápido en el primer 25 % del ciclo y queda afuera el resto (como la TV).
// Solo `transform`: compositado por GPU, sin repintar.
.doric-column__brillo {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background: linear-gradient(
      105deg,
      transparent calc(50% - 40px),
      rgba(255, 248, 232, 0.8) 50%,
      transparent calc(50% + 40px)
    );
    transform: translateX(-100%);
    animation: doric-column-brillo 12s linear infinite;
    animation-delay: 1.5s;
    will-change: transform;
  }
}

@keyframes doric-column-brillo {
  0% {
    transform: translateX(-100%);
  }

  25%,
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .doric-column__brillo::after {
    animation: none;
  }
}
</style>
