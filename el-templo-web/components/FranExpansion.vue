<script setup lang="ts">
/**
 * FranExpansion -- "DE MAR DEL PLATA AL MUNDO." section.
 *
 * Deep Charcoal background with light text. Shows animated counters,
 * a custom SVG map (Argentina + Spain) with brand-colored pins,
 * a sede list, and a closing phrase.
 *
 * Stats counters animate count-up on scroll via useCountUp composable.
 * Multiple useScrollReveal instances for staggered entrance effects.
 */

import { expansionStats, expansionCities } from "~/data/franquicias";
import { useCountUp } from "~/composables/useCountUp";

// --- Count-up animation ---
const {
  displayValues,
  trigger: triggerCountUp,
  cleanup: countUpCleanup,
} = useCountUp(expansionStats);

// --- Scroll reveal instances ---
const {
  revealed: statsRevealed,
  elementRef: statsRef,
  cleanup: statsCleanup,
} = useScrollReveal({ threshold: 0.3 });

const {
  revealed: mapRevealed,
  elementRef: mapRef,
  cleanup: mapCleanup,
} = useScrollReveal();

const {
  revealed: phraseRevealed,
  elementRef: phraseRef,
  cleanup: phraseCleanup,
} = useScrollReveal();

// Trigger count-up when stats scroll into view
watch(statsRevealed, (revealed) => {
  if (revealed) {
    triggerCountUp();
  }
});

// --- Cleanup ---
onBeforeUnmount(() => {
  statsCleanup();
  mapCleanup();
  phraseCleanup();
  countUpCleanup();
});
</script>

<template>
  <section id="expansion" class="expansion">
    <div class="expansion__container">
      <!-- Section Title -->
      <h2 class="expansion__title">DE MAR DEL PLATA AL MUNDO.</h2>

      <!-- Stats Counters -->
      <div
        ref="statsRef"
        class="expansion__stats"
        :class="{ 'is-visible': statsRevealed }"
      >
        <div
          v-for="(stat, index) in expansionStats"
          :key="index"
          class="expansion__stat"
          :style="{
            transitionDelay: statsRevealed ? index * 100 + 'ms' : '0ms',
          }"
        >
          <span class="expansion__stat-number">
            {{ displayValues[index] }}
          </span>
          <div class="expansion__stat-separator" />
          <span class="expansion__stat-label">{{ stat.label }}</span>
        </div>
      </div>

      <!-- SVG Map: Argentina + Spain -->
      <div
        ref="mapRef"
        class="expansion__map-wrap"
        :class="{ 'is-visible': mapRevealed }"
      >
        <svg
          class="expansion__map"
          viewBox="0 0 800 400"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Mapa de expansi&oacute;n: Argentina y Espa&ntilde;a"
        >
          <!-- Argentina outline (simplified) -->
          <path
            class="expansion__country"
            d="M180 60 L220 55 L240 70 L250 90 L260 120 L270 140 L265 170 L260 200 L255 230 L245 260 L235 290 L220 310 L200 330 L190 350 L195 370 L180 380 L170 370 L165 350 L160 320 L155 290 L150 260 L145 230 L150 200 L155 170 L160 140 L165 120 L170 90 L175 70 Z"
          />

          <!-- Tierra del Fuego (tip of Argentina) -->
          <path
            class="expansion__country"
            d="M175 382 L190 385 L200 395 L185 398 L172 392 Z"
          />

          <!-- Spain outline (simplified, positioned right-top) -->
          <path
            class="expansion__country"
            d="M550 80 L570 70 L600 65 L630 68 L660 75 L680 85 L690 100 L685 120 L670 135 L650 142 L630 145 L610 142 L590 135 L570 125 L555 110 L548 95 Z"
          />

          <!-- Portugal (small, attached to Spain) -->
          <path
            class="expansion__country"
            d="M548 95 L540 100 L535 115 L538 130 L548 135 L555 125 L555 110 Z"
          />

          <!-- Connecting arc (dashed) -->
          <path
            class="expansion__arc"
            d="M240 100 C350 30 450 30 570 85"
            fill="none"
          />

          <!-- Mar del Plata pin (Argentina, southeast coast) -->
          <circle
            class="expansion__pin expansion__pin--active"
            cx="245"
            cy="295"
            r="6"
          />
          <circle class="expansion__pin-pulse" cx="245" cy="295" r="6" />
          <text class="expansion__pin-label" x="258" y="300">
            Mar del Plata
          </text>

          <!-- Barcelona pin (Spain, northeast) -->
          <circle
            class="expansion__pin expansion__pin--active"
            cx="650"
            cy="95"
            r="6"
          />
          <circle class="expansion__pin-pulse" cx="650" cy="95" r="6" />
          <text class="expansion__pin-label" x="663" y="100">Barcelona</text>

          <!-- "Proximamente" callout -->
          <circle
            class="expansion__pin expansion__pin--future"
            cx="420"
            cy="220"
            r="8"
            stroke-dasharray="4 3"
            fill="none"
          />
          <text class="expansion__callout" x="420" y="250" text-anchor="middle">
            &iquest;Tu ciudad?
          </text>
        </svg>
      </div>

      <!-- Sede List -->
      <div class="expansion__sedes">
        <div
          v-for="(city, index) in expansionCities"
          :key="index"
          class="expansion__sede-row"
        >
          <span class="expansion__sede-city">{{ city.city }}</span>
          <span class="expansion__sede-names">{{ city.sedes }}</span>
        </div>
      </div>

      <!-- Closing Phrase -->
      <p
        ref="phraseRef"
        class="expansion__phrase"
        :class="{ 'is-visible': phraseRevealed }"
      >
        Nac&iacute; en un garage. Hoy cruzo el oc&eacute;ano. Ma&ntilde;ana, tu
        ciudad.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Expansion Section -- "DE MAR DEL PLATA AL MUNDO."
   BEM naming. Token variables only. Never pure black or white.
   Deep Charcoal background, light (Marble Cream) text.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section Wrapper
   ------------------------------------------------------------------ */
