import Link from 'next/link';

import { LoginForm } from './login-form';

export default function HomePage() {
  return (
    <main className="shell">
      <div style={{ width: 'min(640px, 100%)' }}>
        <LoginForm />
      </div>

      <div style={{ marginTop: 20, width: 'min(640px, 100%)' }}>
        <Link
          className="button button-primary"
          href="/dashboard"
          style={{ 
            width: '100%', 
            display: 'flex', 
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 600,
            padding: '16px 24px',
            minHeight: 48,
            alignItems: 'center'
          }}
        >
          📊 Ver dashboard de puntos
        </Link>
      </div>
    </main>
  );
}