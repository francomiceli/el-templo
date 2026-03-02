<script setup lang="ts">
/**
 * FranModels — "DOS CAMINOS. UNA MISMA VISION." comparison section.
 *
 * Activa vs Pasiva franchise models side by side with distinct
 * accent borders (Terracotta / Aged Gold), hover elevation,
 * shared note, and repeated CTA. Warm Stone background.
 */

import { franchiseModels } from "~/data/franquicias";

const {
  revealed: modelsRevealed,
  elementRef: modelsRef,
  cleanup: modelsCleanup,
} = useScrollReveal();

onBeforeUnmount(() => {
  modelsCleanup();
});
</script>

<template>
  <section id="modelos-franquicia" class="fran-models">
    <div class="fran-models__container">
      <!-- Title -->
      <h2 class="fran-models__title">
        DOS MODELOS DE FRANQUICIA. UNA MISMA VISI&Oacute;N.
      </h2>

      <!-- Comparison Cards -->
      <div
        ref="modelsRef"
        class="fran-models__grid"
        :class="{ 'is-visible': modelsRevealed }"
      >
        <div
          v-for="(model, index) in franchiseModels"
          :key="model.id"
          class="fran-models__card"
          :class="`fran-models__card--${model.accentColor}`"
          :style="{
            transitionDelay: modelsRevealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <h3 class="fran-models__card-title">{{ model.title }}</h3>
          <p class="fran-models__card-tagline">{{ model.tagline }}</p>
          <p class="fran-models__card-desc">{{ model.description }}</p>
        </div>
      </div>

      <!-- Shared Note -->
      <p class="fran-models__note" :class="{ 'is-visible': modelsRevealed }">
        Ambos modelos incluyen todo lo necesario para operar: m&eacute;todo,
        formaci&oacute;n, equipamiento Gladius, marca y acompa&ntilde;amiento.
      </p>

      <!-- Repeated CTA -->
      <div
        class="fran-models__cta-wrap"
        :class="{ 'is-visible': modelsRevealed }"
      >
        <a
          href="#formulario-franquicia"
          class="btn btn--primary fran-models__cta"
        >
          Quiero aplicar
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranModels — Franchise Model Comparison
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.fran-models {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.fran-models__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.fran-models__title {
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
   Comparison Grid — 50/50 desktop, stacked mobile
   ------------------------------------------------------------------ */
.fran-models__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-comfortable);
  margin-bottom: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Cards — accent left border, hover elevation
   ------------------------------------------------------------------ */
.fran-models__card {
  background: var(--color-marble-cream);
  border-radius: var(--radius-card);
  padding: var(--space-spacious) var(--space-spacious) var(--space-spacious)
    calc(var(--space-spacious) + 3px);
  border-left: 3px solid transparent;
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
}

.fran-models__grid.is-visible .fran-models__card {
  opacity: 1;
  transform: translateY(0);
}

.fran-models__card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-2px);
}

.fran-models__grid.is-visible .fran-models__card:hover {
  transform: translateY(-2px);
}

/* Accent borders per model */
.fran-models__card--terracotta {
  border-left-color: var(--color-terracotta);
}

.fran-models__card--aged-gold {
  border-left-color: var(--color-aged-gold);
}

/* ------------------------------------------------------------------
   Card Content
   ------------------------------------------------------------------ */
.fran-models__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0 0 8px 0;
}

.fran-models__card-tagline {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 18px;
  color: var(--color-charcoal-mist);
  line-height: 1.4;
  margin: 0 0 var(--space-base) 0;
}

.fran-models__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Shared Note
   ------------------------------------------------------------------ */
.fran-models__note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
  line-height: 1.6;
  text-align: center;
  max-width: 700px;
  margin: 0 auto var(--space-spacious) auto;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 500ms ease 300ms,
    transform 500ms ease 300ms;
}

.fran-models__note.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   CTA
   ------------------------------------------------------------------ */
.fran-models__cta-wrap {
  text-align: center;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 500ms ease 400ms,
    transform 500ms ease 400ms;
}

.fran-models__cta-wrap.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .fran-models {
    padding: var(--space-large) 0;
  }

  .fran-models__title {
    font-size: 28px;
  }

  .fran-models__grid {
    grid-template-columns: 1fr;
    gap: var(--space-base);
  }

  .fran-models__card {
    padding: var(--space-comfortable) var(--space-comfortable)
      var(--space-comfortable) calc(var(--space-comfortable) + 3px);
  }

  .fran-models__card-title {
    font-size: 20px;
  }

  .fran-models__card-tagline {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .fran-models__title {
    font-size: 24px;
  }

  .fran-models__card-title {
    font-size: 18px;
  }

  .fran-models__card-desc {
    font-size: 14px;
  }

  .fran-models__cta {
    width: 100%;
    max-width: 320px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-models__card,
  .fran-models__note,
  .fran-models__cta-wrap {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .fran-models__card:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
