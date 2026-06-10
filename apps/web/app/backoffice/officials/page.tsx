'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OfficialStatus = {
  id: number;
  email: string;
  fullName: string | null;
  sex: string | null;
  createdAt: string;
  predictionUpdatedAt: string | null;
  qualifiedCount: number;
  finalistCount: number;
  championCode: string | null;
  points: number;
  hasPrediction: boolean;
  predictionCompleted: boolean;
  status: 'pendiente' | 'incompleta' | 'completa';
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

export default function BackofficeOfficialsPage() {
  const router = useRouter();
  const [officials, setOfficials] = useState<OfficialStatus[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      router.replace('/backoffice/login');
      return;
    }

    setAdminToken(token);
    void loadOfficials(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOfficials(token?: string) {
    const activeToken = token ?? adminToken;
    if (!activeToken) {
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/officials`, {
        headers: { 'x-admin-token': activeToken },
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        throw new Error('No se pudo cargar estado de funcionarios.');
      }

      const payload = (await response.json()) as OfficialStatus[];
      setOfficials(payload);
      setNotice('');
    } catch {
      setNotice('No se pudo cargar estado de funcionarios.');
    } finally {
      setIsBusy(false);
    }
  }

  async function importOfficialsCsv() {
    if (!adminToken || !csvFile) {
      setNotice('Selecciona un archivo CSV para importar.');
      return;
    }

    try {
      setIsBusy(true);
      const csvContent = await csvFile.text();
      const response = await fetch(`${API_URL}/backoffice/officials/import-csv`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ csvContent }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorPayload?.message ?? 'No se pudo importar el CSV.');
      }

      const payload = (await response.json()) as {
        createdUsers: number;
        updatedUsers: number;
        alreadyExisting: number;
        invalidRows: number;
        invalidSexRows: number;
        duplicatesInFile: number;
      };

      setNotice(
        `Importacion ok: ${payload.createdUsers} nuevos, ${payload.updatedUsers} actualizados, ${payload.alreadyExisting} existentes, ${payload.invalidRows} emails invalidos, ${payload.invalidSexRows} sexos invalidos, ${payload.duplicatesInFile} duplicados.`,
      );
      setCsvFile(null);
      await loadOfficials();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo importar el CSV.';
      setNotice(message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Funcionarios importados</h1>
          <p>Seguimiento de estado de prediccion por usuario: pendiente, incompleta o completa.</p>
        </div>
        <div className="backoffice-actions">
          <button className="button button-secondary" type="button" onClick={() => void loadOfficials()} disabled={isBusy}>
            Refrescar
          </button>
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
        <h2>Listado de funcionarios</h2>
        <p>{officials.length} funcionarios cargados</p>

        <div className="import-row">
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
          />
          <button className="button button-primary" type="button" onClick={() => void importOfficialsCsv()} disabled={isBusy}>
            Importar CSV
          </button>
        </div>
        <p className="small">CSV esperado: email, nombre y sexo. Encabezados validos: email/correo, nombre/name, sexo/sex.</p>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Funcionario</th>
                  <th>Sexo</th>
                <th>Estado</th>
                <th>Puntos</th>
                <th>Progreso</th>
                <th>Campeon</th>
                <th>Ultima actualizacion</th>
              </tr>
            </thead>
            <tbody>
              {officials.map((official) => (
                <tr key={official.id}>
                  <td>
                    <strong>{official.email}</strong>
                    {official.fullName ? <span>Nombre: {official.fullName}</span> : null}
                    <span>Alta: {new Date(official.createdAt).toLocaleString()}</span>
                  </td>
                  <td>{official.sex === 'female' ? 'female' : official.sex === 'male' ? 'male' : '-'}</td>
                  <td>
                    <span className={`status-chip status-chip-${official.status}`}>{official.status}</span>
                  </td>
                  <td>{official.points}</td>
                  <td>
                    {official.qualifiedCount}/32 clasificados · {official.finalistCount}/2 finalistas
                  </td>
                  <td>{official.championCode ?? '-'}</td>
                  <td>
                    {official.predictionUpdatedAt ? new Date(official.predictionUpdatedAt).toLocaleString() : 'Sin carga'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="status">{isBusy ? 'Cargando...' : notice}</div>
    </main>
  );
}
