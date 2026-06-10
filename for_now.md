# Edge World Cup 2026 - Estado actual

Fecha de corte: 2026-06-10

## Resumen ejecutivo

La plataforma corre end-to-end en local con Docker. En este corte se consolido el sistema de rachas (hits consecutivos y fails consecutivos), hardening OTP para entorno real, migracion de variables a .env por perfil, y etiquetas de modo de combate en el dashboard.

## Lo construido

### Infraestructura y stack

- Frontend: Next.js 15 App Router en apps/web.
- Backend: NestJS 11 en apps/api.
- DB: PostgreSQL con bootstrap automatico de tablas.
- Mail: Mailpit para OTP en desarrollo, SMTP real configurable por env.
- Orquestacion: docker-compose con variables desde .env.
- Perfiles de entorno: .env, .env.dev, .env.prod, .env.example.

### Auth OTP (usuario)

- POST /auth/request-otp y POST /auth/verify-otp.
- Seguridad reforzada para entorno real:
  - Hash con HMAC-SHA256 + secreto por env (OTP_HASH_SECRET).
  - Cooldown entre requests OTP por email (OTP_REQUEST_COOLDOWN_SECONDS).
  - Rate limit por email/hora y por IP/hora.
  - Rate limit de verify por IP en 10 minutos.
  - Lock configurable por minutos (OTP_LOCK_MINUTES).
  - Registro de eventos de seguridad en tabla otp_security_events.
- SMTP con soporte a auth y TLS (SMTP_USER, SMTP_PASSWORD, SMTP_SECURE).

### Panel de usuario

- GET /user/panel-data y POST /user/prediction protegidos por x-session-token.
- Regla: 32 clasificados, 2 finalistas, 1 campeon.
- Upsert de prediccion por usuario.

### Backoffice admin

- Login admin por env y x-admin-token.
- CRUD de paises y partidos.
- Simulacion demo, reset y distribucion por olas.

### Dashboard y ranking en vivo

- GET /dashboard/leaderboard devuelve todos los participantes.
- Top 10 destacado + resto compacto (3 columnas en desktop).
- Layout compacto para ver mas filas en pantalla.

### Avatares y sistema de rachas

- Avatares base m1..m10 y f1..f10.
- Avatares premium en public/avatars/premium (asignacion limpia, sin residuos historicos).
- Fuego animado alrededor del avatar para usuarios con mas de 25 puntos.
- Avatares de racha de errores desde public/avatars/fails (asignacion aleatoria fija por usuario).

### Sistema de rachas - "Purete Combat Mode"

Tabla user_scoring_state persiste por usuario:

- hit_streak: aciertos consecutivos (se resetea al no subir puntos).
- miss_streak: errores consecutivos (se resetea al subir puntos).
- fail_avatar_key: avatar de fails asignado cuando miss_streak >= 2.
- last_results_version: huella MD5 del snapshot de resultados para detectar cambios reales.

Etiquetas de modo en dashboard (basadas en hit_streak consecutivo):

- 0-1 hits: DESCONECTADO
- 2-3 hits: WARM UP
- 4-6 hits: PREDATOR INSTINCT
- 7-9 hits: COMBO STARTER
- 10-12 hits: NO MERCY
- 13-15 hits: FATAL STRIKE
- 16-18 hits: BRUTALITY MODE
- 19-22 hits: EXECUTIONER
- 23+ hits: WORLD DOMINATION

Etiquetas de fail (basadas en miss_streak):

- 2 errs: Clown Mode Activated
- 3 errs: Choke Artist
- 4 errs: Almost Legendary
- 5 errs: Pressure Folded You
- 6 errs: Lag In Brain
- 7 errs: Juice Drained
- 8 errs: Racha Funeral
- 9+ errs: Misclick Supreme

## Accesos locales

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Leaderboard: http://localhost:4000/dashboard/leaderboard
- Mailpit UI: http://localhost:8025
- Backoffice login: http://localhost:3000/backoffice/login
- Panel usuario: http://localhost:3000/panel

## Comandos de entorno

- Dev: docker compose --env-file .env.dev up -d
- Prod-like: docker compose --env-file .env.prod up -d
- Dev hot reload web: docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d

## Archivos clave

- .env / .env.dev / .env.prod / .env.example
- docker-compose.yml / docker-compose.dev.yml
- apps/api/src/app.controller.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/auth.controller.ts
- apps/api/src/mail/mail.service.ts
- apps/api/src/database/database.service.ts
- apps/web/app/dashboard/page.tsx
- apps/web/app/globals.css

## Decisiones tecnicas resueltas

- hit_streak y miss_streak son independientes: uno sube cuando el otro se resetea.
- El modo de combate (BRUTALITY, etc.) usa hits consecutivos, no puntos totales.
- Un error en el partido N corta la racha aunque el total de puntos sea alto.
- Huella de resultados con MD5 evita recalcular streaks en cada refresh.
- OTP hardening aplica sin romper modo dev (Mailpit, sin SMTP_USER).
- Perfiles .env por entorno evitan tocar docker-compose al cambiar config.

## Alcance actual

- Flujo OTP: implementado con hardening para entorno real.
- Flujo de prediccion usuario: implementado y persistente.
- Backoffice admin: operativo con simulacion demo.
- Dashboard live: lista completa, compacto, etiquetas de modo visibles.
- Rachas positivas y negativas: persistidas y reflejadas en UI.
- Sistema de avatares: base, premium y fails activos.
- Variables de entorno: migradas a .env por perfil.
- Stack local Docker: operativo.

## Proximo bloque sugerido

1. Migrar sesion de localStorage a cookie HttpOnly Secure (fase 2 OTP).
2. Conectar resultados reales via API-Football para reemplazar modo demo.
3. Agregar WebSocket / polling mas corto para actualizacion en vivo del dashboard.