.expansion {
  background: var(--color-deep-charcoal);
  padding: var(--space-hero) 0;
}

.expansion__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title (H2)
   ------------------------------------------------------------------ */
.expansion__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-marble-cream);
  line-height: 1.2;
  margin: 0 0 var(--space-large) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Stats Counters
   ------------------------------------------------------------------ */
.expansion__stats {
  display: flex;
  justify-content: center;
  gap: var(--space-large);
  margin-bottom: var(--space-large);
}

.expansion__stat {
  text-align: center;
  transition:
    opacity 500ms ease,
    transform 500ms ease;
  opacity: 0;
  transform: translateY(16px);
}

.expansion__stats.is-visible .expansion__stat {
  opacity: 1;
  transform: translateY(0);
}

.expansion__stat-number {
  display: block;
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 40px;
  color: var(--color-marble-cream);
  line-height: 1;
}

.expansion__stat-separator {
  width: 24px;
  height: 2px;
  background: var(--color-terracotta);
  margin: 8px auto;
}

.expansion__stat-label {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(242, 237, 229, 0.6);
}

/* ------------------------------------------------------------------
   SVG Map
   ------------------------------------------------------------------ */
.expansion__map-wrap {
  max-width: 800px;
  margin: 0 auto var(--space-large) auto;
  opacity: 0;
  transform: scale(0.95);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.expansion__map-wrap.is-visible {
  opacity: 1;
  transform: scale(1);
}

.expansion__map {
  width: 100%;
  height: auto;
  display: block;
}

/* Country outlines */
.expansion__country {
  fill: none;
  stroke: rgba(242, 237, 229, 0.15);
  stroke-width: 1.5;
}

/* Connecting arc */
.expansion__arc {
  stroke: rgba(242, 237, 229, 0.1);
  stroke-width: 1;
  stroke-dasharray: 6 4;
}

/* Active pins (Terracotta) */
.expansion__pin--active {
  fill: var(--color-terracotta);
}

/* Pulse animation on pins */
.expansion__pin-pulse {
  fill: none;
  stroke: var(--color-terracotta);
  stroke-width: 1.5;
  opacity: 0;
  animation: pin-pulse 2s ease-out infinite;
}

@keyframes pin-pulse {
  0% {
    r: 6;
    opacity: 0.6;
  }
  100% {
    r: 16;
    opacity: 0;
  }
}

/* Pin labels */
.expansion__pin-label {
  font-family: var(--font-clarity);
  font-size: 11px;
  fill: rgba(242, 237, 229, 0.7);
  font-weight: 500;
}

/* Future pin (Aged Gold dashed) */
.expansion__pin--future {
  stroke: var(--color-aged-gold);
  stroke-width: 1.5;
}

/* Callout text */
.expansion__callout {
  font-family: var(--font-elegance);
  font-size: 14px;
  font-style: italic;
  fill: var(--color-aged-gold);
}

/* ------------------------------------------------------------------
   Sede List
   ------------------------------------------------------------------ */
.expansion__sedes {
  max-width: 600px;
  margin: 0 auto var(--space-large) auto;
}

.expansion__sede-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 0;
  border-bottom: 1px solid rgba(242, 237, 229, 0.1);
}

.expansion__sede-row:last-child {
  border-bottom: none;
}

.expansion__sede-city {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-marble-cream);
  flex-shrink: 0;
  margin-right: var(--space-base);
}

.expansion__sede-names {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: rgba(242, 237, 229, 0.7);
  text-align: right;
}

/* ------------------------------------------------------------------
   Closing Phrase
   ------------------------------------------------------------------ */
.expansion__phrase {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  color: var(--color-marble-cream);
  text-align: center;
  line-height: 1.5;
  max-width: 650px;
  margin: 0 auto;
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.expansion__phrase.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .expansion {
    padding: var(--space-large) 0;
  }

  .expansion__title {
    font-size: 28px;
  }

  .expansion__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-spacious);
  }

  .expansion__stat-number {
    font-size: 32px;
  }

  .expansion__phrase {
    font-size: 18px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .expansion__title {
    font-size: 24px;
  }

  .expansion__sede-row {
    flex-direction: column;
    gap: 4px;
  }

  .expansion__sede-city {
    font-size: 14px;
  }

  .expansion__sede-names {
    text-align: left;
    font-size: 13px;
  }

  .expansion__phrase {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .expansion__stat,
  .expansion__map-wrap,
  .expansion__phrase {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .expansion__pin-pulse {
    animation: none;
  }
}
</style>
