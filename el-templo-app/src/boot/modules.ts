import { boot } from 'quasar/wrappers'
import {
  manifest as trainingManifest,
  registerModule as registerTraining,
} from 'src/modules/training'
import {
  manifest as progressionManifest,
  registerModule as registerProgression,
} from 'src/modules/progression'
import {
  manifest as personalizadaManifest,
  registerModule as registerPersonalizada,
} from 'src/modules/personalizada'
import { manifest as planManifest, registerModule as registerPlan } from 'src/modules/plan'
import { registerModule as registerOnboarding } from 'src/modules/onboarding'

// Handle Vite chunk load failures (e.g., after deployment with cleared old chunks)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    // Reload page to get fresh chunks
    window.location.reload()
  })
}

// Export manifests for MainLayout navigation
export const modules = [
  trainingManifest,
  progressionManifest,
  personalizadaManifest,
  planManifest,
  // Future modules added here:
  // academyManifest,
  // agoraManifest,
]

export default boot(({ router }) => {
  // Register all module routes
  registerTraining(router)
  registerProgression(router)
  registerPersonalizada(router)
  registerPlan(router)
  registerOnboarding(router)

  // Future modules:
  // registerAcademy(router)
  // registerAgora(router)
})
