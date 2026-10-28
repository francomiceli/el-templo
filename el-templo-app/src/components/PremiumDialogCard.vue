<template>
  <!-- Estilo "A · Hermana" (sketch 010): el lenguaje de la card de hoy (TodayCard) sin la
       columnata del logo, el halo ni el borde que fluye. El marco es QUIETO; lo único que se
       mueve es el destello del botón primario (solo con prefers-reduced-motion: no-preference). -->
  <div class="pd-frame">
    <div class="pd-card" :class="{ 'pd-card--light': tone === 'light' }">
      <span v-if="tone !== 'light'" class="pd-line" aria-hidden="true" />
      <div class="pd-content">
        <q-icon v-if="icon" :name="icon" size="40px" class="pd-icon" aria-hidden="true" />
        <p v-if="kicker" class="pd-kicker">{{ kicker }}</p>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Marco compartido de los pop-ups de Mi Templo (calificar, sugerencia, vencimiento, aviso) y,
 * con `tone="light"`, de los diálogos de trámite (Reservas, eliminar cuenta, elegir sede; sketch 012 A).
 *
 * El CSS del CONTENIDO (título, texto, etiquetas, estrellas, textarea, ayuda, acciones, botón
 * primario con destello, link secundario) vive acá, en un solo lugar, vía `:slotted(...)`. Los
 * diálogos solo ponen las clases `pd-*` sobre sus elementos:
 *   pd-title · pd-text · pd-label · pd-rating · pd-area · pd-help · pd-acts · pd-cta · pd-skip
 * y, para los trámites: pd-input (campo de una línea) · pd-title--neg · pd-cta--neg (destructivo,
 * sin destello) · pd-rows / pd-row / pd-row-main / pd-row-name / pd-row-sub / pd-row-go (lista de sedes).
 * Los colores de texto salen de variables CSS del `.pd-card`, así `dark` y `light` comparten reglas.
 * El marco, la línea, el campo oscuro y el botón con destello vienen del partial
 * `src/css/_premium-card.scss`, compartido con `PremiumGlassCard` (login / registro / onboarding).
 */
withDefaults(
  defineProps<{
    /** Título chico en Cinzel sobre el título ("Tu opinión", "Aviso", …). Opcional en `light`. */
    kicker?: string
    /** Ícono opcional arriba del kicker (Material), en crema cálido (terracota en `light`). */
    icon?: string
    /** `dark` (pop-ups de Mi Templo) o `light` (trámites: crema, tinta, sin línea luminosa). */
    tone?: 'dark' | 'light'
  }>(),
  { kicker: undefined, icon: undefined, tone: 'dark' },
)
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

// Colores de texto por tono (variables del card): los `:slotted` de abajo las leen y no se duplican.
.pd-card {
  @include pd-card($surface);
  --pd-fg: #{$cream};
  --pd-fg-2: #{$cream-3};
  --pd-accent: #{$cream-2};
  padding: 22px 18px 12px;
  text-align: left;
}

.pd-card--light {
  background: $pd-light-surface;
  --pd-fg: #{$pd-ink};
  --pd-fg-2: #{$pd-ink-2};
  --pd-accent: #{$pd-terra-ink};
  padding: 20px 18px 10px;
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
  color: var(--pd-accent);
}

.pd-kicker {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pd-accent);
}

// ── Contenido que ponen los diálogos (clases pd-*) ──────────────────────────────
:slotted(.pd-title) {
  margin: 6px 0 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--pd-fg);
}

// Trámites: título 20px; sin kicker arriba no necesita el aire de 6px.
.pd-card--light :slotted(.pd-title) {
  margin-top: 0;
  font-size: 20px;
  line-height: 1.25;
}

// Eliminar cuenta: el título también avisa (5.6:1 sobre la card crema).
:slotted(.pd-title--neg) {
  color: $pd-neg-title;
}

:slotted(.pd-text) {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--pd-fg);
}

:slotted(.pd-label) {
  display: block;
  margin: 14px 0 4px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pd-fg-2);
}

// Estrellas en crema (ni doradas ni terracota). Sin `color` en el q-rating: hereda de acá.
:slotted(.pd-rating) {
  color: var(--pd-fg);
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

// Campo de una línea de los trámites (teléfono, contraseña): claro sobre la card crema.
.pd-card--light :slotted(.pd-input) {
  @include pd-field-light(15px);
  margin-top: 14px;
}

:slotted(.pd-help) {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--pd-fg-2);
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

// Destructivo: rojo y sin destello (va después de `.pd-cta` para ganarle por orden).
:slotted(.pd-cta.pd-cta--neg) {
  @include pd-cta-negative;
}

:slotted(.pd-cta.disabled) {
  @include pd-cta-disabled;
}

// Secundario: link subrayado, 44px de alto (crema en `dark`, tinta-2 en `light`).
:slotted(.pd-skip) {
  min-height: 44px;
  padding: 0 12px;
  color: var(--pd-fg);
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 14px;
}

.pd-card--light :slotted(.pd-skip) {
  color: $pd-ink-2;
}

:slotted(.pd-skip) .q-btn__content {
  text-decoration: underline;
  text-underline-offset: 3px;
}

// Filas tocables (elegir sede): borde $pd-light-line, radio 12, fondo blanco; nombre en tinta,
// dirección en tinta-2 y acción en terracota.
:slotted(.pd-rows) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

:slotted(.pd-row) {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  padding: 0 4px 0 0;
  border: 1px solid $pd-light-line;
  border-radius: 12px;
  background: #fff;
  color: $pd-ink;
}

// Zona tocable de la fila: <button> nativo (Enter / Space gratis) con nombre + dirección. "Cómo llegar"
// va como hermano, no adentro (un botón dentro de un botón no es accesible).
:slotted(.pd-row-main) {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  margin: 0;
  padding: 10px 8px 10px 12px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

:slotted(.pd-row-main:focus-visible) {
  outline: 2px solid $pd-terra-ink;
  outline-offset: -2px;
}

:slotted(.pd-row-name) {
  display: block;
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 15px;
  color: $pd-ink;
}

:slotted(.pd-row-sub) {
  display: block;
  margin: 2px 0 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-ink-2;
}

:slotted(.pd-row-go) {
  flex-shrink: 0;
  min-height: 44px;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 12px;
  color: $pd-terra-ink;
}

@include pd-sheen-keyframes;
</style>
