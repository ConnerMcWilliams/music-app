/**
 * In-memory mock of expo-secure-store for tests. The real module needs the
 * native keychain/keystore, which isn't present under Jest, so back it with a
 * plain object. Tests can reset it via `__reset()`.
 */
const store = new Map<string, string>();

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only helper to clear the fake keychain between tests. */
export function __reset(): void {
  store.clear();
}
