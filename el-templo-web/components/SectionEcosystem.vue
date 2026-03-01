<script setup lang="ts">
/**
 * SectionEcosystem — "El Templo crece con vos" pathway cards section.
 *
 * 4 ecosystem pathway cards in 2x2 grid:
 * 1. Templo Online (Azul Noche) — /app
 * 2. Academy (Terracotta) — /academy
 * 3. Franquicias (Aged Gold) — /franquicias
 * 4. Gladius (Aged Gold) — /gladius
 *
 * Each card has a colored 3px left-border accent and ghost CTA with arrow.
 * Scroll-triggered staggered entrance with 100ms between cards.
 */
import { pathways } from "~/data/ecosystem";

const { revealed, elementRef: gridRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="ecosistema" class="ecosystem">
    <div class="ecosystem__container">
      <!-- Section header -->
      <span class="ecosystem__tag">Ecosistema</span>

      <h2 class="ecosystem__title">El Templo crece con vos.</h2>

      <p class="ecosystem__subtitle">
        El lugar donde crec&eacute;s f&iacute;sicamente puede ser el mismo lugar
        donde crezcas a nivel profesional. Entren&aacute;, formate,
        lider&aacute;, invert&iacute;.
      </p>

      <!-- Pathway cards grid -->
      <div
        ref="gridRef"
        class="ecosystem__grid"
        :class="{ 'is-visible': revealed }"
      >
        <div
          v-for="(pathway, index) in pathways"
          :key="pathway.id"
          class="ecosystem__card"
          :class="`ecosystem__card--${pathway.variant}`"
          :style="{
            transitionDelay: revealed ? index * 100 + 'ms' : '0ms',
          }"
        >
          <span class="ecosystem__card-tag">{{ pathway.tag }}</span>

          <h3 class="ecosystem__card-title">{{ pathway.title }}</h3>

          <p class="ecosystem__card-desc">{{ pathway.description }}</p>

          <a :href="pathway.ctaHref" class="ecosystem__card-cta">
            {{ pathway.ctaText }}
            <span class="ecosystem__card-arrow">&rarr;</span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Ecosystem Section — "El Templo crece con vos"
   BEM naming. Token variables only. Never pure black or white.
   4 pathway cards in 2x2 grid with colored left-border accents.
   ========================================================================== */

.ecosystem {
  background: var(--color-warm-stone);
  padding: 80px 0;
}

.ecosystem__container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.ecosystem__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  text-align: center;
  margin-bottom: var(--space-base);
}

.ecosystem__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  text-align: center;
  margin: 0 0 var(--space-comfortable) 0;
}

.ecosystem__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 18px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-section) auto;
  text-align: center;
}

/* ------------------------------------------------------------------
   Grid (2x2 desktop/tablet, 1-col mobile)
   ------------------------------------------------------------------ */
.ecosystem__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Card Base
   ------------------------------------------------------------------ */
.ecosystem__card {
  display: flex;
  flex-direction: column;
  background: var(--color-marble-cream);
  border: 1px solid var(--color-sandy-beige);
  border-radius: var(--radius-card);
  padding: 32px 28px;
  transition: var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base),
    border-color var(--transition-base);
}

.ecosystem__grid.is-visible .ecosystem__card {
  opacity: 1;
  transform: translateY(0);
}

.ecosystem__card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-medium);
}

.ecosystem__grid.is-visible .ecosystem__card:hover {
  transform: translateY(-2px);
}

/* ------------------------------------------------------------------
   Border-left accent per variant
   ------------------------------------------------------------------ */
.ecosystem__card--online {
  border-left: 3px solid var(--color-azul-noche);
}

.ecosystem__card--academy {
  border-left: 3px solid var(--color-terracotta);
}

.ecosystem__card--franchise {
  border-left: 3px solid var(--color-aged-gold);
}

.ecosystem__card--gladius {
  border-left: 3px solid var(--color-aged-gold);
}

/* ------------------------------------------------------------------
   Hover border intensification (full border takes variant color)
   ------------------------------------------------------------------ */
.ecosystem__card--online:hover {
  border-color: var(--color-azul-noche);
}

.ecosystem__card--academy:hover {
  border-color: var(--color-terracotta);
}

.ecosystem__card--franchise:hover {
  border-color: var(--color-aged-gold);
}

.ecosystem__card--gladius:hover {
  border-color: var(--color-aged-gold);
}

/* ------------------------------------------------------------------
   Card Tag / Verb
   ------------------------------------------------------------------ */
.ecosystem__card-tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}

.ecosystem__card--online .ecosystem__card-tag {
  color: var(--color-azul-noche);
}

.ecosystem__card--academy .ecosystem__card-tag {
  color: var(--color-terracotta);
}

.ecosystem__card--franchise .ecosystem__card-tag {
  color: var(--color-aged-gold);
}

.ecosystem__card--gladius .ecosystem__card-tag {
  color: var(--color-aged-gold);
}

/* ------------------------------------------------------------------
   Card Title (normal case, NOT uppercase per spec)
   ------------------------------------------------------------------ */
.ecosystem__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0 0 12px 0;
}

/* ------------------------------------------------------------------
   Card Description
   ------------------------------------------------------------------ */
.ecosystem__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.55;
  margin: 0;
}

/* ------------------------------------------------------------------
   Card CTA (ghost style with arrow)
   ------------------------------------------------------------------ */
.ecosystem__card-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  margin-top: auto;
  padding-top: 16px;
  transition: color var(--transition-base);
}

/* CTA colors per variant */
.ecosystem__card--online .ecosystem__card-cta {
  color: var(--color-azul-noche);
}

.ecosystem__card--online .ecosystem__card-cta:hover {
  color: #3d4e62;
}

.ecosystem__card--academy .ecosystem__card-cta {
  color: var(--color-terracotta);
}

.ecosystem__card--academy .ecosystem__card-cta:hover {
  color: var(--color-clay);
}

.ecosystem__card--franchise .ecosystem__card-cta,
.ecosystem__card--gladius .ecosystem__card-cta {
  color: var(--color-aged-gold);
}

.ecosystem__card--franchise .ecosystem__card-cta:hover,
.ecosystem__card--gladius .ecosystem__card-cta:hover {
  color: #a08a50;
}

/* Arrow animation on hover */
.ecosystem__card-arrow {
  transition: transform var(--transition-base);
}

.ecosystem__card-cta:hover .ecosystem__card-arrow {
  transform: translateX(4px);
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .ecosystem {
    padding: var(--space-large) 0;
  }

  .ecosystem__title {
    font-size: 26px;
  }

  .ecosystem__subtitle {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .ecosystem__title {
    font-size: 22px;
  }

  .ecosystem__grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .ecosystem__card-title {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable entrance/hover animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .ecosystem__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .ecosystem__card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
