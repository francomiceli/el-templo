<script setup lang="ts">
/**
 * GladPhilosophy -- Philosophy section explaining why Gladius exists.
 *
 * Warm Stone background. Split layout: text (60%) + PlaceholderBox (40%)
 * on desktop, stacked on mobile. 3 feature items with inline SVG icons.
 *
 * Uses useScrollReveal for entrance animation (slide-in from sides).
 * BEM prefix: glad-philosophy
 */

import { gladiusConfig } from "~/data/gladius";

const {
  revealed: revealedText,
  elementRef: textRef,
  cleanup: cleanupText,
} = useScrollReveal({ threshold: 0.15 });
const {
  revealed: revealedImage,
  elementRef: imageRef,
  cleanup: cleanupImage,
} = useScrollReveal({ threshold: 0.15 });

onBeforeUnmount(() => {
  cleanupText();
  cleanupImage();
});
</script>

<template>
  <section class="glad-philosophy">
    <div class="glad-philosophy__container">
      <!-- TEXT COLUMN -->
      <div
        ref="textRef"
        class="glad-philosophy__text"
        :class="{
          'glad-philosophy--revealed': revealedText,
          'glad-philosophy--from-left': true,
        }"
      >
        <h2 class="glad-philosophy__title">
          {{ gladiusConfig.philosophy.title }}
        </h2>

        <p class="glad-philosophy__body">
          {{ gladiusConfig.philosophy.body }}
        </p>

        <!-- FEATURES -->
        <div class="glad-philosophy__features">
          <div
            v-for="(feature, index) in gladiusConfig.philosophy.features"
            :key="index"
            class="glad-philosophy__feature"
          >
            <!-- Inline SVG icons (stroke-based, 32x32) -->
            <div class="glad-philosophy__feature-icon">
              <!-- Design icon -->
              <svg
                v-if="index === 0"
                viewBox="0 0 32 32"
                fill="none"
                width="32"
                height="32"
                aria-hidden="true"
              >
                <rect
                  x="4"
                  y="4"
                  width="24"
                  height="24"
                  rx="3"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M4 12h24M12 4v24"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="4"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
              <!-- Tested icon -->
              <svg
                v-else-if="index === 1"
                viewBox="0 0 32 32"
                fill="none"
                width="32"
                height="32"
                aria-hidden="true"
              >
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M10 16l4 4 8-8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <!-- Durability icon -->
              <svg
                v-else
                viewBox="0 0 32 32"
                fill="none"
                width="32"
                height="32"
                aria-hidden="true"
              >
                <path
                  d="M16 4l3 6h7l-5.5 4.5 2 7L16 17l-6.5 4.5 2-7L6 10h7l3-6z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <div class="glad-philosophy__feature-content">
              <h3 class="glad-philosophy__feature-title">
                {{ feature.title }}
              </h3>
              <p class="glad-philosophy__feature-text">
                {{ feature.text }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- IMAGE COLUMN -->
      <div
        ref="imageRef"
        class="glad-philosophy__image"
        :class="{
          'glad-philosophy--revealed': revealedImage,
          'glad-philosophy--from-right': true,
        }"
      >
        <PlaceholderBox aspect-ratio="3/4" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   GladPhilosophy -- Product Philosophy Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.glad-philosophy {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.glad-philosophy__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
  display: flex;
  align-items: center;
  gap: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Text Column (60%)
   ------------------------------------------------------------------ */
.glad-philosophy__text {
  flex: 3;
  min-width: 0;
}

/* ------------------------------------------------------------------
   Image Column (40%)
   ------------------------------------------------------------------ */
.glad-philosophy__image {
  flex: 2;
  min-width: 0;
}

/* ------------------------------------------------------------------
   Scroll Reveal Animation
   ------------------------------------------------------------------ */
.glad-philosophy--from-left {
  opacity: 0;
  transform: translateX(-40px);
  transition:
    opacity 700ms ease,
    transform 700ms ease;
}

.glad-philosophy--from-right {
  opacity: 0;
  transform: translateX(40px);
  transition:
    opacity 700ms ease,
    transform 700ms ease;
}

.glad-philosophy--revealed {
  opacity: 1;
  transform: translateX(0);
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.glad-philosophy__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Body Text
   ------------------------------------------------------------------ */
.glad-philosophy__body {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.7;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   Features
   ------------------------------------------------------------------ */
.glad-philosophy__features {
  display: flex;
  flex-direction: column;
  gap: var(--space-comfortable);
}

.glad-philosophy__feature {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.glad-philosophy__feature-icon {
  flex-shrink: 0;
  color: var(--color-terracotta);
  margin-top: 2px;
}

.glad-philosophy__feature-content {
  min-width: 0;
}

.glad-philosophy__feature-title {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.glad-philosophy__feature-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px) -- Stack
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .glad-philosophy {
    padding: var(--space-large) 0;
  }

  .glad-philosophy__container {
    flex-direction: column;
    gap: var(--space-comfortable);
  }

  .glad-philosophy__text,
  .glad-philosophy__image {
    flex: none;
    width: 100%;
  }

  .glad-philosophy__title {
    font-size: 26px;
  }

  /* On mobile both slide up instead of from sides */
  .glad-philosophy--from-left,
  .glad-philosophy--from-right {
    transform: translateY(30px);
  }

  .glad-philosophy--revealed {
    transform: translateY(0);
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .glad-philosophy__title {
    font-size: 22px;
  }

  .glad-philosophy__body {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .glad-philosophy--from-left,
  .glad-philosophy--from-right {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
