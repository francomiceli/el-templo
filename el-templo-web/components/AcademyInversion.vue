<script setup lang="ts">
/**
 * AcademyInversion — "INVERSIÓN EN TU FORMACIÓN." section.
 *
 * Placeholder state — no prices displayed.
 * CTA scrolls to form. Franchise note with link to /franquicias.
 * Marble Cream background. Prepared for future price cards.
 */

const showPrices = false;
</script>

<template>
  <section id="inversion-academy" class="academy-inversion">
    <div class="academy-inversion__container">
      <!-- Title -->
      <h2 class="academy-inversion__title">
        INVERSI&Oacute;N EN TU FORMACI&Oacute;N.
      </h2>

      <!-- Placeholder state (no prices) -->
      <template v-if="!showPrices">
        <p class="academy-inversion__copy">
          Consult&aacute; disponibilidad y valor del programa. Cada
          edici&oacute;n presencial tiene cupos limitados.
        </p>

        <div class="academy-inversion__cta-wrapper">
          <a href="#formulario-academy" class="btn btn--primary">
            CONSULTAR DISPONIBILIDAD
          </a>
        </div>
      </template>

      <!-- Future: Price cards go here when showPrices is true -->

      <!-- Franchise note -->
      <p class="academy-inversion__franchise-note">
        &iquest;Sos franquiciado de El Templo? La formaci&oacute;n de tus
        entrenadores est&aacute; incluida en tu paquete de franquicia.
        <NuxtLink to="/franquicias" class="academy-inversion__franchise-link">
          Conoc&eacute; m&aacute;s sobre franquicias &rarr;
        </NuxtLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyInversion — Investment/Pricing Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-inversion {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.academy-inversion__container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.academy-inversion__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Copy
   ------------------------------------------------------------------ */
.academy-inversion__copy {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   CTA
   ------------------------------------------------------------------ */
.academy-inversion__cta-wrapper {
  margin-bottom: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Franchise Note
   ------------------------------------------------------------------ */
.academy-inversion__franchise-note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
  line-height: 1.6;
  margin: 0;
  padding-top: var(--space-comfortable);
  border-top: 1px solid rgba(61, 55, 50, 0.1);
}

.academy-inversion__franchise-link {
  color: var(--color-terracotta);
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.academy-inversion__franchise-link:hover {
  text-decoration: underline;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-inversion {
    padding: var(--space-large) 0;
  }

  .academy-inversion__title {
    font-size: 28px;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-inversion__title {
    font-size: 24px;
  }
}
</style>
