import { useSyncExternalStore } from 'react';
import { fetchHealth, type CloudHealth } from './cloud.ts';

let value: CloudHealth = { state: 'unknown' };
const listeners = new Set<() => void>();
let inflight: Promise<CloudHealth> | null = null;

export function refreshHealth(): Promise<CloudHealth> {
  inflight ??= fetchHealth().then((v) => {
    value = v;
    inflight = null;
    listeners.forEach((l) => l());
    return v;
  });
  return inflight;
}

export function useCloudHealth() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => value,
  );
}
