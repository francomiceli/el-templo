import { copyToClipboard } from 'quasar'
import { createLogger } from 'src/utils/logger'

const log = createLogger('clipboard')

/**
 * Copia `text` al portapapeles. Devuelve `true` si lo logró.
 *
 * El WebView de Android niega `navigator.clipboard.writeText` (Write permission
 * denied) y copyToClipboard de Quasar no tiene fallback propio en ese caso:
 * se cae a `document.execCommand('copy')` con un textarea temporal.
 */
export async function copyWithFallback(text: string): Promise<boolean> {
  try {
    await copyToClipboard(text)
    return true
  } catch (copyErr: unknown) {
    log.warn('clipboard API failed → fallback execCommand', {
      err: copyErr instanceof Error ? copyErr.message : String(copyErr),
    })
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (execErr: unknown) {
    log.error('clipboard fallback failed', {
      err: execErr instanceof Error ? execErr.message : String(execErr),
    })
    return false
  }
}
