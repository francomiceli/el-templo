<script setup lang="ts">
/**
 * AcademyHero — Full-viewport academy hero section.
 *
 * Image background (PlaceholderBox for now), warm overlay,
 * staggered entrance animation, format data line, CTA to
 * #formulario-academy, scroll indicator with bounce.
 */

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
  <section id="hero-academy" class="academy-hero">
    <!-- IMAGE BACKGROUND (Placeholder for now) -->
    <div class="academy-hero__bg" :style="{ transform: parallaxTransform }">
      <PlaceholderBox label="" height="100%" />
    </div>

    <!-- OVERLAY GRADIENT -->
    <div
      class="academy-hero__overlay"
      :style="{ transform: parallaxTransform }"
    />

    <!-- CONTENT -->
    <div class="academy-hero__content">
      <h1
        class="academy-hero__title academy-hero--delay-1"
        :class="{ 'academy-hero--entered': entered }"
      >
        FORM&Aacute; ENTRENADORES. FORJ&Aacute; L&Iacute;DERES.
      </h1>

      <p
        class="academy-hero__subtitle academy-hero--delay-2"
        :class="{ 'academy-hero--entered': entered }"
      >
        Olympic Academy es la formaci&oacute;n oficial de El Templo Calistenia.
        Certificaci&oacute;n profesional con el m&eacute;todo que ya opera en
        dos continentes.
      </p>

      <a
        href="#formulario-academy"
        class="btn btn--primary academy-hero__cta academy-hero--delay-3"
        :class="{ 'academy-hero--entered': entered }"
      >
        QUIERO FORMARME
      </a>

      <p
        class="academy-hero__format academy-hero--delay-4"
        :class="{ 'academy-hero--entered': entered }"
      >
        Intensivo de 1 mes &bull; Presencial y online &bull; 3 niveles de
        certificaci&oacute;n
      </p>
    </div>

    <!-- SCROLL INDICATOR -->
    <div v-if="showScrollIndicator" class="academy-hero__scroll-indicator">
      <span class="academy-hero__scroll-arrow">&#8595;</span>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyHero — Full Viewport Academy Hero
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.academy-hero {
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
.academy-hero__bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  will-change: transform;
}

.academy-hero__bg :deep(.placeholder-box) {
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
  border: none;
}

/* ------------------------------------------------------------------
   Overlay Gradient (Deep Charcoal — never black)
   ------------------------------------------------------------------ */
.academy-hero__overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(61, 55, 50, 0.2) 0%,
    rgba(61, 55, 50, 0.6) 100%
  );
  z-index: 1;
  will-change: transform;
}

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */
.academy-hero__content {
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
.academy-hero__title,
.academy-hero__subtitle,
.academy-hero__cta,
.academy-hero__format {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.academy-hero--entered {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered entrance delay classes */
.academy-hero--delay-1 {
  transition-delay: 200ms;
}
.academy-hero--delay-2 {
  transition-delay: 500ms;
}
.academy-hero--delay-3 {
  transition-delay: 700ms;
}
.academy-hero--delay-4 {
  transition-delay: 900ms;
}

/* ------------------------------------------------------------------
   Title — Montserrat ExtraBold
   ------------------------------------------------------------------ */
.academy-hero__title {
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
.academy-hero__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.02em;
  color: var(--color-marble-cream);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-spacious) auto;
}

/* ------------------------------------------------------------------
   CTA
   ------------------------------------------------------------------ */
.academy-hero__cta {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   Format Data Line
   ------------------------------------------------------------------ */
.academy-hero__format {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-warm-stone);
  letter-spacing: 0.02em;
  margin: 24px 0 0 0;
}

/* ------------------------------------------------------------------
   Scroll Indicator
   ------------------------------------------------------------------ */
.academy-hero__scroll-indicator {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.academy-hero__scroll-arrow {
  display: block;
  font-size: 24px;
  color: var(--color-marble-cream);
  opacity: 0.4;
  animation: academy-hero-bounce 2s ease-in-out infinite;
}

@keyframes academy-hero-bounce {
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
  .academy-hero {
    margin-top: -56px;
  }

  .academy-hero__content {
    padding-top: 56px;
  }

  .academy-hero__title {
    font-size: 28px;
  }

  .academy-hero__subtitle {
    font-size: 18px;
    max-width: 500px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-hero {
    min-height: 100svh;
  }

  .academy-hero__title {
    font-size: 24px;
    letter-spacing: 0.04em;
    line-height: 1.25;
    margin-bottom: 16px;
  }

  .academy-hero__subtitle {
    font-size: 16px;
    max-width: 90%;
    letter-spacing: 0.01em;
    line-height: 1.45;
    margin-bottom: 16px;
  }

  .academy-hero__format {
    font-size: 13px;
  }

  .academy-hero__cta {
    width: 100%;
    max-width: 320px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-hero__title,
  .academy-hero__subtitle,
  .academy-hero__cta,
  .academy-hero__format {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .academy-hero__scroll-arrow {
    animation: none;
  }

  .academy-hero__bg,
  .academy-hero__overlay {
    will-change: auto;
  }
}
</style>
