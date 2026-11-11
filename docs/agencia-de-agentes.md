# Agencia de agentes

Cada agente corre en un **horario fijo** (GitHub Actions → endpoint con `CRON_SECRET`), hace una tarea acotada y se apaga. Nada trabaja todo el día. Las corridas quedan en el panel de Agentes (CronRuns) y, si fallan, avisan por correo.

| Agente | Cuándo | Qué hace | Modelo |
|---|---|---|---|
| Investigador de temas (`topic-research`) | martes y viernes 7:00 AM COL | Busca en la web temas oportunos (noticias, fechas límite) y los deja como ideas (ángulos) | Haiku + búsqueda web |
| Noticias (`news-watch`) | lunes y jueves, 10:00 AM COL | Lee `NEWS_FEED_URLS` y convierte noticias nuevas en borradores | Haiku (búsqueda) / Sonnet (redacción) |
| Contenido (`auto-content`) | sábado 9:00 AM COL | Genera los posts de L/X/V (uno por tema, para todas las redes) | Sonnet |
| Verificador de datos | tras generar cada post, o botón "Verificar datos" | Contrasta montos/fechas/formularios con la biblioteca, la fuente y IRS.gov | Sonnet + búsqueda web |
| Analista de métricas (`metrics-report`) | sábado 8:00 AM COL | Analiza los números de los posts publicados; el informe se usa al generar la semana | Haiku |

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

## Oficina (pantalla 3D, dentro de Agentes)
La vista "Oficina" de **Agentes** (`/agentes`; `/oficina` redirige ahí) muestra todo el edificio, con un cuarto por departamento: **Monitoreo** (un agente por app vigilada, como Ángela), **un departamento de marketing por empresa activa** (Investigador, Redactor, Verificador, Analista + puestos reservados para Video y Comunidad) y **Dirección** (Jarvis y agentes generales).
- Estado real: monitoreo = último chequeo de salud; marketing = última corrida registrada (CronRun); rojo si la última corrida falló. Se refresca cada minuto.
- "Ver un día en demostración" reproduce los horarios en un reloj rápido.
- Para sumar un agente nuevo: agregarlo en `buildOffice()` (`src/lib/office.ts`); si aún no existe, va como puesto reservado (`ghost`).

### Oficina 3D: un solo espacio con áreas
- Un piso abierto con ventanales, dividido en áreas con alfombra y mamparas de vidrio: Monitoreo, una por empresa (con sus agentes) y Finanzas. La oficina de cristal de Andrés Marín (CEO) va aparte, elevada, con una pantalla de lo que necesita su decisión.
- **Sala de descanso:** TV grande con sofá, sillones y puf, zona de juegos (billar, ping-pong, futbolito, arcade), bar de café, agua, impresora y la pizarra con la agenda; quien no está trabajando (fuera de horario, de 11 PM a 7 AM o sin tareas) camina hasta allí y se recuesta; al volver a trabajar regresa a su escritorio. Si hay más agentes que asientos, el resto duerme en su puesto.
- Las personas están hechas con código (sin modelos externos), con rasgos propios por agente. Trabajan tecleando con las dos manos, descansan con la cabeza baja y levantan la mano cuando algo falla.
- Nombres: Monitoreo usa los nombres de cada agente (Luisa, Ángela, Alejandro...); en marketing se asignan de la lista Juan, Fernanda, Felipe, Samantha, Tomás, María e Isabel (ver `PEOPLE` en `src/lib/office.ts`).

## Noticias confiables y memoria de temas
- **Noticias:** solo cuenta lo que trae su propia fecha y es de los últimos 7 días. Antes de escribir, el sistema abre el enlace y comprueba que la página sea esa noticia y que la fecha coincida; luego un revisor (Haiku) la descarta si es un recordatorio genérico, no sirve a la audiencia o repite un tema ya publicado. Lo descartado queda explicado en el registro de la corrida.
- **Memoria de temas:** todo tema usado o propuesto (publicado, programado, rechazado, hasta un año atrás) se guarda en los propios posts y nunca vuelve a salir: ni por la misma noticia (enlace), ni con otras palabras (parecido de temas). Aplica a noticias, a la tanda semanal y al investigador.
- **Varias fuentes:** `NEWS_FEED_URLS` acepta varios feeds RSS/Atom o páginas de listado separados por coma (IRS, contabilidad, pequeñas empresas…). Cada noticia debe traer fecha propia.
- **Aprobar con un dato incorrecto:** si el verificador marcó el post con error, pide confirmación antes de aprobar.

## Calendario
**Command Center → 📅 Calendario:** lo publicado, programado y por aprobar de cada día del mes, por empresa, con sus redes, el enlace al post publicado y la fuente.

## Búsqueda de noticias en la web
Además de las fuentes fijas (`NEWS_FEED_URLS`), el investigador de noticias busca en la web (Sonnet + búsqueda) noticias de los últimos 7 días de impuestos, contabilidad, nómina y pequeños negocios, solo de fuentes oficiales o medios de contabilidad reconocidos. **No se confía en lo que devuelve:** cada noticia se abre y debe cumplir que la página exista, sea esa noticia y MUESTRE una fecha que coincida (±2 días); luego pasa por la memoria de temas y el revisor. Lo inventado o con fecha dudosa se descarta con su motivo. Funciona aunque no haya feeds configurados. El post trae "Fuente verificada en la web (nombre)" con fecha y enlace.

