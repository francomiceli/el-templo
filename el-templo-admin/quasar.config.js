// Configuration for El Templo Admin app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { existsSync, realpathSync } from 'node:fs';
import { defineConfig } from '#q-app/wrappers';

// En un worktree, node_modules suele ser un symlink a otro checkout: sin esto Vite responde 403
// a todo lo que vive afuera del proyecto (p. ej. la fuente de los íconos) y se ven sus nombres.
const nodeModulesReal = existsSync('node_modules') ? [realpathSync('node_modules')] : [];

export default defineConfig((/* ctx */) => {
  return {
    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['sentry', 'axios', 'pinia', 'staging-marker'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: ['material-icons'],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      // Web-only admin app uses history mode (not hash)
      vueRouterMode: 'history',

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // Admin app runs on port 9100 (member app uses 9000)
      port: 9100,
      open: true,
      fs: { allow: ['.', ...nodeModulesReal] },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // Quasar plugins
      plugins: ['Notify', 'Dialog'],
    },

    animations: [],
  };
});
