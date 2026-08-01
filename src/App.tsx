import { ProjectApp } from './components/projects/ProjectApp';
import { NotificationProvider } from './components/ui/notification-provider';

export default function App() {
  return (
    <NotificationProvider>
      <ProjectApp />
    </NotificationProvider>
  );
}
