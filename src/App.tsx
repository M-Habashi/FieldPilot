import { useEffect } from 'react';
import { ProjectApp } from './components/projects/ProjectApp';
import { LandingPage } from './components/marketing/LandingPage';
import { NotificationProvider } from './components/ui/notification-provider';
import { clearAppView } from './lib/app-view';
import { useHashRoute } from './hooks/useHashRoute';

export default function App() {
  const route = useHashRoute();
  const onLanding = route === '/';

  // Reaching the landing page ends the previous session's place in the app, so
  // signing in or entering from here starts on the project list rather than
  // dropping the user back inside a plan or the map.
  useEffect(() => {
    if (onLanding) clearAppView();
  }, [onLanding]);

  return (
    <NotificationProvider>
      {onLanding ? <LandingPage authenticated /> : <ProjectApp />}
    </NotificationProvider>
  );
}
