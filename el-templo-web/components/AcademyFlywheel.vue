<script setup lang="ts">
/**
 * AcademyFlywheel — "ENTRENÁ. FORMATE. LIDERÁ. INVERTÍ." section.
 *
 * Wraps FlywheelDiagram reusable component with academy-specific
 * title, subtitle, and closing text. Deep Charcoal background.
 */
</script>

<template>
  <section id="flywheel-academy" class="academy-flywheel">
    <div class="academy-flywheel__container">
      <!-- Title -->
      <h2 class="academy-flywheel__title">
        ENTREN&Aacute;. FORMATE. LIDER&Aacute;. INVERT&Iacute;.
      </h2>

      <!-- Subtitle -->
      <p class="academy-flywheel__subtitle">
        Un ecosistema que evoluciona y se alimenta solo. Sostenido por
        herramientas digitales. Movido por el amor al movimiento.
      </p>

      <!-- Flywheel Diagram (uses defaults) -->
      <FlywheelDiagram />

      <!-- Closing text -->
      <p class="academy-flywheel__closing">
        No es un curso. Es la puerta de entrada a un ecosistema en movimiento.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyFlywheel — Flywheel Section Wrapper
   BEM naming. Token variables only. Never pure black or white.
   Deep Charcoal background — all text light.
   ========================================================================== */

.academy-flywheel {
  background: var(--color-deep-charcoal);
  padding: var(--space-hero) 0;
}

.academy-flywheel__container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.academy-flywheel__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-marble-cream);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Subtitle
   ------------------------------------------------------------------ */
.academy-flywheel__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  letter-spacing: 0.02em;
  color: var(--color-warm-stone);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Closing Text
   ------------------------------------------------------------------ */
.academy-flywheel__closing {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 18px;
  letter-spacing: 0.02em;
  color: var(--color-marble-cream);
  line-height: 1.5;
  margin: var(--space-spacious) 0 0 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-flywheel {
    padding: var(--space-large) 0;
  }

  .academy-flywheel__title {
    font-size: 28px;
  }

  .academy-flywheel__subtitle {
    font-size: 18px;
  }

  .academy-flywheel__closing {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-flywheel__title {
    font-size: 24px;
  }

  .academy-flywheel__subtitle {
    font-size: 16px;
  }
}
</style>
