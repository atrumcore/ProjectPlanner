import { Component, type ReactNode } from 'react';
// Inline styles, so the CSS custom properties are out of reach — take the
// scale from the shared constants rather than restating the font stacks here.
import { FS, FONT_BODY, FONT_DISPLAY } from '../theme/typography';

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
    try { localStorage.removeItem('bbd-planner-state'); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', fontFamily: FONT_BODY, background: 'var(--bg-app)', color: 'var(--text-primary)',
        }}>
          <h1 style={{ fontSize: FS.title, fontFamily: FONT_DISPLAY, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: FS.body, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px', border: '1px solid var(--accent-primary)', borderRadius: 999,
              background: 'var(--accent-primary)', color: 'var(--on-accent)', fontWeight: 600, fontSize: FS.body,
              fontFamily: FONT_BODY, cursor: 'pointer',
            }}
          >
            Reset &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
