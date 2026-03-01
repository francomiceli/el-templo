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

useHead({
  title: "Franquicias El Templo Calistenia \u2014 Abr\u00ED tu Templo",
  meta: [
    {
      name: "description",
      content:
        "Franquicia de calistenia premium. M\u00E9todo propio, marca internacional, equipamiento Gladius. Inversi\u00F3n desde USD 50.000. Aplic\u00E1 ahora.",
    },
    {
      property: "og:title",
      content: "Franquicias El Templo \u2014 Abr\u00ED tu Templo",
    },
    {
      property: "og:description",
      content:
        "La franquicia de calistenia con m\u00E9todo propio y presencia internacional. Modelos activos y pasivos.",
    },
    { property: "og:url", content: "https://eltemplo.org/franquicias" },
    { property: "og:type", content: "website" },
  ],
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
