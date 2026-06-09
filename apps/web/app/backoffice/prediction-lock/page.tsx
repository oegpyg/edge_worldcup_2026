'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

function toDatetimeLocalValue(isoValue: string | null) {
  if (!isoValue) {
    return '';
  }

  const date = new Date(isoValue);
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export default function BackofficePredictionLockPage() {
  const router = useRouter();
  const [lockAt, setLockAt] = useState('');
  const [currentLockAt, setCurrentLockAt] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
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
    void loadSettings(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings(token?: string) {
    const activeToken = token ?? adminToken;
    if (!activeToken) {
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/prediction-lock`, {
        headers: { 'x-admin-token': activeToken },
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        throw new Error('No se pudo cargar la fecha de cierre.');
      }

      const payload = (await response.json()) as {
        lockAt: string | null;
        locked: boolean;
      };

      setCurrentLockAt(payload.lockAt);
      setLockAt(toDatetimeLocalValue(payload.lockAt));
      setLocked(payload.locked);
      setNotice('');
    } catch {
      setNotice('No se pudo cargar la fecha de cierre.');
    } finally {
      setIsBusy(false);
    }
  }

  async function saveLock() {
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/prediction-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ lockAt }),
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
          : payload.message ?? 'No se pudo guardar la fecha de cierre.';
        throw new Error(msg);
      }

      const payload = (await response.json()) as {
        lockAt: string | null;
        locked: boolean;
      };

      setCurrentLockAt(payload.lockAt);
      setLocked(payload.locked);
      setLockAt(toDatetimeLocalValue(payload.lockAt));
      setNotice(payload.locked ? 'La edicion quedo cerrada.' : 'La edicion quedo habilitada.');
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'No se pudo guardar la fecha de cierre.');
    } finally {
      setIsBusy(false);
    }
  }

  async function clearLock() {
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/prediction-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ lockAt: '' }),
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
          : payload.message ?? 'No se pudo quitar la fecha de cierre.';
        throw new Error(msg);
      }

      const payload = (await response.json()) as {
        lockAt: string | null;
        locked: boolean;
      };

      setCurrentLockAt(payload.lockAt);
      setLocked(payload.locked);
      setLockAt('');
      setNotice('La edicion quedo habilitada.');
    } catch (clearError) {
      setNotice(clearError instanceof Error ? clearError.message : 'No se pudo quitar la fecha de cierre.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Cierre de edicion</h1>
          <p>Define la fecha y hora a partir de la cual los usuarios pasan a solo lectura.</p>
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
        <h2>Fecha de cierre</h2>
        <p>
          Estado actual: <strong>{locked ? 'cerrado' : 'abierto'}</strong>
          {currentLockAt ? ` · Cierra el ${new Date(currentLockAt).toLocaleString()}` : ' · Sin fecha definida'}
        </p>

        <div className="form">
          <label className="label">
            Fecha y hora de cierre
            <input
              className="input"
              type="datetime-local"
              value={lockAt}
              onChange={(event) => setLockAt(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button className="button button-primary" type="button" onClick={saveLock} disabled={isBusy}>
              Guardar cierre
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={clearLock}
              disabled={isBusy}
            >
              Quitar cierre
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void loadSettings()}
              disabled={isBusy}
            >
              Refrescar
            </button>
          </div>
        </div>
      </section>

      <div className="status">{isBusy ? 'Cargando...' : notice}</div>
    </main>
  );
}