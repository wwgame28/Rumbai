import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';

export const DB_NAME = 'rumbai';
export const DB_VERSION = 1;

export const STORES = [
  'tasks',
  'notes',
  'conversations',
  'messages',
  'docs',
  'excerpts',
  'automations',
  'automationRuns',
  'audit',
  'kv',
] as const;
export type StoreName = (typeof STORES)[number];

type UpgradeTx = IDBPTransaction<unknown, StoreName[], 'versionchange'>;

/**
 * Ordered migrations. Never edit a shipped step — add a new one and bump
 * DB_VERSION, so existing users' data is carried forward.
 */
const MIGRATIONS: Record<number, (db: IDBPDatabase, tx: UpgradeTx) => void> = {
  1: (db) => {
    for (const name of ['tasks', 'notes', 'conversations', 'docs', 'excerpts', 'automations', 'audit'] as const) {
      db.createObjectStore(name, { keyPath: 'id' });
    }
    const messages = db.createObjectStore('messages', { keyPath: 'id' });
    messages.createIndex('byConversation', 'conversationId');
    const runs = db.createObjectStore('automationRuns', { keyPath: 'id' });
    runs.createIndex('byAutomation', 'automationId');
    db.createObjectStore('kv');
  },
};

export interface Backend {
  readonly kind: 'indexeddb' | 'memory';
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, value: unknown, key?: string): Promise<void>;
  putMany(store: StoreName, values: unknown[]): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  deleteMany(store: StoreName, keys: string[]): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

class IdbBackend implements Backend {
  readonly kind = 'indexeddb' as const;
  private readonly db: IDBPDatabase;
  constructor(db: IDBPDatabase) {
    this.db = db;
  }
  getAll<T>(store: StoreName) {
    return this.db.getAll(store) as Promise<T[]>;
  }
  get<T>(store: StoreName, key: string) {
    return this.db.get(store, key) as Promise<T | undefined>;
  }
  // Writes resolve only when the transaction commits, not when the request succeeds,
  // so a reload right after saving cannot lose the change.
  async put(store: StoreName, value: unknown, key?: string) {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([tx.store.put(value, key), tx.done]);
  }
  async putMany(store: StoreName, values: unknown[]) {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([...values.map((v) => tx.store.put(v)), tx.done]);
  }
  async delete(store: StoreName, key: string) {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([tx.store.delete(key), tx.done]);
  }
  async deleteMany(store: StoreName, keys: string[]) {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
  }
  async clear(store: StoreName) {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([tx.store.clear(), tx.done]);
  }
}

/** Used when IndexedDB is unavailable (some private modes, blocked storage). Nothing survives a reload. */
export class MemoryBackend implements Backend {
  readonly kind = 'memory' as const;
  private data = new Map<StoreName, Map<string, unknown>>();
  private map(store: StoreName) {
    let m = this.data.get(store);
    if (!m) this.data.set(store, (m = new Map()));
    return m;
  }
  async getAll<T>(store: StoreName) {
    return [...this.map(store).values()].map((v) => structuredClone(v)) as T[];
  }
  async get<T>(store: StoreName, key: string) {
    const v = this.map(store).get(key);
    return (v === undefined ? undefined : structuredClone(v)) as T | undefined;
  }
  async put(store: StoreName, value: unknown, key?: string) {
    this.map(store).set(key ?? (value as { id: string }).id, structuredClone(value));
  }
  async putMany(store: StoreName, values: unknown[]) {
    for (const v of values) await this.put(store, v);
  }
  async delete(store: StoreName, key: string) {
    this.map(store).delete(key);
  }
  async deleteMany(store: StoreName, keys: string[]) {
    for (const k of keys) this.map(store).delete(k);
  }
  async clear(store: StoreName) {
    this.map(store).clear();
  }
}

export async function openBackend(): Promise<{ backend: Backend; error?: string }> {
  if (typeof indexedDB === 'undefined') return { backend: new MemoryBackend(), error: 'IndexedDB недоступен в этом браузере.' };
  try {
    const db = await withTimeout(
      openDB(DB_NAME, DB_VERSION, {
        upgrade(database, oldVersion, newVersion, tx) {
          for (let v = oldVersion + 1; v <= (newVersion ?? DB_VERSION); v++) MIGRATIONS[v]?.(database, tx as unknown as UpgradeTx);
        },
        blocking() {
          // Another tab wants a newer schema: release our connection so it can upgrade.
          db.close();
        },
      }),
      8000,
    );
    return { backend: new IdbBackend(db) };
  } catch (err) {
    return { backend: new MemoryBackend(), error: `Не удалось открыть IndexedDB: ${(err as Error).message}` };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('превышено время ожидания')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

export function describeStorageError(err: unknown): string {
  if (isQuotaError(err)) return 'Закончилось место в хранилище браузера. Удалите ненужные файлы или кэш модели.';
  return `Не удалось сохранить: ${(err as Error)?.message ?? 'неизвестная ошибка'}`;
}
