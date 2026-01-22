import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'authToken';

export function useTokenStorage() {
  const isNative = Capacitor.isNativePlatform();

  async function getToken(): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      return value;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  async function setToken(token: string): Promise<void> {
    if (isNative) {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  async function removeToken(): Promise<void> {
    if (isNative) {
      await Preferences.remove({ key: TOKEN_KEY });
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  return { getToken, setToken, removeToken };
}
