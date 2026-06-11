'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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

type PredictionStage = 'stage1' | 'stage2' | 'readonly';

const FLAG_IMG_BY_CODE: Record<string, string> = {
  CAN: '/flags/canada.jpg',
  MEX: '/flags/mexico.jpg',
  USA: '/flags/estadosunidos.jpg',
  CUW: '/flags/curazao.jpg',
  HAI: '/flags/haiti.jpg',
  PAN: '/flags/panama.jpg',
  ARG: '/flags/argentina.jpg',
  BRA: '/flags/brasil.jpg',
  COL: '/flags/colombia.jpg',
  ECU: '/flags/ecuador.jpg',
  PAR: '/flags/paraguay.jpg',
  URU: '/flags/uruguay.jpg',
  AUS: '/flags/australia.jpg',
  IRN: '/flags/iran.jpg',
  JPN: '/flags/japon.jpg',
  JOR: '/flags/jordania.jpg',
  KOR: '/flags/coreadelsur.jpg',
  QAT: '/flags/qatar.jpg',
  KSA: '/flags/arabiasaudita.jpg',
  UZB: '/flags/uzbekistan.jpg',
  IRQ: '/flags/irak.jpg',
  ALG: '/flags/argelia.jpg',
  CPV: '/flags/caboverde.jpg',
  CIV: '/flags/costademarfil.jpg',
  EGY: '/flags/egipto.jpg',
  GHA: '/flags/ghana.jpg',
  MAR: '/flags/marruecos.jpg',
  SEN: '/flags/senegal.jpg',
  RSA: '/flags/sudafrica.jpg',
  TUN: '/flags/tunez.jpg',
  COD: '/flags/rdcongo.jpg',
  NZL: '/flags/nuevazelanda.jpg',
  AUT: '/flags/austria.jpg',
  BEL: '/flags/belgica.jpg',
  BIH: '/flags/bosniayherzegovina.jpg',
  CRO: '/flags/croacia.jpg',
  CZE: '/flags/republicacheca.jpg',
  ENG: '/flags/inglaterra.jpg',
  FRA: '/flags/francia.jpg',
  GER: '/flags/alemania.jpg',
  NED: '/flags/paisesbajos.jpg',
  POR: '/flags/portugal.jpg',
  NOR: '/flags/noruega.jpg',
  SCO: '/flags/escocia.jpg',
  ESP: '/flags/espana.jpg',
  SWE: '/flags/suecia.jpg',
  SUI: '/flags/suiza.jpg',
  TUR: '/flags/turquia.jpg',
};

