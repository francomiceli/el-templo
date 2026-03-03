<script setup lang="ts">
/**
 * AcademyQueEs — "LA ESCUELA DETRÁS DEL MÉTODO." section.
 *
 * 3 value cards with scroll-reveal entrance animation.
 * Marble Cream background.
 */

import { valueCards } from "~/data/academy";

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
  <section id="que-es-academy" class="academy-que-es">
    <div class="academy-que-es__container">
      <!-- Title -->
      <h2 class="academy-que-es__title">
        LA ESCUELA DETR&Aacute;S DEL M&Eacute;TODO.
      </h2>

      <!-- Copy -->
      <div class="academy-que-es__copy">
        <p>
          Olympic Academy es el programa de formaci&oacute;n profesional de El
          Templo Calistenia. No es un curso online m&aacute;s. Es la
          certificaci&oacute;n que forma a los entrenadores que operan en
          nuestras sedes en Argentina y Espa&ntilde;a.
        </p>
        <p>
          Aprender&aacute;s el sistema completo de El Templo: la
          biomec&aacute;nica detr&aacute;s de cada movimiento, la l&oacute;gica
          de progresi&oacute;n, la periodizaci&oacute;n del entrenamiento y las
          herramientas para liderar sesiones con prop&oacute;sito.
        </p>
        <p>
          Formamos entrenadores que entienden el cuerpo humano, dominan la
          t&eacute;cnica y saben transmitir el m&eacute;todo con la profundidad
          que la marca exige.
        </p>
      </div>

      <!-- Value Cards -->
      <div
        ref="cardsRef"
        class="academy-que-es__cards"
        :class="{ 'is-visible': cardsRevealed }"
      >
        <div
          v-for="(card, index) in valueCards"
          :key="card.id"
          class="academy-que-es__card"
          :style="{
            transitionDelay: cardsRevealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <h3 class="academy-que-es__card-title">{{ card.title }}</h3>
          <p class="academy-que-es__card-desc">{{ card.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyQueEs — What is Olympic Academy
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-que-es {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.academy-que-es__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.academy-que-es__title {
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
   Copy
   ------------------------------------------------------------------ */
.academy-que-es__copy {
  max-width: 700px;
  margin: 0 auto var(--space-spacious) auto;
}

.academy-que-es__copy p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.7;
  margin: 0 0 var(--space-base) 0;
}

.academy-que-es__copy p:last-child {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   Cards
   ------------------------------------------------------------------ */
.academy-que-es__cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
  margin-top: var(--space-spacious);
}

.academy-que-es__card {
  background: var(--color-warm-stone);
  border-radius: var(--radius-base);
  padding: var(--space-spacious);
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.is-visible .academy-que-es__card {
  opacity: 1;
  transform: translateY(0);
}

.academy-que-es__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-tight) 0;
}

.academy-que-es__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-que-es {
    padding: var(--space-large) 0;
  }

  .academy-que-es__title {
    font-size: 28px;
  }

  .academy-que-es__cards {
    grid-template-columns: 1fr;
    gap: var(--space-base);
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-que-es__title {
    font-size: 24px;
  }

  .academy-que-es__copy p {
    font-size: 15px;
  }

  .academy-que-es__card {
    padding: var(--space-comfortable);
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-que-es__card {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
