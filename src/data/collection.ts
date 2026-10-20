import type { z } from 'zod';
import { describeStorageError, type Backend, type StoreName } from './db.ts';

type Listener = () => void;

/**
 * An in-memory mirror of one object store. Writes update the UI immediately
 * and roll back if persistence fails, so the screen never shows data that
 * was not saved without saying so.
 */
export class Collection<T extends { id: string }> {
  private items: T[] = [];
  private listeners = new Set<Listener>();
  private backend: Backend | null = null;
  loaded = false;
  readonly store: StoreName;
  private readonly schema: z.ZodType<T>;

  constructor(store: StoreName, schema: z.ZodType<T>) {
    this.store = store;
    this.schema = schema;
  }

  async load(backend: Backend) {
    this.backend = backend;
    const raw = await backend.getAll<unknown>(this.store);
    // Rows that fail validation (e.g. corrupted or from an unknown version) are kept out of the UI but not deleted.
    this.items = raw.flatMap((r) => {
      const parsed = this.schema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
    this.loaded = true;
    this.emit();
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.items;

  get(id: string) {
    return this.items.find((i) => i.id === id);
  }

  all() {
    return this.items;
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private requireBackend() {
    if (!this.backend) throw new Error('Хранилище ещё не открыто');
    return this.backend;
  }

  /** Validates, shows immediately, persists; reverts and rethrows a readable error on failure. */
  async put(value: T): Promise<T> {
    const item = this.schema.parse(value);
    const prev = this.items;
    const idx = prev.findIndex((i) => i.id === item.id);
    this.items = idx === -1 ? [...prev, item] : prev.map((i, n) => (n === idx ? item : i));
    this.emit();
    try {
      await this.requireBackend().put(this.store, item);
      return item;
    } catch (err) {
      this.items = prev;
      this.emit();
      throw new Error(describeStorageError(err), { cause: err });
    }
  }

  async putMany(values: T[]) {
    if (!values.length) return;
    const parsed = values.map((v) => this.schema.parse(v));
    const prev = this.items;
    const byId = new Map(prev.map((i) => [i.id, i]));
    for (const p of parsed) byId.set(p.id, p);
    this.items = [...byId.values()];
    this.emit();
    try {
      await this.requireBackend().putMany(this.store, parsed);
    } catch (err) {
      this.items = prev;
      this.emit();
      throw new Error(describeStorageError(err), { cause: err });
    }
  }

  async remove(ids: string | string[]) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return;
    const prev = this.items;
    const set = new Set(list);
    this.items = prev.filter((i) => !set.has(i.id));
    this.emit();
    try {
      await this.requireBackend().deleteMany(this.store, list);
    } catch (err) {
      this.items = prev;
      this.emit();
      throw new Error(describeStorageError(err), { cause: err });
    }
  }

  async clear() {
    await this.requireBackend().clear(this.store);
    this.items = [];
    this.emit();
  }
}
