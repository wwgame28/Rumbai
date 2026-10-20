import { Collection } from './collection.ts';
import { openBackend, type Backend, type StoreName, STORES } from './db.ts';
import {
  auditSchema,
  automationRunSchema,
  automationStateSchema,
  conversationSchema,
  docSchema,
  excerptSchema,
  messageSchema,
  noteSchema,
  prefsSchema,
  taskSchema,
  type AuditEntry,
  type Prefs,
} from './types.ts';
import { newId } from './ids.ts';

export const tasks = new Collection('tasks', taskSchema);
export const notes = new Collection('notes', noteSchema);
export const conversations = new Collection('conversations', conversationSchema);
export const messages = new Collection('messages', messageSchema);
export const docs = new Collection('docs', docSchema);
export const excerpts = new Collection('excerpts', excerptSchema);
export const automations = new Collection('automations', automationStateSchema);
export const automationRuns = new Collection('automationRuns', automationRunSchema);
export const audit = new Collection('audit', auditSchema);

const collections = [tasks, notes, conversations, messages, docs, excerpts, automations, automationRuns, audit];

// ---------- Preferences (single record in the key-value store) ----------

type Listener = () => void;
let prefsValue: Prefs = prefsSchema.parse({});
const prefsListeners = new Set<Listener>();
let backendRef: Backend | null = null;

export const prefsStore = {
  subscribe(fn: Listener) {
    prefsListeners.add(fn);
    return () => prefsListeners.delete(fn);
  },
  getSnapshot: () => prefsValue,
  get: () => prefsValue,
  async update(patch: Partial<Prefs>) {
    const prev = prefsValue;
    prefsValue = prefsSchema.parse({ ...prefsValue, ...patch });
    prefsListeners.forEach((l) => l());
    try {
      await backendRef?.put('kv', prefsValue, 'prefs');
    } catch (err) {
      prefsValue = prev;
      prefsListeners.forEach((l) => l());
      throw err;
    }
  },
};

// ---------- Boot ----------

export interface StorageInfo {
  kind: Backend['kind'];
  error?: string;
}

let storageInfo: StorageInfo = { kind: 'memory' };
export const getStorageInfo = () => storageInfo;

export async function initStore(): Promise<StorageInfo> {
  const { backend, error } = await openBackend();
  backendRef = backend;
  storageInfo = { kind: backend.kind, error };
  const savedPrefs = await backend.get<unknown>('kv', 'prefs').catch(() => undefined);
  const parsed = prefsSchema.safeParse(savedPrefs ?? {});
  prefsValue = parsed.success ? parsed.data : prefsSchema.parse({});
  prefsListeners.forEach((l) => l());
  await Promise.all(collections.map((c) => c.load(backend)));
  return storageInfo;
}

// ---------- Audit trail ----------

const AUDIT_LIMIT = 500;

export async function logAudit(entry: Omit<AuditEntry, 'id' | 'at'>) {
  try {
    await audit.put({ ...entry, id: newId(), at: Date.now() });
    const all = audit.all();
    if (all.length > AUDIT_LIMIT) {
      const old = [...all].sort((a, b) => a.at - b.at).slice(0, all.length - AUDIT_LIMIT);
      await audit.remove(old.map((o) => o.id));
    }
  } catch {
    // The audit trail must never break the action it records.
  }
}

// ---------- Export / delete ----------

export async function exportAll() {
  const data: Record<string, unknown> = {
    app: 'RUMBAI',
    format: 1,
    exportedAt: new Date().toISOString(),
    prefs: prefsValue,
  };
  for (const c of collections) data[c.store] = c.all();
  return data;
}

export async function deleteAllData() {
  for (const c of collections) await c.clear();
  await backendRef?.clear('kv');
  prefsValue = prefsSchema.parse({});
  prefsListeners.forEach((l) => l());
}

export const storeNames: readonly StoreName[] = STORES;
