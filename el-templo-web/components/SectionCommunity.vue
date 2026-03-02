<script setup lang="ts">
/**
 * SectionCommunity — Social proof section with two visual zones.
 *
 * Zone A (Warm Stone): Photo gallery mosaic, testimonial cards, stats counters.
 * Zone B (Marble Cream): AURA CLUB sub-section with split layout.
 *
 * Stats counters animate count-up on scroll into viewport.
 * Gallery photos open a fullscreen lightbox overlay on click.
 * Multiple useScrollReveal instances for staggered zone entrance.
 */

import { testimonials, communityStats, galleryPhotos } from "~/data/community";
import type { CommunityStat } from "~/data/community";

// --- Scroll reveal instances (one per stagger group) ---
const {
  revealed: galleryRevealed,
  elementRef: galleryRef,
  cleanup: galleryCleanup,
} = useScrollReveal();

const {
  revealed: testimonialsRevealed,
  elementRef: testimonialsRef,
  cleanup: testimonialsCleanup,
} = useScrollReveal();

const {
  revealed: statsRevealed,
  elementRef: statsRef,
  cleanup: statsCleanup,
} = useScrollReveal({ threshold: 0.5 });

const {
  revealed: auraRevealed,
  elementRef: auraRef,
  cleanup: auraCleanup,
} = useScrollReveal();

// --- Lightbox state ---
const lightboxIndex = ref(-1);

function openLightbox(index: number): void {
  lightboxIndex.value = index;
}

function closeLightbox(): void {
  lightboxIndex.value = -1;
}

function handleLightboxKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeLightbox();
  }
}

function handleOverlayClick(event: MouseEvent): void {
  // Close when clicking the overlay background, not the image itself
  if ((event.target as HTMLElement).classList.contains("community__lightbox")) {
    closeLightbox();
  }
}

// --- Current lightbox photo (safe access) ---
const lightboxPhoto = computed(() => {
  if (lightboxIndex.value >= 0 && lightboxIndex.value < galleryPhotos.length) {
    return galleryPhotos[lightboxIndex.value];
  }
  return null;
});

// --- Keyboard listener for lightbox ---
if (import.meta.client) {
  watch(lightboxIndex, (newVal) => {
    if (newVal >= 0) {
      document.addEventListener("keydown", handleLightboxKeydown);
      document.body.style.overflow = "hidden";
    } else {
      document.removeEventListener("keydown", handleLightboxKeydown);
      document.body.style.overflow = "";
    }
  });
}

// --- Count-up animation ---
const displayValues = ref<string[]>(communityStats.map(() => "0"));

let countUpRan = false;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function formatNumber(value: number): string {
  return value.toLocaleString("es-AR");
}

