# Publicación automática de imágenes

El sistema decide **qué** publicar y **cuándo**; un servicio intermedio (Make, Zapier, n8n o un
agregador de redes) se encarga de **subirlo** a cada red. Así no dependemos de aprobar una app propia
en Meta, LinkedIn y X, y se puede cambiar de servicio sin tocar el código.

Solo se publican **imágenes** en Instagram, Facebook, LinkedIn y X. Los videos los subes tú a mano. **TikTok** se genera y se aprueba aquí, pero se sube a mano (su API exige auditoría); si algún día lo conectas, agrégalo a `PUBLISH_PLATFORMS`.

## Flujo

1. Domingo: el sistema genera los posts de lunes, miércoles y viernes (1:00 PM Colombia).
2. Tú generas las imágenes, las subes, revisas y **apruebas** cada post (`Command Center → Por aprobar`).
3. A su hora, un job (L–V, 1:10–6:10 PM, cada hora) envía cada post aprobado **con imagen** al webhook.
4. Si el webhook falla, reintenta hasta 3 veces (mínimo 30 min entre intentos). Al tercer fallo el post
   queda en **"Fallaron al publicar"**, la corrida se marca como fallida y te llega un correo.
5. En la bandeja puedes **Publicar ahora**, **Reintentar**, **reprogramar** la hora, o marcarlo como
   subido a mano.

## Variables de entorno (Railway)

| Variable | Para qué |
|---|---|
| `PUBLISH_WEBHOOK_URL` | URL del webhook que publica. Sin ella no se publica nada (todo queda para subir a mano). |
| `PUBLISH_PLATFORMS` | Opcional. Redes que el escenario cubre, separadas por coma. Por defecto `instagram,facebook,linkedin,twitter`. |
| `PUBLISH_WEBHOOK_SECRET` | Se envía como header `X-Webhook-Secret`; el escenario debe verificarlo. También autentica el callback. |

## Lo que recibe el webhook

`POST` con `Content-Type: application/json`:

```json
{
  "postId": "cmvq…",
  "idempotencyKey": "cmvq…",
  "company": "Nombre de la marca",
  "platform": "instagram | facebook | linkedin | twitter",
  "text": "Texto final listo para publicar (copy + hashtags; en X ya recortado a 280)",
  "copy": "…", "hashtags": ["#taxes"], "cta": "…",
  "imageUrl": "https://…/api/public/post-image/<token>",
  "scheduledDate": "2026-11-02T18:00:00.000Z",
  "callbackUrl": "https://…/api/publish/callback"
}
```

- Si llega `"test": true` (botón **Probar conexión**), es solo una prueba: el escenario debe responder `200` y **detenerse sin publicar**.
- `imageUrl` es pública y siempre **JPEG** (Instagram solo acepta JPEG). Úsala tal cual.
- `idempotencyKey` es estable: si el servicio recibe dos veces el mismo, debe publicar una sola vez.
- **Respuesta:** cualquier `2xx` cuenta como "enviado". Si el cuerpo es JSON con `url` (o `permalink`),
  se guarda como enlace al post publicado. Cualquier otro código cuenta como fallo y se reintenta.

## Callback (opcional, recomendado)

`2xx` solo confirma que el servicio **recibió** el post, no que la red lo aceptó. Para registrar el
resultado real, el escenario puede llamar al final a `callbackUrl`:

```
POST /api/publish/callback
X-Webhook-Secret: <PUBLISH_WEBHOOK_SECRET>      (o Authorization: Bearer <CRON_SECRET>)

{ "postId": "…", "ok": true,  "url": "https://www.linkedin.com/feed/update/…" }
{ "postId": "…", "ok": false, "error": "Token de LinkedIn vencido" }
```

`ok:false` deja el post en "Fallaron al publicar" con ese mensaje; `ok:true` lo marca publicado y guarda el enlace.

## Montarlo en Make (guía general)

Los nombres exactos de los módulos pueden variar; busca el equivalente.

1. **Webhooks → Custom webhook**: crea el webhook y copia su URL a `PUBLISH_WEBHOOK_URL`.
2. Primer filtro: el header `X-Webhook-Secret` debe ser igual a tu secreto; si no, detener. Segundo filtro: si `test` es `true`, responder 200 y detener (así pruebas la conexión sin publicar).
3. **Router** con una ruta por `platform`:
   - `instagram`: módulo de Instagram for Business para publicar una foto (URL = `imageUrl`, texto = `text`).
   - `facebook`: módulo de Facebook Pages para publicar una foto en la página.
   - `linkedin`: módulo de LinkedIn para publicar con imagen.
   - `twitter`: módulo de X para publicar con imagen (descargar `imageUrl` y adjuntarla).
4. Al final de cada ruta, un **HTTP → Make a request** al `callbackUrl` con `ok:true` y la URL del post
   (y una ruta de error con `ok:false` y el mensaje).
5. Prueba con **Run once** y pulsa "Publicar ahora" en un post aprobado.

## Requisitos de cada cuenta (verifícalos antes de contar con ellos)

- **Instagram:** cuenta profesional (Business o Creator) vinculada a una página de Facebook.
- **Facebook:** una Página (no un perfil personal).
- **LinkedIn:** publicar en un perfil personal suele ser directo; publicar en una **página de empresa**
  puede requerir aprobación de LinkedIn.
- **X:** la API de X tiene planes y límites de publicación que cambian; revisa qué incluye el plan
  gratuito antes de depender de él.

Si prefieres un agregador de redes con API propia, recibe el mismo JSON: solo cambia `PUBLISH_WEBHOOK_URL`.
