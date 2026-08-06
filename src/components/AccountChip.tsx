import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { isMockMode } from '../auth/msal';

/** "Alice Smith" -> "AS"; single word takes its first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Toolbar identity control. Renders a "Sign in" button when signed out and an
 * avatar chip with a small menu when signed in. Hidden entirely when no
 * sign-in path is configured, so the plain local-file app looks untouched.
 */
export default function AccountChip() {
  const available = useAuthStore(s => s.available);
  const account = useAuthStore(s => s.account);
  const busy = useAuthStore(s => s.busy);
  const signIn = useAuthStore(s => s.signIn);
  const signOut = useAuthStore(s => s.signOut);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuPos(null); };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuPos]);

  if (!available) return null;

  if (!account) {
    return (
      <button
        className="account-signin-btn"
        onClick={signIn}
        disabled={busy}
        title="Sign in with your Microsoft 365 account to use shared plans"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    );
  }

  return (
    <>
      <button
        className="account-chip"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuPos(menuPos ? null : { left: r.right, top: r.bottom + 4 });
        }}
        title={account.email ?? account.name}
      >
        <span className="account-chip-avatar">{initials(account.name)}</span>
        <span className="account-chip-name">{account.name}</span>
      </button>
      {menuPos && createPortal(
        <div
          ref={menuRef}
          className="account-menu"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          <div className="account-menu-identity">
            <div className="account-menu-name">{account.name}</div>
            {account.email && <div className="account-menu-email">{account.email}</div>}
            {isMockMode && <div className="account-menu-mock">Mock tenant (dev)</div>}
          </div>
          <div className="account-menu-divider" />
          <button
            className="account-menu-item"
            onClick={() => { setMenuPos(null); signOut(); }}
          >
            Sign out
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
