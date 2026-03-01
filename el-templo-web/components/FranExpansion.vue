<script setup lang="ts">
/**
 * FranExpansion -- "DE MAR DEL PLATA AL MUNDO." section.
 *
 * Deep Charcoal background with light text. Shows animated counters,
 * a real SVG map (Natural Earth data — Argentina + Spain highlighted)
 * with brand-colored pins, a sede list, and a closing phrase.
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

      <!-- SVG Map: Real Natural Earth data — South America + Western Europe -->
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
               SOUTH AMERICA (Natural Earth paths)
               Transformed from source coords to left panel
               transform: translate(-499,-1385) scale(2.6)
               ============================================ -->
          <g transform="translate(-499,-1385) scale(2.6)">
            <!-- Brazil -->
            <path
              class="expansion__continent-fill"
              d="M286.631,618.464l5.402-10.391l0.198-8.73l10.079-6.501h5.645l4.435-7.512l0.804-14.418l-1.815-3.855l10.684-9.751l0.406-10.761l-14.514-7.105l-17.53-5.48l-8.264-0.812l2.221-4.669l-0.604-7.104l-1.808-0.596l-2.671,5.308l-1.4,1.754l-3.595-1.59l-12.093,4.261l-4.028-5.073l0.648-5.299l-3.804,3.872l-4.201-2.265l-0.424,0.597l0.009,1.841l3.622,1.945l-5.437,5.73l-3.432-0.034l-3.475-3.535l-3.933,0.121l-0.484,4.2l2.256,2.739l-2.663,8.532l-3.112,0.241l-4.953,3.13l-1.21,6.146l4.296,4.599l0.787-0.89l3.017-0.812l2.576,4.34l7.374-3.164l2.861,0.165l1.971,6.976l10.52,3.337l1.815,5.564l4.478,0.537l2.135,5.314l-1.443,4.729l1.884,2.474l-0.276,3.683l5.048-0.477l4.625,5.844l-0.363,4.105l2.74,2.316l-6.57,9.95Z"
            />
            <!-- Colombia -->
            <path
              class="expansion__continent-fill"
              d="M234.326,498.251l-1.781-0.182l-11.773,9.707l-1.245,3.414l-1.608,0.182l0.717,7.546l-4.105,10.07l4.46,3.776l5.714,0.363l3.924,5.757l5.705,0.183l-0.182,4.312h2.135l2.316-7.909l-2.144-2.694l0.536-5.031l4.46-0.363l-0.536-11.688l-9.993-3.232l-2.316-6.293Z"
            />
            <!-- Venezuela -->
            <path
              class="expansion__continent-fill"
              d="M231.5,503.558l0.38,2.239l2.809,0.892l0.64-4.124l2.965-3.068l2.965,3.475l6.82,1.859l5.774-1.211l3.933,4.849l2.965,1.858l-3.25,4.953l1.089,3.752l-1.858,2.299l-1.928,1.616l-4.175-2.102l-0.959,0.969v2.99l3.052,1.452l-2.248,2.43l-2.248,2.43l-2.965-0.242l-2.982-3.275l-0.631-12.326l-10.183-3.476l-1.85-5.42Z"
            />
            <!-- Peru -->
            <path
              class="expansion__continent-fill"
              d="M209.518,541.246l-1.677,1.695l0.113,2.703l14.643,26.694l15.205,9.802l2.351-3.941l0.562-8.669l-1.228-5.402l-4.141-6.984l-2.463,0.786l-1.115,1.236l-4.918-5.636l1.228-6.647l5.705-3.717l-0.449-3.492l-5.809-0.226l-3.017-5.064l-1.677-0.562l0.113,3.044l-7.486,8.895l-5.593-1.349Z"
            />
            <!-- Ecuador -->
            <path
              class="expansion__continent-fill"
              d="M213.986,529.43l-4.088,2.541l-0.294,3.771l-0.821,1.234l2.576,2.473l-1.115,1.219l0.259,3.113l4.607,1.098l6.976-8.256l-0.017-2.878l-3.345-0.216Z"
            />
            <!-- Bolivia -->
            <path
              class="expansion__continent-fill"
              d="M238.631,561.361l7.114-3.104l2.351,0.226l1.565,6.534l10.839,3.604l1.79,5.523l4.469,0.562l1.902,4.729l-1.34,4.278l-7.27,0.562l-2.68,6.872l-5.705-0.112l-1.79-0.337l-3.293,3.197l-1.625-0.156l-5.593-12.957l1.547-2.316l0.545-9.163l-1.383-5.455Z"
            />
            <!-- Paraguay -->
            <path
              class="expansion__continent-fill"
              d="M267.199,584.458l1.902,2.074l-0.225,4.392l5.48-0.338l4.141,5.299l-0.337,4.729l-2.681,4.054L270,604.893l-0.225-2.256l1.564-3.718l-5.368-3.38h-4.469l-3.354-3.604l2.438-6.968Z"
            />
            <!-- Uruguay -->
            <path
              class="expansion__continent-fill"
              d="M274.633,612.481l-1.773,1.894l0.735,10.183l5.566,1.615l7.08-7.097Z"
            />
            <!-- Guyana -->
            <path
              class="expansion__continent-fill"
              d="M261.399,510.654l6.241,5.652l-2.481,2.87l-0.199,1.703l3.259,3.362l-0.078,3.232l-5.67,2.16l-3.397-4.59l0.726-5.515l-1.452-4.105Z"
            />
            <!-- Suriname -->
            <path
              class="expansion__continent-fill"
              d="M268.384,516.715l1.763,1.616l2.731-1.694l2.49,0.078l-0.32,0.968l-1.046,2.179l-0.164,5.421l-4.97,2.022l0.242-3.476l-3.207-2.991l0.164-1.538Z"
            />
            <!-- Chile -->
            <path
              class="expansion__continent-fill"
              d="M260.137,682.239l-2.775,3.068l-0.337,3.604l-5.368-3.043l-5.705-8.221l-1.677-2.932l2.351-3.043l-0.225-3.83l-2.68-1.124l-2.126-1.572l0.449-2.144l2.792-0.787l0.562-12.387l-4.356-2.48l-2.844-64.477l0.735-1.278l5.567,12.836l1.781,0.035l0.579,2.049l-2.369,2.868l-2.723,15.448l3.873,11.895l-1.79,9.007l6.31,26.485l0.666,15.49l4.521,5.229Z"
            />
            <!-- Argentina (highlighted) -->
            <path
              class="expansion__highlight"
              d="M279.05,600.613l1.677,1.571l-6.371,9.467l-2.239,2.479l0.777,10.813l4.918,5.974l-4.132,7.209l-3.129,1.35h-3.579l1.003,5.627l-5.593,1.92l1.34,4.729l-3.354,10.701l4.141,3.38l-2.239,5.515l-3.804,5.975l2.014,4.165l-4.918,0.786l-4.028-4.951l-0.674-15.432l-6.258-26.209l1.893-9.163l-4.028-11.713l2.68-15.204l2.463-2.931l-0.605-2.222l3.164-2.888l7.054,0.483l3.942,4.21l4.555,0.078l4.668,2.853l-1.375,3.217l0.329,3.25l6.612-0.312Z"
            />
            <!-- Mar del Plata pin (source coords) -->
            <circle
              class="expansion__pin expansion__pin--active"
              cx="276"
              cy="618"
              r="2.3"
            />
            <circle class="expansion__pin-pulse" cx="276" cy="618" r="2.3" />
            <text class="expansion__pin-label-sm" x="280" y="621">
              Mar del Plata
            </text>
          </g>

          <!-- ============================================
               WESTERN EUROPE (Natural Earth paths)
               Transformed from source coords to right panel
               transform: translate(-1180,-1611) scale(4.5)
               ============================================ -->
          <g transform="translate(-1180,-1611) scale(4.5)">
            <!-- France -->
            <path
              class="expansion__continent-fill"
              d="M412.973,393.588l-1.91,0.467l-3.82,4.158l-1.149,0.078l-1.53-1.081l-0.993,0.233l-0.762,2.386l-5.584,0.155l0.156,1.236l3.82,2.543l4.435,3.543l-0.077,4.236l-2.368,4.157l5.126,2.464l5.204,0.154l1.606-1.85l3.286,0.078l0.916,0.848l3.285-0.233l1.686-2.162l-2.145-2.541l-0.155-1.616l0.458-1.771l-1.071-1.539l-1.833,0.535l-0.232-1.383l4.054-4.469v-2.697l-2.348-0.767l-1.432-0.987Z"
            />
            <!-- Italy -->
            <path
              class="expansion__continent-fill"
              d="M423.233,409.391l-0.535,1.356l0.146,1.478l2.065,2.412l3.25-0.113l7.175,8.334l4.479,1.297l2.646,2.498l0.631,5.695l1.417-0.828l1.229-3.104l-0.303-2.229l2.101-0.19l0.304-1.263l-5.922-2.834l-5.619-5.523l-2.238-3.303l-0.545-3.137l2.861-0.684l-0.734-2.066l-1.755-1.478l-1.513-0.069l-2.108,0.58l-1.99,2.781l-1.201,0.795l-1.858-1.141Z"
            />
            <!-- United Kingdom -->
            <path
              class="expansion__continent-fill"
              d="M400.629,367.984l-1.582,2.395l0.631,0.959h3.648v1.6l-0.952,1.278l0.632,3.354l2.058,3.994l1.581,3.672l2.533,0.959l1.105,1.92l-0.155,1.755l-1.582,0.959l-0.156,0.795l1.106,0.64l-0.951,1.279l-2.221,0.959l-4.279-0.477l-6.664,3.035l-2.221-1.115l6.345-3.674l-0.796-0.477l-3.328-0.32l2.058-3.033l0.319-2.56l2.696-0.319l-0.475-4.953l-3.174-0.155l-0.95-1.115l0.155-3.674l-1.901,0.156l1.901-6.388l3.492-2.56Z"
            />
            <!-- Ireland -->
            <path
              class="expansion__continent-fill"
              d="M394.915,383.085l-0.786,5.187l-6.975,2.56h-2.223l-1.582-1.115v-0.96l3.492-2.238l-0.951-1.92l0.156-2.714l3.018,0.155l1.383-3.25l-0.183,2.887l2.344,1.858Z"
            />
            <!-- Portugal -->
            <path
              class="expansion__continent-fill"
              d="M387.499,421.716l-0.536,7.478l-1.53,1.384l0.156,0.846l1.071,1.772l-0.691,2.16l1.149,0.39l2.68-0.312l-0.155-2.16l1.756-10.02l-0.382-1.383Z"
            />
            <!-- Spain (highlighted) -->
            <path
              class="expansion__highlight"
              d="M402.565,416.322h-11.014l-2.222-1.004l-1.071,0.078l-1.297,2.696l0.458,2.775l4.21,0.389l0.536,1.771l-1.833,10.33l0.078,1.851l2.981,1.617l3.439,0.232l6.881-1.694l3.363-4.233l0.077-4.313l5.965-5.395l0.302-2.386l-5.428-0.078Z"
            />
            <!-- Barcelona pin (source coords) -->
            <circle
              class="expansion__pin expansion__pin--active"
              cx="412"
              cy="420"
              r="1.3"
            />
            <circle class="expansion__pin-pulse" cx="412" cy="420" r="1.3" />
            <text class="expansion__pin-label-sm" x="414" y="418.5">
              Barcelona
            </text>
          </g>

          <!-- ============================================
               CONNECTING ARC (root coordinate space)
               From east coast of SA (~307,130) to Spain (~679,284)
               ============================================ -->
          <path
            class="expansion__arc"
            d="M310,150 C410,50 550,100 665,275"
            fill="none"
          />

          <!-- "¿Tu ciudad?" callout (Atlantic center) -->
          <circle
            class="expansion__pin expansion__pin--future"
            cx="465"
            cy="245"
            r="8"
            stroke-dasharray="4 3"
            fill="none"
          />
          <text class="expansion__callout" x="465" y="273" text-anchor="middle">
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
   SVG Map (Natural Earth data)
   ------------------------------------------------------------------ */
.expansion__map-wrap {
  max-width: 960px;
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

/* Country fills (context — subtle) */
.expansion__continent-fill {
  fill: rgba(242, 237, 229, 0.06);
  stroke: rgba(242, 237, 229, 0.15);
  stroke-width: 0.3;
  stroke-linejoin: round;
}

/* Highlighted countries — Argentina and Spain */
.expansion__highlight {
  fill: rgba(192, 122, 86, 0.15);
  stroke: var(--color-terracotta);
  stroke-width: 0.4;
  stroke-linejoin: round;
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
  stroke-width: 0.5;
  opacity: 0;
  animation: pin-pulse 2s ease-out infinite;
}

@keyframes pin-pulse {
  0% {
    r: 2.3;
    opacity: 0.6;
  }
  100% {
    r: 6;
    opacity: 0;
  }
}

/* Pin labels (inside transformed groups — small font to compensate for scale) */
.expansion__pin-label-sm {
  font-family: var(--font-clarity);
  font-size: 4px;
  fill: rgba(242, 237, 229, 0.8);
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
