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
  link: [
    { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    {
      rel: "icon",
      type: "image/png",
      sizes: "192x192",
      href: "/favicon-192x192.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: "/favicon-32x32.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "16x16",
      href: "/favicon-16x16.png",
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon-180x180.png",
    },
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
      "https://www.instagram.com/eltemplomdp/",
      "https://www.youtube.com/@ElTemplomdp/",
      "https://www.facebook.com/eltemplomdp/",
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
