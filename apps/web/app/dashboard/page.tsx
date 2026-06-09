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
};

type LeaderboardPayload = {
  goalPoints: number;
  phase: string;
  nextUpdateInSeconds: number;
  liveUpdatedAt: string;
  leaders: LeaderItem[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
          <article>
            <span>Proxima actualizacion</span>
            <strong>{formatTimer(board?.nextUpdateInSeconds ?? 58)} min</strong>
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
            <p>Acierta resultados y gana la carrera.</p>
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
          {leaders.map((leader) => {
            const tone = laneTone(leader.rank);
            const style = {
              '--progress': `${leader.progress}%`,
            } as CSSProperties;

            return (
              <article className={`race-row ${tone}`} key={leader.id} style={style}>
                <div className="race-rank">{leader.rank}</div>
                <div className="race-runner">
                  <img
                    className="race-avatar"
                    src={leader.avatarImage}
                    alt={`Avatar ${leader.name}`}
                  />
                  <div>
                    <strong>{leader.name}</strong>
                    <span>{leader.streakLabel}</span>
                  </div>
                </div>
                <div className="race-points-box">
                  <strong>{leader.points}</strong>
                  <span>pts</span>
                </div>

                <div className="race-lane" aria-hidden="true">
                  <div className="race-progress" />
                  <img
                    className="race-avatar race-avatar-inline"
                    src={leader.avatarImage}
                    alt=""
                  />
                </div>

                <div className="race-points-end">{leader.points} pts</div>
              </article>
            );
          })}
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
