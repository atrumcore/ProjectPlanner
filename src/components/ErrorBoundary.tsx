import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    try { localStorage.removeItem('dha-gantt-state'); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', fontFamily: "'Figtree', Helvetica, Arial, sans-serif", background: '#e8e4dd', color: '#1a1814',
        }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 12, color: '#74706a', marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px', border: '1px solid #dedad3', borderRadius: 4,
              background: '#1e1b16', color: '#ede9e1', fontSize: 12, cursor: 'pointer',
            }}
          >
            Reset &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
