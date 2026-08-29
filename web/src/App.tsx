import { useEffect, useState } from 'react';

import { api } from './api';
import { Nav } from './components/Nav';
import type { User } from './types';
import { AdminView } from './views/AdminView';
import { AgentView } from './views/AgentView';
import { AuthView } from './views/AuthView';
import { CustomerView } from './views/CustomerView';

const DEFAULT_TAB: Record<User['role'], string> = {
  customer: 'tickets',
  agent: 'queue',
  admin: 'agents',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('tickets');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: User }>('/auth/me')
      .then((body) => setUser(body.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  function handleSignedIn(signedInUser: User) {
    setUser(signedInUser);
    setActiveTab(DEFAULT_TAB[signedInUser.role]);
  }

  function handleSignedOut() {
    setUser(null);
    setActiveTab('tickets');
  }

  if (loading) {
    return (
      <main className="app-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <p>Loading your workspace...</p>
      </main>
    );
  }

  if (!user) {
    return <AuthView onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="app-shell">
      <Nav
        activeTab={activeTab}
        user={user}
        onSignedOut={handleSignedOut}
        onTabChange={setActiveTab}
      />
      <main className="workspace" id="main-content">
        {user.role === 'customer' && (
          <CustomerView user={user} activeTab={activeTab} />
        )}
        {user.role === 'agent' && (
          <AgentView
            activeTab={activeTab}
            user={user}
            onTabChange={setActiveTab}
          />
        )}
        {user.role === 'admin' && <AdminView activeTab={activeTab} />}
      </main>
    </div>
  );
}
