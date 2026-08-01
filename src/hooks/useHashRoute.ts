import { useEffect, useState } from 'react';

function readRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}

/**
 * Minimal hash-based routing for the pre-auth marketing pages.
 * Routes: `#/` landing, `#/login`, `#/signup`. Anything unknown
 * falls back to the landing page.
 */
export function useHashRoute(): string {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
