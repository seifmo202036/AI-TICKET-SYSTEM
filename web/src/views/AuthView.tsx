import { useState, type FormEvent } from 'react';

import { api } from '../api';
import { ApiError, type User } from '../types';

interface AuthViewProps {
  onSignedIn: (user: User) => void;
}

export function AuthView({ onSignedIn }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState<'customer' | 'agent'>('customer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === 'signup') {
        await api.post('/auth/signup', {
          userName,
          email,
          password,
          role,
        });

        const result = await api.post<{ user?: User }>('/auth/login', {
          email,
          password,
        });

        if (result.user) {
          onSignedIn(result.user);
        }
      } else {
        const result = await api.post<{ user: User }>('/auth/login', {
          email,
          password,
        });

        onSignedIn(result.user);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ACCOUNT_PENDING') {
        setError('Your agent account is awaiting administrator approval.');
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-title">
        <div className="brand-mark large" aria-hidden="true">T</div>
        <p className="eyebrow">Ticket desk</p>
        <h1 id="auth-title">Support that keeps moving.</h1>
        <p>
          Follow every request in one clear conversation, from first report to
          resolution.
        </p>
        <ul className="auth-points">
          <li>Clear status at every step</li>
          <li>One secure place for updates</li>
          <li>Support teams that stay in context</li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="auth-form-title">
        <div className="auth-card-heading">
          <p className="eyebrow">
            {mode === 'login' ? 'Welcome back' : 'New to ticket desk'}
          </p>
          <h2 id="auth-form-title">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </h2>
          <p className="muted">
            {mode === 'login'
              ? 'Use the email address linked to your support account.'
              : 'Customers can start right away. Agent accounts need approval.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label htmlFor="userName">Username</label>
              <input
                autoComplete="username"
                id="userName"
                onChange={(event) => setUserName(event.target.value)}
                placeholder="How should we address you?"
                required
                value={userName}
              />
              <label htmlFor="role">Account type</label>
              <select
                id="role"
                onChange={(event) =>
                  setRole(event.target.value as 'customer' | 'agent')
                }
                value={role}
              >
                <option value="customer">Customer, access immediately</option>
                <option value="agent">Agent, administrator approval required</option>
              </select>
            </>
          )}

          <label htmlFor="email">Email</label>
          <input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />

          <label htmlFor="password">Password</label>
          <input
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            id="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            type="password"
            value={password}
          />

          {error && (
            <div aria-live="polite" className="message error" role="alert">
              {error}
            </div>
          )}

          <button className="primary" disabled={busy} type="submit">
            {busy
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'No account yet?' : 'Already registered?'}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'signup' : 'login');
            }}
            type="button"
          >
            {mode === 'login' ? 'Create one' : 'Sign in instead'}
          </button>
        </p>
      </section>
    </main>
  );
}