export default function UserPanelPage() {
  const router = useRouter();
  const [countries, setCountries] = useState<Country[]>([]);
  const [qualifiedCodes, setQualifiedCodes] = useState<string[]>([]);
  const [finalistCodes, setFinalistCodes] = useState<string[]>([]);
  const [championCode, setChampionCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [predictionStage, setPredictionStage] = useState<PredictionStage>('stage1');
  const [stage1LockAt, setStage1LockAt] = useState<string | null>(null);
  const [stage2LockAt, setStage2LockAt] = useState<string | null>(null);

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
  const isStage1 = predictionStage === 'stage1';
  const isStage2 = predictionStage === 'stage2';

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

  const countryByCode = useMemo(() => {
    return new Map(countries.map((country) => [country.code, country]));
  }, [countries]);

  function getFlagImg(code: string) {
    return FLAG_IMG_BY_CODE[code] ?? null;
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
        predictionStage: PredictionStage;
        predictionStage1LockAt: string | null;
        predictionStage2LockAt: string | null;
      };

      setCountries(payload.countries);
      setPredictionStage(payload.predictionStage);
      setStage1LockAt(payload.predictionStage1LockAt);
      setStage2LockAt(payload.predictionStage2LockAt);

      if (payload.predictionStage === 'readonly') {
        router.replace('/panel/readonly');
        return;
      }

      if (payload.prediction) {
        setQualifiedCodes(payload.prediction.qualifiedCodes);
        setFinalistCodes(payload.prediction.finalistCodes);
        setChampionCode(payload.prediction.championCode);
      }

      if (payload.predictionStage === 'stage1') {
        setNotice(payload.prediction ? 'Etapa 1 habilitada: puedes editar los 32 clasificados.' : 'Etapa 1 habilitada: selecciona tus 32 clasificados.');
      } else {
        setNotice('Etapa 2 habilitada: define finalistas y campeon.');
      }
    } catch {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  function toggleQualified(code: string) {
    if (!isStage1) {
      return;
    }

    setNotice('');
    setQualifiedCodes((current) => {
      const targetCountry = countryByCode.get(code);

      if (current.includes(code)) {
        const next = current.filter((item) => item !== code);
        setFinalistCodes((finalists) => finalists.filter((item) => item !== code));
        setChampionCode((champion) => (champion === code ? '' : champion));
        return next;
      }

      if (targetCountry) {
        const selectedInGroup = current.filter((item) => countryByCode.get(item)?.groupName === targetCountry.groupName).length;
        if (selectedInGroup >= 3) {
          setNotice(`Solo puedes elegir 3 paises del grupo ${targetCountry.groupName}.`);
          return current;
        }
      }

      if (current.length >= 32) {
        setNotice('Solo puedes seleccionar 32 clasificados.');
        return current;
      }

      return [...current, code];
    });
  }

  function updateFinalist(slot: 0 | 1, code: string) {
    if (!isStage2) {
      return;
    }

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

    if (isStage2) {
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
          finalistCodes: isStage2 ? cleanFinalists : undefined,
          championCode: isStage2 ? championCode : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string | string[] };
        const msg = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message ?? 'No se pudo guardar prediccion.';
        throw new Error(msg);
      }

      const payload = (await response.json()) as { stage?: string; message?: string };
      setNotice(payload.message ?? (isStage2 ? 'Etapa 2 guardada.' : 'Etapa 1 guardada.'));
      await loadPanel(sessionToken);
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
          <Image src="/edgelogo.svg" alt="Edge" width={120} height={34} priority className="edge-logo" />
          <span className="eyebrow">Panel de usuario</span>
          <h1>Tu prediccion del Mundial</h1>
          <p>
            {isStage1
              ? 'Etapa 1: selecciona los 32 clasificados.'
              : 'Etapa 2: selecciona finalistas y campeon.'}
          </p>
          <p className="small">
            Etapa 1 cierra: {stage1LockAt ? new Date(stage1LockAt).toLocaleString() : 'sin fecha'} · Etapa 2 cierra:{' '}
            {stage2LockAt ? new Date(stage2LockAt).toLocaleString() : 'sin fecha'}
          </p>
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
        <section className="panel user-panel-card user-panel-card-bottom">
          <div className="panel-card-header">
            <h2>Clasificados a siguiente ronda</h2>
            <p>{qualifiedCodes.length}/32 seleccionados</p>
          </div>
          {!isStage1 ? <p className="small">Etapa 1 cerrada. Los 32 clasificados quedan en solo lectura.</p> : null}
          <div className="country-groups">
            {groupedCountries.map((group) => {
              const selectedInGroup = group.teams.filter((team) => qualifiedSet.has(team.code)).length;

              return (
                <section className="group-box" key={group.groupName}>
                  <header className="group-head">
                    <strong>Grupo {group.groupName}</strong>
                    <span className="group-count">{selectedInGroup}/3 max</span>
                  </header>

                  <div className="group-country-grid">
                    {group.teams.map((country) => {
                      const isSelected = qualifiedSet.has(country.code);
                      const isDisabled = !isStage1 || (!isSelected && (qualifiedCodes.length >= 32 || selectedInGroup >= 3));
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
                          <span className="country-flag" aria-hidden="true">
                            {getFlagImg(country.code) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={getFlagImg(country.code)!} alt="" className="country-flag-img" />
                            ) : null}
                          </span>
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
        </section>

        <section className="panel user-panel-card user-panel-card-top">
          <h2>Final y campeon</h2>
          {!isStage2 ? <p className="small">Etapa 2 aun no habilitada. Se activa cuando cierre etapa 1.</p> : null}
          <div className="form">
            <label className="label">
              Finalista 1
              <select
                className="input"
                value={finalistCodes[0] ?? ''}
                onChange={(event) => updateFinalist(0, event.target.value)}
                disabled={!isStage2}
              >
                <option value="">Selecciona</option>
                {finalistOptions.map((country) => (
                  <option key={`f1-${country.code}`} value={country.code}>
                    {country.name} ({country.code})
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
                disabled={!isStage2}
              >
                <option value="">Selecciona</option>
                {finalistOptions.map((country) => (
                  <option key={`f2-${country.code}`} value={country.code}>
                    {country.name} ({country.code})
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
                disabled={!isStage2}
              >
                <option value="">Selecciona</option>
                {finalistOptions
                  .filter((country) => finalistCodes.includes(country.code))
                  .map((country) => (
                    <option key={`champ-${country.code}`} value={country.code}>
                      {country.name} ({country.code})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </section>

        <div className="button-row user-panel-submit">
          <button className="button button-primary" type="submit" disabled={busy}>
            {isStage1 ? 'Guardar etapa 1' : 'Guardar etapa 2'}
          </button>
        </div>
      </form>

      <div className="status">{busy ? 'Guardando...' : notice}</div>
    </main>
  );
}
