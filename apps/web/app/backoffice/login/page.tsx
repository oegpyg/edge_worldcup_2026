'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

export default function BackofficeLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/backoffice/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Credenciales invalidas');
      }

      const payload = (await response.json()) as { token: string };
      window.localStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      router.push('/backoffice');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesion');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="backoffice-login-shell">
      <section className="panel backoffice-login-card">
        <span className="eyebrow">Admin Access</span>
        <h1>Login backoffice</h1>
        <p>Ingresa credenciales de admin configuradas por entorno para continuar.</p>

        <form className="form" onSubmit={onSubmit}>
          <label className="label">
            Usuario
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              required
            />
          </label>

          <label className="label">
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            Entrar
          </button>
        </form>

        <div className={`status ${error ? 'error' : ''}`}>{error}</div>

        <Link className="button button-secondary" href="/">
          Volver
        </Link>
      </section>
    </main>
  );
}
