# Marin Systems

Sistema personal de productividad y trading para Forex en cuenta demo.

## Stack

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript
- **Base de datos**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js (credenciales email/contraseña)
- **Estilos**: Tailwind CSS (dark mode)
- **Gráficos**: Recharts
- **Deploy**: Railway

## Módulos

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/dashboard` | Semáforo del día, stats, cita motivacional |
| Diario de Trading | `/trading/diario` | Registro de trades + alerta 3 strikes |
| Checklist Pre-trade | `/trading/checklist` | 11 ítems en 3 secciones, reset diario |
| Calculadora | `/trading/calculadora` | Tamaño de lote, riesgo, R:R |
| Playbook | `/trading/playbook` | 4 setups, horarios, proceso de decisión |
| Estadísticas | `/trading/estadisticas` | Win rate, profit factor, gráficos |
| Hábitos | `/habitos` | CRUD + streaks + contribution graph |
| Agenda | `/agenda` | Vista semanal + lista, eventos Forex |
| Journal | `/journal` | Diario de ánimo + historial mensual |

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

### 4. Configurar variables de entorno
En el servicio de la aplicación, ve a **Variables** y agrega:

```
DATABASE_URL=postgresql://... (la que copiaste del PostgreSQL)
NEXTAUTH_SECRET=<genera una clave con: openssl rand -base64 32>
NEXTAUTH_URL=https://tu-app.railway.app
```

### 5. Configurar el build
Railway usará el `railway.toml` del proyecto:
- **Build**: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start**: `npm run start`

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
    (dashboard)/          # Páginas protegidas con sidebar
      dashboard/          # Home con semáforo
      trading/            # Módulo de trading
      habitos/            # Módulo de hábitos
      agenda/             # Módulo de agenda
      journal/            # Módulo de journal
    api/                  # API routes
    login/                # Página de login
  components/
    Sidebar.tsx           # Navegación lateral
    ui/                   # Componentes reutilizables
  lib/
    auth.ts               # Configuración NextAuth
    prisma.ts             # Cliente Prisma singleton
    utils.ts              # Utilidades (timezone, cálculos)
  types/
    next-auth.d.ts        # Tipos de sesión
prisma/
  schema.prisma           # Modelos de base de datos
  seed.ts                 # Datos iniciales
```

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | URL de conexión PostgreSQL | ✅ |
| `NEXTAUTH_SECRET` | Secreto para JWT (mínimo 32 chars) | ✅ |
| `NEXTAUTH_URL` | URL pública de la aplicación | ✅ |

## Solución de problemas

**Error de Prisma en build**: Asegúrate de que `DATABASE_URL` esté configurada antes del build.

**Error de NextAuth**: Verifica que `NEXTAUTH_SECRET` tenga al menos 32 caracteres y que `NEXTAUTH_URL` coincida con la URL de tu app.

**Login no funciona**: Ejecuta `npx prisma db seed` para crear el usuario inicial.
