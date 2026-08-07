import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { isMockMode } from '../auth/msal';
import { initials } from '../utils/initials';

/**
 * Identity control (toolbar + launcher header). Renders a "Sign in" button
 * when signed out and an avatar chip with a small menu when signed in. Hidden
 * entirely when no sign-in path is configured, so the plain local-file app
 * looks untouched.
 */
export default function AccountChip() {
  const available = useAuthStore(s => s.available);
  const account = useAuthStore(s => s.account);
  const busy = useAuthStore(s => s.busy);
  const signIn = useAuthStore(s => s.signIn);
  const signOut = useAuthStore(s => s.signOut);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Clicking the chip while its menu is open must CLOSE it: the menu's
  // outside-mousedown handler fires first (nulling menuPos), so a naive
  // click toggle would reopen. Same pattern as the toolbar menus.
  const suppressReopen = useRef(false);

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

  // Clamp the menu into the viewport once it has a size. The CSS shifts it
  // left by its own width (translateX(-100%)), so the horizontal check is on
  // the left edge after translation; vertical is the usual bottom clamp.
  useEffect(() => {
    if (!menuPos || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(menuPos.left, rect.width + 4), window.innerWidth - 4);
    const top = Math.min(menuPos.top, window.innerHeight - rect.height - 4);
    if (left !== menuPos.left || top !== menuPos.top) setMenuPos({ left, top });
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
        onPointerDown={() => { suppressReopen.current = menuPos !== null; }}
        onClick={e => {
          if (suppressReopen.current) {
            suppressReopen.current = false;
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setMenuPos({ left: r.right, top: r.bottom + 4 });
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
