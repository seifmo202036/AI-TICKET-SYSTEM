import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type { User } from '../types';

interface AdminViewProps {
  activeTab: string;
}

const VALID_USER_ID = /^[1-9]\d*$/;

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function AdminView({ activeTab }: AdminViewProps) {
  const [pendingAgents, setPendingAgents] = useState<User[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadPendingAgents = useCallback(async () => {
    setLoading(true);

    try {
      const body = await api.get<{ data: { agents: User[] } }>(
        '/users/agents/pending',
      );
      setPendingAgents(body.data.agents);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPendingAgents();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadPendingAgents]);

  async function approve(userId: string) {
    setApprovingId(userId);
    setError(null);
    setMessage(null);

    try {
      await api.post(`/users/${userId}/approve`);
      setMessage('Agent approved. They can now sign in.');
      await loadPendingAgents();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setApprovingId(null);
    }
  }

  const showingPendingAgents = activeTab === 'agents';

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>{showingPendingAgents ? 'Agent access' : 'Account controls'}</h1>
          <p>
            {showingPendingAgents
              ? 'Review agent requests before granting access to customer conversations.'
              : 'Change a user account status when access needs to be paused or restored.'}
          </p>
        </div>
        {showingPendingAgents && (
          <button
            className="small quiet"
            disabled={loading}
            onClick={() => void loadPendingAgents()}
            type="button"
          >
            {loading ? 'Refreshing...' : 'Refresh requests'}
          </button>
        )}
      </header>

      {message && (
        <div aria-live="polite" className="message success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div aria-live="polite" className="message error" role="alert">
          {error}
        </div>
      )}

      {showingPendingAgents ? (
        <section aria-labelledby="pending-agents-title" className="panel ticket-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Approval queue</p>
              <h2 id="pending-agents-title">Pending agents</h2>
            </div>
            {!loading && pendingAgents.length > 0 && (
              <span className="list-count">{pendingAgents.length} awaiting review</span>
            )}
          </div>

          {loading ? (
            <div aria-label="Loading agent requests" className="list-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : pendingAgents.length === 0 ? (
            <div className="empty-state">
              <strong>No agent requests to review</strong>
              <p>New agent registrations will appear here for approval.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Email</th>
                    <th scope="col">Requested</th>
                    <th scope="col"><span className="sr-only">Approval action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAgents.map((agent) => (
                    <tr className="ticket-row" key={agent.id}>
                      <td data-label="User">
                        <strong>{agent.userName}</strong>
                        <span className="table-subtext">ID #{agent.id}</span>
                      </td>
                      <td data-label="Email">{agent.email}</td>
                      <td data-label="Requested">{formatDate(agent.createdAt)}</td>
                      <td className="action-cell">
                        <button
                          className="small accent"
                          disabled={approvingId === agent.id}
                          onClick={() => void approve(agent.id)}
                          type="button"
                        >
                          {approvingId === agent.id ? 'Approving...' : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <UserManagementPanel />
      )}
    </>
  );
}

function UserManagementPanel() {
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'suspend' | 'reinstate' | null>(null);

  const validId = VALID_USER_ID.test(userId);

  async function act(nextAction: 'suspend' | 'reinstate') {
    setAction(nextAction);
    setError(null);
    setMessage(null);

    try {
      await api.post(`/users/${userId}/${nextAction}`);
      setMessage(`User #${userId} was ${nextAction}d successfully.`);
      setUserId('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setAction(null);
    }
  }

  return (
    <section aria-labelledby="user-controls-title" className="admin-controls">
      <div className="panel">
        <p className="eyebrow">Access management</p>
        <h2 id="user-controls-title">Suspend or reinstate a user</h2>
        <p className="muted form-intro">
          Enter the numeric user ID from a support request or the database.
          This action changes their ability to sign in.
        </p>
        <label htmlFor="targetUser">User ID</label>
        <input
          autoComplete="off"
          id="targetUser"
          inputMode="numeric"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="For example, 42"
          value={userId}
        />
        {message && (
          <div aria-live="polite" className="message success" role="status">
            {message}
          </div>
        )}
        {error && (
          <div aria-live="polite" className="message error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-actions">
          <button
            className="small danger"
            disabled={!validId || action !== null}
            onClick={() => void act('suspend')}
            type="button"
          >
            {action === 'suspend' ? 'Suspending...' : 'Suspend access'}
          </button>
          <button
            className="small accent"
            disabled={!validId || action !== null}
            onClick={() => void act('reinstate')}
            type="button"
          >
            {action === 'reinstate' ? 'Reinstating...' : 'Reinstate access'}
          </button>
        </div>
      </div>

      <aside className="support-note admin-note">
        <p className="eyebrow">Before changing access</p>
        <p>
          Confirm the user ID carefully. The API does not currently provide a
          searchable list of all users.
        </p>
      </aside>
    </section>
  );
}
