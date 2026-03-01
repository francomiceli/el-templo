import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Nuxt uses single-word file names for pages/layouts by convention
    'vue/multi-word-component-names': 'off',
  },
})
