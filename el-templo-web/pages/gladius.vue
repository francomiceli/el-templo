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

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    "hero-gladius": "viewed_gladius_hero",
    "catalogo-gladius": "viewed_gladius_catalog",
    "contacto-gladius": "viewed_gladius_contact",
  },
});
onUnmounted(() => cleanupTracking());

useHead({
  title: "Gladius \u2014 Equipamiento Profesional de Calistenia | El Templo",
  meta: [
    {
      name: "description",
      content:
        "Barras de calistenia y paralelas dise\u00F1adas en El Templo. Probadas en 8 sedes por +1000 alumnos. Consult\u00E1 disponibilidad.",
    },
    {
      property: "og:title",
      content:
        "Gladius \u2014 Equipamiento Profesional de Calistenia | El Templo",
    },
    {
      property: "og:description",
      content:
        "Barras, paralelas y equipamiento de calistenia dise\u00F1ados en El Templo. Probados en 8 sedes por +1000 alumnos.",
    },
    { property: "og:url", content: "https://eltemplo.org/gladius" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
    {
      property: "og:image",
      content: "https://eltemplo.org/images/og-gladius.jpg",
    },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org/gladius" }],
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
