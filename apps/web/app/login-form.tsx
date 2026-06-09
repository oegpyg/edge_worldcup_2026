'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const OTP_LOCK_LIMIT = 3;

type AuthState = 'request' | 'verify' | 'ready';

const runners = [
  { name: 'Micaela', team: '4 aciertos hoy', points: 31, streak: true },
  { name: 'Joaquin', team: '1 finalista correcto', points: 29, streak: false },
  { name: 'Lucia', team: 'Avatar raro desbloqueado', points: 27, streak: true },
];

type ApiErrorDetails = {
  message: string;
  attemptsUsed?: number;
  isLocked: boolean;
};

type PenaltySlotState = 'empty' | 'scored' | 'missed';

async function readApiError(response: Response, fallbackMessage: string): Promise<ApiErrorDetails> {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    const rawMessage = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : typeof payload.message === 'string'
        ? payload.message
        : fallbackMessage;

    const attemptMatch = rawMessage.match(/Intento\s+(\d+)/i);
    const attemptsUsed = attemptMatch ? Number(attemptMatch[1]) : undefined;

    return {
      message: rawMessage,
      attemptsUsed,
      isLocked: /bloqueado/i.test(rawMessage),
    };
  } catch {
    return {
      message: fallbackMessage,
      isLocked: false,
    };
  }
}

function getPenaltySlotState(
  row: 'rival' | 'you',
  slotIndex: number,
  attemptsUsed: number,
  lockLimit: number,
): PenaltySlotState {
  const shot = slotIndex + 1;
  const completedShots = Math.min(attemptsUsed, lockLimit);

  if (row === 'rival') {
    return shot <= completedShots ? 'scored' : 'empty';
  }

  if (shot <= completedShots && completedShots > 0) {
    return 'missed';
  }

  return 'empty';
}

function getPenaltySymbol(state: PenaltySlotState) {
  if (state === 'scored') {
    return 'x';
  }

  if (state === 'missed') {
    return '-';
  }

  return ' ';
}

