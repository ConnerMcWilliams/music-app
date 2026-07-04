/**
 * Secure persistence for the JWT credential pair.
 *
 * On native (iOS/Android) tokens live in the OS keychain/keystore via
 * `expo-secure-store` — explicitly NOT AsyncStorage, which is unencrypted.
 * On web, where SecureStore has no implementation, we fall back to
 * `localStorage` (the browser has no keychain; this at least scopes tokens to
 * the origin). The backend remains the source of truth either way.
 *
 * Only the tokens are stored here. Cached non-sensitive profile data, if any,
 * belongs in a separate store.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenPair } from './types';

const ACCESS_KEY = 'cc.auth.access';
const REFRESH_KEY = 'cc.auth.refresh';

const isWeb = Platform.OS === 'web';

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const tokenStore = {
  async save(tokens: TokenPair): Promise<void> {
    await Promise.all([
      setItem(ACCESS_KEY, tokens.access),
      setItem(REFRESH_KEY, tokens.refresh),
    ]);
  },

  async getAccess(): Promise<string | null> {
    return getItem(ACCESS_KEY);
  },

  async getRefresh(): Promise<string | null> {
    return getItem(REFRESH_KEY);
  },

  async clear(): Promise<void> {
    await Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY)]);
  },
};