function animateCountUp(): void {
  if (countUpRan) return;
  countUpRan = true;

  // Check reduced motion preference
  if (
    import.meta.client &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    displayValues.value = communityStats.map(
      (stat: CommunityStat) => stat.prefix + formatNumber(stat.value),
    );
    return;
  }

  const duration = 1500;
  const startTime = performance.now();

  function update(currentTime: number): void {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);

    displayValues.value = communityStats.map((stat: CommunityStat) => {
      const current = Math.floor(stat.value * eased);
      const formatted = formatNumber(current);
      if (progress >= 1) {
        return stat.prefix + formatNumber(stat.value);
      }
      return stat.prefix + formatted;
    });

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Trigger count-up when stats scroll into view
watch(statsRevealed, (revealed) => {
  if (revealed) {
    animateCountUp();
  }
});

// --- Cleanup ---
onBeforeUnmount(() => {
  galleryCleanup();
  testimonialsCleanup();
  statsCleanup();
  auraCleanup();

  if (import.meta.client) {
    document.removeEventListener("keydown", handleLightboxKeydown);
    document.body.style.overflow = "";
  }
});
</script>

<template>
  <section id="comunidad" class="community">
    <!-- ============================================================
         ZONE A: Community (Warm Stone background)
         ============================================================ -->
    <div class="community__main">
      <div class="community__container">
        <!-- Header -->
        <span class="community__tag">Comunidad</span>

        <h2 class="community__title">
          ENTRENAMIENTO DE CALISTENIA EN COMUNIDAD.
        </h2>

        <p class="community__subtitle">
          M&aacute;s de 1000 personas eligen El Templo cada semana. No porque
          sea f&aacute;cil, sino porque cada sesi&oacute;n tiene sentido y cada
          persona que entra encuentra su lugar.
        </p>

        <!-- Gallery Mosaic -->
        <div
          ref="galleryRef"
          class="community__gallery"
          :class="{ 'is-visible': galleryRevealed }"
        >
          <div
            v-for="(photo, index) in galleryPhotos"
            :key="photo.id"
            class="community__gallery-item"
            :style="{
              transitionDelay: galleryRevealed ? index * 60 + 'ms' : '0ms',
            }"
            @click="openLightbox(index)"
          >
            <PlaceholderBox :label="photo.label" height="100%" />
          </div>
        </div>

        <!-- Testimonials -->
        <div
          ref="testimonialsRef"
          class="community__testimonials"
          :class="{ 'is-visible': testimonialsRevealed }"
        >
          <div
            v-for="(testimonial, index) in testimonials"
            :key="index"
            class="community__testimonial"
            :style="{
              transitionDelay: testimonialsRevealed
                ? index * 150 + 'ms'
                : '0ms',
            }"
          >
            <span class="community__quote-mark">&ldquo;</span>
            <p class="community__quote">{{ testimonial.quote }}</p>
            <p class="community__author">&mdash; {{ testimonial.name }}</p>
            <p class="community__meta">
              {{ testimonial.level }} &middot; {{ testimonial.duration }}
            </p>
          </div>
        </div>

        <!-- Stats Counters -->
        <div
          ref="statsRef"
          class="community__numbers"
          :class="{ 'is-visible': statsRevealed }"
        >
          <div
            v-for="(stat, index) in communityStats"
            :key="index"
            class="community__stat"
            :style="{
              transitionDelay: statsRevealed ? index * 100 + 'ms' : '0ms',
            }"
          >
            <span class="community__stat-number">
              {{ displayValues[index] }}
            </span>
            <div class="community__stat-separator" />
            <span class="community__stat-label">{{ stat.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================
         ZONE B: AURA CLUB (Marble Cream background)
         ============================================================ -->
    <div class="community__aura">
      <div
        ref="auraRef"
        class="community__aura-container"
        :class="{ 'is-visible': auraRevealed }"
      >
        <div class="community__aura-image">
          <PlaceholderBox
            label="Evento AURA CLUB"
            aspect-ratio="4/5"
            class="community__aura-placeholder"
          />
        </div>

        <div class="community__aura-text">
          <span class="community__aura-tag">AURA CLUB</span>

          <h3 class="community__aura-title">
            La comunidad se vive m&aacute;s all&aacute; de la barra.
          </h3>

          <p class="community__aura-desc">
            AURA CLUB es donde la comunidad de El Templo se encuentra fuera de
            la sesi&oacute;n. Eventos de wellness, encuentros, experiencias que
            conectan cuerpo, mente y personas. Porque entrenar juntos es solo el
            principio.
          </p>

          <NuxtLink to="/aura-club" class="community__aura-cta">
            Descubr&iacute; AURA CLUB
            <span class="community__aura-arrow">&rarr;</span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- ============================================================
         LIGHTBOX OVERLAY
         ============================================================ -->
    <Teleport to="body">
      <Transition name="lightbox-fade">
        <div
          v-if="lightboxPhoto"
          class="community__lightbox"
          @click="handleOverlayClick"
        >
          <button
            class="community__lightbox-close"
            aria-label="Cerrar lightbox"
            @click="closeLightbox"
          >
            &times;
          </button>

          <div class="community__lightbox-content">
            <PlaceholderBox :label="lightboxPhoto.label" aspect-ratio="16/9" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Community Section — Social Proof + AURA CLUB
   BEM naming. Token variables only. Never pure black or white.
   Zone A: Warm Stone. Zone B: Marble Cream.
   ========================================================================== */

/* ------------------------------------------------------------------
   Zone A — Main Community
   ------------------------------------------------------------------ */
.community__main {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.community__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.community__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
  text-align: center;
}

.community__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
  text-align: center;
}

.community__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 650px;
  margin: 0 auto var(--space-large) auto;
  text-align: center;
}

