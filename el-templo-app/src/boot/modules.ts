import { boot } from 'quasar/wrappers'
import { manifest as trainingManifest, registerModule as registerTraining } from 'src/modules/training'

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
  // Future modules added here:
  // academyManifest,
  // agoraManifest,
]

export default boot(({ router }) => {
  // Register all module routes
  registerTraining(router)

  // Future modules:
  // registerAcademy(router)
  // registerAgora(router)
})
