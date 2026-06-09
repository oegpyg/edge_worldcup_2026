'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

export default function BackofficeDemoPredictionsPage() {
  const router = useRouter();
  const [count, setCount] = useState('50');
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

  async function generateDemoPredictions() {
    if (!adminToken) {
      return;
    }

    const normalizedCount = Number(count);
    if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 200) {
      setNotice('Ingresa un numero entre 1 y 200.');
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/demo-predictions`, {
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
          : payload.message ?? 'No se pudieron cargar las predicciones demo.';
        throw new Error(msg);
      }

      const payload = (await response.json()) as {
        createdUsers: number;
        predictions: number;
        message?: string;
      };

      setNotice(payload.message ?? `Se cargaron ${payload.predictions} predicciones demo para ${payload.createdUsers} usuarios.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron cargar las predicciones demo.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Predicciones demo</h1>
          <p>Crea usuarios de prueba con predicciones simuladas para trabajar el dashboard ya mismo.</p>
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
        <h2>Generar carga simulada</h2>
        <p>Esto borra y recrea los usuarios demo con predicciones nuevas. No toca usuarios reales.</p>

        <div className="form">
          <label className="label">
            Cantidad de usuarios demo
            <input
              className="input"
              type="number"
              min="1"
              max="200"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button className="button button-primary" type="button" onClick={generateDemoPredictions} disabled={isBusy}>
              Generar predicciones demo
            </button>
          </div>
        </div>
      </section>

      <div className="status">{isBusy ? 'Generando...' : notice}</div>
    </main>
  );
}