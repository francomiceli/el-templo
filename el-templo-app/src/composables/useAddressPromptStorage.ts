/**
 * useAddressPromptStorage
 *
 * Guarda, por socio y en el dispositivo, cuántas veces se mostró el pop-up de dirección y cuándo
 * fue la última (ver la cadencia en utils/member-address.ts). Mismo patrón dual-path que
 * useTipsSeenStorage: Capacitor Preferences en nativo, localStorage en web; clave por usuario
 * para que un dispositivo compartido no mezcle socios.
 *
 * Best-effort: si leer falla, se trata como "ya se mostró todas las veces" (ante la duda, no
 * insistir); si guardar falla, se loguea y sigue. Reinstalar la app o cambiar de teléfono arranca
 * de cero: aceptado (2026-11-05) para no sumar una migración.
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'
import {
  ADDRESS_PROMPT_MAX_SHOWS,
  parseAddressPromptState,
  type AddressPromptState,
} from 'src/utils/member-address'

const KEY_PREFIX = 'eltemplo.addressPrompt:'
const log = createLogger('useAddressPromptStorage')

export function useAddressPromptStorage() {
  const isNative = Capacitor.isNativePlatform()
  const keyFor = (userId: number) => `${KEY_PREFIX}${userId}`

  async function read(userId: number): Promise<AddressPromptState | null> {
    try {
      const raw = isNative
        ? (await Preferences.get({ key: keyFor(userId) })).value
        : localStorage.getItem(keyFor(userId))
      return parseAddressPromptState(raw)
    } catch (err: unknown) {
      log.warn('read failed', { err: err instanceof Error ? err.message : String(err) })
      return { shows: ADDRESS_PROMPT_MAX_SHOWS, lastShownAt: '' }
    }
  }

  async function write(userId: number, state: AddressPromptState): Promise<void> {
    const value = JSON.stringify(state)
    try {
      if (isNative) {
        await Preferences.set({ key: keyFor(userId), value })
        return
      }
      localStorage.setItem(keyFor(userId), value)
    } catch (err: unknown) {
      log.warn('write failed', { err: err instanceof Error ? err.message : String(err) })
    }
  }

  return { read, write }
}
