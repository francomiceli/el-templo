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

      <!-- SVG Map: Atlantic view — South America + Western Europe -->
      <div
        ref="mapRef"
        class="expansion__map-wrap"
        :class="{ 'is-visible': mapRevealed }"
      >
        <svg
          class="expansion__map"
          viewBox="0 0 960 440"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Mapa de expansi&oacute;n: Argentina y Espa&ntilde;a"
        >
          <!-- ============================================
               LEFT PANEL: SOUTH AMERICA
               ============================================ -->

          <!-- South America continent outline -->
          <path
            class="expansion__continent"
            d="M128,48 L142,38 L155,35 L172,30 L192,25 L215,20 L238,18 L258,20 L278,26 L295,36 L308,48 L318,65 L325,78 L322,98 L318,118 L312,138 L305,155 L295,172 L282,190 L272,206 L265,218 L260,230 L254,248 L246,268 L238,288 L228,310 L218,332 L210,350 L202,362 L196,372 L190,380 L195,390 L188,398 L178,392 L170,382 L164,368 L158,350 L152,332 L146,310 L140,288 L134,262 L130,238 L126,212 L122,188 L120,165 L118,142 L117,120 L118,98 L122,78 L128,62 L134,52 Z"
          />

          <!-- Central America (context) -->
          <path
            class="expansion__landmass"
            d="M128,48 L120,40 L110,34 L98,30 L86,28 L75,32 L68,38"
          />

          <!-- Argentina (highlighted fill within continent) -->
          <path
            class="expansion__highlight"
            d="M126,172 L140,162 L158,155 L178,158 L198,164 L218,174 L238,182 L255,192 L268,202 L272,206 L265,218 L260,230 L254,248 L246,268 L238,288 L228,310 L218,332 L210,350 L202,362 L196,372 L190,380 L195,390 L188,398 L178,392 L170,382 L164,368 L158,350 L152,332 L146,310 L140,288 L134,262 L130,238 L126,212 L122,188 L120,178 Z"
          />

          <!-- Falklands / Malvinas (small reference) -->
          <ellipse
            class="expansion__landmass-fill"
            cx="218"
            cy="398"
            rx="8"
            ry="4"
          />

          <!-- ============================================
               RIGHT PANEL: WESTERN EUROPE
               ============================================ -->

          <!-- British Isles (context) -->
          <path
            class="expansion__landmass-fill"
            d="M638,8 L648,4 L660,2 L670,6 L674,16 L672,26 L666,32 L656,34 L646,30 L640,22 L636,14 Z"
          />
          <!-- Ireland -->
          <path
            class="expansion__landmass-fill"
            d="M624,12 L632,8 L638,12 L636,22 L630,26 L624,20 Z"
          />

          <!-- France -->
          <path
            class="expansion__continent"
            d="M695,102 L710,94 L728,86 L742,76 L750,65 L748,52 L740,40 L726,32 L708,26 L690,24 L672,26 L656,30 L644,38 L636,48 L632,60 L634,72 L638,82 L648,90 L660,96 L675,100 L688,102 Z"
          />

          <!-- Iberian Peninsula — Spain (highlighted) -->
          <path
            class="expansion__highlight"
            d="M588,118 L602,108 L620,102 L642,98 L662,96 L682,98 L695,102 L698,114 L696,128 L692,140 L686,154 L680,166 L672,176 L660,184 L645,190 L628,192 L612,190 L598,184 L588,176 L584,164 L580,148 L578,134 L582,122 Z"
          />

          <!-- Portugal -->
          <path
            class="expansion__continent"
            d="M588,118 L582,122 L578,134 L576,148 L578,162 L582,172 L588,176 L580,178 L572,170 L566,156 L564,140 L566,126 L572,116 L580,112 Z"
          />

          <!-- Italy (boot — context) -->
          <path
            class="expansion__landmass-fill"
            d="M750,65 L758,60 L770,58 L780,62 L784,74 L782,88 L778,102 L772,116 L764,128 L758,136 L752,130 L748,118 L746,104 L748,88 L750,76 Z"
          />

          <!-- Sicily -->
          <ellipse
            class="expansion__landmass-fill"
            cx="762"
            cy="142"
            rx="10"
            ry="6"
          />

          <!-- Sardinia + Corsica -->
          <ellipse
            class="expansion__landmass-fill"
            cx="738"
            cy="118"
            rx="5"
            ry="10"
          />
          <ellipse
            class="expansion__landmass-fill"
            cx="736"
            cy="102"
            rx="4"
            ry="6"
          />

          <!-- North Africa coastline (subtle context) -->
          <path
            class="expansion__coastline"
            d="M558,200 L588,196 L622,194 L658,192 L695,194 L728,192 L762,196 L790,194"
          />

          <!-- ============================================
               CONNECTING ELEMENTS
               ============================================ -->

          <!-- Dashed arc across Atlantic -->
          <path
            class="expansion__arc"
            d="M305,120 C420,32 530,32 682,98"
            fill="none"
          />

          <!-- ============================================
               PINS & LABELS
               ============================================ -->

          <!-- Mar del Plata pin -->
          <circle
            class="expansion__pin expansion__pin--active"
            cx="260"
            cy="240"
            r="6"
          />
          <circle class="expansion__pin-pulse" cx="260" cy="240" r="6" />
          <text class="expansion__pin-label" x="272" y="244">
            Mar del Plata
          </text>

          <!-- Barcelona pin -->
          <circle
            class="expansion__pin expansion__pin--active"
            cx="692"
            cy="132"
            r="6"
          />
          <circle class="expansion__pin-pulse" cx="692" cy="132" r="6" />
          <text class="expansion__pin-label" x="704" y="136">Barcelona</text>

          <!-- "¿Tu ciudad?" callout (Atlantic center) -->
          <circle
            class="expansion__pin expansion__pin--future"
            cx="475"
            cy="230"
            r="8"
            stroke-dasharray="4 3"
            fill="none"
          />
          <text class="expansion__callout" x="475" y="258" text-anchor="middle">
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
  max-width: 900px;
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

/* Continent outlines (South America, France, Portugal) */
.expansion__continent {
  fill: none;
  stroke: rgba(242, 237, 229, 0.18);
  stroke-width: 1.2;
  stroke-linejoin: round;
}

/* Highlighted countries — Argentina and Spain */
.expansion__highlight {
  fill: rgba(192, 122, 86, 0.12);
  stroke: var(--color-terracotta);
  stroke-width: 1.2;
  stroke-linejoin: round;
}

/* Context landmasses (Central America, UK, Italy, islands) — stroke only */
.expansion__landmass {
  fill: none;
  stroke: rgba(242, 237, 229, 0.12);
  stroke-width: 1;
  stroke-linejoin: round;
}

/* Context landmasses — filled (small islands, UK, Italy) */
.expansion__landmass-fill {
  fill: rgba(242, 237, 229, 0.06);
  stroke: rgba(242, 237, 229, 0.12);
  stroke-width: 0.8;
}

/* North Africa coastline (subtle reference line) */
.expansion__coastline {
  fill: none;
  stroke: rgba(242, 237, 229, 0.08);
  stroke-width: 0.8;
  stroke-dasharray: 4 6;
}

/* Connecting arc (dashed, across Atlantic) */
.expansion__arc {
  stroke: rgba(242, 237, 229, 0.12);
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
