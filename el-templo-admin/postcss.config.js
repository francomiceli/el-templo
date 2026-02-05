// https://github.com/michael-ciniawsky/postcss-load-config

import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    // https://github.com/postcss/autoprefixer
    autoprefixer({
      overrideBrowserslist: [
        'last 4 Chrome versions',
        'last 4 Firefox versions',
        'last 4 Edge versions',
        'last 4 Safari versions',
      ],
    }),
  ],
}
