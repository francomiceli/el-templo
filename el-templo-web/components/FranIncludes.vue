<script setup lang="ts">
/**
 * FranIncludes — "TODO LO QUE NECESITAS PARA ABRIR TU TEMPLO." grid section.
 *
 * 6-item grid: 3x2 desktop, 2x3 tablet, 1-col mobile.
 * PlaceholderBox icons (Deep Charcoal mono) + title + description.
 * Staggered entrance animation. Marble Cream background.
 */

import { includesItems } from "~/data/franquicias";

const {
  revealed: itemsRevealed,
  elementRef: itemsRef,
  cleanup: itemsCleanup,
} = useScrollReveal();

onBeforeUnmount(() => {
  itemsCleanup();
});
</script>

<template>
  <section id="que-incluye" class="fran-includes">
    <div class="fran-includes__container">
      <!-- Title -->
      <h2 class="fran-includes__title">
        TODO LO QUE INCLUYE TU FRANQUICIA DE GIMNASIO FUNCIONAL.
      </h2>

      <!-- Items Grid -->
      <div
        ref="itemsRef"
        class="fran-includes__grid"
        :class="{ 'is-visible': itemsRevealed }"
      >
        <div
          v-for="(item, index) in includesItems"
          :key="item.id"
          class="fran-includes__item"
          :style="{
            transitionDelay: itemsRevealed ? index * 100 + 'ms' : '0ms',
          }"
        >
          <div class="fran-includes__icon">
            <PlaceholderBox :label="item.iconLabel" height="40px" />
          </div>
          <h3 class="fran-includes__item-title">{{ item.title }}</h3>
          <p class="fran-includes__item-desc">{{ item.description }}</p>
        </div>
      </div>

      <!-- Academy note -->
      <p class="fran-includes__academy-note">
        La formaci&oacute;n de entrenadores est&aacute; incluida en tu
        franquicia.
        <NuxtLink to="/academy" class="fran-includes__academy-link">
          Conoc&eacute; Olympic Academy &rarr;
        </NuxtLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranIncludes — What's Included Grid
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.fran-includes {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.fran-includes__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.fran-includes__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-large) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Items Grid — 3x2 desktop, 2x3 tablet, 1-col mobile
   ------------------------------------------------------------------ */
.fran-includes__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
}

.fran-includes__item {
  padding: var(--space-comfortable);
  transition:
    opacity 500ms ease,
    transform 500ms ease;

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
}

.fran-includes__grid.is-visible .fran-includes__item {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Icon
   ------------------------------------------------------------------ */
.fran-includes__icon {
  width: 40px;
  height: 40px;
  margin-bottom: 12px;
}

.fran-includes__icon :deep(.placeholder-box) {
  border-radius: var(--radius-base);
  height: 100%;
  aspect-ratio: unset;
}

/* ------------------------------------------------------------------
   Item Content
   ------------------------------------------------------------------ */
.fran-includes__item-title {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0 0 6px 0;
}

.fran-includes__item-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-charcoal-mist);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Academy Note
   ------------------------------------------------------------------ */
.fran-includes__academy-note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
  text-align: center;
  margin: var(--space-comfortable) 0 0 0;
}

.fran-includes__academy-link {
  color: var(--color-terracotta);
  text-decoration: none;
  font-weight: 500;
  transition: text-decoration 200ms ease;
}

.fran-includes__academy-link:hover {
  text-decoration: underline;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 1199px)
   ------------------------------------------------------------------ */
@media (max-width: 1199px) {
  .fran-includes__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ------------------------------------------------------------------
   Tablet smaller (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .fran-includes {
    padding: var(--space-large) 0;
  }

  .fran-includes__title {
    font-size: 28px;
  }

  .fran-includes__grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-base);
  }

  .fran-includes__item {
    padding: var(--space-base);
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .fran-includes__title {
    font-size: 24px;
  }

  .fran-includes__grid {
    grid-template-columns: 1fr;
  }

  .fran-includes__item-title {
    font-size: 15px;
  }

  .fran-includes__item-desc {
    font-size: 13px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-includes__item {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
