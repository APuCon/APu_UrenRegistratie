import { useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

// Minimale router op basis van de History API (geen extra pakket nodig).
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
}
const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, replace = false) {
  if (to === snapshot()) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useLocation(): { path: string; search: URLSearchParams } {
  const s = useSyncExternalStore(subscribe, snapshot);
  const i = s.indexOf('?');
  return { path: i === -1 ? s : s.slice(0, i), search: new URLSearchParams(i === -1 ? '' : s.slice(i)) };
}

export function Link({ to, children, className, title }: { to: string; children: ReactNode; className?: string; title?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className} title={title}>
      {children}
    </a>
  );
}
