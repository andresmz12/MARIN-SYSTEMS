# Marín Systems

Sistema personal de productividad, trading (Forex en cuenta demo) y gestión de negocios propios, con generación de contenido asistida por IA.

## Stack

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript
- **Base de datos**: PostgreSQL + Prisma ORM (migraciones controladas, ver [Base de datos y migraciones](#base-de-datos-y-migraciones))
- **Auth**: NextAuth.js (credenciales email/contraseña, usuario único)
- **Estilos**: Tailwind CSS (dark mode)
- **Gráficos**: Recharts
- **IA**: Anthropic (Claude) para generación de contenido y análisis
- **Voz**: ElevenLabs (audio de guiones — voz "Angie")
- **Email**: SendGrid (correos transaccionales y alertas)
- **Deploy**: Railway (branch de producción: `fix-deploy`)
- **Automatización**: GitHub Actions (cron jobs)

## Módulos

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/dashboard` | Semáforo del día, stats, cita motivacional |
| **Trading** | `/trading` | Trading Operating System (TOS) v1.0 |
| ├─ Diario de Trading | `/trading/diario` | Registro de trades + alerta 3 strikes |
| ├─ Mi Sistema (checklist) | `/trading/sistema` | Checklist pre-trade + temporizador de respiración + hábitos reales |
| ├─ Calculadora | `/trading/calculadora` | Tamaño de lote, riesgo, R:R (recuerda capital/riesgo/par y pares favoritos) |
| ├─ Playbook | `/trading/playbook` | Setups, horarios, proceso de decisión |
| └─ Estadísticas | `/trading/estadisticas` | Win rate, profit factor, gráficos, análisis de screenshots vía IA |
| Hábitos | `/habitos` | CRUD + streaks + contribution graph |
| Agenda | `/agenda` | Vista semanal/mensual + lista, eventos, integración con calendario, noticias Forex |
| Journal | `/journal` | Diario de ánimo + historial mensual |
| Metas | `/metas` | Goals con subgoals, completions diarias y streaks |
| Empresas | `/empresas` | Gestión de empresas propias: notas, equipo, links, tareas |
| Corporate Tasks | `/corporate-tasks` | Tareas recurrentes por empresa, envío de recordatorios a empleados por email (cron) |
| Command Center (CEO) | `/command-center` | Planificación semanal, work blocks, brand profiles, campañas de marketing, generación de contenido con Claude, revenue tracking |
| Content Creator | `/content-creator` | Generación de guiones/mapas de video con IA |
| Studio | `/studio/[token]` | Edición de guiones, generación de audio (ElevenLabs), historial de sesiones |
| IRS News | `/irs-news` | Curación y resumen en español de noticias del IRS |
| IRS Video | `/irs-video` | Generación de contenido de video sobre noticias del IRS |
| Finanzas | `/finanzas` | Cuentas, tarjetas de crédito, deudas, categorías, transacciones, presupuestos |
| Agentes | `/agentes` | Monitoreo de salud de apps/agentes externos (uptime, latencia, CPU/memoria), vista tipo oficina animada, alertas por email |
| Configuración | `/configuracion` | Ajustes del usuario |
| Mis Mapas | `/mis-mapas` | Mapas mentales de contenido generados |

## Base de datos y migraciones

El proyecto usa **migraciones controladas de Prisma** (`prisma migrate deploy`), no `db push`. El comando de arranque en producción corre las migraciones pendientes **antes** de levantar el servidor (secuencial, no en paralelo):

```
npx prisma migrate deploy && npm start
```

Para crear una nueva migración en desarrollo, después de modificar `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <descripcion_del_cambio>
```

Esto genera un nuevo folder en `prisma/migrations/` que debe commitearse junto con el cambio de schema. **Nunca uses `prisma db push` contra la base de datos de producción** — solo migraciones versionadas.

## Despliegue en Railway

### 1. Crear cuenta en Railway
Ve a [railway.app](https://railway.app) y crea una cuenta.

### 2. Crear base de datos PostgreSQL
1. En Railway, click en **New Project**
2. Selecciona **Deploy PostgreSQL**
3. Copia la variable `DATABASE_URL` que aparece en las variables de entorno del servicio PostgreSQL

### 3. Crear servicio de la aplicación
1. En el mismo proyecto, click en **New Service**
2. Selecciona **GitHub Repo** y conecta este repositorio
3. Railway detectará automáticamente que es un proyecto Next.js
4. **Branch de producción**: `fix-deploy` (es el branch por defecto real del repo, no `main`)

### 4. Configurar variables de entorno
En el servicio de la aplicación, ve a **Variables** y agrega (ver también [Variables de entorno](#variables-de-entorno)):

```
DATABASE_URL=postgresql://... (la que copiaste del PostgreSQL)
NEXTAUTH_SECRET=<genera una clave con: openssl rand -base64 32>
NEXTAUTH_URL=https://tu-app.railway.app
NEXT_PUBLIC_APP_URL=https://tu-app.railway.app
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=noreply@marinsystems.com
ALERT_EMAIL_TO=tu@email.com
CRON_SECRET=<genera una clave aleatoria, debe coincidir con el secret de GitHub Actions>
```

### 5. Configurar el build
Railway usará el `railway.toml` del proyecto:
- **Build**: `npm ci && npx prisma generate && npx next build`
- **Start**: `npx prisma migrate deploy && npm start`

### 6. Ejecutar el seed (primer despliegue)
Después del primer despliegue exitoso, abre el terminal del servicio en Railway y ejecuta:

```bash
npx prisma db seed
```

Esto crea el usuario inicial:
- **Email**: `admin@marinsystems.com`
- **Password**: `trading2025`

### 7. Acceder a la aplicación
Usa la URL que Railway te asigna (formato: `https://marin-systems-xxx.up.railway.app`)

## Cron jobs (GitHub Actions)

Los cron jobs se manejan desde `.github/workflows/cron-reminders.yml` (Railway no soporta `[cronjobs.*]` en `railway.toml`). Requieren el secret `CRON_SECRET` configurado en GitHub Actions (Settings → Secrets), que debe coincidir con la variable `CRON_SECRET` de Railway.

| Job | Horario (Colombia) | Endpoint |
|-----|---------------------|----------|
| Morning Reminder | 8:30 AM | `/api/corporate-tasks/cron/morning` |
| Midday Reminder | 12:00 PM | `/api/corporate-tasks/cron/midday` |
| Evening Reminder | 6:00 PM | `/api/corporate-tasks/cron/evening` |
| Generate Recurring Instances | cada 6 horas | `/api/corporate-tasks/cron/generate` |
| Weekly Content Angles | lunes 8:00 AM | `/api/ceo/cron/weekly-angles` |

## Desarrollo local

### Requisitos
- Node.js 18+
- PostgreSQL local o conexión a Railway

### Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd marin-systems

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local con tus valores

# Ejecutar migraciones
npx prisma migrate dev

# Seed inicial
npx prisma db seed

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Credenciales por defecto

| Campo | Valor |
|-------|-------|
| Email | `admin@marinsystems.com` |
| Password | `trading2025` |

## Estructura del proyecto

```
src/
  app/
    (dashboard)/              # Páginas protegidas con sidebar
      dashboard/               # Home con semáforo
      trading/                 # Diario, sistema, calculadora, playbook, estadísticas
      habitos/                 # Módulo de hábitos
      agenda/                  # Módulo de agenda
      journal/                 # Módulo de journal
      metas/                   # Goals y subgoals
      empresas/                # Gestión de empresas propias
      corporate-tasks/         # Tareas recurrentes por empresa
      command-center/          # CEO: planificación, marketing, contenido
      content-creator/         # Generación de guiones de video
      irs-news/, irs-video/    # Contenido sobre noticias del IRS
      finanzas/                # Finanzas personales
      agentes/                 # Monitoreo de agentes/apps externos
      configuracion/           # Ajustes del usuario
      mis-mapas/                # Mapas mentales generados
    api/                      # API routes (una por módulo + cron/*)
    studio/                   # Editor de guiones/audio (sesiones por token)
    login/                    # Página de login
  components/
    Sidebar.tsx, DashboardShell.tsx  # Navegación y layout
    agents/                    # Vista animada de oficina de agentes
    studio/                    # Editor de mapas de estudio
    trading/                   # Timer de respiración, checklist pre-trade
    ui/                        # Componentes reutilizables
  lib/
    auth.ts                    # Configuración NextAuth
    prisma.ts                  # Cliente Prisma singleton
    ai.ts, ai-date.ts          # Integración con Claude
    ceo.ts                     # Lógica del Command Center
    recurring-tasks.ts         # Generación de instancias recurrentes
    sendgrid-client.ts         # Cliente de SendGrid
    utils.ts                   # Utilidades (timezone, cálculos)
  types/
    next-auth.d.ts, agents.ts  # Tipos
  stores/
    agentStore.ts              # Estado del monitoreo de agentes (zustand)
prisma/
  schema.prisma                # Modelos de base de datos
  migrations/                  # Migraciones versionadas (prisma migrate)
  seed.ts                      # Datos iniciales
```

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | URL de conexión PostgreSQL | ✅ |
| `NEXTAUTH_SECRET` | Secreto para JWT (mínimo 32 chars) | ✅ |
| `NEXTAUTH_URL` | URL pública de la aplicación | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL pública (debe coincidir con `NEXTAUTH_URL`), usada para links del studio | ✅ |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic (Claude), usada en Command Center y Content Creator | ✅ |
| `ELEVENLABS_API_KEY` | Clave de ElevenLabs, generación de audio server-side | Solo si se usa Studio |
| `SENDGRID_API_KEY` | Clave de SendGrid | Solo si se usan Corporate Tasks / alertas |
| `SENDGRID_FROM_EMAIL` | Remitente verificado en SendGrid | Solo si se usan Corporate Tasks / alertas |
| `ALERT_EMAIL_TO` | Destinatario de alertas de agentes down/degraded | Solo si se usa monitoreo de Agentes |
| `CRON_SECRET` | Token compartido con GitHub Actions para autorizar los endpoints `/cron/*` | ✅ (si se usan los cron jobs) |

## Solución de problemas

**Error de Prisma en build**: Asegúrate de que `DATABASE_URL` esté configurada antes del build.

**Error de migraciones en deploy**: `prisma migrate deploy` falla si hay drift entre el schema y la base de datos real. Revisa `npx prisma migrate status` contra la base de datos afectada antes de reintentar.

**Error de NextAuth**: Verifica que `NEXTAUTH_SECRET` tenga al menos 32 caracteres y que `NEXTAUTH_URL` coincida con la URL de tu app.

**Login no funciona**: Ejecuta `npx prisma db seed` para crear el usuario inicial.

**Los cron jobs no se ejecutan**: Verifica que `CRON_SECRET` esté configurado igual en Railway y en los secrets de GitHub Actions del repositorio.
