import type { CapacitorConfig } from '@capacitor/cli'

const isStaging = process.env.STAGING === 'true'

const config: CapacitorConfig = {
  appId: isStaging ? 'com.eltemplo.app.staging' : 'com.eltemplo.app',
  appName: isStaging ? 'El Templo (Staging)' : 'El Templo',
  webDir: 'www',
  // Fondo del WebView mientras la app arranca (antes de que Quasar monte): crema
  // de la marca (`$brand-cream`) en vez del blanco/negro por defecto, que el
  // socio leía como "la app quedó en blanco".
  backgroundColor: '#f2ede5',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
