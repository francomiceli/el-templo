<script setup lang="ts">
/**
 * FranExpansion -- "DE MAR DEL PLATA AL MUNDO." section.
 *
 * Deep Charcoal background with light text. 3-column layout:
 * 1. Mar del Plata — country silhouette, Leaflet map with 7 pins, sede list
 * 2. Barcelona — country silhouette, Leaflet map with 1 pin, sede info
 * 3. ¿Tu ciudad? — CTA linking to franchise form
 *
 * Stats counters animate count-up on scroll via useCountUp composable.
 * Multiple useScrollReveal instances for staggered entrance effects.
 */

import { expansionStats } from "~/data/franquicias";
import {
  mdpMapConfig,
  bcnMapConfig,
  argSilhouette,
  spaSilhouette,
} from "~/data/expansion-maps";
import { sedesByCity } from "~/data/sedes";
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

      <!-- 3-Column City Grid -->
      <div
        ref="mapRef"
        class="expansion__grid"
        :class="{ 'is-visible': mapRevealed }"
      >
        <!-- Column 1: Mar del Plata -->
        <div class="expansion__column">
          <div class="expansion__country">
            <div class="expansion__silhouette-wrap">
              <img
                :src="argSilhouette.src"
                alt=""
                class="expansion__silhouette"
                aria-hidden="true"
              >
              <span
                class="expansion__country-dot"
                :style="{
                  top: argSilhouette.dotTop,
                  left: argSilhouette.dotLeft,
                }"
              />
            </div>
          </div>
          <CityMap :config="mdpMapConfig" :revealed="mapRevealed" />
          <h3 class="expansion__city-name">Mar del Plata</h3>
          <p class="expansion__city-count">7 sedes</p>
          <ul class="expansion__sede-list">
            <li v-for="sede in sedesByCity.mdp" :key="sede.id">
              <a
                :href="sede.mapsUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="expansion__sede-link"
              >
                {{ sede.name }}
                <span class="expansion__sede-address">{{ sede.address }}</span>
              </a>
            </li>
          </ul>
        </div>

        <!-- Column 2: Barcelona -->
        <div class="expansion__column">
          <div class="expansion__country">
            <div class="expansion__silhouette-wrap">
              <img
                :src="spaSilhouette.src"
                alt=""
                class="expansion__silhouette"
                aria-hidden="true"
              >
              <span
                class="expansion__country-dot"
                :style="{
                  top: spaSilhouette.dotTop,
                  left: spaSilhouette.dotLeft,
                }"
              />
            </div>
          </div>
          <CityMap :config="bcnMapConfig" :revealed="mapRevealed" />
          <h3 class="expansion__city-name">Barcelona</h3>
          <p class="expansion__city-count">1 sede</p>
          <ul class="expansion__sede-list">
            <li v-for="sede in sedesByCity.bcn" :key="sede.id">
              <a
                :href="sede.mapsUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="expansion__sede-link"
              >
                {{ sede.address }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Column 3: ¿Tu ciudad? -->
        <div class="expansion__column expansion__column--cta">
          <div class="expansion__cta-box">
            <span class="expansion__cta-question">?</span>
            <h3 class="expansion__cta-title">&iquest;Tu ciudad?</h3>
            <p class="expansion__cta-text">
              Abrí tu Templo. Llevá el método a donde estés.
            </p>
            <a href="#contacto" class="expansion__cta-link">
              Quiero ser franquiciado
            </a>
          </div>
        </div>
      </div>

      <!-- Closing Phrase -->
      <p
        ref="phraseRef"
        class="expansion__phrase"
        :class="{ 'is-visible': phraseRevealed }"
      >
        Nací en un garage. Hoy cruzo el océano. Mañana, tu ciudad.
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
   3-Column City Grid
   ------------------------------------------------------------------ */
.expansion__grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-large);
  margin-bottom: var(--space-large);
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.expansion__grid.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.expansion__column {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ------------------------------------------------------------------
   Country Silhouette (JPG image, inverted + screen blend on dark bg)
   ------------------------------------------------------------------ */
.expansion__country {
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-base);
}

.expansion__silhouette-wrap {
  position: relative;
  height: 100%;
  display: inline-block;
}

.expansion__silhouette {
  display: block;
  height: 100%;
  width: auto;
  opacity: 0.4;
  user-select: none;
  pointer-events: none;
}

.expansion__country-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-terracotta);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 0 var(--color-terracotta);
  animation: country-dot-pulse 2s ease-out infinite;
  z-index: 1;
}

@keyframes country-dot-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(183, 101, 67, 0.6);
  }
  100% {
    box-shadow: 0 0 0 10px rgba(183, 101, 67, 0);
  }
}

/* ------------------------------------------------------------------
   City Info (below map)
   ------------------------------------------------------------------ */
.expansion__city-name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 20px;
  color: var(--color-marble-cream);
  margin: var(--space-base) 0 4px 0;
  text-align: center;
}

.expansion__city-count {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: rgba(242, 237, 229, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 var(--space-base) 0;
}

/* ------------------------------------------------------------------
   Sede List (links to Google Maps)
   ------------------------------------------------------------------ */
.expansion__sede-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
}

.expansion__sede-list li {
  border-bottom: 1px solid rgba(242, 237, 229, 0.08);
}

.expansion__sede-list li:last-child {
  border-bottom: none;
}

.expansion__sede-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: rgba(242, 237, 229, 0.7);
  text-decoration: none;
  transition: color 200ms ease;
}

.expansion__sede-link:hover {
  color: var(--color-marble-cream);
}

.expansion__sede-address {
  font-size: 13px;
  color: rgba(242, 237, 229, 0.4);
  flex-shrink: 0;
  margin-left: 8px;
}

/* ------------------------------------------------------------------
   CTA Column ("¿Tu ciudad?")
   ------------------------------------------------------------------ */
.expansion__column--cta {
  justify-content: center;
}

.expansion__cta-box {
  border: 2px dashed rgba(191, 155, 81, 0.4);
  border-radius: 12px;
  padding: var(--space-spacious);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 320px;
}

.expansion__cta-question {
  font-family: var(--font-elegance);
  font-style: italic;
  font-size: 64px;
  color: var(--color-aged-gold);
  line-height: 1;
  margin-bottom: var(--space-base);
  opacity: 0.7;
}

.expansion__cta-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-aged-gold);
  margin: 0 0 var(--space-base) 0;
}

.expansion__cta-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: rgba(242, 237, 229, 0.6);
  margin: 0 0 var(--space-spacious) 0;
  line-height: 1.5;
}

.expansion__cta-link {
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  background: var(--color-aged-gold);
  padding: 12px 28px;
  border-radius: 4px;
  text-decoration: none;
  transition:
    background 200ms ease,
    transform 200ms ease;
}

.expansion__cta-link:hover {
  background: #d4b44a;
  transform: translateY(-1px);
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

  .expansion__grid {
    grid-template-columns: 1fr;
  }

  .expansion__cta-box {
    min-height: 200px;
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

  .expansion__phrase {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .expansion__stat,
  .expansion__grid,
  .expansion__phrase {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .expansion__country-dot {
    animation: none;
  }
}
</style>
