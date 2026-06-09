'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION_TOKEN_KEY = 'edge-worldcup-token';

type Country = {
  code: string;
  name: string;
  groupName: string;
};

type Prediction = {
  qualifiedCodes: string[];
  finalistCodes: string[];
  championCode: string;
} | null;

const FLAG_BY_CODE: Record<string, string> = {
  CAN: '🇨🇦',
  MEX: '🇲🇽',
  USA: '🇺🇸',
  CUW: '🇨🇼',
  HAI: '🇭🇹',
  PAN: '🇵🇦',
  ARG: '🇦🇷',
  BRA: '🇧🇷',
  COL: '🇨🇴',
  ECU: '🇪🇨',
  PAR: '🇵🇾',
  URU: '🇺🇾',
  AUS: '🇦🇺',
  IRN: '🇮🇷',
  JPN: '🇯🇵',
  JOR: '🇯🇴',
  KOR: '🇰🇷',
  QAT: '🇶🇦',
  KSA: '🇸🇦',
  UZB: '🇺🇿',
  IRQ: '🇮🇶',
  ALG: '🇩🇿',
  CPV: '🇨🇻',
  CIV: '🇨🇮',
  EGY: '🇪🇬',
  GHA: '🇬🇭',
  MAR: '🇲🇦',
  SEN: '🇸🇳',
  RSA: '🇿🇦',
  TUN: '🇹🇳',
  COD: '🇨🇩',
  NZL: '🇳🇿',
  AUT: '🇦🇹',
  BEL: '🇧🇪',
  BIH: '🇧🇦',
  CRO: '🇭🇷',
  CZE: '🇨🇿',
  ENG: '🏴',
  FRA: '🇫🇷',
  GER: '🇩🇪',
  NED: '🇳🇱',
  POR: '🇵🇹',
  NOR: '🇳🇴',
  SCO: '🏴',
  ESP: '🇪🇸',
  SWE: '🇸🇪',
  SUI: '🇨🇭',
  TUR: '🇹🇷',
};

export default function UserPanelReadonlyPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [qualifiedCodes, setQualifiedCodes] = useState<string[]>([]);
  const [finalistCodes, setFinalistCodes] = useState<string[]>([]);
  const [championCode, setChampionCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      router.replace('/');
      return;
    }

    void loadPanel(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qualifiedSet = useMemo(() => new Set(qualifiedCodes), [qualifiedCodes]);

  const groupedCountries = useMemo(() => {
    const groups = new Map<string, Country[]>();

    for (const country of countries) {
      const current = groups.get(country.groupName) ?? [];
      current.push(country);
      groups.set(country.groupName, current);
    }

    return Array.from(groups.entries())
      .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
      .map(([groupName, teams]) => ({
        groupName,
        teams: teams.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [countries]);

  function getFlag(code: string) {
    return FLAG_BY_CODE[code] ?? '🏳️';
  }

  async function loadPanel(token: string) {
    try {
      setBusy(true);
      const savedFromQuery = new URLSearchParams(window.location.search).get('status') === 'saved';
      const response = await fetch(`${API_URL}/user/panel-data`, {
        headers: { 'x-session-token': token },
      });

      if (!response.ok) {
        throw new Error('Sesion invalida');
      }

      const payload = (await response.json()) as {
        countries: Country[];
        prediction: Prediction;
      };

      setCountries(payload.countries);
      if (payload.prediction) {
        setQualifiedCodes(payload.prediction.qualifiedCodes);
        setFinalistCodes(payload.prediction.finalistCodes);
        setChampionCode(payload.prediction.championCode);
        if (savedFromQuery) {
          setNotice('Prediccion guardada correctamente.');
        }
      } else {
        router.replace('/panel');
      }
    } catch {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="user-panel-shell">
      <section className="panel user-panel-head">
        <div>
          <span className="eyebrow">Panel de usuario</span>
          <h1>Prediccion en modo lectura</h1>
          <p>Tu prediccion ya fue guardada. Desde aqui solo puedes verla.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" href="/backoffice/login">
            Admin panel
          </Link>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              window.localStorage.removeItem(SESSION_TOKEN_KEY);
              router.push('/');
            }}
          >
            Cerrar sesion
          </button>
        </div>
      </section>

      <section className="panel user-panel-card readonly-summary-card">
        <h2>Resumen guardado</h2>
        <div className="readonly-summary-grid">
          <div className="readonly-summary-item">
            <span>Clasificados</span>
            <strong>{qualifiedCodes.length}/32</strong>
          </div>
          <div className="readonly-summary-item">
            <span>Finalistas</span>
            <strong>{finalistCodes.length}/2</strong>
          </div>
          <div className="readonly-summary-item">
            <span>Campeon</span>
            <strong>{championCode || '-'}</strong>
          </div>
        </div>
      </section>

      <section className="user-panel-grid">
        <section className="panel user-panel-card user-panel-card-bottom">
          <h2>Clasificados a siguiente ronda</h2>
          <p>{qualifiedCodes.length}/32 seleccionados</p>
          <div className="country-groups">
            {groupedCountries.map((group) => {
              const selectedInGroup = group.teams.filter((team) => qualifiedSet.has(team.code)).length;

              return (
                <section className="group-box" key={group.groupName}>
                  <header className="group-head">
                    <strong>Grupo {group.groupName}</strong>
                    <span className="group-count">{selectedInGroup}/{group.teams.length}</span>
                  </header>

                  <div className="group-country-grid">
                    {group.teams.map((country) => {
                      const isSelected = qualifiedSet.has(country.code);
                      const cardClassName = ['country-item', isSelected ? 'is-selected' : '', 'is-readonly']
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <div className={cardClassName} key={country.code}>
                          <span className="country-flag" aria-hidden="true">{getFlag(country.code)}</span>
                          <span className="country-name">{country.name}</span>
                          <small className="country-code">{country.code}</small>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="panel user-panel-card user-panel-card-top readonly-final-card">
          <h2>Final y campeon</h2>
          <div className="readonly-final-list">
            <div className="readonly-final-slot">
              <span>Finalista 1</span>
              <strong>{finalistCodes[0] ?? '-'}</strong>
            </div>
            <div className="readonly-final-slot">
              <span>Finalista 2</span>
              <strong>{finalistCodes[1] ?? '-'}</strong>
            </div>
            <div className="readonly-final-slot readonly-champion">
              <span>Campeon</span>
              <strong>{championCode || '-'}</strong>
            </div>
          </div>
        </section>
      </section>

      {notice ? <div className="status">{busy ? 'Cargando...' : notice}</div> : <div className="status">{busy ? 'Cargando...' : 'Solo lectura'}</div>}
    </main>
  );
}
