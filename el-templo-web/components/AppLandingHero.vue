<script setup lang="ts">
/**
 * AppLandingHero — Full-viewport hero for /app landing page.
 *
 * Warm Stone background, centered content, H1 "EL TEMPLO EN TU BOLSILLO.",
 * store badges, dual CTAs (download + scroll to modules), staggered entrance.
 *
 * Modeled on FranHero.vue pattern but with lighter treatment (no image overlay).
 */

import { heroContent, storeLinks } from "~/data/app-landing";

const { trackEvent } = useAnalytics();

const entered = ref(false);

if (import.meta.client) {
  onMounted(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      entered.value = true;
      return;
    }

    requestAnimationFrame(() => {
      entered.value = true;
    });
  });
}

function handleDownloadClick(): void {
  trackEvent("click_cta_app_download");
}
</script>

<template>
  <section id="hero-app" class="app-landing-hero">
    <div class="app-landing-hero__content">
      <h1
        class="app-landing-hero__title app-landing-hero--delay-1"
        :class="{ 'app-landing-hero--entered': entered }"
      >
        {{ heroContent.title }}
      </h1>

      <p
        class="app-landing-hero__subtitle app-landing-hero--delay-2"
        :class="{ 'app-landing-hero--entered': entered }"
      >
        {{ heroContent.subtitle }}
      </p>

      <!-- CTA row -->
      <div
        class="app-landing-hero__cta-row app-landing-hero--delay-3"
        :class="{ 'app-landing-hero--entered': entered }"
      >
        <a
          :href="storeLinks.appStore"
          class="btn btn--primary app-landing-hero__cta-primary"
          @click="handleDownloadClick"
        >
          {{ heroContent.ctaPrimary }}
        </a>

        <a
          :href="heroContent.ctaSecondaryHref"
          class="btn btn--ghost app-landing-hero__cta-secondary"
        >
          {{ heroContent.ctaSecondary }}
        </a>
      </div>

      <!-- Store badges -->
      <div
        class="app-landing-hero__badges app-landing-hero--delay-4"
        :class="{ 'app-landing-hero--entered': entered }"
      >
        <a
          :href="storeLinks.appStore"
          class="app-landing-hero__badge-link"
          aria-label="Descargar en App Store"
          @click="handleDownloadClick"
        >
          <PlaceholderBox label="App Store" aspect-ratio="135/40" />
        </a>
        <a
          :href="storeLinks.googlePlay"
          class="app-landing-hero__badge-link"
          aria-label="Descargar en Google Play"
          @click="handleDownloadClick"
        >
          <PlaceholderBox label="Google Play" aspect-ratio="135/40" />
        </a>
      </div>

      <!-- Badge line -->
      <p
        class="app-landing-hero__badge-line app-landing-hero--delay-4"
        :class="{ 'app-landing-hero--entered': entered }"
      >
        {{ heroContent.badgeLine }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingHero — Full Viewport /app Hero
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.app-landing-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-warm-stone);

  /* Escape the 64px padding-top from .page__content in default layout */
  margin-top: -64px;
}

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */
.app-landing-hero__content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 800px;
  padding: 0 5%;

  /* Compensate for nav overlap */
  padding-top: 64px;
}

/* ------------------------------------------------------------------
   Staggered Entrance Animation
   ------------------------------------------------------------------ */
.app-landing-hero__title,
.app-landing-hero__subtitle,
.app-landing-hero__cta-row,
.app-landing-hero__badges,
.app-landing-hero__badge-line {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.app-landing-hero--entered {
  opacity: 1;
  transform: translateY(0);
}

.app-landing-hero--delay-1 {
  transition-delay: 200ms;
}
.app-landing-hero--delay-2 {
  transition-delay: 500ms;
}
.app-landing-hero--delay-3 {
  transition-delay: 700ms;
}
.app-landing-hero--delay-4 {
  transition-delay: 900ms;
}

/* ------------------------------------------------------------------
   Title — Montserrat ExtraBold
   ------------------------------------------------------------------ */
.app-landing-hero__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 48px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  line-height: 1.15;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Subtitle — Cormorant Garamond Italic
   ------------------------------------------------------------------ */
.app-landing-hero__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.02em;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-spacious) auto;
}

/* ------------------------------------------------------------------
   CTA Row
   ------------------------------------------------------------------ */
.app-landing-hero__cta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: var(--space-spacious);
}

.app-landing-hero__cta-primary {
  white-space: nowrap;
}

.app-landing-hero__cta-secondary {
  white-space: nowrap;
}

/* ------------------------------------------------------------------
   Store Badges
   ------------------------------------------------------------------ */
.app-landing-hero__badges {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: var(--space-base);
}

.app-landing-hero__badge-link {
  display: block;
  width: 135px;
  min-height: 44px;
  transition: var(--transition-base);
}

.app-landing-hero__badge-link:hover {
  transform: translateY(-1px);
}

.app-landing-hero__badge-link :deep(.placeholder-box) {
  height: 40px;
  border-radius: var(--radius-base);
}

/* ------------------------------------------------------------------
   Badge Line — small helper text
   ------------------------------------------------------------------ */
.app-landing-hero__badge-line {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  letter-spacing: 0.02em;
  margin: 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing-hero {
    margin-top: -56px;
  }

  .app-landing-hero__content {
    padding-top: 56px;
  }

  .app-landing-hero__title {
    font-size: 36px;
  }

  .app-landing-hero__subtitle {
    font-size: 18px;
    max-width: 500px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-hero {
    min-height: 100svh;
  }

  .app-landing-hero__title {
    font-size: 28px;
    letter-spacing: 0.04em;
    line-height: 1.2;
    margin-bottom: 16px;
  }

  .app-landing-hero__subtitle {
    font-size: 16px;
    max-width: 90%;
    line-height: 1.45;
    margin-bottom: 20px;
  }

  .app-landing-hero__cta-row {
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  .app-landing-hero__cta-primary {
    width: 100%;
    max-width: 320px;
    text-align: center;
  }

  .app-landing-hero__badges {
    flex-direction: column;
    gap: 12px;
  }

  .app-landing-hero__badge-link {
    width: 160px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-hero__title,
  .app-landing-hero__subtitle,
  .app-landing-hero__cta-row,
  .app-landing-hero__badges,
  .app-landing-hero__badge-line {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
