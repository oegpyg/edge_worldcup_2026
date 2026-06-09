'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

export default function BackofficeDemoMatchesPage() {
  const router = useRouter();
  const [count, setCount] = useState('10');
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminToken, setAdminToken] = useState('');

  useEffect(() => {
    const token = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      router.replace('/backoffice/login');
      return;
    }

    setAdminToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateDemoMatches() {
    if (!adminToken) {
      return;
    }

    const normalizedCount = Number(count);
    if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 50) {
      setNotice('Ingresa un numero entre 1 y 50.');
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/demo-matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ count: normalizedCount }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        const payload = (await response.json()) as { message?: string | string[] };
        const msg = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message ?? 'No se pudieron simular los partidos.';
        throw new Error(msg);
      }

      const payload = (await response.json()) as {
        updatedMatches: number;
        message?: string;
      };

      setNotice(payload.message ?? `Se simularon ${payload.updatedMatches} partidos.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron simular los partidos.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Partidos demo</h1>
          <p>Simula varios partidos para recalcular los puntos y mover el ranking de funcionarios.</p>
        </div>
        <div className="backoffice-actions">
          <Link className="button button-secondary" href="/backoffice">
            Volver a backoffice
          </Link>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              window.localStorage.removeItem(ADMIN_TOKEN_KEY);
              router.push('/backoffice/login');
            }}
          >
            Cerrar admin
          </button>
        </div>
      </section>

      <section className="panel backoffice-card">
        <h2>Simular partidos</h2>
        <p>Se crean o actualizan partidos demo con resultados aleatorios para probar el ranking.</p>

        <div className="form">
          <label className="label">
            Cantidad de partidos
            <input
              className="input"
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button className="button button-primary" type="button" onClick={generateDemoMatches} disabled={isBusy}>
              Simular partidos
            </button>
          </div>
        </div>
      </section>

      <div className="status">{isBusy ? 'Simulando...' : notice}</div>
    </main>
  );
}
