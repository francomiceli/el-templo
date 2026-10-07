// https://nuxt.com/docs/api/configuration/nuxt-config
import { prerenderRoutes } from "./data/prerender-routes";
import type { WebData } from "./data/web-data.types";

// Fuente unica de sedes/blog (fase 195): la escribe scripts/fetch-web-data.mjs.
// Import dinamico (sin node:fs: el typecheck de la web no trae @types/node).
const webData = await import("./data/generated/web-data.json")
  .then((m) => m.default as unknown as WebData)
  .catch(() => {
    throw new Error(
      "Falta data/generated/web-data.json: corré pnpm prepare-data",
    );
  });

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

  // JSON-LD propio (utils/schema-graph.ts): el modulo queda apagado para que no colapse todo en un solo nodo.
  schemaOrg: {
    enabled: false,
  },

  sitemap: {
    sources: ["/api/__sitemap__/blog"],
  },

  routeRules: {
    "/curso-entrenadores": {
      redirect: { to: "/academy", statusCode: 301 },
    },
    "/qr/bcn": {
      redirect: {
        to: "https://app.eltemplo.org/register?promo=TEMPLOPASSBCN",
        statusCode: 302,
      },
    },
    "/qr/aura-club": {
      redirect: {
        to: "https://app.eltemplo.org/register?promo=AURACLUB1",
        statusCode: 302,
      },
    },
  },

  nitro: {
    preset: "static",
    prerender: {
      failOnError: false,
      ignore: ["/aura-club"],
      routes: prerenderRoutes(webData),
    },
  },

  runtimeConfig: {
    public: {
      apiUrl: "http://localhost:3000/api",
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
