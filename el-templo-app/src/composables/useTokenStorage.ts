import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

// Phase 116 (D-03): dual-key storage with soft migration.
// - `accessToken` + `refreshToken` are the new keys.
// - `authToken` is the legacy single-key token (still valid up to 7d).
//   We READ it as the access token when no new `accessToken` exists, and we
//   DELETE it lazily (deferred cleanup) on the first successful refresh or
//   re-login (i.e. on `setTokens`), never eagerly at boot.
const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'
const LEGACY_KEY = 'authToken'

export function useTokenStorage() {
  const isNative = Capacitor.isNativePlatform()

  async function readKey(key: string): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key })
      return value
    }
    return localStorage.getItem(key)
  }

  async function writeKey(key: string, value: string): Promise<void> {
    if (isNative) {
      await Preferences.set({ key, value })
    } else {
      localStorage.setItem(key, value)
    }
  }

  async function deleteKey(key: string): Promise<void> {
    if (isNative) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  }

  // Access token: prefer the new key; fall back to the legacy authToken.
  async function getAccessToken(): Promise<string | null> {
    const access = await readKey(ACCESS_KEY)
    if (access) {
      return access
    }
    return readKey(LEGACY_KEY)
  }

  async function getRefreshToken(): Promise<string | null> {
    return readKey(REFRESH_KEY)
  }

  // Writes both new keys AND removes the legacy authToken (deferred cleanup, D-03).
  async function setTokens(access: string, refresh: string): Promise<void> {
    await writeKey(ACCESS_KEY, access)
    await writeKey(REFRESH_KEY, refresh)
    await deleteKey(LEGACY_KEY)
  }

  // Full cleanup on logout / failed refresh.
  async function clearTokens(): Promise<void> {
    await deleteKey(ACCESS_KEY)
    await deleteKey(REFRESH_KEY)
    await deleteKey(LEGACY_KEY)
  }

  // True when only the legacy token exists (no new access token present),
  // meaning there is no refresh token available for a silent refresh.
  async function hasLegacyOnly(): Promise<boolean> {
    const access = await readKey(ACCESS_KEY)
    if (access) {
      return false
    }
    const legacy = await readKey(LEGACY_KEY)
    return legacy !== null
  }

  // Backwards-compat aliases so existing consumers keep working until migrated.
  const getToken = getAccessToken
  const removeToken = clearTokens

  return {
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens,
    hasLegacyOnly,
    // backwards-compat
    getToken,
    removeToken,
  }
}
