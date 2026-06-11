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
  const [stage1LockAt, setStage1LockAt] = useState('');
  const [stage2LockAt, setStage2LockAt] = useState('');
  const [currentStage1LockAt, setCurrentStage1LockAt] = useState<string | null>(null);
  const [currentStage2LockAt, setCurrentStage2LockAt] = useState<string | null>(null);
  const [stage1Locked, setStage1Locked] = useState(false);
  const [stage2Locked, setStage2Locked] = useState(false);
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

        throw new Error('No se pudieron cargar las fechas de etapas.');
      }

      const payload = (await response.json()) as {
        lockAt: string | null;
        stage2LockAt: string | null;
        locked: boolean;
        stage2Locked: boolean;
      };

      setCurrentStage1LockAt(payload.lockAt);
      setCurrentStage2LockAt(payload.stage2LockAt);
      setStage1LockAt(toDatetimeLocalValue(payload.lockAt));
      setStage2LockAt(toDatetimeLocalValue(payload.stage2LockAt));
      setStage1Locked(payload.locked);
      setStage2Locked(payload.stage2Locked);
      setNotice('');
    } catch {
      setNotice('No se pudieron cargar las fechas de etapas.');
    } finally {
      setIsBusy(false);
    }
  }

  async function saveLocks() {
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
        body: JSON.stringify({
          lockAt: stage1LockAt,
          stage2LockAt,
        }),
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
          : payload.message ?? 'No se pudieron guardar las fechas de etapas.';
        throw new Error(msg);
      }

      await loadSettings();
      setNotice('Fechas de etapas guardadas.');
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'No se pudieron guardar las fechas de etapas.');
    } finally {
      setIsBusy(false);
    }
  }

  async function clearStage(stage: 1 | 2) {
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
        body: JSON.stringify({
          lockAt: stage === 1 ? '' : stage1LockAt,
          stage2LockAt: stage === 2 ? '' : stage2LockAt,
        }),
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
          : payload.message ?? 'No se pudo limpiar la etapa.';
        throw new Error(msg);
      }

      await loadSettings();
      setNotice(stage === 1 ? 'Etapa 1 habilitada sin fecha.' : 'Etapa 2 habilitada sin fecha.');
    } catch (clearError) {
      setNotice(clearError instanceof Error ? clearError.message : 'No se pudo limpiar la etapa.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Etapas de prediccion</h1>
          <p>Configura cierre de etapa 1 (32 clasificados) y etapa 2 (finalistas/campeon).</p>
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
        <h2>Cierres por etapa</h2>
        <p>
          Etapa 1: <strong>{stage1Locked ? 'cerrada' : 'abierta'}</strong>
          {currentStage1LockAt ? ` · Cierra ${new Date(currentStage1LockAt).toLocaleString()}` : ' · Sin fecha'}
        </p>
        <p>
          Etapa 2: <strong>{stage2Locked ? 'cerrada' : 'abierta'}</strong>
          {currentStage2LockAt ? ` · Cierra ${new Date(currentStage2LockAt).toLocaleString()}` : ' · Sin fecha'}
        </p>

        <div className="form">
          <label className="label">
            Fecha cierre etapa 1
            <input
              className="input"
              type="datetime-local"
              value={stage1LockAt}
              onChange={(event) => setStage1LockAt(event.target.value)}
            />
          </label>

          <label className="label">
            Fecha cierre etapa 2
            <input
              className="input"
              type="datetime-local"
              value={stage2LockAt}
              onChange={(event) => setStage2LockAt(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button className="button button-primary" type="button" onClick={saveLocks} disabled={isBusy}>
              Guardar fechas
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void clearStage(1)}
              disabled={isBusy}
            >
              Limpiar etapa 1
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void clearStage(2)}
              disabled={isBusy}
            >
              Limpiar etapa 2
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
