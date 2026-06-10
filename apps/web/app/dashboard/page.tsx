'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';

type LeaderItem = {
  id: number;
  rank: number;
  name: string;
  points: number;
  progress: number;
  streakLevel: number;
  streakLabel: string;
  avatarRow: 'male' | 'female';
  avatarFrame: number;
  avatarImage: string;
  isPremium: boolean;
  hitStreak: number;
  missStreak: number;
  isFailStreak: boolean;
};

type LeaderboardPayload = {
  goalPoints: number;
  phase: string;
  nextUpdateInSeconds: number;
  liveUpdatedAt: string;
  leaders: LeaderItem[];
  groups: GroupStanding[];
};

type GroupStandingTeam = {
  code: string;
  name: string;
  groupName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  progress: number;
  qualificationStatus: 'directo' | 'tercero' | 'afuera';
};

type GroupStanding = {
  groupName: string;
  progress: number;
  teams: GroupStandingTeam[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const FLAG_BY_CODE: Record<string, string> = {
  CAN: '🇨🇦', MEX: '🇲🇽', USA: '🇺🇸', CUW: '🇨🇼', HAI: '🇭🇹', PAN: '🇵🇦',
  ARG: '🇦🇷', BRA: '🇧🇷', COL: '🇨🇴', ECU: '🇪🇨', PAR: '🇵🇾', URU: '🇺🇾',
  AUS: '🇦🇺', IRN: '🇮🇷', JPN: '🇯🇵', JOR: '🇯🇴', KOR: '🇰🇷', QAT: '🇶🇦',
  KSA: '🇸🇦', UZB: '🇺🇿', IRQ: '🇮🇶', ALG: '🇩🇿', CPV: '🇨🇻', CIV: '🇨🇮',
  EGY: '🇪🇬', GHA: '🇬🇭', MAR: '🇲🇦', SEN: '🇸🇳', RSA: '🇿🇦', TUN: '🇹🇳',
  COD: '🇨🇩', NZL: '🇳🇿', AUT: '🇦🇹', BEL: '🇧🇪', BIH: '🇧🇦', CRO: '🇭🇷',
  CZE: '🇨🇿', ENG: '🏴', FRA: '🇫🇷', GER: '🇩🇪', NED: '🇳🇱', POR: '🇵🇹',
  NOR: '🇳🇴', SCO: '🏴', ESP: '🇪🇸', SWE: '🇸🇪', SUI: '🇨🇭', TUR: '🇹🇷',
};

function avatarSrc(row: 'male' | 'female', frame: number) {
  const normalized = Math.min(10, Math.max(1, frame + 1));
  const prefix = row === 'female' ? 'f' : 'm';
  return `/avatars/${prefix}${normalized}.png`;
}

function laneTone(rank: number) {
  if (rank === 1) {
    return 'lane-red';
  }

  if (rank === 2) {
    return 'lane-orange';
  }

  if (rank === 3) {
    return 'lane-yellow';
  }

  if (rank === 4) {
    return 'lane-green';
  }

  return 'lane-blue';
}

function formatTimer(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function tierFromStreak(streakLevel: number) {
  if (streakLevel >= 5) {
    return 'Racha 6+ aciertos';
  }

  if (streakLevel <= 0) {
    return 'Avatar base';
  }

  return `Racha ${streakLevel} aciertos`;
}

function descriptionFromStreak(streakLevel: number) {
  if (streakLevel >= 5) {
    return 'Desbloquea corona legendaria.';
  }

  if (streakLevel === 4) {
    return 'Desbloquea efecto fuego.';
  }

  if (streakLevel === 3) {
    return 'Desbloquea lentes premium.';
  }

  if (streakLevel === 2) {
    return 'Sube al siguiente set de avatar.';
  }

  if (streakLevel === 1) {
    return 'Inicia tu progreso de racha.';
  }

  return 'Tu carrera comienza aqui.';
}

function comboModeLabel(hitStreak: number) {
  if (hitStreak >= 23) {
    return 'WORLD DOMINATION';
  }

  if (hitStreak >= 19) {
    return 'EXECUTIONER';
  }

  if (hitStreak >= 16) {
    return 'BRUTALITY MODE';
  }

  if (hitStreak >= 13) {
    return 'FATAL STRIKE';
  }

  if (hitStreak >= 10) {
    return 'NO MERCY';
  }

  if (hitStreak >= 7) {
    return 'COMBO STARTER';
  }

  if (hitStreak >= 4) {
    return 'PREDATOR INSTINCT';
  }

  if (hitStreak >= 2) {
    return 'WARM UP';
  }

  return 'DESCONECTADO';
}

const FAIL_MODE_LABELS = [
  'Clown Mode Activated',
  'Choke Artist',
  'Almost Legendary',
  'Pressure Folded You',
  'Lag In Brain',
  'Juice Drained',
  'Racha Funeral',
  'Misclick Supreme',
];

function failModeLabel(missStreak: number) {
  if (missStreak < 2) {
    return '';
  }

  const index = Math.min(FAIL_MODE_LABELS.length - 1, missStreak - 2);
  return FAIL_MODE_LABELS[index] ?? FAIL_MODE_LABELS[0];
}

export default function DashboardPage() {
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadBoard() {
      try {
        const response = await fetch(`${API_URL}/dashboard/leaderboard`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('No se pudo cargar el dashboard.');
        }

        const payload = (await response.json()) as LeaderboardPayload;
        if (!isMounted) {
          return;
        }

        setBoard(payload);
        setError('');
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el dashboard.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBoard();
    const timer = window.setInterval(() => {
      void loadBoard();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const leaders = board?.leaders ?? [];
  const groups = board?.groups ?? [];
  const topTen = leaders.slice(0, 10);
  const others = leaders.slice(10);
  const premiumCount = leaders.filter((leader) => leader.isPremium).length;
  const unlocks = useMemo(() => {
    const levels = [0, 2, 3, 4, 5];
    return levels.map((level, index) => {
      const probe = leaders[index] ?? leaders[0];
      return {
        level,
        frame: probe ? (level === 0 ? 0 : Math.min(9, level + 4)) : 0,
        row: (index % 2 === 0 ? 'male' : 'female') as 'male' | 'female',
      };
    });
  }, [leaders]);

  return (
    <main className="race-shell">
      <section className="race-topbar panel">
        <div className="race-brand">
          <span className="race-cup">🏆</span>
          <div>
            <strong>MUNDIAL 2026</strong>
            <span>LA CARRERA</span>
          </div>
        </div>

        <div className="race-metrics">
          <article>
            <span>Puntos totales en juego</span>
            <strong>{board?.goalPoints ?? 32} pts</strong>
          </article>
          <article>
            <span>Fase actual</span>
            <strong>{board?.phase ?? 'Fase de Grupos'}</strong>
          </article>
          <article className="race-metrics-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/edgelogo.svg" alt="Edge" className="topbar-edge-logo" />
          </article>
        </div>

        <div className="race-live">
          <strong>EN VIVO</strong>
          <span>
            {board?.liveUpdatedAt
              ? `Actualizado ${new Date(board.liveUpdatedAt).toLocaleTimeString()}`
              : 'Actualizado hace instantes'}
          </span>
        </div>
      </section>

      <section className="panel race-board">
        <header className="race-board-head">
          <div>
            <h1>Ranking en vivo</h1>
            <p>Acierta resultados y gana la carrera. {premiumCount} premium activos.</p>
          </div>
          <div className="race-board-actions">
            <Link className="button button-secondary" href="/">
              Volver
            </Link>
          </div>
        </header>

        <div className="race-scale">
          <span>0 pts</span>
          <span>8 pts</span>
          <span>16 pts</span>
          <span>24 pts</span>
          <span>Meta {board?.goalPoints ?? 32} pts</span>
        </div>

        {isLoading && <div className="status">Cargando ranking...</div>}
        {error && <div className="status error">{error}</div>}

        <div className="race-list">
          {topTen.map((leader) => {
            const tone = laneTone(leader.rank);
            const hasFireAura = leader.points > 25;
            const comboLabel = comboModeLabel(leader.hitStreak);
            const failLabel = leader.isFailStreak ? failModeLabel(leader.missStreak) : '';
            const style = {
              '--progress': `${leader.progress}%`,
            } as CSSProperties;

            return (
              <article className={`race-row ${tone} ${leader.isPremium ? 'is-premium' : ''}`} key={leader.id} style={style}>
                <div className="race-rank">{leader.rank}</div>
                <div className="race-runner">
                  <div className={`race-avatar-wrap ${leader.isPremium ? 'is-premium' : ''} ${hasFireAura ? 'is-on-fire' : ''}`}>
                    <img
                      className="race-avatar"
                      src={leader.avatarImage}
                      alt={`Avatar ${leader.name}`}
                    />
                    {leader.isPremium && <span className="premium-mark">P</span>}
                  </div>
                  <div className="race-runner-copy">
                    <div className="race-name-line">
                      <strong>{leader.name}</strong>
                      {leader.isPremium && <span className="premium-pill">Premium</span>}
                    </div>
                    <div className="race-streak-line">
                      <span className="race-streak-label">Hits seguidos: {leader.hitStreak}</span>
                      <span className="mode-pill mode-pill-combo">{comboLabel}</span>
                      {failLabel && <span className="mode-pill mode-pill-fail">{failLabel}</span>}
                    </div>
                  </div>
                </div>
                <div className="race-points-box">
                  <strong>{leader.points}</strong>
                  <span>pts</span>
                </div>

                <div className="race-lane" aria-hidden="true">
                  <div className="race-progress" />
                  <div className={`race-avatar-wrap race-avatar-inline ${leader.isPremium ? 'is-premium' : ''} ${hasFireAura ? 'is-on-fire' : ''}`}>
                    <img className="race-avatar" src={leader.avatarImage} alt="" />
                  </div>
                </div>

                <div className="race-points-end">{leader.points} pts</div>
              </article>
            );
          })}
        </div>

        {others.length > 0 && (
          <section className="race-rest">
            <div className="race-rest-head">
              <h2>Todos los participantes</h2>
              <p>{others.length} participantes mas en formato compacto. Premium claros con badge dorado.</p>
            </div>

            <div className="race-rest-list">
              {others.map((leader) => {
                const hasFireAura = leader.points > 25;
                const comboLabel = comboModeLabel(leader.hitStreak);
                const failLabel = leader.isFailStreak ? failModeLabel(leader.missStreak) : '';

                return (
                <article className={`race-rest-row ${leader.isPremium ? 'is-premium' : ''}`} key={leader.id}>
                  <div className="race-rest-rank">#{leader.rank}</div>
                  <div className={`race-avatar-wrap race-avatar-small-wrap ${leader.isPremium ? 'is-premium' : ''} ${hasFireAura ? 'is-on-fire' : ''}`}>
                    <img className="race-avatar race-avatar-small" src={leader.avatarImage} alt={`Avatar ${leader.name}`} />
                    {leader.isPremium && <span className="premium-mark premium-mark-small">P</span>}
                  </div>
                  <div className="race-rest-runner">
                    <div className="race-rest-name-line">
                      <strong>{leader.name}</strong>
                      {leader.isPremium && <span className="premium-pill premium-pill-small">Premium</span>}
                    </div>
                    <div className="race-rest-streak-line">
                      <span>Hits seguidos: {leader.hitStreak}</span>
                      <span className="mode-pill mode-pill-combo mode-pill-small">{comboLabel}</span>
                      {failLabel && <span className="mode-pill mode-pill-fail mode-pill-small">{failLabel}</span>}
                    </div>
                  </div>
                  <div className="race-rest-points">{leader.points} pts</div>
                </article>
                );
              })}
            </div>
          </section>
        )}
      </section>

      <section className="panel race-groups-panel">
        <header className="race-board-head">
          <div>
            <h2>Clasificacion por grupo</h2>
            <p>Tabla de posiciones actualizada en vivo conforme cargas resultados.</p>
          </div>
        </header>

        <div className="race-groups-tables">
          {groups.map((group) => (
            <div className="race-group-table-wrap" key={group.groupName}>
              <h3>Grupo {group.groupName}</h3>
              <table className="race-group-table">
                <thead>
                  <tr>
                    <th className="pos-col">#</th>
                    <th>Equipo</th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>E</th>
                    <th>P</th>
                    <th>DG</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {group.teams.map((team, index) => (
                    <tr key={team.code} className={`is-${team.qualificationStatus}`}>
                      <td className="pos-col">{index + 1}</td>
                      <td className="team-name">
                        <span className="team-flag">{FLAG_BY_CODE[team.code] ?? '🏳️'}</span>
                        {team.name}
                      </td>
                      <td>{team.played}</td>
                      <td>{team.wins}</td>
                      <td>{team.draws}</td>
                      <td>{team.losses}</td>
                      <td className={team.goalDifference >= 0 ? 'positive' : 'negative'}>
                        {team.goalDifference >= 0 ? '+' : ''}{team.goalDifference}
                      </td>
                      <td className="pts-bold">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="panel race-unlocks">
        <header>
          <h2>Desbloquea mejoras</h2>
          <p>Manten tu racha y cambia tu icono automaticamente.</p>
        </header>
        <div className="race-unlocks-grid">
          {unlocks.map((unlock) => {
            return (
              <article className="unlock-card" key={unlock.level}>
                <img
                  className="race-avatar"
                  src={avatarSrc(unlock.row, unlock.frame)}
                  alt=""
                />
                <div>
                  <strong>{tierFromStreak(unlock.level)}</strong>
                  <p>{descriptionFromStreak(unlock.level)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
