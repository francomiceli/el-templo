<script setup lang="ts">
/**
 * Root app component — global head and Organization schema.
 *
 * Sets lang="es", default Twitter Card meta, and Organization
 * structured data (JSON-LD) inherited by all pages.
 */

useHead({
  htmlAttrs: { lang: "es" },
  meta: [
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@eltemplo" },
  ],
});

useSchemaOrg([
  defineOrganization({
    name: "El Templo",
    url: "https://eltemplo.org",
    logo: "https://eltemplo.org/images/logo-eltemplo.svg",
    description:
      "Escuela de movimiento y calistenia. M\u00E9todo propio, 6 niveles de entrenamiento con peso corporal, 8 sedes en Argentina y Espa\u00F1a.",
    sameAs: [
      // Placeholder — real social URLs added in Phase 38
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+54-9-223-582-0521",
      contactType: "customer service",
      availableLanguage: "Spanish",
    },
  }),
]);
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
