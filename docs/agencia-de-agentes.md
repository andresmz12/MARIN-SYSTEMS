# Agencia de agentes

Cada agente corre en un **horario fijo** (GitHub Actions → endpoint con `CRON_SECRET`), hace una tarea acotada y se apaga. Nada trabaja todo el día. Las corridas quedan en el panel de Agentes (CronRuns) y, si fallan, avisan por correo.

| Agente | Cuándo | Qué hace | Modelo |
|---|---|---|---|
| Investigador de temas (`topic-research`) | diario 7:00 AM COL | Busca en la web temas oportunos (noticias, fechas límite) y los deja como ideas (ángulos) | Haiku + búsqueda web |
| Noticias (`news-watch`) | diario 10:00 AM COL | Lee `NEWS_FEED_URLS` y convierte noticias nuevas en borradores | Sonnet |
| Contenido (`auto-content`) | domingo 9:00 AM COL | Genera los posts de L/X/V (uno por tema, para todas las redes) | Sonnet |
| Verificador de datos | tras generar cada post, o botón "Verificar datos" | Contrasta montos/fechas/formularios con la biblioteca, la fuente y IRS.gov | Sonnet + búsqueda web |
| Analista de métricas (`metrics-report`) | domingo 8:00 AM COL | Analiza los números de los posts publicados; el informe se usa al generar la semana | Haiku |

## Biblioteca de impuestos
Pestaña **📚 Biblioteca**: textos que la IA puede citar para datos concretos. Se eligen los fragmentos más parecidos al tema (por palabras) y se pasan al generador y al verificador.

## Métricas
- A mano: "📊 Agregar números" en cada post publicado.
- Automático (Facebook/Instagram vía Make): un escenario programado que lea los insights y llame `POST /api/ceo/metrics/ingest` con `Authorization: Bearer <CRON_SECRET>` y
  `{"items":[{"platform":"facebook","externalId":"<id del post>","reach":0,"likes":0,"comments":0,"shares":0,"saves":0,"clicks":0}]}`.
  Se reconoce el post por `postId`, por `externalId`/`url` (contra el enlace guardado al publicar) o por `message` (el texto publicado).
- El analista necesita al menos 3 posts publicados con números en los últimos 28 días.

## Variables
`ANTHROPIC_API_KEY`, `CRON_SECRET`, `ALERT_EMAIL_TO`, `SENDGRID_API_KEY` (ya existentes) y `NEWS_FEED_URLS` (feeds RSS/Atom https, separados por coma).

## Oficina (pantalla 3D)
`/oficina` muestra cada departamento como un cuarto: **Monitoreo** (un agente por app vigilada, como Ángela), **un departamento de marketing por empresa activa** (Investigador, Redactor, Verificador, Analista + puestos reservados para Video y Comunidad) y **Dirección** (Jarvis y agentes generales).
- Estado real: monitoreo = último chequeo de salud; marketing = última corrida registrada (CronRun); rojo si la última corrida falló. Se refresca cada minuto.
- "Ver un día en demostración" reproduce los horarios en un reloj rápido.
- Para sumar un agente nuevo: agregarlo en `buildOffice()` (`src/lib/office.ts`); si aún no existe, va como puesto reservado (`ghost`).
