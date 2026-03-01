// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    "@nuxt/content",
    "@nuxt/eslint",
    "nuxt-schema-org",
    "@nuxt/image",
    "@nuxtjs/sitemap",
  ],

  ssr: true,

  css: [
    "~/assets/css/fonts.css",
    "~/assets/css/tokens.css",
    "~/assets/css/base.css",
    "~/assets/css/buttons.css",
    "~/assets/css/layout.css",
    "~/assets/css/leaflet.css",
  ],

  site: {
    url: "https://eltemplo.org",
    name: "El Templo",
  },

  schemaOrg: {
    identity: "Organization",
  },

  sitemap: {
    sources: ["/api/__sitemap__/blog"],
  },

  nitro: {
    preset: "static",
    prerender: {
      failOnError: false,
      ignore: ["/app", "/academy", "/aura-club"],
    },
  },

  runtimeConfig: {
    public: {
      apiUrl: "http://localhost:3000",
      sentryDsn: "",
      appEnvironment: "",
      ga4Id: "",
      metaPixelId: "",
    },
  },

  compatibilityDate: "2026-02-28",

  devServer: {
    port: 9200,
  },

  devtools: { enabled: true },

  typescript: {
    strict: true,
  },
});
