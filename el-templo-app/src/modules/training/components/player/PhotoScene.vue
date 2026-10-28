<template>
  <div class="photo-scene" :style="sceneStyle">
    <div class="photo-scene__foot" :style="footStyle" aria-hidden="true" />
    <div class="photo-scene__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  NOCHE_FOOT_GRADIENT,
  NOCHE_GRADIENT,
  sceneBackgroundStyle,
} from 'src/constants/sceneVeil'

// Fondo de pantalla completa de la transición entre bloques y del 3-2-1: la foto de Guía con su velo
// "noche" (src/constants/sceneVeil.ts). El contenido va en el slot, por encima de la foto.
const sceneStyle = sceneBackgroundStyle(NOCHE_GRADIENT)
const footStyle = { background: NOCHE_FOOT_GRADIENT }
</script>

<style scoped lang="scss">
.photo-scene {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// Oscurecido del pie: el botón y los textos chicos quedan sobre fondo firme.
.photo-scene__foot {
  position: absolute;
  inset: auto 0 0 0;
  height: 46%;
  pointer-events: none;
}

.photo-scene__content {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
