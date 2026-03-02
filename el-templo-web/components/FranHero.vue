<script setup lang="ts">
/**
 * FranHero — Full-viewport franchise hero section.
 *
 * Image background (PlaceholderBox for now), warm overlay,
 * staggered entrance animation, investment figure, CTA to
 * #formulario-franquicia, scroll indicator with bounce.
 *
 * Modeled on SectionHero.vue with franchise-specific content.
 */

import { franquiciasConfig } from "~/data/franquicias";

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
  <section id="hero-franquicias" class="fran-hero">
    <!-- IMAGE BACKGROUND (Placeholder for now) -->
    <div class="fran-hero__bg" :style="{ transform: parallaxTransform }">
      <PlaceholderBox label="" height="100%" />
    </div>

    <!-- OVERLAY GRADIENT -->
    <div class="fran-hero__overlay" :style="{ transform: parallaxTransform }" />

    <!-- CONTENT -->
    <div class="fran-hero__content">
      <h1
        class="fran-hero__title"
        :class="{ 'fran-hero--entered': entered }"
        :style="{ transitionDelay: '200ms' }"
      >
        ABRI TU FRANQUICIA DE CALISTENIA.
      </h1>

      <p
        class="fran-hero__subtitle"
        :class="{ 'fran-hero--entered': entered }"
        :style="{ transitionDelay: '500ms' }"
      >
        Un m&eacute;todo internacional. Una comunidad en expansi&oacute;n. Tu
        oportunidad.
      </p>

      <p
        class="fran-hero__investment"
        :class="{ 'fran-hero--entered': entered }"
        :style="{ transitionDelay: '700ms' }"
      >
        Inversi&oacute;n desde {{ franquiciasConfig.investmentFigure }}
      </p>

      <a
        href="#formulario-franquicia"
        class="btn btn--primary fran-hero__cta"
        :class="{ 'fran-hero--entered': entered }"
        :style="{ transitionDelay: '900ms' }"
      >
        Quiero aplicar
      </a>
    </div>

    <!-- SCROLL INDICATOR -->
    <div v-if="showScrollIndicator" class="fran-hero__scroll-indicator">
      <span class="fran-hero__scroll-arrow">&#8595;</span>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranHero — Full Viewport Franchise Hero
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.fran-hero {
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
.fran-hero__bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  will-change: transform;
}

.fran-hero__bg :deep(.placeholder-box) {
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
  border: none;
}

/* ------------------------------------------------------------------
   Overlay Gradient (Deep Charcoal — never black)
   ------------------------------------------------------------------ */
.fran-hero__overlay {
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
.fran-hero__content {
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
.fran-hero__title,
.fran-hero__subtitle,
.fran-hero__investment,
.fran-hero__cta {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.fran-hero--entered {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Title — Montserrat ExtraBold
   ------------------------------------------------------------------ */
.fran-hero__title {
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
   Subtitle — Cormorant Garamond Italic
   ------------------------------------------------------------------ */
.fran-hero__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.02em;
  color: rgba(242, 237, 229, 0.9);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto 24px auto;
}

/* ------------------------------------------------------------------
   Investment Figure — Geologica, muted
   ------------------------------------------------------------------ */
.fran-hero__investment {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: rgba(242, 237, 229, 0.6);
  letter-spacing: 0.03em;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   Primary CTA
   ------------------------------------------------------------------ */
.fran-hero__cta {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   Scroll Indicator
   ------------------------------------------------------------------ */
.fran-hero__scroll-indicator {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.fran-hero__scroll-arrow {
  display: block;
  font-size: 24px;
  color: var(--color-marble-cream);
  opacity: 0.4;
  animation: fran-hero-bounce 2s ease-in-out infinite;
}

@keyframes fran-hero-bounce {
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
  .fran-hero {
    margin-top: -56px;
  }

  .fran-hero__content {
    padding-top: 56px;
  }

  .fran-hero__title {
    font-size: 28px;
  }

  .fran-hero__subtitle {
    font-size: 18px;
    max-width: 500px;
  }

  .fran-hero__investment {
    font-size: 14px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .fran-hero {
    min-height: 100svh;
  }

  .fran-hero__title {
    font-size: 24px;
    letter-spacing: 0.04em;
    line-height: 1.25;
    margin-bottom: 16px;
  }

  .fran-hero__subtitle {
    font-size: 16px;
    max-width: 90%;
    letter-spacing: 0.01em;
    line-height: 1.45;
    margin-bottom: 16px;
  }

  .fran-hero__investment {
    font-size: 13px;
    margin-bottom: 24px;
  }

  .fran-hero__cta {
    width: 100%;
    max-width: 320px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-hero__title,
  .fran-hero__subtitle,
  .fran-hero__investment,
  .fran-hero__cta {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .fran-hero__scroll-arrow {
    animation: none;
  }

  .fran-hero__bg,
  .fran-hero__overlay {
    will-change: auto;
  }
}
</style>
