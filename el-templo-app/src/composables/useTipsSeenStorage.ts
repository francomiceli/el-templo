/**
 * useTipsSeenStorage
 *
 * SPEC "Empezá acá" C: sistema chico de "tips vistos" — persiste, por socio,
 * si ya vio un tip de primer uso (QR de check-in, bloques en Entrenar,
 * anticipación en Reservas). Mismo patrón dual-path que useTokenStorage /
 * useLevelSelectionStorage: Capacitor Preferences en nativo, localStorage en
 * web; clave por usuario (como useLevelSelectionStorage, SPEC D-06) para que
 * un dispositivo compartido no oculte el tip a un socio distinto.
 *
 * Storage best-effort: fallas se logean y se swallean (mismo criterio que
 * useLastLoginEmail/useLevelSelectionStorage) — un tip que no se puede
 * persistir no debe bloquear ni romper la UI, en el peor caso se vuelve a
 * mostrar.
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

const KEY_PREFIX = 'eltemplo.tipSeen:'
const log = createLogger('useTipsSeenStorage')

export function useTipsSeenStorage() {
  const isNative = Capacitor.isNativePlatform()
  const keyFor = (userId: number, tipId: string) => `${KEY_PREFIX}${userId}:${tipId}`

  async function hasSeen(userId: number, tipId: string): Promise<boolean> {
    try {
      if (isNative) {
        const { value } = await Preferences.get({ key: keyFor(userId, tipId) })
        return value === '1'
      }
      return localStorage.getItem(keyFor(userId, tipId)) === '1'
    } catch (err: unknown) {
      log.warn('hasSeen failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  async function markSeen(userId: number, tipId: string): Promise<void> {
    try {
      if (isNative) {
        await Preferences.set({ key: keyFor(userId, tipId), value: '1' })
        return
      }
      localStorage.setItem(keyFor(userId, tipId), '1')
    } catch (err: unknown) {
      log.warn('markSeen failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { hasSeen, markSeen }
}
