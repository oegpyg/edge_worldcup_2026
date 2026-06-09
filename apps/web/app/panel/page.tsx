'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION_TOKEN_KEY = 'edge-worldcup-token';

type Country = {
  code: string;
  name: string;
  groupName: string;
};

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

type Prediction = {
  qualifiedCodes: string[];
  finalistCodes: string[];
  championCode: string;
} | null;

export default function UserPanelPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [qualifiedCodes, setQualifiedCodes] = useState<string[]>([]);
  const [finalistCodes, setFinalistCodes] = useState<string[]>([]);
  const [championCode, setChampionCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState('');

  useEffect(() => {
    const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      router.replace('/');
      return;
    }

    setSessionToken(token);
    void loadPanel(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qualifiedSet = useMemo(() => new Set(qualifiedCodes), [qualifiedCodes]);

  const finalistOptions = useMemo(
    () => countries.filter((country) => qualifiedSet.has(country.code)),
    [countries, qualifiedSet],
  );

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
      }
    } catch {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  function toggleQualified(code: string) {
    setNotice('');
    setQualifiedCodes((current) => {
      if (current.includes(code)) {
        const next = current.filter((item) => item !== code);
        setFinalistCodes((finalists) => finalists.filter((item) => item !== code));
        setChampionCode((champion) => (champion === code ? '' : champion));
        return next;
      }

      if (current.length >= 32) {
        setNotice('Solo puedes seleccionar 32 clasificados.');
        return current;
      }

      return [...current, code];
    });
  }

  function updateFinalist(slot: 0 | 1, code: string) {
    setFinalistCodes((current) => {
      const next = [...current];
      next[slot] = code;
      const unique = Array.from(new Set(next.filter((item) => item)));
      if (unique.length < next.filter((item) => item).length) {
        setNotice('No puedes repetir finalistas.');
      }
      return next;
    });

    if (championCode && championCode !== code && ![code, finalistCodes[slot === 0 ? 1 : 0]].includes(championCode)) {
      setChampionCode('');
    }
  }

  async function savePrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (qualifiedCodes.length !== 32) {
      setNotice('Debes elegir exactamente 32 clasificados.');
      return;
    }

    const cleanFinalists = finalistCodes.filter((item) => item);
    if (cleanFinalists.length !== 2) {
      setNotice('Debes elegir 2 finalistas.');
      return;
    }

    if (!championCode) {
      setNotice('Debes elegir campeon.');
      return;
    }

    if (!cleanFinalists.includes(championCode)) {
      setNotice('El campeon debe ser uno de los finalistas.');
      return;
    }

    try {
      setBusy(true);
      const response = await fetch(`${API_URL}/user/prediction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          qualifiedCodes,
          finalistCodes: cleanFinalists,
          championCode,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string | string[] };
        const msg = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message ?? 'No se pudo guardar prediccion.';
        throw new Error(msg);
      }

      setNotice('Prediccion guardada correctamente.');
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'No se pudo guardar prediccion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="user-panel-shell">
      <section className="panel user-panel-head">
        <div>
          <span className="eyebrow">Panel de usuario</span>
          <h1>Tu prediccion del Mundial</h1>
          <p>Selecciona 32 clasificados, 2 finalistas y el campeon.</p>
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

      <form className="user-panel-grid" onSubmit={savePrediction}>
        <section className="panel user-panel-card user-panel-card-top">
          <h2>Final y campeon</h2>
          <div className="form">
            <label className="label">
              Finalista 1
              <select
                className="input"
                value={finalistCodes[0] ?? ''}
                onChange={(event) => updateFinalist(0, event.target.value)}
              >
                <option value="">Selecciona</option>
                {finalistOptions.map((country) => (
                  <option key={`f1-${country.code}`} value={country.code}>
                    {getFlag(country.code)} {country.name} ({country.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="label">
              Finalista 2
              <select
                className="input"
                value={finalistCodes[1] ?? ''}
                onChange={(event) => updateFinalist(1, event.target.value)}
              >
                <option value="">Selecciona</option>
                {finalistOptions.map((country) => (
                  <option key={`f2-${country.code}`} value={country.code}>
                    {getFlag(country.code)} {country.name} ({country.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="label">
              Campeon
              <select
                className="input"
                value={championCode}
                onChange={(event) => setChampionCode(event.target.value)}
              >
                <option value="">Selecciona</option>
                {finalistOptions
                  .filter((country) => finalistCodes.includes(country.code))
                  .map((country) => (
                    <option key={`champ-${country.code}`} value={country.code}>
                      {getFlag(country.code)} {country.name} ({country.code})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </section>

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
                      const isDisabled = !isSelected && qualifiedCodes.length >= 32;
                      const cardClassName = [
                        'country-item',
                        isSelected ? 'is-selected' : '',
                        isDisabled ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <label className={cardClassName} key={country.code}>
                          <input
                            className="country-toggle"
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleQualified(country.code)}
                            disabled={isDisabled}
                          />
                          <span className="country-flag" aria-hidden="true">{getFlag(country.code)}</span>
                          <span className="country-name">{country.name}</span>
                          <small className="country-code">{country.code}</small>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={busy}>
              Guardar prediccion
            </button>
          </div>
        </section>
      </form>

      <div className="status">{busy ? 'Guardando...' : notice}</div>
    </main>
  );
}
