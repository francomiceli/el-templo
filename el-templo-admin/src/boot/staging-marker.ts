import { boot } from 'quasar/wrappers';

/**
 * Staging environment marker.
 *
 * When the admin is built for staging (VITE_APP_ENVIRONMENT=staging, set by
 * the deploy-staging.yml admin build — production leaves it unset), tag the
 * body so the staging CSS in app.scss recolors the brand primary to blue-9,
 * and rename the browser tab. Makes it unmistakable that you're operating on
 * a non-production environment.
 */
export default boot(() => {
  if (import.meta.env.VITE_APP_ENVIRONMENT === 'staging') {
    document.body.classList.add('staging-env');
    document.title = 'Pruebas El Templo Admin';
  }
});
