/**
 * Bağımlılıksız mini yönlendirici. Sadece iki ekran var: `/` ve `/r/:code`.
 * Bir router kütüphanesi eklemek paket boyutunu gereksiz büyütür.
 */
import { useSyncExternalStore } from 'react';
import { normalizeRoomCode } from '@shared/validation';

export type Route = { name: 'home' } | { name: 'room'; code: string } | { name: 'dev' };

function parse(pathname: string): Route {
  if (import.meta.env.DEV && pathname === '/dev/ui') return { name: 'dev' };
  const m = /^\/r\/([^/]+)\/?$/.exec(pathname);
  const code = m ? normalizeRoomCode(m[1]) : null;
  return code ? { name: 'room', code } : { name: 'home' };
}

let current: Route = parse(location.pathname);
const listeners = new Set<() => void>();

function emit() {
  current = parse(location.pathname);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('popstate', emit);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', emit);
  };
}

export function navigate(to: Route, replace = false) {
  const path = to.name === 'room' ? `/r/${to.code}` : to.name === 'dev' ? '/dev/ui' : '/';
  if (path === location.pathname) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  emit();
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}
