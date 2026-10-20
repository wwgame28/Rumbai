import { useSyncExternalStore } from 'react';

export const routes = ['home', 'assistant', 'tasks', 'notes', 'knowledge', 'files', 'automations', 'settings', 'models'] as const;
export type Route = (typeof routes)[number];

function parse(): { route: Route; param: string | null } {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  const route = (routes as readonly string[]).includes(name ?? '') ? (name as Route) : 'home';
  return { route, param: param ? decodeURIComponent(param) : null };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function navigate(route: Route, param?: string) {
  const hash = `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (location.hash !== hash) location.hash = hash;
}
