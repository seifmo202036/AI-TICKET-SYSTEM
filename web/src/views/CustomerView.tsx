import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '../api';
import { TicketConversation } from '../components/TicketConversation';
import type { Ticket, TicketStatus, User } from '../types';

interface CustomerViewProps {
  user: User;
  activeTab: string;
}

const ISSUE_TYPES = [
  'payment',
  'refund',
  'account',
  'subscription',
  'technical',
  'billing',
  'security',
  'general',
  'other',
];

const STATUS_COPY: Record<TicketStatus, string> = {
  triaging: 'We are reviewing the details of your request.',
  open: 'Your request is waiting for a support agent.',
  assigned: 'A support agent is actively working on your request.',
  resolved: 'An agent marked this resolved. Confirm if everything is working.',
  closed: 'This request is complete. The conversation is kept for reference.',
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not yet';
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function CustomerView({ user, activeTab }: CustomerViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [issueType, setIssueType] = useState('general');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [creating, setCreating] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);

    try {
      const body = await api.get<{ tickets: Ticket[] }>('/tickets');
      setTickets(body.tickets);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadTickets]);

  async function createTicket(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    setMessage(null);
    setCreating(true);

    try {
      const body = await api.post<{ ticket: Ticket }>('/tickets/create', {
        customerIssueType: issueType,
        description,
      });

      setDescription('');
      setSelected(body.ticket);
      setMessage(`Ticket #${body.ticket.id} was created.`);
      await loadTickets();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function closeTicket(ticketId: string) {
    setError(null);
    setMessage(null);
    setClosingTicket(true);

    try {
      const body = await api.post<{ ticket: Ticket }>(
        `/tickets/${ticketId}/close`,
      );
      setSelected(body.ticket);
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === body.ticket.id ? body.ticket : ticket,
        ),
      );
      setMessage('Ticket closed. Thanks for confirming the resolution.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setClosingTicket(false);
    }
  }

  if (activeTab !== 'tickets') {
    return null;
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Customer workspace</p>
          <h1>My tickets</h1>
          <p>
            Start a request, check its progress, or continue an existing
            conversation.
          </p>
        </div>
        <button
          className="small quiet"
          disabled={loadingTickets}
          onClick={() => void loadTickets()}
          type="button"
        >
          {loadingTickets ? 'Refreshing...' : 'Refresh list'}
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

      <div className="customer-layout">
        <form className="panel ticket-form" onSubmit={createTicket}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">New request</p>
              <h2>Tell us what happened</h2>
            </div>
          </div>
          <p className="muted form-intro">
            A short, specific description helps the right person pick this up.
          </p>
          <label htmlFor="issueType">Topic</label>
          <select
            id="issueType"
            onChange={(event) => setIssueType(event.target.value)}
            value={issueType}
          >
            {ISSUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
          <label htmlFor="description">What do you need help with?</label>
          <textarea
            id="description"
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Include the relevant details, what you expected, and what happened instead."
            required
            value={description}
          />
          <div className="form-footer">
            <span className="character-count">{description.length}/2000</span>
            <button className="primary" disabled={creating} type="submit">
              {creating ? 'Creating ticket...' : 'Create ticket'}
            </button>
          </div>
        </form>

        <aside className="support-note" aria-label="How support requests work">
          <p className="eyebrow">What happens next</p>
          <ol>
            <li>We review your request and route it to the right queue.</li>
            <li>An agent keeps the conversation updated here.</li>
            <li>You confirm the result before the ticket is closed.</li>
          </ol>
        </aside>
      </div>

      <section aria-labelledby="ticket-list-heading" className="panel ticket-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your requests</p>
            <h2 id="ticket-list-heading">Ticket history</h2>
          </div>
          {!loadingTickets && tickets.length > 0 && (
            <span className="list-count">{tickets.length} total</span>
          )}
        </div>

        {loadingTickets ? (
          <div aria-label="Loading tickets" className="list-skeleton">
            <span />
            <span />
            <span />
          </div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <strong>No tickets yet</strong>
            <p>When you need help, create a ticket and its updates will appear here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col"><span className="sr-only">Open ticket</span></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr className="ticket-row" key={ticket.id}>
                    <td data-label="Ticket">#{ticket.id}</td>
                    <td data-label="Topic">{titleCase(ticket.customer_issue_type)}</td>
                    <td data-label="Status">
                      <span className={`badge ${ticket.status}`}>{ticket.status}</span>
                    </td>
                    <td data-label="Created">{formatDate(ticket.created_at)}</td>
                    <td className="action-cell">
                      <button
                        className="small quiet"
                        onClick={() => setSelected(ticket)}
                        type="button"
                      >
                        Open<span className="sr-only"> ticket #{ticket.id}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section aria-labelledby="selected-ticket-title" className="ticket-detail">
          <div className="ticket-detail-heading">
            <div>
              <p className="eyebrow">Ticket #{selected.id}</p>
              <h2 id="selected-ticket-title">{titleCase(selected.customer_issue_type)} request</h2>
            </div>
            <div className="ticket-detail-actions">
              <span className={`badge ${selected.status}`}>{selected.status}</span>
              <button
                aria-label={`Close ticket #${selected.id} details`}
                className="small quiet"
                onClick={() => setSelected(null)}
                type="button"
              >
                Close details
              </button>
            </div>
          </div>
          <p className="ticket-description">{selected.description}</p>
          <div className="ticket-status-note">
            <strong>Current status</strong>
            <span>{STATUS_COPY[selected.status]}</span>
          </div>
          <dl className="ticket-meta">
            <div><dt>Created</dt><dd>{formatDate(selected.created_at)}</dd></div>
            <div><dt>Assigned</dt><dd>{formatDate(selected.assigned_at)}</dd></div>
            <div><dt>Resolved</dt><dd>{formatDate(selected.resolved_at)}</dd></div>
          </dl>

          {selected.status === 'resolved' && (
            <div className="resolution-prompt">
              <div>
                <strong>Is everything working now?</strong>
                <span>Close the ticket when the resolution is confirmed.</span>
              </div>
              <button
                className="primary"
                disabled={closingTicket}
                onClick={() => void closeTicket(selected.id)}
                type="button"
              >
                {closingTicket ? 'Closing ticket...' : 'Confirm and close'}
              </button>
            </div>
          )}
        </section>
      )}

      {selected && (
        <TicketConversation
          currentUser={user}
          key={selected.id}
          ticket={selected}
        />
      )}
    </>
  );
}
