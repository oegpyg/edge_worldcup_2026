# Edge World Cup 2026 - Maqueta

Implementacion base del concurso interno para predecir paises del Mundial 2026, con login por OTP, ranking en vivo y avatares con racha.

## Stack

- **Frontend**: Next.js 15 (TypeScript)
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL 16
- **Mail**: Mailpit (para desarrollo)
- **Containerizacion**: Docker Compose

## Estructura

```
/Users/og/Developer/edge_worldcup_2026/
├── apps/
│   ├── api/           # Backend NestJS
│   │   ├── src/
│   │   │   ├── auth/          # Endpoints OTP
│   │   │   ├── database/      # Conexion PostgreSQL
│   │   │   └── mail/          # SMTP via Mailpit
│   │   └── Dockerfile
│   └── web/           # Frontend Next.js
│       ├── app/
│       │   ├── page.tsx       # Pantalla hero
│       │   └── login-form.tsx # Formulario OTP
│       └── Dockerfile
├── docker-compose.yml
└── SOLUTION_ARCHITECTURE.md
```

## Como levantar

### Preparar variables de entorno

Este proyecto ahora usa archivos `.env` para todas las variables de Docker Compose.

Perfiles disponibles:

- `.env.dev` para desarrollo local.
- `.env.prod` para perfil productivo/local de validacion.
- `.env.example` como base general.

Si quieres el perfil clasico con `.env`, crea uno desde el ejemplo:

```bash
cp .env.example .env
```

### Con Docker Compose (recomendado)

```bash
cd /Users/og/Developer/edge_worldcup_2026
docker compose up -d
```

Con perfil de desarrollo explicito:

```bash
cd /Users/og/Developer/edge_worldcup_2026
docker compose --env-file .env.dev up -d
```

Con perfil productivo explicito:

```bash
cd /Users/og/Developer/edge_worldcup_2026
docker compose --env-file .env.prod up -d
```

Espera 2-3 segundos a que se estabilicen los servicios:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Mailpit UI**: http://localhost:8025
- **PostgreSQL**: localhost:5432

### Con Docker + hot reload (frontend)

Si quieres ver cambios de `apps/web` sin rebuild por cada edicion, usa el compose de desarrollo:

```bash
cd /Users/og/Developer/edge_worldcup_2026
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d
```

En este modo, el servicio `web` corre con `next dev` y monta el codigo local como volumen.
Cada cambio en `apps/web` se refleja en http://localhost:3000 sin reiniciar contenedor.

