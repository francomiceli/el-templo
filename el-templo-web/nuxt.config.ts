// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxt/content", "@nuxt/eslint"],

  ssr: true,

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

  devtools: { enabled: true },

  typescript: {
    strict: true,
  },
});
