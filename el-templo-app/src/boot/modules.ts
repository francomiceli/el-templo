import { boot } from 'quasar/wrappers'

// Handle Vite chunk load failures (e.g., after deployment with cleared old chunks)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    // Reload page to get fresh chunks
    window.location.reload()
  })
}

export default boot(async ({ app, router }) => {
  // Module registration happens here
  // Training module will be imported and registered in Plan 02
  // Placeholder for now to establish boot file order

  // Future modules register like:
  // const { manifest, registerModule } = await import('src/modules/training')
  // registerModule(router)
})
