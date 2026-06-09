'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Country = {
  id: number;
  name: string;
  code: string;
  groupName: string;
};

type MatchItem = {
  id: number;
  home: string;
  homeCode: string;
  away: string;
  awayCode: string;
  kickoff: string;
  stage: string;
  venue: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'edge-backoffice-admin-token';

function sortByName(countries: Country[]) {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name));
}

function sortByGroup(countries: Country[]) {
  return [...countries].sort((a, b) => {
    const groupCompare = a.groupName.localeCompare(b.groupName);
    if (groupCompare !== 0) {
      return groupCompare;
    }

    return a.name.localeCompare(b.name);
  });
}

export default function BackofficePage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [countryName, setCountryName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryGroup, setCountryGroup] = useState('A');
  const [homeCode, setHomeCode] = useState('');
  const [awayCode, setAwayCode] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [stage, setStage] = useState('Grupos');
  const [venue, setVenue] = useState('');
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [adminToken, setAdminToken] = useState('');

  useEffect(() => {
    const token = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      router.replace('/backoffice/login');
      return;
    }

    setAdminToken(token);
    void loadData(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(token?: string) {
    const activeToken = token ?? adminToken;
    if (!activeToken) {
      return;
    }

    try {
      setIsBusy(true);
      const [countriesResponse, matchesResponse] = await Promise.all([
        fetch(`${API_URL}/backoffice/countries`, {
          headers: { 'x-admin-token': activeToken },
        }),
        fetch(`${API_URL}/backoffice/matches`, {
          headers: { 'x-admin-token': activeToken },
        }),
      ]);

      if (!countriesResponse.ok || !matchesResponse.ok) {
        if (countriesResponse.status === 401 || matchesResponse.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        throw new Error('No se pudo cargar backoffice desde API');
      }

      const [countriesPayload, matchesPayload] = (await Promise.all([
        countriesResponse.json(),
        matchesResponse.json(),
      ])) as [Country[], MatchItem[]];

      setCountries(sortByName(countriesPayload));
      setMatches(matchesPayload);
    } catch {
      setNotice('No se pudo conectar al backend. Revisa API en localhost:4000.');
    } finally {
      setIsBusy(false);
    }
  }

  async function importFromApiWithFallback() {
    if (!adminToken) {
      return;
    }

    try {
      setIsBusy(true);
      const response = await fetch(`${API_URL}/backoffice/import`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          router.replace('/backoffice/login');
          return;
        }

        throw new Error('Import no disponible');
      }

      const payload = (await response.json()) as {
        source: 'api' | 'fallback';
        message?: string;
        countries: number;
        matches: number;
      };

      await loadData(adminToken);
      if (payload.source === 'api') {
        setNotice(`Import API OK: ${payload.countries} paises y ${payload.matches} partidos.`);
      } else {
        setNotice(
          payload.message ??
            `Import API fallo, se activo fallback manual: ${payload.countries} paises y ${payload.matches} partidos.`,
        );
      }
    } catch {
      setNotice('Import API fallo. Continua carga manual en backoffice.');
    } finally {
      setIsBusy(false);
    }
  }

  const countryOptions = useMemo(() => sortByName(countries), [countries]);
  const countriesByGroup = useMemo(() => sortByGroup(countries), [countries]);

  function addCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void (async () => {
      const normalizedName = countryName.trim();
      const normalizedCode = countryCode.trim().toUpperCase();

      if (!normalizedName || normalizedCode.length !== 3) {
        setNotice('Completa pais y codigo ISO de 3 letras.');
        return;
      }

      try {
        setIsBusy(true);
        const response = await fetch(`${API_URL}/backoffice/countries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': adminToken,
          },
          body: JSON.stringify({
            name: normalizedName,
            code: normalizedCode,
            groupName: countryGroup,
          }),
        });

        if (!response.ok) {
          throw new Error('Error creando pais');
        }

        const created = (await response.json()) as Country;
        setCountries((current) => sortByName([...current, created]));
        setCountryName('');
        setCountryCode('');
        setCountryGroup('A');
        setNotice('Pais agregado en PostgreSQL.');
      } catch {
        setNotice('No se pudo crear pais. Verifica duplicados.');
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function addMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void (async () => {
      if (!homeCode || !awayCode || !kickoff || !venue.trim()) {
        setNotice('Completa local, visita, fecha y estadio.');
        return;
      }

      if (homeCode === awayCode) {
        setNotice('Local y visita no pueden ser el mismo pais.');
        return;
      }

      try {
        setIsBusy(true);
        const response = await fetch(`${API_URL}/backoffice/matches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': adminToken,
          },
          body: JSON.stringify({
            homeCode,
            awayCode,
            kickoff: new Date(kickoff).toISOString(),
            stage,
            venue: venue.trim(),
          }),
        });

        if (!response.ok) {
          throw new Error('Error creando partido');
        }

        await loadData(adminToken);
        setHomeCode('');
        setAwayCode('');
        setKickoff('');
        setStage('Grupos');
        setVenue('');
        setNotice('Partido agregado en PostgreSQL.');
      } catch {
        setNotice('No se pudo crear partido. Revisa paises/fecha.');
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function deleteCountry(id: number) {
    void (async () => {
      try {
        setIsBusy(true);
        await fetch(`${API_URL}/backoffice/countries/${id}`, {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken },
        });
        await loadData(adminToken);
        setNotice('Pais eliminado.');
      } catch {
        setNotice('No se pudo eliminar pais.');
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function deleteMatch(id: number) {
    void (async () => {
      try {
        setIsBusy(true);
        await fetch(`${API_URL}/backoffice/matches/${id}`, {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken },
        });
        await loadData(adminToken);
        setNotice('Partido eliminado.');
      } catch {
        setNotice('No se pudo eliminar partido.');
      } finally {
        setIsBusy(false);
      }
    })();
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Backoffice Mundial 2026</h1>
          <p>
            Gestiona paises y partidos en PostgreSQL. Puedes importar desde API externa y si falla,
            el sistema cae automaticamente al fallback manual.
          </p>
        </div>
        <div className="backoffice-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              window.localStorage.removeItem(ADMIN_TOKEN_KEY);
              router.push('/backoffice/login');
            }}
          >
            Cerrar admin
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={importFromApiWithFallback}
            disabled={isBusy}
          >
            Importar desde API
          </button>
          <Link className="button button-secondary" href="/backoffice/officials">
            Ver funcionarios
          </Link>
          <Link className="button button-primary" href="/">
            Volver al login
          </Link>
        </div>
      </section>

      <section className="backoffice-grid">
        <article className="panel backoffice-card">
          <h2>Paises del mundial</h2>
          <form className="form" onSubmit={addCountry}>
            <label className="label">
              Pais
              <input
                className="input"
                value={countryName}
                onChange={(event) => setCountryName(event.target.value)}
                placeholder="Argentina"
                required
              />
            </label>
            <div className="inline-fields">
              <label className="label">
                Codigo
                <input
                  className="input"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 3))}
                  placeholder="ARG"
                  required
                />
              </label>
              <label className="label">
                Grupo
                <select className="input" value={countryGroup} onChange={(event) => setCountryGroup(event.target.value)}>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((group) => (
                    <option value={group} key={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button button-primary" type="submit">
              Agregar pais
            </button>
          </form>

          <div className="table-wrap table-wrap-y">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pais</th>
                  <th>Cod</th>
                  <th>Grupo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {countriesByGroup.map((country) => (
                  <tr key={country.id}>
                    <td>{country.name}</td>
                    <td>{country.code}</td>
                    <td>{country.groupName}</td>
                    <td>
                      <button className="mini-button" type="button" onClick={() => deleteCountry(country.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel backoffice-card">
          <h2>Proximos partidos</h2>
          <form className="form" onSubmit={addMatch}>
            <div className="inline-fields two-col">
              <label className="label">
                Local
                <select
                  className="input"
                  value={homeCode}
                  onChange={(event) => setHomeCode(event.target.value)}
                  required
                >
                  <option value="">Selecciona</option>
                  {countryOptions.map((country) => (
                    <option value={country.code} key={`home-${country.id}`}>
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Visita
                <select
                  className="input"
                  value={awayCode}
                  onChange={(event) => setAwayCode(event.target.value)}
                  required
                >
                  <option value="">Selecciona</option>
                  {countryOptions.map((country) => (
                    <option value={country.code} key={`away-${country.id}`}>
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="inline-fields two-col">
              <label className="label">
                Fecha y hora
                <input
                  className="input"
                  type="datetime-local"
                  value={kickoff}
                  onChange={(event) => setKickoff(event.target.value)}
                  required
                />
              </label>
              <label className="label">
                Fase
                <select className="input" value={stage} onChange={(event) => setStage(event.target.value)}>
                  <option value="Grupos">Grupos</option>
                  <option value="Octavos">Octavos</option>
                  <option value="Cuartos">Cuartos</option>
                  <option value="Semifinal">Semifinal</option>
                  <option value="Final">Final</option>
                </select>
              </label>
            </div>

            <label className="label">
              Estadio
              <input
                className="input"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                placeholder="MetLife Stadium"
                required
              />
            </label>

            <button className="button button-primary" type="submit">
              Agregar partido
            </button>
          </form>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Partido</th>
                  <th>Fecha</th>
                  <th>Fase</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td>
                      <strong>
                        {match.home} vs {match.away}
                      </strong>
                      <span>{match.venue}</span>
                    </td>
                    <td>{new Date(match.kickoff).toLocaleString()}</td>
                    <td>{match.stage}</td>
                    <td>
                      <button className="mini-button" type="button" onClick={() => deleteMatch(match.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

      </section>

      <section className="panel api-ready-card">
        <h3>Preparado para API externa</h3>
        <p>
          Si `WORLDCUP_IMPORT_URL` responde bien, se importa desde API. Si falla, el backend carga
          dataset fallback y el backoffice sigue operando en manual sin romper flujo.
        </p>
      </section>

      <div className="status">{notice}</div>
    </main>
  );
}
