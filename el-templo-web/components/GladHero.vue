<script setup lang="ts">
/**
 * GladHero -- Full-viewport Gladius hero section.
 *
 * Deep Charcoal background with PlaceholderBox for product hero image,
 * warm overlay gradient, staggered entrance animation,
 * dual CTAs (primary: VER PRODUCTOS, secondary: CONSULTAR),
 * scroll indicator with bounce.
 *
 * Modeled on FranHero.vue with Gladius-specific content.
 */

import { gladiusConfig } from "~/data/gladius";

const entered = ref(false);
const showScrollIndicator = ref(true);

// Parallax state
const scrollY = ref(0);
const parallaxEnabled = ref(false);
let rafId: number | null = null;
let scrollCleanup: (() => void) | null = null;

if (import.meta.client) {
  onMounted(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      entered.value = true;
      showScrollIndicator.value = true;
      return;
    }

    // Staggered entrance
    requestAnimationFrame(() => {
      entered.value = true;
    });

    // Parallax: only on desktop (> 768px)
    const mediaQuery = window.matchMedia("(min-width: 769px)");
    parallaxEnabled.value = mediaQuery.matches;

    function handleMediaChange(e: MediaQueryListEvent): void {
      parallaxEnabled.value = e.matches;
      if (!e.matches) {
        scrollY.value = 0;
      }
    }

    mediaQuery.addEventListener("change", handleMediaChange);

    // Scroll handler for parallax + scroll indicator
    function onScroll(): void {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        scrollY.value = window.scrollY;

        if (window.scrollY > 100) {
          showScrollIndicator.value = false;
        }

        rafId = null;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    scrollCleanup = () => {
      window.removeEventListener("scroll", onScroll);
      mediaQuery.removeEventListener("change", handleMediaChange);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  });

  onBeforeUnmount(() => {
    if (scrollCleanup) {
      scrollCleanup();
      scrollCleanup = null;
    }
  });
}

const parallaxTransform = computed(() => {
  if (!parallaxEnabled.value) return undefined;
  return `translateY(${scrollY.value * 0.4}px)`;
});
</script>

<template>
  <section id="hero-gladius" class="glad-hero">
    <!-- IMAGE BACKGROUND (Placeholder for now) -->
    <div class="glad-hero__bg" :style="{ transform: parallaxTransform }">
      <PlaceholderBox label="" height="100%" />
    </div>

    <!-- OVERLAY GRADIENT -->
    <div class="glad-hero__overlay" :style="{ transform: parallaxTransform }" />

    <!-- CONTENT -->
    <div class="glad-hero__content">
      <h1
        class="glad-hero__title glad-hero--delay-1"
        :class="{ 'glad-hero--entered': entered }"
      >
        {{ gladiusConfig.hero.title }}
      </h1>

      <p
        class="glad-hero__subtitle glad-hero--delay-2"
        :class="{ 'glad-hero--entered': entered }"
      >
        {{ gladiusConfig.hero.subtitle }}
      </p>

      <div
        class="glad-hero__ctas glad-hero--delay-3"
        :class="{ 'glad-hero--entered': entered }"
      >
        <a
          :href="gladiusConfig.hero.ctaAnchor"
          class="btn btn--primary glad-hero__cta"
        >
          {{ gladiusConfig.hero.cta }}
        </a>

        <a
          :href="gladiusConfig.hero.ctaSecondaryAnchor"
          class="btn btn--ghost glad-hero__cta-secondary"
        >
          {{ gladiusConfig.hero.ctaSecondary }}
        </a>
      </div>
    </div>

    <!-- SCROLL INDICATOR -->
    <div v-if="showScrollIndicator" class="glad-hero__scroll-indicator">
      <span class="glad-hero__scroll-arrow">&#8595;</span>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   GladHero -- Full Viewport Gladius Hero
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.glad-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-deep-charcoal);

  /* Escape the 64px padding-top from .page__content in default layout */
  margin-top: -64px;
}

