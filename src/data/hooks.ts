import { useSyncExternalStore } from 'react';
import type { Collection } from './collection.ts';
import { prefsStore } from './store.ts';

export function useCollection<T extends { id: string }>(c: Collection<T>): T[] {
  return useSyncExternalStore(c.subscribe, c.getSnapshot);
}

export function usePrefs() {
  return useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot);
}