/* ------------------------------------------------------------------
   Gallery Mosaic
   ------------------------------------------------------------------ */
.community__gallery {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: 180px;
  gap: 8px;
  margin-bottom: var(--space-large);
}

.community__gallery-item {
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition:
    opacity 500ms ease,
    transform 500ms ease;

  /* Entrance animation base state */
  opacity: 0;
  transform: scale(0.95);
}

.community__gallery.is-visible .community__gallery-item {
  opacity: 1;
  transform: scale(1);
}

.community__gallery-item:hover {
  opacity: 0.92;
  transform: scale(1.02);
}

.community__gallery.is-visible .community__gallery-item:hover {
  opacity: 0.92;
  transform: scale(1.02);
}

/* Items 2 and 7 span 2 columns for visual variety */
.community__gallery-item:nth-child(2),
.community__gallery-item:nth-child(7) {
  grid-column: span 2;
}

/* Force PlaceholderBox to fill the grid cell */
.community__gallery-item :deep(.placeholder-box) {
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
}

/* ------------------------------------------------------------------
   Testimonials
   ------------------------------------------------------------------ */
.community__testimonials {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
  margin-bottom: var(--space-large);
}

.community__testimonial {
  position: relative;
  background: var(--color-marble-cream);
  border: 1px solid var(--color-sandy-beige);
  border-radius: var(--radius-card);
  padding: 28px;
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
}

.community__testimonials.is-visible .community__testimonial {
  opacity: 1;
  transform: translateY(0);
}

.community__testimonial:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-medium);
}

.community__testimonials.is-visible .community__testimonial:hover {
  transform: translateY(-2px);
}

.community__quote-mark {
  position: absolute;
  top: 12px;
  left: 16px;
  font-family: var(--font-elegance);
  font-size: 48px;
  color: var(--color-terracotta);
  opacity: 0.2;
  line-height: 1;
  pointer-events: none;
}

.community__quote {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0;
}

.community__author {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  color: var(--color-deep-charcoal);
  margin: 16px 0 0 0;
}

.community__meta {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 12px;
  color: var(--color-olive-stone);
  margin: 4px 0 0 0;
}

/* ------------------------------------------------------------------
   Stats Counters
   ------------------------------------------------------------------ */
.community__numbers {
  display: flex;
  justify-content: center;
  gap: var(--space-large);
  padding-top: var(--space-section);
  border-top: 1px solid rgba(61, 55, 50, 0.1);
}

.community__stat {
  text-align: center;
  transition:
    opacity 500ms ease,
    transform 500ms ease;

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(16px);
}

.community__numbers.is-visible .community__stat {
  opacity: 1;
  transform: translateY(0);
}

.community__stat-number {
  display: block;
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 40px;
  color: var(--color-deep-charcoal);
  line-height: 1;
}

.community__stat-separator {
  width: 24px;
  height: 2px;
  background: var(--color-terracotta);
  margin: 8px auto;
}

