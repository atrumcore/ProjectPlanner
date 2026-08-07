import { useEffect } from 'react';
import './App.css';
import GanttChart from './components/GanttChart';
import ErrorBoundary from './components/ErrorBoundary';
import LauncherScreen from './components/launcher/LauncherScreen';
import { useGanttStore } from './store/useGanttStore';
import { useAuthStore } from './auth/useAuthStore';
import { useTheme } from './theme/ThemeContext';

function App() {
  const isDirty = useGanttStore(s => s.isDirty);
  const currentFileName = useGanttStore(s => s.currentFileName);
  const appView = useGanttStore(s => s.appView);
  const signedIn = useAuthStore(s => s.account !== null);
  const { theme } = useTheme();
  const syncBuiltinPhaseColorsToTheme = useGanttStore(s => s.syncBuiltinPhaseColorsToTheme);

  // Keep theme-managed built-in phase colours in step with the active theme,
  // so switching Dark/Light recolours those bars live (custom types untouched).
  useEffect(() => {
    syncBuiltinPhaseColorsToTheme(theme);
  }, [theme, syncBuiltinPhaseColorsToTheme]);

  // Warn before closing/refreshing when there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Both forms for cross-browser compatibility.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Reflect the current view in the browser tab title: the Home screen says
  // Home; the plan view shows file name + dirty dot.
  const onLauncher = signedIn && appView === 'launcher';
  useEffect(() => {
    if (onLauncher) {
      document.title = 'Home \u2014 BBD Project Planner';
      return;
    }
    const name = currentFileName || 'Untitled';
    document.title = `${isDirty ? '\u2022 ' : ''}${name} \u2014 BBD Project Planner`;
  }, [currentFileName, isDirty, onLauncher]);

  // The launcher only exists for signed-in users; signed out, the app opens
  // straight into the plan exactly as it always has.
  return (
    <ErrorBoundary>
      {onLauncher ? <LauncherScreen /> : <GanttChart />}
    </ErrorBoundary>
  );
}

export default App;
