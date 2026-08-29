import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { TicketConversation } from '../components/TicketConversation';
import type { Ticket, User } from '../types';

interface AgentViewProps {
  user: User;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function aiTriageSummary(ticket: Ticket): string {
  if (ticket.ai_status === 'completed') {
    const details = [
      ticket.ai_category && titleCase(ticket.ai_category),
      ticket.ai_score !== null && `Score ${ticket.ai_score}/100`,
      ticket.urgency && `${titleCase(ticket.urgency)} urgency`,
    ].filter((detail): detail is string => Boolean(detail));

    return details.length > 0 ? details.join(' · ') : 'Analysis complete';
  }

  const statusCopy = {
    queued: 'Awaiting analysis',
    processing: 'Analyzing this request',
    failed: 'Analysis unavailable',
    disabled: 'AI triage is turned off',
  } as const;

  return statusCopy[ticket.ai_status];
}

export function AgentView({ user, activeTab, onTabChange }: AgentViewProps) {
  const [queueTickets, setQueueTickets] = useState<Ticket[]>([]);
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const body = await api.get<{ tickets: Ticket[] }>('/tickets/queue');
    setQueueTickets(body.tickets);
  }, []);

  const loadAssigned = useCallback(async () => {
    const body = await api.get<{ tickets: Ticket[] }>('/tickets/assigned');
    setAssignedTickets(body.tickets);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoading(true);

    try {
      await Promise.all([loadQueue(), loadAssigned()]);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadAssigned, loadQueue]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void refreshWorkspace();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [refreshWorkspace]);

  async function claim(ticketId: string) {
    setBusyTicketId(ticketId);
    setError(null);
    setMessage(null);

    try {
      const body = await api.post<{ ticket: Ticket }>(
        `/tickets/${ticketId}/claim`,
      );
      setSelectedTicket(body.ticket);
      setMessage(`Ticket #${ticketId} is now assigned to you.`);
      await refreshWorkspace();
      onTabChange('assigned');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyTicketId(null);
    }
  }

  async function resolve(ticketId: string) {
    setBusyTicketId(ticketId);
    setError(null);
    setMessage(null);

    try {
      const body = await api.post<{ ticket: Ticket }>(
        `/tickets/${ticketId}/resolve`,
      );
      setSelectedTicket(body.ticket);
      setAssignedTickets((current) =>
        current.map((ticket) =>
          ticket.id === body.ticket.id ? body.ticket : ticket,
        ),
      );
      setMessage(`Ticket #${ticketId} was marked resolved.`);
      await refreshWorkspace();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyTicketId(null);
    }
  }

  const showQueue = activeTab === 'queue';
  const visibleTickets = showQueue ? queueTickets : assignedTickets;

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Agent workspace</p>
          <h1>{showQueue ? 'Support queue' : 'Assigned to me'}</h1>
          <p>
            {showQueue
              ? 'Review the open work and claim the next ticket you can own.'
              : 'Keep customers informed and resolve work when it is ready.'}
          </p>
        </div>
        <button
          className="small quiet"
          disabled={loading}
          onClick={() => void refreshWorkspace()}
          type="button"
        >
          {loading ? 'Refreshing...' : 'Refresh workspace'}
        </button>
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

      <section
        aria-labelledby={showQueue ? 'queue-heading' : 'assigned-heading'}
        className="panel ticket-list"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {showQueue ? 'Unassigned' : 'In progress'}
            </p>
            <h2 id={showQueue ? 'queue-heading' : 'assigned-heading'}>
              {showQueue ? 'Open tickets' : 'Your work'}
            </h2>
          </div>
          {!loading && visibleTickets.length > 0 && (
            <span className="list-count">{visibleTickets.length} showing</span>
          )}
        </div>

        {loading ? (
          <div aria-label="Loading tickets" className="list-skeleton">
            <span />
            <span />
            <span />
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="empty-state">
            <strong>
              {showQueue ? 'The queue is clear' : 'Nothing assigned yet'}
            </strong>
            <p>
              {showQueue
                ? 'New customer requests will appear here when they are ready for an agent.'
                : 'Claim a ticket from the queue to begin working on it.'}
            </p>
            {!showQueue && (
              <button
                className="small quiet"
                onClick={() => onTabChange('queue')}
                type="button"
              >
                View queue
              </button>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Topic</th>
                  {!showQueue && <th scope="col">Status</th>}
                  <th scope="col">AI triage</th>
                  <th scope="col">Request</th>
                  <th scope="col">{showQueue ? 'Created' : 'Assigned'}</th>
                  <th scope="col">
                    <span className="sr-only">Ticket actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTickets.map((ticket) => {
                  const isBusy = busyTicketId === ticket.id;

                  return (
                    <tr className="ticket-row" key={ticket.id}>
                      <td data-label="Ticket">#{ticket.id}</td>
                      <td data-label="Topic">
                        {titleCase(ticket.customer_issue_type)}
                      </td>
                      {!showQueue && (
                        <td data-label="Status">
                          <span className={`badge ${ticket.status}`}>
                            {ticket.status}
                          </span>
                        </td>
                      )}
                      <td data-label="AI triage">
                        <span className="badge">{ticket.ai_status}</span>
                        <span className="table-subtext">
                          {aiTriageSummary(ticket)}
                        </span>
                      </td>
                      <td className="ticket-summary" data-label="Request">
                        {ticket.description}
                      </td>
                      <td data-label={showQueue ? 'Created' : 'Assigned'}>
                        {formatDate(
                          showQueue ? ticket.created_at : ticket.assigned_at,
                        )}
                      </td>
                      <td className="action-cell">
                        {showQueue ? (
                          <button
                            className="small accent"
                            disabled={isBusy}
                            onClick={() => void claim(ticket.id)}
                            type="button"
                          >
                            {isBusy ? 'Claiming...' : 'Claim'}
                          </button>
                        ) : (
                          <div className="ticket-actions">
                            <button
                              className="small quiet"
                              onClick={() => setSelectedTicket(ticket)}
                              type="button"
                            >
                              Open
                              <span className="sr-only">
                                {' '}
                                ticket #{ticket.id}
                              </span>
                            </button>
                            {ticket.status === 'assigned' && (
                              <button
                                className="small accent"
                                disabled={isBusy}
                                onClick={() => void resolve(ticket.id)}
                                type="button"
                              >
                                {isBusy ? 'Resolving...' : 'Resolve'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!showQueue && selectedTicket && (
        <section
          aria-labelledby="agent-ticket-title"
          className="ticket-detail compact"
        >
          <div className="ticket-detail-heading">
            <div>
              <p className="eyebrow">Ticket #{selectedTicket.id}</p>
              <h2 id="agent-ticket-title">
                {titleCase(selectedTicket.customer_issue_type)} request
              </h2>
            </div>
            <div className="ticket-detail-actions">
              <span className={`badge ${selectedTicket.status}`}>
                {selectedTicket.status}
              </span>
              <button
                className="small quiet"
                onClick={() => setSelectedTicket(null)}
                type="button"
              >
                Close details
              </button>
            </div>
          </div>
          <p className="ticket-description">{selectedTicket.description}</p>
          {selectedTicket.status === 'assigned' && (
            <div className="resolution-prompt">
              <div>
                <strong>Ready to resolve?</strong>
                <span>
                  The customer can review the result before the ticket closes.
                </span>
              </div>
              <button
                className="primary"
                disabled={busyTicketId === selectedTicket.id}
                onClick={() => void resolve(selectedTicket.id)}
                type="button"
              >
                {busyTicketId === selectedTicket.id
                  ? 'Resolving...'
                  : 'Mark resolved'}
              </button>
            </div>
          )}
        </section>
      )}

      {!showQueue && selectedTicket && (
        <TicketConversation
          currentUser={user}
          key={selectedTicket.id}
          ticket={selectedTicket}
        />
      )}
    </>
  );
}
