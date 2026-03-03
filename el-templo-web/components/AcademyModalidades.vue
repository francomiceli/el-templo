<script setup lang="ts">
/**
 * AcademyModalidades — "ELEGÍ CÓMO FORMARTE." section.
 *
 * 2 modalidad cards (Presencial + Online) side by side on desktop,
 * stacked on mobile. CTA scrolls to form.
 * Warm Linen (#EDE4D6) background.
 */

import { modalidades } from "~/data/academy";

const {
  revealed: cardsRevealed,
  elementRef: cardsRef,
  cleanup: cardsCleanup,
} = useScrollReveal();

onBeforeUnmount(() => {
  cardsCleanup();
});
</script>

<template>
  <section id="modalidades-academy" class="academy-modalidades">
    <div class="academy-modalidades__container">
      <!-- Title -->
      <h2 class="academy-modalidades__title">
        ELEG&Iacute; C&Oacute;MO FORMARTE.
      </h2>

      <!-- Cards -->
      <div
        ref="cardsRef"
        class="academy-modalidades__cards"
        :class="{ 'is-visible': cardsRevealed }"
      >
        <div
          v-for="(mod, index) in modalidades"
          :key="mod.id"
          class="academy-modalidades__card"
          :style="{
            transitionDelay: cardsRevealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <h3 class="academy-modalidades__card-title">{{ mod.title }}</h3>
          <p class="academy-modalidades__card-subtitle">{{ mod.subtitle }}</p>
          <p class="academy-modalidades__card-desc">{{ mod.description }}</p>

          <!-- Details -->
          <div class="academy-modalidades__details">
            <div
              v-for="detail in mod.details"
              :key="detail.label"
              class="academy-modalidades__detail"
            >
              <span class="academy-modalidades__detail-label">{{
                detail.label
              }}</span>
              <span class="academy-modalidades__detail-value">{{
                detail.value
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="academy-modalidades__cta-wrapper">
        <a href="#formulario-academy" class="btn btn--primary">
          QUIERO FORMARME
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyModalidades — Training Modalities Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-modalidades {
  background: #ede4d6; /* Warm Linen */
  padding: var(--space-hero) 0;
}

.academy-modalidades__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.academy-modalidades__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Cards
   ------------------------------------------------------------------ */
.academy-modalidades__cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-comfortable);
}

.academy-modalidades__card {
  background: var(--color-marble-cream);
  border-radius: var(--radius-base);
  padding: var(--space-spacious);
  box-shadow: var(--shadow-subtle);
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.is-visible .academy-modalidades__card {
  opacity: 1;
  transform: translateY(0);
}

.academy-modalidades__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.academy-modalidades__card-subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 18px;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.academy-modalidades__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Details
   ------------------------------------------------------------------ */
.academy-modalidades__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.academy-modalidades__detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.academy-modalidades__detail-label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-olive-stone);
}

.academy-modalidades__detail-value {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

/* ------------------------------------------------------------------
   CTA
   ------------------------------------------------------------------ */
.academy-modalidades__cta-wrapper {
  text-align: center;
  margin-top: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-modalidades {
    padding: var(--space-large) 0;
  }

  .academy-modalidades__title {
    font-size: 28px;
  }

  .academy-modalidades__cards {
    grid-template-columns: 1fr;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-modalidades__title {
    font-size: 24px;
  }

  .academy-modalidades__card {
    padding: var(--space-comfortable);
  }

  .academy-modalidades__card-title {
    font-size: 20px;
  }

  .academy-modalidades__card-subtitle {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-modalidades__card {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
