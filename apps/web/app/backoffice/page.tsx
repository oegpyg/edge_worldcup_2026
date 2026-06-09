'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Country = {
  id: string;
  name: string;
  code: string;
  group: string;
};

type MatchItem = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  stage: string;
  venue: string;
};

const STORAGE_KEY = 'edge-worldcup-backoffice-v1';

const seedCountries: Country[] = [
  { id: crypto.randomUUID(), name: 'Argentina', code: 'ARG', group: 'A' },
  { id: crypto.randomUUID(), name: 'Brazil', code: 'BRA', group: 'B' },
  { id: crypto.randomUUID(), name: 'Mexico', code: 'MEX', group: 'C' },
  { id: crypto.randomUUID(), name: 'Portugal', code: 'POR', group: 'D' },
];

const seedMatches: MatchItem[] = [
  {
    id: crypto.randomUUID(),
    home: 'Argentina',
    away: 'Portugal',
    kickoff: '2026-06-21T18:00',
    stage: 'Grupos',
    venue: 'MetLife Stadium',
  },
  {
    id: crypto.randomUUID(),
    home: 'Mexico',
    away: 'Brazil',
    kickoff: '2026-06-22T20:00',
    stage: 'Grupos',
    venue: 'Estadio Azteca',
  },
];

function sortByName(countries: Country[]) {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name));
}

export default function BackofficePage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [countryName, setCountryName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryGroup, setCountryGroup] = useState('A');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [stage, setStage] = useState('Grupos');
  const [venue, setVenue] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setCountries(sortByName(seedCountries));
        setMatches(seedMatches);
        return;
      }

      const parsed = JSON.parse(raw) as { countries?: Country[]; matches?: MatchItem[] };
      setCountries(sortByName(parsed.countries ?? []));
      setMatches(parsed.matches ?? []);
    } catch {
      setCountries(sortByName(seedCountries));
      setMatches(seedMatches);
    }
  }, []);

  useEffect(() => {
    if (countries.length === 0 && matches.length === 0) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ countries, matches }));
  }, [countries, matches]);

  const countryOptions = useMemo(() => sortByName(countries), [countries]);

  function addCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = countryName.trim();
    const normalizedCode = countryCode.trim().toUpperCase();

    if (!normalizedName || normalizedCode.length !== 3) {
      setNotice('Completa pais y codigo ISO de 3 letras.');
      return;
    }

    if (countries.some((item) => item.code === normalizedCode || item.name === normalizedName)) {
      setNotice('Ese pais ya existe en la lista.');
      return;
    }

    setCountries((current) =>
      sortByName([
        ...current,
        {
          id: crypto.randomUUID(),
          name: normalizedName,
          code: normalizedCode,
          group: countryGroup,
        },
      ]),
    );
    setCountryName('');
    setCountryCode('');
    setCountryGroup('A');
    setNotice('Pais agregado al backoffice.');
  }

  function addMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!home || !away || !kickoff || !venue.trim()) {
      setNotice('Completa local, visita, fecha y estadio.');
      return;
    }

    if (home === away) {
      setNotice('Local y visita no pueden ser el mismo pais.');
      return;
    }

    setMatches((current) => [
      {
        id: crypto.randomUUID(),
        home,
        away,
        kickoff,
        stage,
        venue: venue.trim(),
      },
      ...current,
    ]);
    setHome('');
    setAway('');
    setKickoff('');
    setStage('Grupos');
    setVenue('');
    setNotice('Partido agregado al calendario.');
  }

  function deleteCountry(id: string) {
    const target = countries.find((item) => item.id === id);
    if (!target) {
      return;
    }

    setCountries((current) => current.filter((item) => item.id !== id));
    setMatches((current) =>
      current.filter((item) => item.home !== target.name && item.away !== target.name),
    );
    setNotice('Pais eliminado. Partidos asociados removidos.');
  }

  function deleteMatch(id: string) {
    setMatches((current) => current.filter((item) => item.id !== id));
    setNotice('Partido eliminado.');
  }

  function seedFromApiFallback() {
    setCountries(sortByName(seedCountries));
    setMatches(seedMatches);
    setNotice('Datos demo cargados (fallback manual si falla API externa).');
  }

  return (
    <main className="backoffice-shell">
      <section className="backoffice-head">
        <div>
          <span className="eyebrow">Admin Panel</span>
          <h1>Backoffice Mundial 2026</h1>
          <p>
            Carga manual de paises y partidos para no depender 100% de API externa. Luego se puede
            reemplazar por import automatico.
          </p>
        </div>
        <div className="backoffice-actions">
          <button className="button button-secondary" type="button" onClick={seedFromApiFallback}>
            Cargar datos demo
          </button>
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

          <div className="table-wrap">
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
                {countryOptions.map((country) => (
                  <tr key={country.id}>
                    <td>{country.name}</td>
                    <td>{country.code}</td>
                    <td>{country.group}</td>
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
                <select className="input" value={home} onChange={(event) => setHome(event.target.value)} required>
                  <option value="">Selecciona</option>
                  {countryOptions.map((country) => (
                    <option value={country.name} key={`home-${country.id}`}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Visita
                <select className="input" value={away} onChange={(event) => setAway(event.target.value)} required>
                  <option value="">Selecciona</option>
                  {countryOptions.map((country) => (
                    <option value={country.name} key={`away-${country.id}`}>
                      {country.name}
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
          Esta seccion ya funciona como fallback manual. En una segunda fase podemos conectar API
          Football y reemplazar la carga manual por import automatico.
        </p>
      </section>

      <div className="status">{notice}</div>
    </main>
  );
}
