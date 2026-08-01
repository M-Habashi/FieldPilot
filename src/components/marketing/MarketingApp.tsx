import { useHashRoute } from '../../hooks/useHashRoute';
import { AuthPage } from './AuthPage';
import { LandingPage } from './LandingPage';

/**
 * Pre-auth shell: landing page plus the login/signup screens, switched by
 * hash route (`#/`, `#/login`, `#/signup`). Shown only while
 * `Unauthenticated`; the signed-in app never renders this tree.
 */
export function MarketingApp() {
  const route = useHashRoute();

  return (
    <div key={route} className="mkt-page-in h-full">
      {route === '/login' ? (
        <AuthPage mode="login" />
      ) : route === '/signup' ? (
        <AuthPage mode="signup" />
      ) : (
        <LandingPage />
      )}
    </div>
  );
}
