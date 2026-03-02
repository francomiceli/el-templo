<script setup lang="ts">
/**
 * SectionHero — Full-viewport cinematic hero section.
 *
 * Video-ready HTML structure with warm Deep Charcoal overlay,
 * staggered entrance animation, parallax effect on desktop,
 * and scroll indicator. First impression: "this is not a gym."
 */

const sedesCount = 8;

// Placeholder paths — replace with real assets when available.
// Using runtime refs so Vite does not try to resolve these as module imports.
const heroPoster = "/assets/img/hero-poster.jpg";
const heroVideo = "/assets/video/hero-loop.mp4";

// Preload hero poster for LCP optimization
useHead({
  link: [
    {
      rel: "preload",
      as: "image",
      href: heroPoster,
    },
  ],
});

const entered = ref(false);
const showScrollIndicator = ref(true);
const videoFailed = ref(false);

// Parallax state
const scrollY = ref(0);
const parallaxEnabled = ref(false);
let rafId: number | null = null;
let scrollCleanup: (() => void) | null = null;

function onVideoError(): void {
  videoFailed.value = true;
}

if (import.meta.client) {
  onMounted(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      // Skip all animations: reveal everything immediately
      entered.value = true;
      showScrollIndicator.value = true;
      return;
    }

    // Staggered entrance: toggle entered after mount to trigger CSS transitions
    // Each element has its own transition-delay set via :style binding
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

        // Hide scroll indicator after scrolling 100px
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
  <section id="hero" class="hero">
    <!-- VIDEO BACKGROUND -->
    <video
      v-if="!videoFailed"
      class="hero__video"
      :style="{ transform: parallaxTransform }"
      autoplay
      muted
      loop
      playsinline
      :poster="heroPoster"
      @error="onVideoError"
    >
      <source :src="heroVideo" type="video/mp4" >
    </video>

    <!-- OVERLAY GRADIENT -->
    <div class="hero__overlay" :style="{ transform: parallaxTransform }" />

    <!-- CONTENT -->
    <div class="hero__content">
      <h1
        class="hero__title hero--delay-1"
        :class="{ 'hero--entered': entered }"
      >
        Calistenia y entrenamiento con peso corporal.
      </h1>

      <p
        class="hero__subtitle hero--delay-2"
        :class="{ 'hero--entered': entered }"
      >
        {{ sedesCount }} sedes donde la calistenia se practica como lo que es:
        el arte m&aacute;s antiguo de forjar el cuerpo con su propio peso.
      </p>

      <a
        href="#descubri-nivel"
        class="btn btn--primary hero__cta hero--delay-3"
        :class="{ 'hero--entered': entered }"
      >
        Comenz&aacute; tu camino
      </a>

      <p class="hero__note hero--delay-4" :class="{ 'hero--entered': entered }">
        Tu primera sesi&oacute;n es sin cargo.
      </p>

      <NuxtLink
        to="/franquicias"
        class="btn btn--secondary-gold hero__franchise-cta hero--delay-5"
        :class="{ 'hero--entered': entered }"
      >
        Abr&iacute; tu Templo
      </NuxtLink>
    </div>

    <!-- SCROLL INDICATOR -->
    <div v-if="showScrollIndicator" class="hero__scroll-indicator">
      <span class="hero__scroll-arrow">&#8595;</span>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Hero Section — Full Viewport Cinematic Entry
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.hero {
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
   Video Background
   ------------------------------------------------------------------ */
.hero__video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 0;
  will-change: transform;
}

/* ------------------------------------------------------------------
   Overlay Gradient (NEVER black — always Deep Charcoal)
   ------------------------------------------------------------------ */
.hero__overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(61, 55, 50, 0.15) 0%,
    rgba(61, 55, 50, 0.55) 100%
  );
  z-index: 1;
  will-change: transform;
}

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */
.hero__content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 800px;
  padding: 0 5%;

  /* Compensate for nav overlap (hero has negative margin-top) */
  padding-top: 64px;
}

/* ------------------------------------------------------------------
   Staggered Entrance Animation
   Elements start invisible and slide up. The `hero--entered` class
   triggers the transition. Each element gets a unique transition-delay
   via :style binding.
   ------------------------------------------------------------------ */
.hero__title,
.hero__subtitle,
.hero__cta,
.hero__note,
.hero__franchise-cta {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.hero--entered {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered entrance delay classes (replaces inline :style bindings) */
.hero--delay-1 {
  transition-delay: 200ms;
}
.hero--delay-2 {
  transition-delay: 500ms;
}
.hero--delay-3 {
  transition-delay: 800ms;
}
.hero--delay-4 {
  transition-delay: 1000ms;
}
.hero--delay-5 {
  transition-delay: 1200ms;
}

/* ------------------------------------------------------------------
   Title — Montserrat ExtraBold
   ------------------------------------------------------------------ */
.hero__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 48px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-marble-cream);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Subtitle — Cormorant Garamond Italic
   ------------------------------------------------------------------ */
.hero__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.02em;
  color: rgba(242, 237, 229, 0.9);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto 40px auto;
}

/* ------------------------------------------------------------------
   Primary CTA — Uses .btn .btn--primary from buttons.css
   Hero-specific overrides only.
   ------------------------------------------------------------------ */
.hero__cta {
  margin-bottom: var(--space-base);
}

/* ------------------------------------------------------------------
   Note — Small complementary text
   ------------------------------------------------------------------ */
.hero__note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: rgba(242, 237, 229, 0.7);
  letter-spacing: 0.02em;
  margin: 0 0 var(--space-base) 0;
}

/* ------------------------------------------------------------------
   Franchise CTA — Uses .btn .btn--secondary-gold from buttons.css
   Hero-specific overrides only.
   ------------------------------------------------------------------ */
.hero__franchise-cta {
  margin-top: var(--space-base);
}

/* ------------------------------------------------------------------
   Scroll Indicator
   ------------------------------------------------------------------ */
.hero__scroll-indicator {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.hero__scroll-arrow {
  display: block;
  font-size: 24px;
  color: var(--color-marble-cream);
  opacity: 0.4;
  animation: hero-bounce 2s ease-in-out infinite;
}

@keyframes hero-bounce {
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
  .hero {
    margin-top: -56px;
  }

  .hero__content {
    padding-top: 56px;
  }

  .hero__title {
    font-size: 32px;
  }

  .hero__subtitle {
    font-size: 18px;
    max-width: 500px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .hero {
    min-height: 100svh;
  }

  .hero__title {
    font-size: 26px;
    letter-spacing: 0.04em;
    line-height: 1.25;
    margin-bottom: 16px;
  }

  .hero__subtitle {
    font-size: 16px;
    max-width: 90%;
    letter-spacing: 0.01em;
    line-height: 1.45;
    margin-bottom: 28px;
  }

  .hero__cta {
    width: 100%;
    max-width: 320px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .hero__title,
  .hero__subtitle,
  .hero__cta,
  .hero__note,
  .hero__franchise-cta {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .hero__scroll-arrow {
    animation: none;
  }

  .hero__video,
  .hero__overlay {
    will-change: auto;
  }
}
</style>
