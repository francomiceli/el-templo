<script setup lang="ts">
/**
 * FranFounder -- "FUNDADO POR UN ATLETA. CONSTRUIDO CON METODO." section.
 *
 * Warm Linen background. Split 55/45 text/photo layout on desktop,
 * stacked on mobile (photo first). Horizontal timeline on desktop,
 * vertical on mobile. Sequential milestone reveal with 0.15s stagger.
 *
 * Connecting line draws progressively synced with milestone reveals.
 */

import { founderTimeline } from "~/data/franquicias";

// --- Scroll reveal instances ---
const {
  revealed: bioRevealed,
  elementRef: bioRef,
  cleanup: bioCleanup,
} = useScrollReveal();

const {
  revealed: timelineRevealed,
  elementRef: timelineRef,
  cleanup: timelineCleanup,
} = useScrollReveal({ threshold: 0.2 });

// --- Cleanup ---
onBeforeUnmount(() => {
  bioCleanup();
  timelineCleanup();
});
</script>

<template>
  <section id="fundador" class="founder">
    <div class="founder__container">
      <!-- Section Title -->
      <h2 class="founder__title">
        EL FUNDADOR DE LA FRANQUICIA DE CALISTENIA.
      </h2>

      <!-- Bio Split Layout -->
      <div
        ref="bioRef"
        class="founder__bio"
        :class="{ 'is-visible': bioRevealed }"
      >
        <!-- Text Column (55%) -->
        <div class="founder__bio-text">
          <div class="founder__bio-body">
            <p>
              Ignacio Bordon. Ex gimnasta de alto rendimiento. M&aacute;s de 20
              a&ntilde;os de experiencia en calistenia y entrenamiento con el
              peso del cuerpo.
            </p>
            <p>
              El Templo naci&oacute; en septiembre de 2020, en el garage de su
              casa en Mar del Plata. Lo que empez&oacute; como un m&eacute;todo
              personal se convirti&oacute; en un sistema internacional con sedes
              en dos continentes.
            </p>
            <p>
              La visi&oacute;n: democratizar el movimiento con el peso del
              cuerpo. Que cualquier persona pueda dominar su cuerpo a
              trav&eacute;s de un m&eacute;todo progresivo, sin importar desde
              d&oacute;nde empiece.
            </p>
          </div>
        </div>

        <!-- Photo Column (45%) -->
        <div class="founder__bio-image">
          <img
            src="/images/photos/ignacio-bordon.webp"
            alt="Ignacio Bordon — fundador de El Templo"
            class="founder__photo"
            loading="lazy"
          >
        </div>
      </div>

      <!-- Timeline -->
      <div
        ref="timelineRef"
        class="founder__timeline"
        :class="{ 'is-visible': timelineRevealed }"
      >
        <!-- Connecting line (draws progressively) -->
        <div class="founder__timeline-line" />

        <!-- Milestones -->
        <div
          v-for="(milestone, index) in founderTimeline"
          :key="index"
          class="founder__milestone"
          :class="{
            'founder__milestone--future': milestone.isFuture,
          }"
          :style="{
            transitionDelay: timelineRevealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <span class="founder__milestone-year">{{ milestone.year }}</span>
          <p class="founder__milestone-desc">{{ milestone.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Founder Section -- "FUNDADO POR UN ATLETA. CONSTRUIDO CON METODO."
   BEM naming. Token variables only. Never pure black or white.
   Warm Linen background.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section Wrapper
   ------------------------------------------------------------------ */
.founder {
  background: var(--color-warm-linen);
  padding: var(--space-hero) 0;
}

.founder__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title (H2)
   ------------------------------------------------------------------ */
.founder__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-large) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Bio Split Layout
   ------------------------------------------------------------------ */
.founder__bio {
  display: grid;
  grid-template-columns: 55% 1fr;
  gap: var(--space-large);
  align-items: center;
  margin-bottom: var(--space-hero);
}

/* Entrance animation */
.founder__bio-text {
  opacity: 0;
  transform: translateX(-30px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.founder__bio-image {
  opacity: 0;
  transform: translateX(30px);
  transition:
    opacity 600ms ease,
    transform 600ms ease 150ms;
}

.founder__bio.is-visible .founder__bio-text,
.founder__bio.is-visible .founder__bio-image {
  opacity: 1;
  transform: translateX(0);
}

.founder__bio-body p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 20px 0;
}

.founder__bio-body p:last-child {
  margin-bottom: 0;
}

.founder__photo {
  width: 100%;
  border-radius: var(--radius-card);
  object-fit: cover;
  aspect-ratio: 4 / 5;
  box-shadow: var(--shadow-prominent);
}

/* ------------------------------------------------------------------
   Timeline — Desktop (Horizontal)
   ------------------------------------------------------------------ */
.founder__timeline {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-base);
  padding-top: var(--space-spacious);
}

/* Horizontal connecting line */
.founder__timeline-line {
  position: absolute;
  top: 47px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-terracotta);
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform 800ms ease 200ms;
}

.founder__timeline.is-visible .founder__timeline-line {
  transform: scaleX(1);
}

/* Milestone */
.founder__milestone {
  flex: 1;
  text-align: center;
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 400ms ease,
    transform 400ms ease;
}

.founder__timeline.is-visible .founder__milestone {
  opacity: 1;
  transform: translateY(0);
}

/* Year badge */
.founder__milestone-year {
  display: inline-block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.04em;
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
  padding: 6px 16px;
  border-radius: 20px;
  margin-bottom: 16px;
}

/* Future milestone uses Aged Gold */
.founder__milestone--future .founder__milestone-year {
  background: var(--color-aged-gold);
}

/* Description */
.founder__milestone-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.5;
  margin: 0;
  max-width: 160px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .founder {
    padding: var(--space-large) 0;
  }

  .founder__title {
    font-size: 28px;
  }

  .founder__bio {
    gap: var(--space-spacious);
  }

  .founder__bio-body p {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .founder__title {
    font-size: 24px;
  }

  /* Stack bio: photo first */
  .founder__bio {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
  }

  .founder__bio-image {
    order: -1;
  }

  .founder__photo {
    aspect-ratio: 16 / 9;
  }

  .founder__bio-body p {
    font-size: 14px;
  }

  /* Timeline: vertical layout */
  .founder__timeline {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    padding-top: 0;
    padding-left: var(--space-spacious);
  }

  /* Vertical connecting line */
  .founder__timeline-line {
    top: 0;
    bottom: 0;
    left: 12px;
    right: auto;
    width: 2px;
    height: 100%;
    transform-origin: top center;
    transform: scaleY(0);
  }

  .founder__timeline.is-visible .founder__timeline-line {
    transform: scaleY(1);
    /* Override scaleX for mobile */
  }

  /* Milestone: horizontal row */
  .founder__milestone {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    text-align: left;
    padding: 12px 0;
    position: relative;
  }

  .founder__milestone-year {
    flex-shrink: 0;
    margin-bottom: 0;
    font-size: 12px;
    padding: 4px 12px;
  }

  .founder__milestone-desc {
    max-width: none;
    margin-left: 0;
    margin-right: 0;
    font-size: 13px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .founder__bio-text,
  .founder__bio-image,
  .founder__milestone,
  .founder__timeline-line {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