export function LoginForm() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sessionEmail, setSessionEmail] = useState('');
  const [showGoal, setShowGoal] = useState(false);
  const [otpMisses, setOtpMisses] = useState(0);
  const [otpLocked, setOtpLocked] = useState(false);
  const [showLockToast, setShowLockToast] = useState(false);
  const goalTimer = useRef<number | null>(null);
  const lockToastTimer = useRef<number | null>(null);
  const boardAttempt = Math.max(1, Math.min(otpMisses === 0 ? 1 : otpMisses, OTP_LOCK_LIMIT));

  useEffect(() => {
    return () => {
      if (goalTimer.current) {
        window.clearTimeout(goalTimer.current);
      }

      if (lockToastTimer.current) {
        window.clearTimeout(lockToastTimer.current);
      }
    };
  }, []);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setStatus('Enviando OTP...');

    try {
      const response = await fetch(`${API_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const apiError = await readApiError(response, 'No pudimos enviar el codigo');
        throw new Error(apiError.message);
      }

      setAuthState('verify');
      setOtpMisses(0);
      setOtpLocked(false);
      setShowLockToast(false);
      setStatus('OTP enviado. Revisa tu mail o Mailpit en localhost:8025.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Error enviando OTP');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setStatus('Validando codigo...');

    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      if (!response.ok) {
        const apiError = await readApiError(response, 'OTP invalido o vencido');
        const attemptsFromApi =
          apiError.attemptsUsed ??
          (apiError.isLocked ? OTP_LOCK_LIMIT : Math.min(otpMisses + 1, OTP_LOCK_LIMIT));
        setOtpMisses(Math.min(attemptsFromApi, OTP_LOCK_LIMIT));
        setOtpLocked(apiError.isLocked);

        if (apiError.isLocked) {
          setShowLockToast(true);
          if (lockToastTimer.current) {
            window.clearTimeout(lockToastTimer.current);
          }

          lockToastTimer.current = window.setTimeout(() => {
            setShowLockToast(false);
            setAuthState('request');
            setEmail('');
            setOtp('');
            setOtpMisses(0);
            setOtpLocked(false);
            setStatus('');
            setError('');
          }, 5000);
        }

        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as { token: string; user: { email: string } };
      window.localStorage.setItem('edge-worldcup-token', payload.token);
      window.localStorage.setItem('edge-worldcup-email', payload.user.email);
      setSessionEmail(payload.user.email);
      setOtpMisses(0);
      setOtpLocked(false);
      setShowLockToast(false);
      setShowGoal(true);
      setStatus('Gooooool! OTP correcto.');

      if (goalTimer.current) {
        window.clearTimeout(goalTimer.current);
      }

      goalTimer.current = window.setTimeout(() => {
        setShowGoal(false);
        router.push('/panel');
      }, 1500);
    } catch (requestError) {
      setShowGoal(false);
      setError(requestError instanceof Error ? requestError.message : 'Error validando OTP');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-card">
      {showGoal && (
        <div className="goal-overlay" role="status" aria-live="polite">
          <span className="goal-text">gooooool</span>
        </div>
      )}

      <div className="auth-header">
        <div className="brand-row">
          <Image
            src="/images/edge-logo.svg"
            alt="Edge"
            width={120}
            height={34}
            priority
            className="edge-logo"
          />
          <span className="brand-dot">x Mundial 2026</span>
        </div>
        <span className="eyebrow">Acceso oficial</span>
        <h2>Entrar al torneo</h2>
        <p>
          Usa tu mail corporativo para validar OTP y desbloquear predicciones, ranking y rachas en
          tiempo real.
        </p>
      </div>

      <div className="wc-chips">
        <span className="chip">Fase de grupos</span>
        <span className="chip">32 pts en juego</span>
        <span className="chip">Actualizacion en vivo</span>
      </div>

      {authState === 'request' && (
        <form className="form" onSubmit={requestOtp}>
          <label className="label">
            Email corporativo
            <input
              className="input"
              type="email"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              Pedir OTP
            </button>
          </div>
        </form>
      )}

      {authState === 'verify' && (
        <form className="form" onSubmit={verifyOtp}>
          {otpMisses > 0 && (
            <section className={`penalty-board ${otpLocked ? 'is-locked' : ''}`}>
              <div className="penalty-head">
                <strong>Intento {boardAttempt}/{OTP_LOCK_LIMIT}</strong>
                <span>{otpLocked ? 'Bloqueado 1h por seguridad' : 'Tanda de penales OTP'}</span>
              </div>

              <div className="penalty-row">
                <span className="penalty-label">Rival</span>
                <div className="penalty-track" aria-hidden="true">
                  {Array.from({ length: OTP_LOCK_LIMIT }).map((_, index) => {
                    const state = getPenaltySlotState('rival', index, otpMisses, OTP_LOCK_LIMIT);
                    return (
                      <span
                        className={`penalty-slot penalty-slot-${state}`}
                        key={`rival-${index}-${state}`}
                      >
                        {getPenaltySymbol(state)}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="penalty-row">
                <span className="penalty-label">Tu</span>
                <div className="penalty-track" aria-hidden="true">
                  {Array.from({ length: OTP_LOCK_LIMIT }).map((_, index) => {
                    const state = getPenaltySlotState('you', index, otpMisses, OTP_LOCK_LIMIT);
                    return (
                      <span className={`penalty-slot penalty-slot-${state}`} key={`you-${index}-${state}`}>
                        {getPenaltySymbol(state)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <label className="label">
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="label">
            Codigo OTP
            <input
              className="input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              placeholder="123456"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              Validar OTP
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setAuthState('request');
                setOtp('');
                setOtpMisses(0);
                setOtpLocked(false);
                setShowLockToast(false);
                setStatus('');
                setError('');
              }}
            >
              Cambiar email
            </button>
          </div>
          <div className="otp-hint">Ingresa los 6 digitos recibidos para activar tu sesion.</div>
        </form>
      )}

      {authState === 'ready' && (
        <div className="dashboard">
          <div className="dashboard-head">
            <div>
              <span className="small">Sesion activa</span>
              <h3 style={{ margin: '6px 0 0', fontSize: 30 }}>{sessionEmail}</h3>
            </div>
            <div className="button-row">
              <Link className="button button-secondary" href="/backoffice">
                Ir a backoffice
              </Link>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  window.localStorage.removeItem('edge-worldcup-token');
                  if (goalTimer.current) {
                    window.clearTimeout(goalTimer.current);
                  }

                  if (lockToastTimer.current) {
                    window.clearTimeout(lockToastTimer.current);
                  }

                  setShowGoal(false);
                  setAuthState('request');
                  setOtp('');
                  setOtpMisses(0);
                  setOtpLocked(false);
                  setShowLockToast(false);
                  setStatus('');
                  setError('');
                }}
              >
                Cerrar sesion
              </button>
            </div>
          </div>

          <p>
            Ya estas dentro. Este preview simula ranking vivo, rachas activas y progreso hacia la
            meta del torneo.
          </p>

          <div className="track">
            {runners.map((runner, index) => (
              <article className="runner" key={runner.name}>
                <div className={`avatar ${runner.streak ? 'streak' : 'normal'}`}>{index + 1}</div>
                <div>
                  <strong>{runner.name}</strong>
                  <span>{runner.team}</span>
                </div>
                <div className="points">{runner.points}</div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className={`status ${error ? 'error' : ''}`}>{error || status}</div>

      {showLockToast && (
        <div className="lock-toast" role="status" aria-live="polite">
          Upss.. has perdido en tanda de penales. Te espero en 1 hora para reintentarlo.
        </div>
      )}
    </section>
  );
}
