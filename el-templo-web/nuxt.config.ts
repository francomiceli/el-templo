// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxt/content", "@nuxt/eslint"],

  ssr: true,

  css: [
    "~/assets/css/tokens.css",
    "~/assets/css/base.css",
    "~/assets/css/buttons.css",
    "~/assets/css/layout.css",
  ],

  app: {
    head: {
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;600;700;800&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Geologica:wght@400;500;600&display=swap",
        },
      ],
    },
  },

  nitro: {
    preset: "static",
  },

  runtimeConfig: {
    public: {
      apiUrl: "",
      sentryDsn: "",
      appEnvironment: "",
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
