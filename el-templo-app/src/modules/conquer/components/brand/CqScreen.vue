<template>
  <div class="cq-root cq-screen">
    <slot />
  </div>
</template>

<script setup lang="ts">
// Fase 201 DA-16: raíz de cada pantalla de Conquer (reemplaza a la raíz con cielo). Trae `.cq-root` (tokens
// `--cq-*`, solo adentro de Conquer) y la hoja de la submarca. La página es la del app: el fondo es
// transparente y se ve `.app-bg` de MainLayout; sin cielo, sin estrellas, sin degradés.
import '../../styles/conquer.scss'
</script>

<style scoped lang="scss">
.cq-screen {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 16px;
  min-width: 0;
  padding: 16px 16px 24px;
  background: transparent;
}
</style>
