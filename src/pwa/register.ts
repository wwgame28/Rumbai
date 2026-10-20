import { useSyncExternalStore } from 'react';

export interface SwState {
  supported: boolean;
  /** The current page is served/controlled by the service worker (app shell cached for offline). */
  controlled: boolean;
  updateReady: boolean;
  error?: string;
}

let state: SwState = { supported: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller), updateReady: false };
const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;

function set(patch: Partial<SwState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function registerServiceWorker() {
  if (!state.supported || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (state.updateReady) location.reload();
    set({ controlled: true });
  });
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      const track = (sw: ServiceWorker | null) => {
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            set({ updateReady: true });
          }
          if (sw.state === 'activated') set({ controlled: Boolean(navigator.serviceWorker.controller) });
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        set({ updateReady: true });
      }
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for a new version when the app returns to the foreground.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    })
    .catch((err: Error) => set({ error: err.message }));
}

export function applyUpdate() {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function useSwState() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
