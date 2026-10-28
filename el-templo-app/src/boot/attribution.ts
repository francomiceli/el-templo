import { boot } from 'quasar/wrappers'
import { captureFirstTouch } from 'src/utils/attribution'
import { createLogger } from 'src/utils/logger'

const log = createLogger('attribution')

/**
 * Guarda el primer origen de la sesión (fase 195-07, D-18).
 *
 * Si el visitante llega desde la web con `?utm_*`/`fbclid`/... a una pantalla
 * que no es `/register` (p. ej. `/login`) y recién después se registra, la
 * query ya no está: este boot la guarda en sessionStorage al arrancar para que
 * `RegisterPage` la pueda mandar a la API. Best-effort: un error acá NUNCA
 * rompe el arranque de la app.
 */
export default boot(() => {
  try {
    const query = Object.fromEntries(new URLSearchParams(window.location.search))
    captureFirstTouch(query, document.referrer, window.sessionStorage, Date.now())
  } catch (err: unknown) {
    log.warn('No se pudo guardar el origen del visitante', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
