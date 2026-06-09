# Edge World Cup 2026 - Estado actual

Fecha de corte: 2026-06-09

## Resumen ejecutivo

La maqueta funcional ya esta implementada y corriendo en entorno local con Docker.
Incluye login OTP de punta a punta, persistencia en PostgreSQL y vista de correos en Mailpit.

## Lo construido

### Infraestructura

- Frontend en Next.js 15 en `apps/web`.
- Backend en NestJS en `apps/api`.
- Base de datos PostgreSQL con creacion automatica de schema.
- Mailpit para captura de correos de desarrollo.
- Orquestacion completa con `docker-compose.yml` (4 servicios: `postgres`, `mailpit`, `api`, `web`).

### Flujo OTP

1. Usuario ingresa email en el frontend.
2. Backend genera codigo OTP de 6 digitos.
3. Backend envia OTP por SMTP a Mailpit.
4. Usuario toma el codigo desde Mailpit.
5. Backend valida OTP y genera sesion/token.
6. Frontend muestra pantalla de dashboard (mockup de ranking en vivo).

### API y modulos

- Endpoints principales:
	- `POST /auth/request-otp`
	- `POST /auth/verify-otp`
- Modulos clave en backend:
	- `auth`
	- `database`
	- `mail`

## Accesos locales

- Login web: http://localhost:3000
- API health: http://localhost:4000/health
- Mailpit UI: http://localhost:8025

## Archivos clave

- `README.md`: guia de uso y arranque.
- `docker-compose.yml`: servicios y networking.
- `apps/api/src/auth/*`: flujo OTP.
- `apps/api/src/database/database.service.ts`: bootstrap de schema/tablas.
- `apps/web/app/*`: UI de login y dashboard mock.

## Decisiones tecnicas ya resueltas

- Ajustes de TypeScript/Nest para build estable.
- Fix de import de `nodemailer` para entorno CommonJS.
- Correccion de build Docker para asegurar salida `.js`.
- Upgrade de Next.js a 15.5.19.

## Alcance actual

- `spike/` se mantiene fuera del flujo principal de la maqueta.
- El sistema esta listo para extenderse con predicciones, API Football y socket.io.

## Proximo bloque sugerido

1. Persistir predicciones de usuario.
2. Integrar proveedor de datos de partidos (API Football).
3. Publicar actualizaciones en tiempo real con socket.io.