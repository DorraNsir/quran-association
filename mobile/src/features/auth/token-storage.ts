import * as SecureStore from 'expo-secure-store';

/**
 * The refresh token's only home: the OS keystore (iOS Keychain, Android
 * Keystore-backed storage). Never AsyncStorage, never logs.
 *
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable after the first unlock since
 * boot (session restore works when the app is opened), excluded from
 * iCloud Keychain sync and from migration to another device.
 */
const KEY = 'qa.refresh.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface TokenStorage {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export const secureTokenStorage: TokenStorage = {
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};
