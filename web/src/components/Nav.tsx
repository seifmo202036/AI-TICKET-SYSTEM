import { useState } from 'react';

import { api } from '../api';
import type { Role, User } from '../types';

const TABS: Record<Role, Array<{ id: string; label: string }>> = {
  customer: [{ id: 'tickets', label: 'My tickets' }],
  agent: [
    { id: 'queue', label: 'Queue' },
    { id: 'assigned', label: 'Assigned to me' },
  ],
  admin: [
    { id: 'agents', label: 'Pending agents' },
    { id: 'users', label: 'Users' },
  ],
};

interface NavProps {
  user: User;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onSignedOut: () => void;
}

export function Nav({
  user,
  activeTab,
  onTabChange,
  onSignedOut,
}: NavProps) {
  const tabs = TABS[user.role];
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function logOut() {
    setLoggingOut(true);
    setLogoutError(null);

    try {
      await api.post('/auth/logout');
      onSignedOut();
    } catch (caught) {
      setLogoutError((caught as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="site-header">
      <a className="brand" href="#main-content">
        <span aria-hidden="true" className="brand-mark">T</span>
        <span>
          <strong>Ticket desk</strong>
          <small>Support workspace</small>
        </span>
      </a>
      <nav aria-label="Workspace" className="workspace-nav">
        {tabs.map((tab) => (
          <button
            aria-current={tab.id === activeTab ? 'page' : undefined}
            className={`tab${tab.id === activeTab ? ' active' : ''}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="account-controls">
        <span aria-hidden="true" className="user-initial">
          {user.userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-summary">
          <strong>{user.userName}</strong>
          <small>{user.role}</small>
        </span>
        <button
          className="small quiet"
          disabled={loggingOut}
          onClick={() => void logOut()}
          type="button"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
      {logoutError && (
        <p className="nav-error" role="alert">
          {logoutError}
        </p>
      )}
    </header>
  );
}
