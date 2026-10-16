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
 * Se eligió `:slotted` (y no un partial SCSS importado por los 4) porque el estilo viaja con el
 * componente y los diálogos no repiten ni una regla.
 */
defineProps<{
  /** Título chico en Cinzel sobre el título ("Tu opinión", "Aviso", …). */
  kicker: string
  /** Ícono opcional arriba del kicker (Material), en crema cálido. */
  icon?: string
}>()
</script>

<style lang="scss" scoped>
// Paleta de la card de hoy. Contraste sobre #2c2318: crema 12.5:1, kicker 9.6:1, secundario 7.6:1.
$surface: #2c2318;
$cream: #f0e6d6;
$cream-2: #e3c9a8;
$cream-3: #c9bba6;

.pd-frame {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 340px;
  border-radius: 21px;
  padding: 1.5px;
  background: linear-gradient(
    115deg,
    #4a3a2b 0%,
    #a35f3c 30%,
    #f0d2b4 45%,
    #a35f3c 60%,
    #4a3a2b 100%
  );
  background-size: 250% 250%;
  background-position: 0% 50%;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.4);
}

.pd-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  box-sizing: border-box;
  background: $surface;
  color: $cream;
  border-radius: 20px;
  padding: 22px 18px 12px;
  text-align: left;
}

.pd-content {
  position: relative;
  z-index: 2;
}

// Decoración: detrás del texto, sin toques.
.pd-line {
  position: absolute;
  z-index: 1;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #a35f3c, #e9bf9b, #a35f3c, transparent);
  opacity: 0.9;
  pointer-events: none;
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
  margin-top: 14px;
}

:slotted(.pd-area) .q-field__control {
  min-height: 76px;
  border-radius: 10px;
  background: rgba(240, 230, 214, 0.05);
}

:slotted(.pd-area) .q-field__control::before {
  border-radius: 10px;
  border-color: rgba(240, 230, 214, 0.32);
}

:slotted(.pd-area) .q-field__control::after {
  border-radius: 10px;
}

// Enfocado: el aro de Quasar usa currentColor → crema cálido (en vez del primario).
:slotted(.pd-area.q-field--focused) .q-field__control {
  color: $cream-2;
}

:slotted(.pd-area) .q-field__native,
:slotted(.pd-area) .q-field__input {
  color: $cream;
  font-family: 'Geologica', sans-serif;
  font-size: 15px;
}

// Label / placeholder / contador: #c9bba6 (7.6:1), también enfocado.
:slotted(.pd-area) .q-field__label,
:slotted(.pd-area) .q-field__native::placeholder,
:slotted(.pd-area) .q-field__bottom {
  color: $cream-3;
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
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 48px;
  padding: 0 20px;
  border-radius: 10px;
  background: linear-gradient(135deg, #a35f3c, #7e4529);
  color: #fff;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.3px;
  box-shadow:
    0 4px 14px rgba(126, 69, 41, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

// Destello: reposa fuera del botón; solo se anima bajo `no-preference` (abajo).
:slotted(.pd-cta)::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -60%;
  width: 40%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.28), transparent);
  transform: skewX(-18deg);
  pointer-events: none;
}

// Deshabilitado: .55. Quasar fija `.disabled { opacity: .6 !important }`, por eso el !important.
:slotted(.pd-cta.disabled) {
  opacity: 0.55 !important;
}

:slotted(.pd-cta.disabled)::after {
  display: none;
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

// Todo el movimiento va acá: con `prefers-reduced-motion: reduce` el destello queda quieto.
@media (prefers-reduced-motion: no-preference) {
  :slotted(.pd-cta)::after {
    animation: pd-sheen 5s ease-in-out 1.2s infinite;
  }
}

@keyframes pd-sheen {
  0%,
  70% {
    left: -60%;
  }
  100% {
    left: 130%;
  }
}
</style>
