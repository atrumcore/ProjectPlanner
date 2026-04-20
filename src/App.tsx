import { useEffect } from 'react';
import './App.css';
import GanttChart from './components/GanttChart';
import ErrorBoundary from './components/ErrorBoundary';
import { useGanttStore } from './store/useGanttStore';

function App() {
  const isDirty = useGanttStore(s => s.isDirty);
  const currentFileName = useGanttStore(s => s.currentFileName);

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

  // Reflect current file + dirty state in the browser tab title.
  useEffect(() => {
    const name = currentFileName || 'Untitled';
    document.title = `${isDirty ? '\u2022 ' : ''}${name} \u2014 DHA Priority Roadmap`;
  }, [currentFileName, isDirty]);

  return (
    <ErrorBoundary>
      <GanttChart />
    </ErrorBoundary>
  );
}

export default App;
