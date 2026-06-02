import { boot } from 'quasar/wrappers'

/**
 * Staging environment marker.
 *
 * When the member app is built for staging (VITE_APP_ENVIRONMENT=staging, set
 * by the deploy-staging.yml app build — production leaves it unset), tag the
 * body so the staging CSS in app.scss paints the desktop rail and header
 * greeting blue. Makes it unmistakable that you're on the non-production build
 * (mirrors el-templo-admin's staging-marker boot).
 */
export default boot(() => {
  if (import.meta.env.VITE_APP_ENVIRONMENT === 'staging') {
    document.body.classList.add('staging-env')
  }
})
