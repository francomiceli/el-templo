<script setup lang="ts">
/**
 * Root app component — global head.
 *
 * Sets lang="es", default Twitter Card meta and favicons. El JSON-LD lo emite
 * cada pagina con utils/schema-graph.ts (nunca desde aca).
 */

useHead({
  htmlAttrs: { lang: "es" },
  meta: [
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@eltemplomdp" },
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
      href: "/apple-touch-icon.png",
    },
  ],
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