/* ------------------------------------------------------------------
   Background Image (PlaceholderBox fills container)
   ------------------------------------------------------------------ */
.glad-hero__bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  will-change: transform;
}

.glad-hero__bg :deep(.placeholder-box) {
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
  border: none;
}

/* ------------------------------------------------------------------
   Overlay Gradient (Deep Charcoal -- never black)
   ------------------------------------------------------------------ */
.glad-hero__overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(61, 55, 50, 0.2) 0%,
    rgba(61, 55, 50, 0.65) 100%
  );
  z-index: 1;
  will-change: transform;
}

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */
.glad-hero__content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 800px;
  padding: 0 5%;

  /* Compensate for nav overlap */
  padding-top: 64px;
}

/* ------------------------------------------------------------------
   Staggered Entrance Animation
   ------------------------------------------------------------------ */
.glad-hero__title,
.glad-hero__subtitle,
.glad-hero__ctas {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.glad-hero--entered {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered entrance delay classes (replaces inline :style bindings) */
.glad-hero--delay-1 {
  transition-delay: 200ms;
}
.glad-hero--delay-2 {
  transition-delay: 500ms;
}
.glad-hero--delay-3 {
  transition-delay: 800ms;
}

/* ------------------------------------------------------------------
   Title -- Montserrat ExtraBold
   ------------------------------------------------------------------ */
.glad-hero__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-marble-cream);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Subtitle -- Cormorant Garamond Italic
   ------------------------------------------------------------------ */
.glad-hero__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.02em;
  color: rgba(242, 237, 229, 0.9);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-spacious) auto;
}

/* ------------------------------------------------------------------
   CTAs Container
   ------------------------------------------------------------------ */
.glad-hero__ctas {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* ------------------------------------------------------------------
   Primary CTA (Terracotta)
   ------------------------------------------------------------------ */
.glad-hero__cta {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   Secondary CTA (Aged Gold ghost button)
   ------------------------------------------------------------------ */
.glad-hero__cta-secondary {
  margin-bottom: 0;
  border: 1px solid var(--color-aged-gold);
  color: var(--color-aged-gold);
  background: transparent;
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 24px;
  border-radius: var(--radius-base);
  text-decoration: none;
  transition:
    background var(--transition-base),
    color var(--transition-base);
  cursor: pointer;
}

.glad-hero__cta-secondary:hover {
  background: var(--color-aged-gold);
  color: var(--color-marble-cream);
}

/* ------------------------------------------------------------------
   Scroll Indicator
   ------------------------------------------------------------------ */
.glad-hero__scroll-indicator {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.glad-hero__scroll-arrow {
  display: block;
  font-size: 24px;
  color: var(--color-marble-cream);
  opacity: 0.4;
  animation: glad-hero-bounce 2s ease-in-out infinite;
}

@keyframes glad-hero-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(8px);
  }
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .glad-hero {
    margin-top: -56px;
  }

  .glad-hero__content {
    padding-top: 56px;
  }

  .glad-hero__title {
    font-size: 28px;
  }

  .glad-hero__subtitle {
    font-size: 18px;
    max-width: 500px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .glad-hero {
    min-height: 100svh;
  }

  .glad-hero__title {
    font-size: 24px;
    letter-spacing: 0.04em;
    line-height: 1.25;
    margin-bottom: 16px;
  }

  .glad-hero__subtitle {
    font-size: 16px;
    max-width: 90%;
    letter-spacing: 0.01em;
    line-height: 1.45;
    margin-bottom: 24px;
  }

  .glad-hero__ctas {
    flex-direction: column;
    width: 100%;
    max-width: 320px;
    margin: 0 auto;
  }

  .glad-hero__cta,
  .glad-hero__cta-secondary {
    width: 100%;
    text-align: center;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .glad-hero__title,
  .glad-hero__subtitle,
  .glad-hero__ctas {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .glad-hero__scroll-arrow {
    animation: none;
  }

  .glad-hero__bg,
  .glad-hero__overlay {
    will-change: auto;
  }
}
</style>
