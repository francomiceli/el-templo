<script setup lang="ts">
/**
 * FranVideo -- Conditional video/PDF section.
 *
 * Only renders when franquiciasConfig.videoUrl or pdfUrl is non-null.
 * Currently both are null, so this section does not appear on the page.
 * The layout must not feel incomplete without it.
 *
 * When activated:
 * - videoUrl: self-hosted <video> element, centered, max-width 800px
 * - pdfUrl: "DESCARGAR BROCHURE" download button
 */

import { franquiciasConfig } from "~/data/franquicias";

const hasContent = computed(
  () =>
    franquiciasConfig.videoUrl !== null || franquiciasConfig.pdfUrl !== null,
);

const { revealed, elementRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section
    v-if="hasContent"
    id="video-franquicias"
    ref="elementRef"
    class="fran-video"
    :class="{ 'is-visible': revealed }"
  >
    <div class="fran-video__container">
      <!-- Video Player -->
      <div v-if="franquiciasConfig.videoUrl" class="fran-video__player-wrap">
        <video
          class="fran-video__player"
          :src="franquiciasConfig.videoUrl"
          controls
          preload="metadata"
          playsinline
        >
          Tu navegador no soporta el elemento de video.
        </video>
      </div>

      <!-- PDF Download -->
      <div v-if="franquiciasConfig.pdfUrl" class="fran-video__download">
        <a :href="franquiciasConfig.pdfUrl" class="btn btn--primary" download>
          DESCARGAR BROCHURE
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FranVideo Section -- Conditional video/PDF
   BEM naming. Token variables only. Never pure black or white.
   Marble Cream background. Only renders when content is available.
   ========================================================================== */

.fran-video {
  background: var(--color-marble-cream);
  padding: var(--space-large) 0;
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.fran-video.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.fran-video__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Video Player
   ------------------------------------------------------------------ */
.fran-video__player-wrap {
  margin-bottom: var(--space-spacious);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-medium);
}

.fran-video__player {
  width: 100%;
  display: block;
  background: var(--color-deep-charcoal);
}

/* ------------------------------------------------------------------
   Download Button
   ------------------------------------------------------------------ */
.fran-video__download {
  display: flex;
  justify-content: center;
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .fran-video {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
