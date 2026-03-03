<script setup lang="ts">
/**
 * AppLandingDownload — Download section with store badges.
 *
 * Final conversion point on the /app page.
 * CTA "DESCARGA LA APP" — 3rd and final appearance per spec.
 * Store badges (App Store + Google Play) as placeholders.
 * Phone mockup placeholder on the right (desktop) / below (mobile).
 */

import { downloadContent, storeLinks } from "~/data/app-landing";

const { trackEvent } = useAnalytics();

const {
  revealed,
  elementRef: sectionRef,
  cleanup,
} = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});

function handleDownloadClick(): void {
  trackEvent("click_cta_app_download");
}
</script>

<template>
  <section id="descarga-app" class="app-landing-download">
    <div
      ref="sectionRef"
      class="app-landing-download__container"
      :class="{ 'is-visible': revealed }"
    >
      <!-- Text + badges column -->
      <div class="app-landing-download__content">
        <h2 class="app-landing-download__title">
          {{ downloadContent.title }}
        </h2>

        <p class="app-landing-download__subtitle">
          {{ downloadContent.subtitle }}
        </p>

        <!-- Store badges -->
        <div class="app-landing-download__badges">
          <a
            :href="storeLinks.appStore"
            class="app-landing-download__badge-link"
            aria-label="Descargar en App Store"
          >
            <PlaceholderBox label="App Store" height="44px" />
          </a>
          <a
            :href="storeLinks.googlePlay"
            class="app-landing-download__badge-link"
            aria-label="Descargar en Google Play"
          >
            <PlaceholderBox label="Google Play" height="44px" />
          </a>
        </div>

        <!-- Primary CTA: 3rd and final appearance -->
        <a
          :href="storeLinks.appStore"
          class="btn btn--primary app-landing-download__cta"
          @click="handleDownloadClick"
        >
          DESCARG&Aacute; LA APP
        </a>

        <!-- Additional text -->
        <p class="app-landing-download__badge-text">
          {{ downloadContent.badgeText }}
        </p>
      </div>

      <!-- Phone mockup -->
      <div class="app-landing-download__mockup">
        <PlaceholderBox label="Phone mockup" aspect-ratio="9/19" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingDownload — Download Section with Store Badges
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.app-landing-download {
  background: var(--color-sandy-beige);
  padding: var(--space-hero) 0;
}

.app-landing-download__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-section);
  align-items: center;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.app-landing-download__container.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Content column
   ------------------------------------------------------------------ */
.app-landing-download__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.app-landing-download__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 40px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Subtitle
   ------------------------------------------------------------------ */
.app-landing-download__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   Store badges
   ------------------------------------------------------------------ */
.app-landing-download__badges {
  display: flex;
  gap: 12px;
  margin-bottom: var(--space-spacious);
}

.app-landing-download__badge-link {
  display: block;
  width: 135px;
  min-height: 44px;
  text-decoration: none;
  transition: var(--transition-base);
}

.app-landing-download__badge-link:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}

.app-landing-download__badge-link :deep(.placeholder-box) {
  width: 135px;
  min-height: 44px;
}

/* ------------------------------------------------------------------
   CTA
   ------------------------------------------------------------------ */
.app-landing-download__cta {
  display: inline-block;
  margin-bottom: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Badge text
   ------------------------------------------------------------------ */
.app-landing-download__badge-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Phone mockup
   ------------------------------------------------------------------ */
.app-landing-download__mockup {
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-landing-download__mockup :deep(.placeholder-box) {
  max-width: 280px;
  width: 100%;
  border-radius: 24px;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing-download {
    padding: var(--space-large) 0;
  }

  .app-landing-download__container {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
    text-align: center;
  }

  .app-landing-download__content {
    align-items: center;
  }

  .app-landing-download__title {
    font-size: 32px;
  }

  .app-landing-download__subtitle {
    font-size: 18px;
  }

  .app-landing-download__mockup {
    order: 1;
  }

  .app-landing-download__mockup :deep(.placeholder-box) {
    max-width: 220px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-download__title {
    font-size: 28px;
  }

  .app-landing-download__subtitle {
    font-size: 16px;
  }

  .app-landing-download__badges {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .app-landing-download__badge-link {
    width: 160px;
  }

  .app-landing-download__badge-link :deep(.placeholder-box) {
    width: 160px;
  }

  .app-landing-download__cta {
    display: block;
    text-align: center;
    max-width: 320px;
    width: 100%;
  }

  .app-landing-download__badge-text {
    font-size: 13px;
  }

  .app-landing-download__mockup :deep(.placeholder-box) {
    max-width: 180px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-download__container {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
