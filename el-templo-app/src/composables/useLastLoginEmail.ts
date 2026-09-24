/**
 * useLastLoginEmail
 *
 * "Recordar email" (App 1.7.9, punto 2 de la spec — NUNCA la contraseña: esa
 * la maneja el gestor de contraseñas del sistema vía los `autocomplete` de
 * LoginPage.vue). Guarda el email del último login exitoso para prellenar el
 * campo al volver a abrir el login. Mismo patrón dual-path que
 * useTokenStorage/useLevelSelectionStorage: Capacitor Preferences en nativo,
 * localStorage en web. Deliberadamente NO se borra en logout — ese es el
 * punto: recordar quién fue el último socio en loguearse en este dispositivo.
 *
 * Storage best-effort: fallas se logean y se swallean (T-99-09), nunca
 * bloquean el login.
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

const KEY = 'lastLoginEmail'
const log = createLogger('useLastLoginEmail')

export function useLastLoginEmail() {
  const isNative = Capacitor.isNativePlatform()

  async function get(): Promise<string | null> {
    try {
      if (isNative) {
        const { value } = await Preferences.get({ key: KEY })
        return value ?? null
      }
      return localStorage.getItem(KEY)
    } catch (err: unknown) {
      log.warn('get failed', { err: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  async function set(email: string): Promise<void> {
    try {
      if (isNative) {
        await Preferences.set({ key: KEY, value: email })
        return
      }
      localStorage.setItem(KEY, email)
    } catch (err: unknown) {
      log.warn('set failed', { err: err instanceof Error ? err.message : String(err) })
    }
  }

  return { get, set }
}
