<template>
  <!-- Variante A del sketch 011: la card de los pop-ups (marco degradé quieto + línea luminosa) pero con
       la superficie TRANSLÚCIDA, para que se vea la estatua del fondo. Sin título dentro de la card.
       Las clases `class` que se le pasen caen en el marco (la raíz). -->
  <div class="pg-frame">
    <div class="pg-card">
      <span class="pg-line" aria-hidden="true" />
      <div class="pg-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Card de vidrio de login, crear cuenta, olvidé mi contraseña, invitación y onboarding.
 *
 * Comparte el marco, la línea, el campo oscuro y el botón con destello con `PremiumDialogCard` vía el
 * partial `src/css/_premium-card.scss`; acá solo se elige la superficie (translúcida + blur) y el
 * CSS del contenido de un formulario, vía `.pg-content :deep(...)`. Quien lo usa pone clases `pd-*`:
 *   pd-field (q-input / q-select) · pd-cta (botón primario) · pd-hint · pd-links > pd-link + pd-links-sep
 */
</script>

<style lang="scss" scoped>
@import 'src/css/premium-card';

.pg-frame {
  @include pd-frame;
}

.pg-card {
  @include pd-card($pd-surface-glass, true);
  padding: 24px 20px 14px;
}

.pg-content {
  position: relative;
  z-index: 2;
}

.pg-line {
  @include pd-line;
}

// `:deep` (y no `:slotted`): los botones y campos suelen ir dentro de un q-form, que renderiza su propio slot.
// Campo del formulario: Quasar outlined/dark, ver el mixin. 16px para que iOS no haga zoom al enfocar.
.pg-content :deep(.pd-field) {
  @include pd-field(16px);
}

.pg-content :deep(.pd-cta) {
  @include pd-cta(50px);
}

.pg-content :deep(.pd-cta.disabled),
.pg-content :deep(.pd-cta:disabled) {
  @include pd-cta-disabled;
}

// Frase de apoyo debajo del botón. #c9bba6: 6.5:1 sobre la card (antes crema al 35 %).
.pg-content :deep(.pd-hint) {
  margin: 12px 0 0;
  text-align: center;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 0.8rem;
  color: $pd-cream-3;
}

.pg-content :deep(.pd-links) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(240, 230, 214, 0.14);
  font-size: 0.8rem;
  color: $pd-cream-3;
}

.pg-content :deep(.pd-link) {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pg-content :deep(.pd-links-sep) {
  color: $pd-cream-3;
}

@include pd-sheen-keyframes;
</style>
