<script setup lang="ts">
/**
 * Root app component — global head.
 *
 * Sets lang="es-AR" (las paginas bajo /es lo pisan con es-ES), default
 * Twitter Card meta, el Smart App Banner de iOS, favicons y, solo en staging,
 * `robots: noindex, nofollow`. El JSON-LD lo emite
 * cada pagina con utils/schema-graph.ts (nunca desde aca).
 */

// Staging nunca se indexa (decision de Franco 2026-10-07: sin cambios en nginx).
// Prod no define NUXT_PUBLIC_APP_ENVIRONMENT: ahi no sale ningun meta robots.
const isStaging = useRuntimeConfig().public.appEnvironment === "staging";

useHead({
  htmlAttrs: { lang: "es-AR" },
  meta: [
    ...(isStaging
      ? [{ name: "robots", content: "noindex, nofollow" }]
      : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@eltemplomdp" },
    // Smart App Banner (solo Safari iOS): id de la app en el App Store.
    { name: "apple-itunes-app", content: "app-id=6761773726" },
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
