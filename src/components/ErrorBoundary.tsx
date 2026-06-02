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
          height: '100vh', fontFamily: "'Figtree', 'Aptos Display', Helvetica, Arial, sans-serif", background: 'var(--bg-app)', color: 'var(--text-primary)',
        }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px', border: '1px solid var(--accent-primary)', borderRadius: 8,
              background: 'var(--accent-primary)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
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
