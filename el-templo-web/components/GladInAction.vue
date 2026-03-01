<script setup lang="ts">
/**
 * GladInAction -- "En Accion" real-use photo gallery section.
 *
 * Marble Cream background. Mosaic grid of 6 PlaceholderBox photos.
 * Desktop: 3-column grid with mixed aspect ratios.
 * Tablet: 2-column. Mobile: horizontal scroll with snap.
 *
 * Social proof text below gallery.
 * useScrollReveal for grid entrance.
 * BEM prefix: glad-action
 */

import { gladiusConfig } from "~/data/gladius";

const { revealed, elementRef, cleanup } = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});

// Mixed aspect ratios for visual variety in the mosaic
const photoAspects = ["2/3", "3/2", "1/1", "3/2", "2/3", "1/1"];
</script>

<template>
  <section class="glad-action">
    <div class="glad-action__container">
      <h2 class="glad-action__title">
        {{ gladiusConfig.inAction.title }}
      </h2>

      <p class="glad-action__subtitle">
        {{ gladiusConfig.inAction.subtitle }}
      </p>

      <!-- PHOTO GRID -->
      <div
        ref="elementRef"
        class="glad-action__grid"
        :class="{ 'glad-action__grid--revealed': revealed }"
      >
        <div
          v-for="(photo, index) in gladiusConfig.inAction.photos"
          :key="photo.id"
          class="glad-action__photo"
          :style="{ transitionDelay: `${index * 100}ms` }"
        >
          <PlaceholderBox
            :aspect-ratio="photoAspects[index]"
            :label="photo.alt"
          />
        </div>
      </div>

      <!-- SOCIAL PROOF -->
      <p class="glad-action__social-proof">
        {{ gladiusConfig.inAction.socialProof }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   GladInAction -- En Accion Photo Gallery
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Container
   ------------------------------------------------------------------ */
.glad-action {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.glad-action__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.glad-action__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Subtitle
   ------------------------------------------------------------------ */
.glad-action__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Photo Grid -- Desktop: 3 columns
   ------------------------------------------------------------------ */
.glad-action__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-base);
}

.glad-action__photo {
  border-radius: var(--radius-card);
  overflow: hidden;
  opacity: 0;
  transform: scale(0.95);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.glad-action__grid--revealed .glad-action__photo {
  opacity: 1;
  transform: scale(1);
}

/* ------------------------------------------------------------------
   Social Proof
   ------------------------------------------------------------------ */
.glad-action__social-proof {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-deep-charcoal);
  text-align: center;
  margin: var(--space-spacious) 0 0 0;
  letter-spacing: 0.02em;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px) -- 2 columns
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .glad-action {
    padding: var(--space-large) 0;
  }

  .glad-action__grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .glad-action__title {
    font-size: 26px;
  }

  .glad-action__social-proof {
    font-size: 18px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px) -- Horizontal scroll with snap
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .glad-action__grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 12px;
    padding-bottom: 8px;
    -webkit-overflow-scrolling: touch;
  }

  .glad-action__photo {
    flex: 0 0 75%;
    scroll-snap-align: start;
  }

  .glad-action__photo :deep(.placeholder-box) {
    aspect-ratio: 3/4 !important;
  }

  .glad-action__title {
    font-size: 22px;
  }

  .glad-action__social-proof {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .glad-action__photo {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
