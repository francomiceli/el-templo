<script setup lang="ts">
/**
 * /franquicias — Franchise landing page.
 *
 * Composes all 8 franchise sections in spec order:
 * Hero -> ValueProps -> Models -> Includes -> Expansion -> Founder -> Video -> Form
 * Plus floating WhatsApp button.
 *
 * Uses default layout (AppNav + AppPrefooter + AppFooter shared with home).
 * SEO meta tags for franchise keyword targeting.
 */

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    "hero-franquicias": "viewed_fran_hero",
    "por-que-el-templo": "viewed_fran_value_props",
    "modelos-franquicia": "viewed_fran_models",
    expansion: "viewed_fran_expansion",
    fundador: "viewed_fran_founder",
    "formulario-franquicia": "viewed_fran_form",
  },
});
onUnmounted(() => cleanupTracking());

useHead({
  title: "Franquicia de Calistenia y Gimnasio Funcional | El Templo",
  meta: [
    {
      name: "description",
      content:
        "Abr\u00ED tu franquicia de calistenia y gimnasio funcional. M\u00E9todo propio, marca internacional, equipamiento Gladius. Inversi\u00F3n desde USD 50.000.",
    },
    {
      property: "og:title",
      content: "Franquicia de Calistenia y Gimnasio Funcional | El Templo",
    },
    {
      property: "og:description",
      content:
        "Franquicia premium de calistenia con m\u00E9todo propio y presencia internacional. Modelos de franquicia activa y pasiva desde USD 50.000.",
    },
    { property: "og:url", content: "https://eltemplo.org/franquicias" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
    {
      property: "og:image",
      content: "https://eltemplo.org/images/og-franquicias.jpg",
    },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org/franquicias" }],
});
</script>

<template>
  <main>
    <FranHero />
    <FranValueProps />
    <FranModels />
    <FranIncludes />
    <FranExpansion />
    <FranFounder />
    <FranVideo />
    <FranForm />
    <FranWhatsApp />
  </main>
</template>
