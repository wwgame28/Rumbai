import { useSyncExternalStore } from 'react';
import { localEngine } from './local.ts';

export function useLocalStatus() {
  return useSyncExternalStore(localEngine.subscribe, localEngine.getSnapshot);
}
