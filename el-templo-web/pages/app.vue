<script setup lang="ts">
/**
 * /app — App landing page for El Templo Online ecosystem.
 *
 * Composes all 10 section components + forms + WhatsApp in spec order.
 * Uses default layout (AppNav + AppPrefooter + AppFooter shared with home).
 *
 * SEO: Optimized for "El Templo Online", "app de entrenamiento", "gestion de gimnasios".
 * Analytics: Section tracking for all visible sections.
 */

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    "hero-app": "viewed_app_hero",
    modulos: "viewed_app_ecosystem",
    "modulo-arete": "viewed_app_arete",
    "modulo-el-templo": "viewed_app_el_templo",
    "modulo-academy": "viewed_app_academy",
    "modulo-labs": "viewed_app_labs",
    "flywheel-digital": "viewed_app_flywheel",
    "descarga-app": "viewed_app_download",
    formularios: "viewed_app_forms",
  },
});
onUnmounted(() => cleanupTracking());

// --- SEO Meta Tags ---
useSeoMeta({
  title:
    "El Templo Online \u2014 App de Entrenamiento, H\u00E1bitos y Gesti\u00F3n",
  description:
    "Ecosistema digital de El Templo Calistenia. 4 m\u00F3dulos: Aret\u00EA (h\u00E1bitos), El Templo (entrenamiento), Olympic Academy (formaci\u00F3n) y Labs (gesti\u00F3n de gimnasios).",
  ogTitle: "El Templo Online \u2014 El Templo en tu Bolsillo",
  ogDescription:
    "Una plataforma, cuatro m\u00F3dulos. H\u00E1bitos, entrenamiento, formaci\u00F3n y gesti\u00F3n.",
  ogUrl: "https://eltemplo.org/app",
  ogType: "website",
});

useHead({
  link: [{ rel: "canonical", href: "https://eltemplo.org/app" }],
});
</script>

<template>
  <div class="app-landing">
    <AppLandingHero />
    <AppLandingEcosystem />
    <AppLandingModuleArete />
    <AppLandingModuleTemplo />
    <AppLandingModuleAcademy />
    <AppLandingModuleLabs />
    <AppLandingFlywheel />
    <AppLandingDownload />
    <div id="formularios" class="app-landing__forms">
      <div class="app-landing__forms-container">
        <h2 class="app-landing__forms-title">CONTACTO</h2>
        <div class="app-landing__forms-grid">
          <AppLandingFormWaitlist />
          <AppLandingFormLabs />
        </div>
      </div>
    </div>
    <AppLandingWhatsApp />
  </div>
</template>

<style scoped>
/* ==========================================================================
   App Landing Page — Forms section wrapper
   ========================================================================== */

.app-landing__forms {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.app-landing__forms-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

.app-landing__forms-title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  text-align: center;
  margin: 0 0 var(--space-section) 0;
}

.app-landing__forms-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: start;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing__forms {
    padding: var(--space-large) 0;
  }

  .app-landing__forms-title {
    font-size: 28px;
  }

  .app-landing__forms-grid {
    grid-template-columns: 1fr;
    gap: 48px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing__forms-title {
    font-size: 24px;
  }

  .app-landing__forms-grid {
    gap: 40px;
  }
}
</style>
