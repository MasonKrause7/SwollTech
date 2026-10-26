/**
 * SecureStore rejects values over about 2 KB, and a Supabase session is larger
 * than that. This splits a value across numbered keys and reassembles it.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain letters, numbers, ".", "-" and "_". */
export function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function createChunkedStorage(store: KeyValueStore, chunkSize = CHUNK_SIZE) {
  const countKey = (key: string) => `${safeKey(key)}.count`;
  const partKey = (key: string, index: number) => `${safeKey(key)}.${index}`;

  async function removeItem(key: string) {
    const count = Number((await store.getItem(countKey(key))) ?? "0");
    for (let index = 0; index < count; index += 1) await store.removeItem(partKey(key, index));
    await store.removeItem(countKey(key));
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const raw = await store.getItem(countKey(key));
      if (raw == null) return null;
      const count = Number(raw);
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await store.getItem(partKey(key, index));
        if (part == null) return null;
        parts.push(part);
      }
      return parts.join("");
    },
    async setItem(key: string, value: string) {
      await removeItem(key);
      const count = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let index = 0; index < count; index += 1) {
        await store.setItem(partKey(key, index), value.slice(index * chunkSize, (index + 1) * chunkSize));
      }
      await store.setItem(countKey(key), String(count));
    },
    removeItem,
  };
}
