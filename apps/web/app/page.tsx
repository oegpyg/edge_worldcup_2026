import Link from 'next/link';

import { LoginForm } from './login-form';

export default function HomePage() {
  return (
    <main className="shell">
      <div className="grid">
        <section className="panel hero">
          <div>
            <span className="eyebrow">World Cup Experience</span>
            <h1>Rumbo al 2026</h1>
            <p>
              Ingresa, arma tu prediccion y sigue el ranking en vivo mientras avanza la fase de
              grupos. Cada acierto suma puntos para subir en la tabla general.
            </p>

            <div className="stats-row">
              <article className="stat-card">
                <span className="small">Fase actual</span>
                <strong>Grupos</strong>
              </article>
              <article className="stat-card">
                <span className="small">Partidos hoy</span>
                <strong>08</strong>
              </article>
              <article className="stat-card">
                <span className="small">Proxima carga</span>
                <strong>00:45 min</strong>
              </article>
            </div>
          </div>

          <div className="feature-list">
            <article className="feature">
              <div>
                <strong>Argentina vs Portugal</strong>
                <span>18:00 UTC • Prediccion abierta</span>
              </div>
              <span className="pill">Top match</span>
            </article>
            <article className="feature">
              <div>
                <strong>Mexico vs Japon</strong>
                <span>20:00 UTC • Tendencia 2-1</span>
              </div>
              <span className="pill">Comunidad</span>
            </article>
            <article className="feature">
              <div>
                <strong>Brasil vs Alemania</strong>
                <span>22:00 UTC • Bonus por marcador exacto</span>
              </div>
              <span className="pill">x2 puntos</span>
            </article>
          </div>
        </section>

        <LoginForm />
      </div>

      <div style={{ marginTop: 14, width: 'min(1180px, 100%)', display: 'flex', justifyContent: 'flex-end' }}>
        <Link className="button button-secondary" href="/dashboard">
          Ver dashboard de puntos
        </Link>
      </div>
    </main>
  );
}