.community__stat-label {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Zone B — AURA CLUB
   ------------------------------------------------------------------ */
.community__aura {
  background: var(--color-marble-cream);
  padding: var(--space-large) 0;
}

.community__aura-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
  display: grid;
  grid-template-columns: 45% 1fr;
  gap: var(--space-section);
  align-items: center;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.community__aura-container.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.community__aura-placeholder {
  box-shadow: var(--shadow-prominent);
}

.community__aura-tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-aged-gold);
  margin-bottom: var(--space-base);
}

.community__aura-title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.community__aura-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
}

/* AURA CTA — Aged Gold Ghost Button */
.community__aura-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-aged-gold);
  border: 1.5px solid var(--color-aged-gold);
  padding: 12px 28px;
  border-radius: var(--radius-base);
  text-decoration: none;
  transition: var(--transition-base);
}

.community__aura-cta:hover {
  background: rgba(184, 155, 94, 0.08);
}

.community__aura-arrow {
  transition: transform var(--transition-base);
}

.community__aura-cta:hover .community__aura-arrow {
  transform: translateX(4px);
}

/* ------------------------------------------------------------------
   Lightbox Overlay
   ------------------------------------------------------------------ */
.community__lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(61, 55, 50, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-spacious);
}

.community__lightbox-close {
  position: absolute;
  top: 20px;
  right: 24px;
  background: none;
  border: none;
  color: var(--color-marble-cream);
  font-size: 40px;
  cursor: pointer;
  line-height: 1;
  padding: 8px;
  transition: opacity var(--transition-fast);
  z-index: 1001;
}

.community__lightbox-close:hover {
  opacity: 0.7;
}

.community__lightbox-content {
  max-width: 900px;
  width: 100%;
  border-radius: var(--radius-card);
  overflow: hidden;
}

/* Lightbox transition */
.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 200ms ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .community__main {
    padding: var(--space-large) 0;
  }

  .community__title {
    font-size: 28px;
  }

  .community__subtitle {
    font-size: 17px;
  }

  .community__testimonials {
    gap: 16px;
  }

  .community__testimonial {
    padding: 24px;
  }

  .community__aura-container {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
  }

  .community__aura-image {
    order: -1;
  }

  .community__aura-placeholder {
    aspect-ratio: 16/9 !important;
  }

  .community__aura-placeholder :deep(.placeholder-box) {
    aspect-ratio: 16/9 !important;
  }

  .community__aura-title {
    font-size: 24px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .community__title {
    font-size: 24px;
  }

  .community__subtitle {
    font-size: 16px;
  }

  /* Gallery: horizontal scroll */
  .community__gallery {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 8px;
    scrollbar-width: none;
  }

  .community__gallery::-webkit-scrollbar {
    display: none;
  }

  .community__gallery-item {
    min-width: 200px;
    height: 200px;
    flex-shrink: 0;
    scroll-snap-align: start;
  }

  .community__gallery-item:nth-child(2),
  .community__gallery-item:nth-child(7) {
    grid-column: auto;
  }

  .community__gallery-item :deep(.placeholder-box) {
    aspect-ratio: 1/1 !important;
    height: 100%;
  }

  /* Testimonials: horizontal scroll */
  .community__testimonials {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    gap: 12px;
  }

  .community__testimonials::-webkit-scrollbar {
    display: none;
  }

  .community__testimonial {
    min-width: 280px;
    flex-shrink: 0;
    scroll-snap-align: start;
  }

  /* Stats: 2x2 grid */
  .community__numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-spacious);
  }

  .community__stat-number {
    font-size: 32px;
  }

  /* Aura Club */
  .community__aura-title {
    font-size: 22px;
  }

  .community__aura-cta {
    width: 100%;
    justify-content: center;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable entrance and count-up animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .community__gallery-item,
  .community__testimonial,
  .community__stat,
  .community__aura-container {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .community__gallery-item:hover {
    opacity: 1;
    transform: none;
  }

  .community__testimonial:hover {
    transform: none;
    box-shadow: none;
  }

  .lightbox-fade-enter-active,
  .lightbox-fade-leave-active {
    transition: none;
  }
}
</style>
