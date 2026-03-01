<script setup lang="ts">
/**
 * /gladius -- Gladius equipment showcase page.
 *
 * Composes all 5 Gladius sections in spec order:
 * Hero -> Philosophy -> Catalog -> InAction -> Contact
 * Plus floating WhatsApp button.
 *
 * Uses default layout (AppNav + AppPrefooter + AppFooter shared with home).
 * SEO meta tags for Gladius equipment keyword targeting.
 */

useHead({
  title: "Gladius \u2014 Equipamiento de Calistenia por El Templo",
  meta: [
    {
      name: "description",
      content:
        "Barras de calistenia y paralelas dise\u00F1adas en El Templo. Probadas en 8 sedes por +1000 alumnos. Consult\u00E1 disponibilidad.",
    },
    {
      property: "og:title",
      content: "Gladius \u2014 Equipamiento de Calistenia por El Templo",
    },
    {
      property: "og:description",
      content:
        "Barras de calistenia dise\u00F1adas en El Templo. Probadas en 8 sedes. Construidas para durar.",
    },
    { property: "og:url", content: "https://eltemplo.org/gladius" },
    { property: "og:type", content: "website" },
  ],
});
</script>

<template>
  <main>
    <GladHero />
    <GladPhilosophy />
    <GladCatalog />
    <GladInAction />
    <GladContact />
    <GladWhatsApp />
  </main>
</template>
