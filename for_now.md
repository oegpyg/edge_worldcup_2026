# Edge World Cup 2026 - Estado actual

Fecha de corte: 2026-06-09

## Resumen ejecutivo

La plataforma corre end-to-end en local con Docker: login OTP, panel de usuario con prediccion persistente, backoffice admin y dashboard de ranking en vivo. En este corte ya quedo estable el flujo de simulacion, ranking para todos los participantes y visibilidad premium con reglas sincronizadas al estado real.

## Lo construido

### Infraestructura y stack

- Frontend: Next.js 15 App Router en apps/web.
- Backend: NestJS 11 en apps/api.
- DB: PostgreSQL con bootstrap automatico de tablas.
- Mail: Mailpit para OTP en desarrollo.
- Orquestacion: docker-compose con postgres, mailpit, api y web.

### Auth OTP (usuario)

- POST /auth/request-otp genera OTP por email.
- POST /auth/verify-otp valida OTP y crea sesion.
- Seguridad: max 3 intentos fallidos por OTP y lock temporal.
- Frontend guarda token y redirige a /panel.

### Panel de usuario

- GET /user/panel-data y POST /user/prediction protegidos por x-session-token.
- Regla de negocio: 32 clasificados, 2 finalistas, 1 campeon.
- Validacion de consistencia del campeon dentro de finalistas.
- Upsert de prediccion por usuario.

### Backoffice admin

- Login admin por env y token en x-admin-token.
- CRUD de paises y partidos.
- Import de paises con fallback local JSON.
- Simulacion de partidos demo para mover ranking.
- Reset de simulacion y limpieza opcional de claims premium.
- Distribucion por olas para generar escenarios de puntaje.

### Dashboard y ranking en vivo

- Endpoint: GET /dashboard/leaderboard.
- Devuelve todos los participantes (sin corte a 12).
- Vista web dividida en top 10 destacado + resto compacto.
- Layout compactado para ver mas filas en pantalla.

### Avatares y premium

- Avatares base en archivos m1..m10 y f1..f10.
- Avatares premium en public/avatars/premium.
- Badge y estilo visual premium claros en dashboard.
- Sincronizacion de premium limpia por estado actual:
	- se recalcula sobre elegibles por umbral de puntos,
	- se eliminan residuos historicos de simulaciones previas,
	- se reescriben claims vigentes de forma consistente.

## Accesos locales

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Leaderboard: http://localhost:4000/dashboard/leaderboard
- Mailpit UI: http://localhost:8025
- Backoffice login: http://localhost:3000/backoffice/login
- Panel usuario: http://localhost:3000/panel

## Archivos clave

- README.md
- docker-compose.yml
- for_now.md
- apps/api/src/app.controller.ts
- apps/api/src/backoffice/backoffice.controller.ts
- apps/api/src/backoffice/backoffice.service.ts
- apps/api/src/backoffice/dto/demo-reset.dto.ts
- apps/api/src/backoffice/dto/demo-distribution.dto.ts
- apps/api/src/database/database.service.ts
- apps/web/app/dashboard/page.tsx
- apps/web/app/backoffice/demo-matches/page.tsx
- apps/web/app/globals.css

## Decisiones tecnicas resueltas

- Ranking calculado desde predicciones + snapshot de resultados simulados.
- Entrega full de participantes en API para evitar recortes por frontend.
- Separacion visual top 10 vs resto para legibilidad.
- Premium sincronizado con estado actual para evitar claims sucios.
- Marcacion visual premium explicita en UI, no solo por imagen.

## Alcance actual

- Flujo OTP: implementado y estable.
- Flujo de prediccion usuario: implementado y persistente.
- Backoffice admin: implementado con simulacion util para demo.
- Dashboard live: implementado con lista completa y diseno compacto.
- Premium: visible y alineado a reglas actuales de puntaje.
- Stack local Docker: operativo.

## Proximo bloque sugerido

1. Definir regla final de premium para negocio (umbral estricto vs top 10 fijo).
2. Agregar pruebas E2E del ciclo demo: simulacion -> leaderboard -> premium.
3. Conectar resultados reales de partidos para reemplazar modo demo en ranking.