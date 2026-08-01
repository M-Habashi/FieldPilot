import { useHashRoute } from '../../hooks/useHashRoute';
import { AuthPage, GOOGLE_AUTH_CALLBACK_ROUTE } from './AuthPage';
import { LandingPage } from './LandingPage';

const GOOGLE_CALLBACK_ERROR = 'Google sign-in did not finish. Please try again.';

/**
 * Pre-auth shell: landing page plus the login/signup screens, switched by
 * hash route (`#/`, `#/login`, `#/signup`, `#/auth/callback`). Shown only while
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
      ) : route === GOOGLE_AUTH_CALLBACK_ROUTE ? (
        <AuthPage mode="login" initialError={GOOGLE_CALLBACK_ERROR} />
      ) : (
        <LandingPage />
      )}
    </div>
  );
}
