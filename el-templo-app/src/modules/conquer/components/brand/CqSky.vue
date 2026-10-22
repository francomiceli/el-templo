<template>
  <div class="cq-root cq-sky">
    <slot />
  </div>
</template>

<script setup lang="ts">
// Fase 201 D-09: fondo noche de Conquer a pantalla completa (estrellas + degradé azul). Es la raíz
// de las pantallas: trae `.cq-root` (tokens `--cq-*`) y la hoja de la submarca, así que nada de
// esto se ve fuera de Conquer. Los márgenes salen de `--cq-pad-*` (el sol y el pie de nubes los
// usan para sangrar hasta el borde).
import '../../styles/conquer.scss'
</script>

<style scoped lang="scss">
.cq-sky {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 16px;
  min-height: 100%;
  padding: var(--cq-pad-top) var(--cq-pad-x) var(--cq-pad-bottom);
  overflow: hidden;
  background:
    radial-gradient(circle, #fff 0 0.8px, transparent 1.4px) 30px 26px / 150px 170px,
    radial-gradient(circle, var(--cq-gold-hi) 0 1px, transparent 1.6px) 110px 90px / 230px 210px,
    radial-gradient(circle, #fff 0 0.6px, transparent 1.2px) 70px 140px / 190px 260px,
    linear-gradient(180deg, var(--cq-sky1), var(--cq-sky2) 55%, var(--cq-sky3));
}
</style>
