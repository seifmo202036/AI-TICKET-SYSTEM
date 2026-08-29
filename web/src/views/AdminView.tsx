import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import type { User } from '../types';

interface AdminViewProps {
  activeTab: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function AdminView({ activeTab }: AdminViewProps) {
  const [pendingAgents, setPendingAgents] = useState<User[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

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

  async function decline(userId: string) {
    setDecliningId(userId);
    setError(null);
    setMessage(null);

    try {
      await api.post(`/users/${userId}/decline`);
      setMessage('Agent request declined. They can submit a new request.');
      await loadPendingAgents();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setDecliningId(null);
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

      {showingPendingAgents && message && (
        <div aria-live="polite" className="message success" role="status">
          {message}
        </div>
      )}
      {showingPendingAgents && error && (
        <div aria-live="polite" className="message error" role="alert">
          {error}
        </div>
      )}

      {showingPendingAgents ? (
        <section
          aria-labelledby="pending-agents-title"
          className="panel ticket-list"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Approval queue</p>
              <h2 id="pending-agents-title">Pending agents</h2>
            </div>
            {!loading && pendingAgents.length > 0 && (
              <span className="list-count">
                {pendingAgents.length} awaiting review
              </span>
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
                    <th scope="col">
                      <span className="sr-only">Approval action</span>
                    </th>
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
                      <td data-label="Requested">
                        {formatDate(agent.createdAt)}
                      </td>
                      <td className="action-cell">
                        <div className="pending-agent-actions">
                          <button
                            className="small accent"
                            disabled={
                              approvingId === agent.id ||
                              decliningId === agent.id
                            }
                            onClick={() => void approve(agent.id)}
                            type="button"
                          >
                            {approvingId === agent.id
                              ? 'Approving...'
                              : 'Approve'}
                          </button>
                          <button
                            aria-label={`Decline ${agent.userName}'s request`}
                            className="small danger"
                            disabled={
                              approvingId === agent.id ||
                              decliningId === agent.id
                            }
                            onClick={() => void decline(agent.id)}
                            type="button"
                          >
                            {decliningId === agent.id
                              ? 'Declining...'
                              : 'Decline'}
                          </button>
                        </div>
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
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);

    try {
      const body = await api.get<{ data: { users: User[] } }>('/users');
      setUsers(body.data.users);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadUsers]);

  const matchingUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [user.userName, user.email, user.role, user.accountStatus].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query, users]);

  async function act(user: User) {
    const nextAction =
      user.accountStatus === 'active' ? 'suspend' : 'reinstate';

    setUpdatingUserId(user.id);
    setError(null);
    setMessage(null);

    try {
      const body = await api.post<{ data: { user: User } }>(
        `/users/${user.id}/${nextAction}`,
      );
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id ? body.data.user : currentUser,
        ),
      );
      setMessage(
        `${body.data.user.userName}'s access was ${nextAction}d successfully.`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <section aria-labelledby="user-controls-title" className="admin-controls">
      <div className="panel">
        <div className="section-heading user-management-heading">
          <div>
            <p className="eyebrow">Access management</p>
            <h2 id="user-controls-title">Manage user access</h2>
            <p className="muted form-intro">
              Find a customer, agent, or another administrator, then change
              their access directly from the list.
            </p>
          </div>
          <button
            className="small quiet"
            disabled={loading}
            onClick={() => void loadUsers()}
            type="button"
          >
            {loading ? 'Refreshing...' : 'Refresh users'}
          </button>
        </div>
        <label htmlFor="userSearch">Find a user</label>
        <input
          autoComplete="off"
          id="userSearch"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, role, or status"
          type="search"
          value={query}
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

        {loading ? (
          <div aria-label="Loading users" className="list-skeleton">
            <span />
            <span />
            <span />
          </div>
        ) : matchingUsers.length === 0 ? (
          <div className="empty-state">
            <strong>
              {users.length === 0 ? 'No users to manage' : 'No matching users'}
            </strong>
            <p>
              {users.length === 0
                ? 'Active and suspended accounts will appear here.'
                : 'Try a different name, email, role, or account status.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">
                    <span className="sr-only">Access action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {matchingUsers.map((user) => {
                  const isSuspended = user.accountStatus === 'suspended';
                  const isUpdating = updatingUserId === user.id;

                  return (
                    <tr className="ticket-row" key={user.id}>
                      <td data-label="User">
                        <strong>{user.userName}</strong>
                        <span className="table-subtext">{user.email}</span>
                      </td>
                      <td data-label="Role">{user.role}</td>
                      <td data-label="Status">
                        <span className={`badge ${user.accountStatus}`}>
                          {user.accountStatus}
                        </span>
                      </td>
                      <td data-label="Created">{formatDate(user.createdAt)}</td>
                      <td className="action-cell">
                        <button
                          className={`small ${isSuspended ? 'accent' : 'danger'}`}
                          disabled={updatingUserId !== null}
                          onClick={() => void act(user)}
                          type="button"
                        >
                          {isUpdating
                            ? isSuspended
                              ? 'Reinstating...'
                              : 'Suspending...'
                            : isSuspended
                              ? 'Reinstate access'
                              : 'Suspend access'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="support-note admin-note">
        <p className="eyebrow">Account safety</p>
        <p>
          Your own account is not listed. Pending agents remain in the approval
          queue until an administrator approves them.
        </p>
      </aside>
    </section>
  );
}
