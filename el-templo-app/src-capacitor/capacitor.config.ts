import type { CapacitorConfig } from '@capacitor/cli'

const isStaging = process.env.STAGING === 'true'

const config: CapacitorConfig = {
  appId: isStaging ? 'com.eltemplo.app.staging' : 'com.eltemplo.app',
  appName: isStaging ? 'El Templo (Staging)' : 'El Templo',
  webDir: 'www',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
