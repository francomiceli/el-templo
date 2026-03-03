<script setup lang="ts">
/**
 * BlogPostCta -- Cross-page CTA banner for blog post pages.
 *
 * Renders one of 3 CTA variants based on the post's ctaType:
 * - trial (default): Reserve trial session via WhatsApp
 * - franchise: Learn about franchise model
 * - app: Discover the training app (Gladius)
 *
 * BEM prefix: blog-cta
 */

const props = withDefaults(
  defineProps<{
    ctaType?: "trial" | "franchise" | "app";
  }>(),
  { ctaType: "trial" },
);

const ctaConfig = computed(() => {
  switch (props.ctaType) {
    case "franchise":
      return {
        heading: "Abr\u00ED tu Templo",
        subtext:
          "Conoc\u00E9 nuestro modelo de franquicia y sumate al movimiento.",
        buttonText: "CONOCER FRANQUICIA",
        buttonLink: "/franquicias",
        isExternal: false,
        modifier: "franchise" as const,
      };
    case "app":
      return {
        heading: "Entren\u00E1 con la App",
        subtext:
          "Sesiones personalizadas, progresiones y seguimiento de tu entrenamiento.",
        buttonText: "DESCUBRIR M\u00C1S",
        buttonLink: "/gladius",
        isExternal: false,
        modifier: "app" as const,
      };
    default:
      return {
        heading: "Reserv\u00E1 tu Sesi\u00F3n de Prueba",
        subtext:
          "Descubr\u00ED tu nivel y empez\u00E1 a entrenar con el M\u00E9todo El Templo.",
        buttonText: "RESERVAR SESI\u00D3N",
        buttonLink:
          "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba",
        isExternal: true,
        modifier: "trial" as const,
      };
  }
});
</script>

<template>
  <div class="blog-cta" :class="`blog-cta--${ctaConfig.modifier}`">
    <h3 class="blog-cta__heading">{{ ctaConfig.heading }}</h3>
    <p class="blog-cta__subtext">{{ ctaConfig.subtext }}</p>

    <!-- External link (WhatsApp) -->
    <a
      v-if="ctaConfig.isExternal"
      :href="ctaConfig.buttonLink"
      target="_blank"
      rel="noopener noreferrer"
      class="blog-cta__btn"
      :class="`blog-cta__btn--${ctaConfig.modifier}`"
    >
      {{ ctaConfig.buttonText }}
    </a>

    <!-- Internal link (NuxtLink) -->
    <NuxtLink
      v-else
      :to="ctaConfig.buttonLink"
      class="blog-cta__btn"
      :class="`blog-cta__btn--${ctaConfig.modifier}`"
    >
      {{ ctaConfig.buttonText }}
    </NuxtLink>
  </div>
</template>

<style scoped>
/* ==========================================================================
   BlogPostCta -- Cross-page CTA banner
   BEM naming. Token variables only.
   ========================================================================== */

.blog-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  background: var(--color-sandy-beige);
  border-top: 1px solid var(--color-warm-stone);
  border-bottom: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  padding: var(--space-spacious) var(--space-comfortable);
  margin: var(--space-spacious) 0;
}

.blog-cta__heading {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  margin: 0;
}

.blog-cta__subtext {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-olive-stone);
  line-height: 1.5;
  max-width: 500px;
  margin: 0;
}

.blog-cta__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  border-radius: var(--radius-base);
  transition:
    background var(--transition-base),
    transform var(--transition-base);
  cursor: pointer;
}

.blog-cta__btn:hover {
  transform: translateY(-1px);
}

/* Trial + App: terracotta button */
.blog-cta__btn--trial,
.blog-cta__btn--app {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
}

.blog-cta__btn--trial:hover,
.blog-cta__btn--app:hover {
  background: var(--color-clay);
}

/* Franchise: aged gold button */
.blog-cta__btn--franchise {
  background: var(--color-aged-gold);
  color: var(--color-marble-cream);
}

.blog-cta__btn--franchise:hover {
  filter: brightness(0.9);
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .blog-cta__heading {
    font-size: 20px;
  }

  .blog-cta__subtext {
    font-size: 14px;
  }

  .blog-cta__btn {
    padding: 12px 24px;
    font-size: 12px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-cta__btn {
    transition: none;
  }
}
</style>
