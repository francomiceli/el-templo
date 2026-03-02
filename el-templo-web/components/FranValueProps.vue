<script setup lang="ts">
/**
 * FranValueProps — "POR QUE EL TEMPLO?" value proposition section.
 *
 * 4 cards in 2x2 grid (desktop), 1-col (mobile) with
 * PlaceholderBox icons, staggered entrance animation.
 * Marble Cream background.
 */

import { valueProps } from "~/data/franquicias";

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
  <section id="por-que-el-templo" class="fran-value">
    <div class="fran-value__container">
      <!-- Section Tag -->
      <span class="fran-value__tag">Franquicias</span>

      <!-- Title -->
      <h2 class="fran-value__title">
        &iquest;POR QU&Eacute; UNA FRANQUICIA DE CALISTENIA?
      </h2>

      <!-- Subtitle -->
      <p class="fran-value__subtitle">
        No es un gym. Es un sistema probado con presencia internacional.
      </p>

      <!-- Cards Grid -->
      <div
        ref="cardsRef"
        class="fran-value__grid"
        :class="{ 'is-visible': cardsRevealed }"
      >
        <div
          v-for="(prop, index) in valueProps"
          :key="prop.id"
          class="fran-value__card"
          :style="{
            transitionDelay: cardsRevealed ? index * 100 + 'ms' : '0ms',
          }"
        >
          <div class="fran-value__icon">
            <PlaceholderBox :label="prop.iconLabel" height="48px" />
          </div>
          <h3 class="fran-value__card-title">{{ prop.title }}</h3>
          <p class="fran-value__card-desc">{{ prop.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranValueProps — Value Proposition Cards
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.fran-value {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.fran-value__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.fran-value__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
  text-align: center;
}

.fran-value__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
  text-align: center;
}

.fran-value__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-large) auto;
  text-align: center;
}

/* ------------------------------------------------------------------
   Cards Grid — 2x2 desktop, 1-col mobile
   ------------------------------------------------------------------ */
.fran-value__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-comfortable);
}

.fran-value__card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-sandy-beige);
  border-radius: var(--radius-card);
  padding: var(--space-spacious);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
}

.fran-value__grid.is-visible .fran-value__card {
  opacity: 1;
  transform: translateY(0);
}

.fran-value__card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-2px);
}

.fran-value__grid.is-visible .fran-value__card:hover {
  transform: translateY(-2px);
}

/* ------------------------------------------------------------------
   Card Content
   ------------------------------------------------------------------ */
.fran-value__icon {
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-base);
}

.fran-value__icon :deep(.placeholder-box) {
  border-radius: var(--radius-base);
  height: 100%;
  aspect-ratio: unset;
}

.fran-value__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0 0 8px 0;
}

.fran-value__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .fran-value {
    padding: var(--space-large) 0;
  }

  .fran-value__title {
    font-size: 28px;
  }

  .fran-value__subtitle {
    font-size: 17px;
  }

  .fran-value__grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-base);
  }

  .fran-value__card {
    padding: var(--space-comfortable);
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .fran-value__title {
    font-size: 24px;
  }

  .fran-value__subtitle {
    font-size: 16px;
  }

  .fran-value__grid {
    grid-template-columns: 1fr;
  }

  .fran-value__card-title {
    font-size: 16px;
  }

  .fran-value__card-desc {
    font-size: 14px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-value__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .fran-value__card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
