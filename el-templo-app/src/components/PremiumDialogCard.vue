<template>
  <!-- Estilo "A · Hermana" (sketch 010): el lenguaje de la card de hoy (TodayCard) sin la
       columnata del logo, el halo ni el borde que fluye. El marco es QUIETO; lo único que se
       mueve es el destello del botón primario (solo con prefers-reduced-motion: no-preference). -->
  <div class="pd-frame">
    <div class="pd-card">
      <span class="pd-line" aria-hidden="true" />
      <div class="pd-content">
        <q-icon v-if="icon" :name="icon" size="40px" class="pd-icon" aria-hidden="true" />
        <p class="pd-kicker">{{ kicker }}</p>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Marco compartido de los 4 pop-ups de Mi Templo (calificar, sugerencia, vencimiento, aviso).
 *
 * El CSS del CONTENIDO (título, texto, etiquetas, estrellas, textarea, ayuda, acciones, botón
 * primario con destello, link secundario) vive acá, en un solo lugar, vía `:slotted(...)`. Los
 * diálogos solo ponen las clases `pd-*` sobre sus elementos:
 *   pd-title · pd-text · pd-label · pd-rating · pd-area · pd-help · pd-acts · pd-cta · pd-skip
 * El marco, la línea, el campo oscuro y el botón con destello vienen del partial
 * `src/css/_premium-card.scss`, compartido con `PremiumGlassCard` (login / registro / onboarding).
 */
defineProps<{
  /** Título chico en Cinzel sobre el título ("Tu opinión", "Aviso", …). */
  kicker: string
  /** Ícono opcional arriba del kicker (Material), en crema cálido. */
  icon?: string
}>()
</script>

<style lang="scss" scoped>
@import 'src/css/premium-card';

$surface: $pd-surface;
$cream: $pd-cream;
$cream-2: $pd-cream-2;
$cream-3: $pd-cream-3;

.pd-frame {
  @include pd-frame;
  max-width: 340px;
}

.pd-card {
  @include pd-card($surface);
  padding: 22px 18px 12px;
  text-align: left;
}

.pd-content {
  position: relative;
  z-index: 2;
}

.pd-line {
  @include pd-line;
}

.pd-icon {
  display: block;
  margin-bottom: 8px;
  color: $cream-2;
}

.pd-kicker {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $cream-2;
}

// ── Contenido que ponen los diálogos (clases pd-*) ──────────────────────────────
:slotted(.pd-title) {
  margin: 6px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: $cream;
}

:slotted(.pd-text) {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.45;
  color: $cream;
}

:slotted(.pd-label) {
  display: block;
  margin: 14px 0 4px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $cream-3;
}

// Estrellas en crema (ni doradas ni terracota). Sin `color` en el q-rating: hereda de acá.
:slotted(.pd-rating) {
  color: $cream;
}

// Quasar baja la opacidad de las vacías: acá la forma (star_border / star) ya las distingue.
:slotted(.pd-rating) .q-rating__icon {
  opacity: 1;
}

:slotted(.pd-area) {
  @include pd-field(15px);
  margin-top: 14px;
}

:slotted(.pd-area) .q-field__control {
  min-height: 76px;
}

// Enfocado: el aro de Quasar usa currentColor → crema cálido (en vez del primario).
:slotted(.pd-area.q-field--focused) .q-field__control {
  color: $cream-2;
}

:slotted(.pd-help) {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: $cream-3;
}

:slotted(.pd-acts) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 18px;
}

// Botón primario: terracota del sketch 006 (blanco sobre #a35f3c 4.9:1, sobre #7e4529 7.4:1).
:slotted(.pd-cta) {
  @include pd-cta(48px);
}

:slotted(.pd-cta.disabled) {
  @include pd-cta-disabled;
}

// Secundario: crema subrayado, 44px de alto.
:slotted(.pd-skip) {
  min-height: 44px;
  padding: 0 12px;
  color: $cream;
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 14px;
}

:slotted(.pd-skip) .q-btn__content {
  text-decoration: underline;
  text-underline-offset: 3px;
}

@include pd-sheen-keyframes;
</style>