## Descanso nocturno
De **11 PM a 7 AM (hora de Colombia)** la app no vigila las apps ni envía avisos de monitoreo (`src/lib/quiet-hours.ts`): ni el vigilante interno ni el disparador externo `/api/agents/cron/check`. A las 7:00 AM retoma y, en el primer chequeo del día, envía UN correo corto "Buenos días" con cómo amanecieron las apps (funcionen bien o no; una sola vez al día, constancia en CronRun `monitor-morning`). En la oficina, todos aparecen dormidos en ese horario. Para vigilar también de noche, pon `AGENT_MONITOR_QUIET=off` en Railway. El botón "Refrescar ahora" sigue funcionando a cualquier hora.

## Correos de salud de las apps

- **Alerta:** si una app falla 2 revisiones seguidas (cada 5 min), llega un correo; otro cuando se recupera. No se repite en 4 horas.
- **Confirmación cada hora:** de 7 AM a 11 PM (hora de Colombia) llega un correo con el estado de todas las apps, estén bien o no. El de las 7 AM es el de "buenos días", con el resumen del equipo.
- Variables en Railway: `HEALTH_EMAIL_EVERY_MIN` (por defecto `60`; `0` lo apaga) y `ALERT_EMAIL_TO` (a dónde llega).
- De 11 PM a 7 AM no se revisa ni se envía nada.

## Luis: blog de Reports Systems

- Escribe **un artículo por semana** (martes 9 AM COL) en **español e inglés** y lo manda al blog como **borrador**; nunca publica. El dueño lo revisa y lo publica en Generales → Blog.
- Proceso: lee los artículos que ya existen (para no repetir) → propone un tema → investiga con fuente → escribe 800–1500 palabras con `##` y sin HTML → adapta al inglés con la misma `translationKey` → revisa promesas → envía. Si hay fuentes, las agrega al final.
- Variables en Railway: `BLOG_API_KEY` (clave `rsb_…` de "solo borradores"; obligatoria), `BLOG_API_URL` (por defecto `https://reportssystems.com`) y `BLOG_COMPANY_NAME` (empresa del Command Center cuyo perfil de marca guía el tono; por defecto `Reports Systems`).
- También se puede lanzar a mano desde Command Center → Equipo → "Luis", con un tema opcional. Si el cron de GitHub se salta el martes, la app lo hace sola el martes o miércoles.

### Banco de temas de Luis

- Son 78 temas en 11 categorías (cierre de caja, cheques, envíos, depósitos, comisiones, empleados, varias tiendas, cumplimiento, del Excel al sistema, clientes, contenido de marca). Se cargan con el botón **Cargar mis temas** en Equipo → Luis (no duplica).
- Luis toma el siguiente **pendiente por prioridad**: primero los 8 que el dueño marcó (cuadrar la caja, cheque devuelto, comisiones de envíos, caja corta o sobrante, quién hizo qué, permisos, Excel, varias tiendas) y luego el resto por categoría. Salta los que ya existen en el blog y marca cada uno como escrito. Se puede saltar uno desde la lista.
- **Temas legales** (permisos, licencias, cumplimiento, cheque devuelto, cobro, impuestos, seguros, notario, etc.): se explica lo general, sin cifras ni leyes no verificadas, y se agrega siempre la nota de confirmar con un abogado o con la autoridad del estado.
- **Casos, testimonios y novedades** ("Un día en una tienda ordenada…", "Qué cambió en una tienda al llevar el control…", "Novedades de Reports Systems"): Luis NO los escribe solo, porque dependen de hechos reales y del permiso del cliente. Solo salen si el dueño escribe el tema y los hechos en el cuadro de "Tema".

### Blogs de destino (mandar lo mismo a otro blog)

- Cada empresa puede tener un blog (misma API: `POST /api/blog/posts`). La **dirección** se guarda en Command Center → Equipo → "Blogs de destino"; la **clave** (secreta, de solo borradores) va en Railway como `BLOG_API_KEY_<NOMBRE_DE_LA_EMPRESA>` (por ejemplo `BLOG_API_KEY_MY_PROFIT_AND_LOSS`).
- **Espejo:** se elige de qué empresa copiar (puede ser otra o la misma: lo que publica ISM puede ir al blog de ISM). Desde ese momento, cada post publicado en redes se manda tal cual como **borrador** al blog (sin IA; viñetas ✅/• pasan a lista, los hashtags a etiquetas, la imagen a portada, y se agrega el llamado a la acción del perfil si existe). Máximo 3 cada 30 minutos; no manda lo publicado antes de activarlo ni repite uno ya enviado. Textos de menos de 200 caracteres no se envían (el blog los rechaza).
- **Envío manual:** en "Publicados esta semana", el menú **📰 Enviar al blog…** manda ese post al blog elegido.

### Artículos listos (los escribe el dueño con otra IA)

- Se pegan en Equipo → Luis → **Artículos listos** con el formato `@@@ARTICULO … @@@FIN` (ver `docs/prompt-articulos-blog.md`, que trae el prompt para la otra IA). La app revisa cada uno: limpia HTML y `#`, bloquea promesas ("garantizado", "ahorrarás"), avisa si la descripción o el largo se salen de lo ideal, agrega la nota legal en temas legales y el llamado a la acción de WhatsApp (en inglés se arma solo).
- Quedan en una **cola con orden**. Cada martes sale el siguiente (español y luego inglés, enlazados) como **borrador** al blog; también se puede "enviar ahora". Si la cola se vacía, Luis **no** escribe con IA salvo que se marque esa opción en el perfil del blog.
- Si el título coincide con un tema del banco, ese tema se marca como escrito.