Para detener este modo:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down
```

### Local (desarrollo)

Requiere Node.js 20+ instalado.

**API:**
```bash
cd apps/api
npm install
npm run start:dev
```

**Web:**
```bash
cd apps/web
npm install
npm run dev
```

## Flujo OTP

1. Usuario entra el mail en login
2. Backend genera codigo 6 digitos y lo envia por SMTP a Mailpit
3. Usuario copia el codigo de Mailpit (en desarrollo) o lo recibe en su inbox (produccion)
4. Backend valida el codigo y genera token de sesion (UUID, duracion 30 dias)
5. Frontend guarda token en localStorage y entra al dashboard

### Endpoints

**POST /auth/request-otp**
```json
{
  "email": "usuario@empresa.com"
}
```

Respuesta:
```json
{
  "success": true,
  "email": "usuario@empresa.com",
  "expiresInMinutes": 10,
  "message": "OTP sent"
}
```

**POST /auth/verify-otp**
```json
{
  "email": "usuario@empresa.com",
  "otp": "123456"
}
```

Respuesta:
```json
{
  "success": true,
  "token": "uuid-token-aqui",
  "user": {
    "id": 1,
    "email": "usuario@empresa.com"
  }
}
```

## Configuracion del Entorno

Variables de entorno en `.env.dev` o `.env.prod` (editar segun necesidad):

**Base de datos:**
- `POSTGRES_DB`: edge_worldcup
- `POSTGRES_USER`: edge_user
- `POSTGRES_PASSWORD`: edge_password

**OTP:**
- `OTP_TTL_MINUTES`: 10 (vencimiento del codigo)
- `OTP_HASH_SECRET`: secreto para firmar hash OTP con HMAC
- `OTP_LOCK_MINUTES`: minutos de bloqueo tras maximo de intentos fallidos
- `OTP_REQUEST_COOLDOWN_SECONDS`: cooldown entre requests OTP por email
- `OTP_REQUEST_MAX_PER_EMAIL_PER_HOUR`: limite de requests OTP por email/hora
- `OTP_REQUEST_MAX_PER_IP_PER_HOUR`: limite de requests OTP por IP/hora
- `OTP_VERIFY_MAX_PER_IP_PER_10MIN`: limite de verify OTP por IP en 10 minutos

**SMTP:**
- `SMTP_HOST`: host SMTP real (mailpit en desarrollo)
- `SMTP_PORT`: puerto SMTP
- `SMTP_SECURE`: true/false segun proveedor (465 normalmente true)
- `SMTP_USER`: usuario SMTP (si aplica)
- `SMTP_PASSWORD`: password/token SMTP (si aplica)
- `SMTP_FROM`: no-reply@edgeworldcup.local

**CORS:**
- `FRONTEND_ORIGIN`: http://localhost:3000

**Backoffice admin:**
- `BACKOFFICE_ADMIN_USER`: usuario del panel admin
- `BACKOFFICE_ADMIN_PASSWORD`: password del panel admin
- `BACKOFFICE_ADMIN_TOKEN`: token interno para proteger endpoints `/backoffice/*`
- `WORLDCUP_IMPORT_URL`: endpoint externo para importar paises/partidos (si falla, se usa fallback)

### Login del backoffice

- URL: `http://localhost:3000/backoffice/login`
- Si no hay token admin valido, `http://localhost:3000/backoffice` redirige automaticamente a login.
- El token se obtiene en `POST /backoffice/auth/login` y se guarda en frontend para consumir endpoints admin.

## Visuales de la Maqueta

La pantalla inicial muestra:

- **Hero**: Descripcion del concurso, features (OTP, Live, Gamified)
- **Login Card**: Formulario OTP bimodal
  - Paso 1: Pedir OTP (email)
  - Paso 2: Validar OTP (codigo 6 digitos)
  - Paso 3: Dashboard con ranking en vivo (placeholder)

Las siguientes fases (después de esta maqueta):

1. Importar usuarios desde CSV
2. Integrar API Football para resultados en vivo
3. Agregar socket.io para actualizaciones de ranking cada 10 minutos
4. Sistema de avatares desbloqueables
5. Metricas de racha y recompensas visuales

## Logs y Debug

Ver logs del API:
```bash
docker compose logs api -f
```

Ver logs del frontend:
```bash
docker compose logs web -f
```

Ver mensajes en Mailpit:
```bash
# Acceder a http://localhost:8025
# O via API:
curl http://localhost:8025/api/v1/messages
```

## Parar los servicios

```bash
docker compose down
```

Para limpiar volumenes (base de datos):
```bash
docker compose down -v
```

## Notas

- El archivo `spike/` contiene pruebas anteriores y no forma parte de la maqueta productiva.
- Los Dockerfiles usan Node 20 Alpine para reducir size de imagenes.
- Next.js 15.5.19 esta sin vulnerabilidades conocidas críticas.
- Nest emite TypeScript `.d.ts` y JavaScript `.js` en `dist/` para runtime.
- Las migraciones de PostgreSQL se crean automáticamente en el inicio del API (`database.service.ts`).

## OTP para entorno real (checklist corto)

1. Completar `.env.prod` con `SMTP_*` reales y `OTP_HASH_SECRET` fuerte.
2. Configurar SPF, DKIM y DMARC del dominio de envio.
3. Levantar con `docker compose --env-file .env.prod up -d`.
4. Verificar request/verify OTP desde una IP real y revisar limites/cooldown.

## Proximos pasos

1. Importar lista de usuarios desde email corporativo
2. Crear endpoint para registrar predicciones (32 paises, finalistas, campeon)
3. Integrar estadios y partidos del torneo real
4. Implementar recalculo de puntos cada 10 minutos via cron
5. Agregar socket.io para dashboard en vivo
6. Disenar sistema de avatares y rachas
