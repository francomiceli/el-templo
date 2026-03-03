<script setup lang="ts">
/**
 * AppLandingFlywheel — Vertical flywheel digital flow.
 *
 * Shows the 4-module progressive unlock narrative as a vertical
 * top-to-bottom flow: Arete -> El Templo -> Academy -> Labs.
 * NOT the circular FlywheelDiagram from /academy — different visual.
 *
 * Deep Charcoal background with accent-colored stage circles.
 * Staggered scroll-triggered reveal (stages appear one by one).
 */

import type { AppModule } from "~/data/app-landing";
import { flywheelContent, modules } from "~/data/app-landing";

// Accent colors per stage — mapped from modules data
const stageAccents: string[] = modules.map((mod: AppModule) => mod.accentColor);

const {
  revealed,
  elementRef: flowRef,
  cleanup,
} = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="flywheel-digital" class="app-landing-flywheel">
    <div class="app-landing-flywheel__container">
      <h2 class="app-landing-flywheel__title">
        {{ flywheelContent.title }}
      </h2>

      <p class="app-landing-flywheel__subtitle">
        {{ flywheelContent.subtitle }}
      </p>

      <!-- Vertical flow -->
      <div
        ref="flowRef"
        class="app-landing-flywheel__flow"
        :class="{ 'is-visible': revealed }"
      >
        <template
          v-for="(stage, index) in flywheelContent.stages"
          :key="stage.name"
        >
          <!-- Connecting arrow (not before first stage) -->
          <div
            v-if="index > 0"
            class="app-landing-flywheel__arrow"
            :style="{
              transitionDelay: revealed ? index * 200 + 'ms' : '0ms',
            }"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="40"
              viewBox="0 0 24 40"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="2" x2="12" y2="32" />
              <polyline points="6 26 12 32 18 26" />
            </svg>
          </div>

          <!-- Stage -->
          <div
            class="app-landing-flywheel__stage"
            :style="{
              transitionDelay: revealed ? index * 200 + 'ms' : '0ms',
            }"
          >
            <!-- Accent circle with module icon -->
            <div
              class="app-landing-flywheel__circle"
              :style="{
                borderColor: `var(${stageAccents[index] ?? '--color-terracotta'})`,
                color: `var(${stageAccents[index] ?? '--color-terracotta'})`,
              }"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span
                class="app-landing-flywheel__icon"
                v-html="modules[index]?.iconPlaceholder ?? ''"
              />
            </div>

            <!-- Stage text -->
            <div class="app-landing-flywheel__stage-text">
              <span class="app-landing-flywheel__stage-name">
                {{ stage.name }}
              </span>
              <span class="app-landing-flywheel__stage-verb">
                {{ stage.verb }}
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Connection text -->
      <p class="app-landing-flywheel__connection">
        {{ flywheelContent.connectionText }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingFlywheel — Vertical Flywheel Digital Flow
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.app-landing-flywheel {
  background: var(--color-deep-charcoal);
  padding: var(--space-hero) 0;
}

.app-landing-flywheel__container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.app-landing-flywheel__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-marble-cream);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.app-landing-flywheel__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-sandy-beige);
  line-height: 1.6;
  max-width: 480px;
  margin: 0 auto var(--space-section) auto;
}

/* ------------------------------------------------------------------
   Vertical flow container
   ------------------------------------------------------------------ */
.app-landing-flywheel__flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  margin-bottom: var(--space-section);
}

/* ------------------------------------------------------------------
   Stage — circle + text
   ------------------------------------------------------------------ */
.app-landing-flywheel__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.app-landing-flywheel__flow.is-visible .app-landing-flywheel__stage {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Accent circle
   ------------------------------------------------------------------ */
.app-landing-flywheel__circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.app-landing-flywheel__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Scale module icons down to fit inside the circle */
.app-landing-flywheel__icon :deep(svg) {
  width: 32px;
  height: 32px;
}

/* ------------------------------------------------------------------
   Stage text
   ------------------------------------------------------------------ */
.app-landing-flywheel__stage-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-landing-flywheel__stage-name {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-marble-cream);
}

.app-landing-flywheel__stage-verb {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-sandy-beige);
}

/* ------------------------------------------------------------------
   Connecting arrows
   ------------------------------------------------------------------ */
.app-landing-flywheel__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
  color: var(--color-sandy-beige);

  /* Entrance animation */
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 400ms ease,
    transform 400ms ease;
}

.app-landing-flywheel__flow.is-visible .app-landing-flywheel__arrow {
  opacity: 0.5;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Connection text
   ------------------------------------------------------------------ */
.app-landing-flywheel__connection {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 18px;
  color: var(--color-sandy-beige);
  line-height: 1.6;
  max-width: 520px;
  margin: 0 auto;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing-flywheel {
    padding: var(--space-large) 0;
  }

  .app-landing-flywheel__title {
    font-size: 28px;
  }

  .app-landing-flywheel__circle {
    width: 68px;
    height: 68px;
  }

  .app-landing-flywheel__icon :deep(svg) {
    width: 28px;
    height: 28px;
  }

  .app-landing-flywheel__connection {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-flywheel__title {
    font-size: 24px;
  }

  .app-landing-flywheel__subtitle {
    font-size: 14px;
  }

  .app-landing-flywheel__circle {
    width: 60px;
    height: 60px;
  }

  .app-landing-flywheel__icon :deep(svg) {
    width: 24px;
    height: 24px;
  }

  .app-landing-flywheel__stage-name {
    font-size: 14px;
  }

  .app-landing-flywheel__stage-verb {
    font-size: 13px;
  }

  .app-landing-flywheel__connection {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-flywheel__stage,
  .app-landing-flywheel__arrow {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
