<script setup lang="ts">
/**
 * /app — App landing page for El Templo Online ecosystem.
 *
 * Composes all app landing sections in spec order.
 * Uses default layout (AppNav + AppPrefooter + AppFooter shared with home).
 *
 * Plans 44-03 and 44-04 will add remaining sections
 * (Academy, Labs, Flywheel, Download, Forms, WhatsApp, SEO).
 */

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    "hero-app": "viewed_app_hero",
    modulos: "viewed_app_ecosystem",
    "modulo-arete": "viewed_app_arete",
    "modulo-el-templo": "viewed_app_el_templo",
  },
});
onUnmounted(() => cleanupTracking());
</script>

<template>
  <div class="app-landing">
    <AppLandingHero />
    <AppLandingEcosystem />
    <AppLandingModuleArete />
    <AppLandingModuleTemplo />
    <!-- Remaining sections added by plans 44-03 and 44-04 -->
  </div>
</template>
