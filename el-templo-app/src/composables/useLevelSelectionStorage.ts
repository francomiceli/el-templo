/**
 * useLevelSelectionStorage
 *
 * Dual-path persistence wrapper for the member's selected training level.
 * Mirrors the shape of useTokenStorage (Capacitor Preferences on native,
 * localStorage on web). User-id-scoped key prevents leakage across accounts
 * on shared devices (SPEC D-06).
 *
 * All storage operations are wrapped in try/catch; failures are logged via
 * createLogger and swallowed (no user-visible crash — T-99-09).
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

const KEY_PREFIX = 'eltemplo.selectedLevel:'
const log = createLogger('level-storage')

export function useLevelSelectionStorage() {
  const isNative = Capacitor.isNativePlatform()
  const keyFor = (userId: number) => `${KEY_PREFIX}${userId}`

  async function get(userId: number): Promise<string | null> {
    try {
      if (isNative) {
        const { value } = await Preferences.get({ key: keyFor(userId) })
        return value ?? null
      }
      return localStorage.getItem(keyFor(userId))
    } catch (err: unknown) {
      log.warn('get failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  async function set(userId: number, value: string): Promise<void> {
    try {
      if (isNative) {
        await Preferences.set({ key: keyFor(userId), value })
        return
      }
      localStorage.setItem(keyFor(userId), value)
    } catch (err: unknown) {
      log.warn('set failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function remove(userId: number): Promise<void> {
    try {
      if (isNative) {
        await Preferences.remove({ key: keyFor(userId) })
        return
      }
      localStorage.removeItem(keyFor(userId))
    } catch (err: unknown) {
      log.warn('remove failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { get, set, remove }
}
