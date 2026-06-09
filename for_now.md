# Edge World Cup 2026 - Estado actual

Fecha de corte: 2026-06-09

## Resumen ejecutivo

El proyecto ya funciona de punta a punta en local con Docker: login OTP real, seguridad de intentos, backoffice admin con persistencia en PostgreSQL, import de paises con fallback y panel de usuario para guardar prediccion (32 clasificados, 2 finalistas, 1 campeon).

## Lo construido

### Infraestructura

- Frontend: Next.js 15 (App Router) en apps/web.
- Backend: NestJS 11 en apps/api.
- DB: PostgreSQL con bootstrap automatico de tablas.
- Mail: Mailpit para inspeccionar OTP en desarrollo.
- Orquestacion: docker-compose.yml con postgres, mailpit, api y web.
- Modo desarrollo: soporte de hot reload para frontend en flujo dev.

### Auth OTP (usuario final)

Flujo:

1. POST /auth/request-otp recibe email y genera OTP.
2. OTP se envia por correo (SMTP hacia Mailpit).
3. POST /auth/verify-otp valida codigo y crea sesion.
4. Frontend guarda token de sesion.
5. Usuario autenticado es redirigido a /panel.

Hardening implementado:

- Maximo 3 intentos fallidos por OTP.
- Bloqueo por 1 hora al superar limite.
- Mensajes de error claros para UI.
- Reset de intentos al validar OTP correcto.

### UX login

- Rediseno visual del home/login con identidad mundialista Edge.
- Flujo OTP de 2 pasos (request + verify).
- Feedback visual tipo tanda de penales en errores.
- Toast de bloqueo y limpieza de estado tras lock.
- Animacion de exito (gooooool) antes de navegar al panel.

### Backoffice admin

Auth admin:

- Login admin por variables de entorno.
- Emision de token admin.
- Proteccion de endpoints por header x-admin-token.

Funciones admin:

- CRUD de paises del mundial.
- CRUD de partidos.
- Import de paises desde API externa.
- Fallback automatico a dataset local JSON si falla API externa.

### Datos y persistencia

Tablas activas:

- users
- otp_codes
- sessions
- wc_countries
- wc_matches
- user_predictions

Predicciones de usuario:

- Endpoint GET /user/panel-data (requiere x-session-token).
- Endpoint POST /user/prediction (requiere x-session-token).
- Regla: 32 clasificados, 2 finalistas, 1 campeon.
- Validacion de consistencia (campeon debe estar entre finalistas).
- Upsert por usuario para mantener una prediccion vigente.

### Panel de usuario

Pagina /panel implementada con:

- Carga de paises + prediccion previa desde backend.
- Seleccion limitada a 32 clasificados.
- Seleccion de 2 finalistas desde los clasificados.
- Seleccion de campeon desde los finalistas.
- Guardado persistente y recarga con datos previos.
- Cierre de sesion local.

## Accesos locales

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Mailpit UI: http://localhost:8025
- Backoffice login: http://localhost:3000/backoffice/login
- Panel usuario: http://localhost:3000/panel

## Archivos clave

- README.md
- docker-compose.yml
- apps/api/src/auth/auth.service.ts
- apps/api/src/backoffice/backoffice.controller.ts
- apps/api/src/backoffice/backoffice.service.ts
- apps/api/src/backoffice/data/worldcup-countries.json
- apps/api/src/database/database.service.ts
- apps/api/src/user/user.controller.ts
- apps/api/src/user/user.service.ts
- apps/api/src/user/dto/save-prediction.dto.ts
- apps/web/app/login-form.tsx
- apps/web/app/backoffice/login/page.tsx
- apps/web/app/backoffice/page.tsx
- apps/web/app/panel/page.tsx
- apps/web/app/globals.css

## Decisiones tecnicas resueltas

- Persistencia centralizada en PostgreSQL (sin mocks para datos core).
- Seguridad OTP mejorada con rate limit por intento/sesion.
- Auth admin simple para iteracion rapida (token por env).
- Fallback de import para evitar bloqueo por proveedor externo.
- Dataset local desacoplado en JSON para mantenibilidad.
- Flujo post-login de usuario orientado a objetivo (va directo a /panel).

## Alcance actual

- Flujo principal usuario: implementado.
- Flujo admin: implementado.
- Persistencia de prediccion: implementada.
- Validaciones base: implementadas y verificadas en endpoints principales.
- Stack local: operativo.

## Proximo bloque sugerido

1. Cerrar validacion E2E completa (OTP real -> /panel -> guardar -> recargar).
2. Agregar resumen visual de prediccion (tabla/tarjetas por fase).
3. Preparar capa de partidos reales para conectar reglas de puntaje.