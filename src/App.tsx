import { ProjectApp } from './components/projects/ProjectApp';
import { LandingPage } from './components/marketing/LandingPage';
import { NotificationProvider } from './components/ui/notification-provider';
import { useHashRoute } from './hooks/useHashRoute';

export default function App() {
  const route = useHashRoute();

  return (
    <NotificationProvider>
      {route === '/' ? <LandingPage authenticated /> : <ProjectApp />}
    </NotificationProvider>
  );
}
