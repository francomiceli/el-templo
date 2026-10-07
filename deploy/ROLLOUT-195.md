# Rollout fase 195 (Web SEO local + AEO + atribución)

Checklist para Franco y el orquestador. Todo `git push` y todo SSH son gates humanos: se hacen solo con el OK explícito de Franco en la conversación.

**Por qué hay un orden.** Desde el plan 195-03, el build de la web lee las sedes, el WhatsApp de ventas y el blog de `GET /api/web/site-data` de la API a la que apunta `VITE_API_URL`. Si esa API todavía no tiene el endpoint (plan 195-02), el build web falla a propósito: nunca publica datos viejos ni del fixture. Como el build web corre ANTES del job `deploy`, un push que trae API nueva + web nueva con una API vieja en el servidor deja el build web en rojo. Desde el plan 195-11 eso ya no frena el deploy de la API (la web queda en su versión anterior y hay un aviso), pero el rollout en 2 pasos evita el rojo y la web desactualizada.

## 1. Orden de pushes en 2 pasos (staging primero, después master)

El mismo orden vale para staging y para master. Staging va primero (`staging-first`, ver el skill `el-templo-change-control`).

**Paso 1: solo la API con el endpoint y las migraciones.**

1. Identificar el último commit anterior a la web nueva. Por mensaje, para que sobreviva a un rebase o a la integración con otras ramas: `git log --oneline --grep='^feat(195-03)' --reverse | head -1` y tomar su padre (`<sha>^`). Ahí terminan los planes 195-01 (columnas web y datos de sedes, migraciones 0270 y 0271) y 195-02 (endpoint).
2. Con OK de Franco: `git push origin <sha-del-último-commit-solo-API>:staging`.
3. Esperar el deploy verde en GitHub Actions (el build web de ese push no usa el endpoint: todavía no existe el prebuild).
4. Comprobar que el endpoint responde y devuelve sedes: `curl -s https://api-staging.eltemplo.org/api/web/site-data | head -c 300`.

**Paso 2: el resto de la rama.**

5. Con OK de Franco: push del resto (`git push origin feat/195-seo-web:staging` o el equivalente que se haya acordado). Corren `Build API`, `Build Admin`, `Build App` y `Build Web` según lo que cambió.
6. Si el build web había fallado (o no corrió), disparar "solo web" (sección 6).
7. UAT en staging. Recién después, mismo orden hacia producción: paso 1 con `<sha>:master`, esperar el deploy, `curl -s https://api.eltemplo.org/api/web/site-data | head -c 300`, y recién ahí el paso 2.

Antes del paso 2 en producción: crear los secrets `WEB_GA4_ID` y `WEB_META_PIXEL_ID` (sección 3), si no la web se genera sin medición.

La migración 0271 carga datos reales de sedes (calle, slug, WhatsApp, publicación) en la base de producción al desplegar el paso 1. Revisar la tabla `branches` después de ese deploy.

## 2. Si el build web falla

- El job `Deploy to Production` / `Deploy to Staging` igual corre para API, app y admin, y muestra el aviso `El build de la web falló` en el resumen de la corrida. La web queda en su versión anterior (no se toca el directorio de la web, ni su backup).
- La corrida igual queda en rojo por el job `Build Web`. Mirar el log: el error dice si la API no tiene el endpoint, si el payload es inválido o si `verify-seo-output.mjs` encontró un problema.
- Corregir la causa (típicamente: la API todavía no tiene el endpoint, o un dato de sede inválido) y volver a disparar solo la web (sección 6).
- Si falla la verificación `--require-api` es porque el build salió del fixture y no de la API real (revisar `VITE_API_URL` / `STAGING_VITE_API_URL`), **o porque algún html conserva un marcador `PENDIENTE DE COMPLETAR`** (el primer rollout sale con el `/privacidad` actual, sin marcador; el marcador aparece recién al copiar `docs/privacidad-con-medicion.vue.txt`, ver guía §1.2).

## 3. Secrets a crear en GitHub (Settings › Secrets and variables › Actions)

Los crea Franco. La guía `docs/guia-195-web-seo-atribucion.md` (plan 195-14) explica cómo conseguir cada valor. Un secret que no existe llega vacío y la integración queda apagada: la API arranca igual y el build web no rompe. **Ninguno de estos va a staging.**

| Secret                             | Entorno                         | Para qué                                                                  | Quién lo consigue                                                                                                  |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `WEB_GA4_ID`                       | solo producción (build web)     | Medición de la web con GA4 (`NUXT_PUBLIC_GA4_ID`)                         | Franco, en GA4 (Admin › Flujos de datos, ID `G-XXXX`)                                                              |
| `WEB_META_PIXEL_ID`                | solo producción (build web)     | Meta Pixel de la web (`NUXT_PUBLIC_META_PIXEL_ID`)                        | Franco, en Meta Events Manager                                                                                     |
| `META_ACCESS_TOKEN`                | solo producción (API)           | Token único para CAPI y gasto publicitario                                | Franco / quien administre el Business Manager (usuario del sistema con acceso al pixel y a la cuenta publicitaria) |
| `META_PIXEL_ID`                    | solo producción (API)           | Pixel/dataset al que CAPI envía conversiones                              | Meta Events Manager                                                                                                |
| `META_AD_ACCOUNT_IDS`              | solo producción (API)           | Cuentas publicitarias de las que se baja el gasto (separadas por coma)    | Meta Business Manager                                                                                              |
| `META_CAPI_START_AT`               | solo producción (API)           | Fecha ISO de activación de CAPI: solo se envían eventos posteriores       | Franco, el día de la activación (ver sección 4)                                                                    |
| `META_GRAPH_VERSION`               | solo producción (API), opcional | Versión de la Graph API (default `v26.0`)                                 | No hace falta crearlo                                                                                              |
| `META_CAPI_TEST_EVENT_CODE`        | solo producción (API), temporal | Código de Events Manager › Probar eventos para validar sin ensuciar datos | Franco, solo durante la validación (borrarlo después)                                                              |
| `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` | solo producción (API)           | Service account de GCP para Search Console (`base64 -w0 key.json`)        | Franco, en GCP; agregar su email como usuario de la propiedad                                                      |
| `GOOGLE_SC_SITE_URL`               | solo producción (API), opcional | Propiedad de Search Console (default `sc-domain:eltemplo.org`)            | No hace falta crearlo                                                                                              |
| `GBP_SYNC_MODE`                    | solo producción (API)           | `off` (default), `dry-run` o `apply` para el sync de fichas de Google     | Franco decide el valor (sección 4)                                                                                 |
| `GBP_OAUTH_CLIENT_ID`              | solo producción (API)           | Cliente OAuth de Google Business Profile                                  | Franco, en GCP                                                                                                     |
| `GBP_OAUTH_CLIENT_SECRET`          | solo producción (API)           | Secreto del cliente OAuth                                                 | Franco, en GCP                                                                                                     |
| `GBP_REFRESH_TOKEN`                | solo producción (API)           | Refresh token del owner de las fichas                                     | Franco, con `scripts/gbp-authorize.ts` (plan 195-09)                                                               |

Los secrets ya existentes (`VITE_API_URL`, `STAGING_VITE_API_URL`, SSH, rutas de deploy, etc.) no cambian.

Los valores del `.env.production` de la API se escriben en cada deploy de la API: crear o cambiar un secret de la API NO tiene efecto hasta el próximo deploy de la API (un push que toque `el-templo-api/**` o un dispatch con target `todo`; `solo-web` no toca la API). Los IDs de GA4 y Pixel se leen en el build web: cambiarlos requiere regenerar la web (`solo-web`).

## 4. Orden de activación de las integraciones

1. **Texto de `/privacidad` en producción primero.** Franco aprueba el texto nuevo (`docs/privacidad-con-medicion.vue.txt`, con razón social, NIF y domicilio de España completados) y la web con esa página tiene que estar en prod antes de cargar `WEB_GA4_ID`, `WEB_META_PIXEL_ID` o cualquier `META_*`. El primer rollout sale con el `/privacidad` actual (decisión de Franco 2026-10-07).
2. **Meta: gasto.** Cargar `META_ACCESS_TOKEN`, `META_PIXEL_ID` y `META_AD_ACCOUNT_IDS` y deployar la API. Con eso se prende solo el gasto publicitario (no necesita fecha ni pixel). CAPI sigue apagado: la API solo lo activa cuando también existe `META_CAPI_START_AT`.
3. **Meta CAPI, validación.** CAPI no envía nada sin `META_CAPI_START_AT`, así que para probar con "Probar eventos" hay que cargar `META_CAPI_TEST_EVENT_CODE` **y** `META_CAPI_START_AT` = fecha y hora de ahora (ISO), y deployar la API. Hacer un registro y una reserva de prueba y mirar Events Manager › Probar eventos (el sistema revisa cada 10 minutos). Mientras el código de prueba esté cargado, TODOS los eventos (también los de alumnos reales) van solo al panel de prueba y quedan marcados como enviados: no se reenvían. Conviene que esta ventana sea corta.
4. **Meta CAPI, activación real.** Con la validación bien: borrar `META_CAPI_TEST_EVENT_CODE` y deployar la API. `META_CAPI_START_AT` queda como está. Desde ahí CAPI envía de verdad (nunca de España ni de altas iOS o de origen desconocido).
5. **Search Console.** Cargar `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` (y agregar la service account a la propiedad). El job es semanal y de solo lectura.
6. **Fichas de Google.** Cargar los tres `GBP_OAUTH_*`/`GBP_REFRESH_TOKEN` y `GBP_SYNC_MODE=dry-run`. Dejarlo **una semana** mirando los logs de la API. Antes de pasar a `apply`, cargar los teléfonos reales en `branches.phone`: si están vacíos, el sync pone el WhatsApp de ventas como teléfono de la ficha. Después `GBP_SYNC_MODE=apply`. Hasta que Google apruebe el acceso a la API, el sync falla por ficha con 403/429 sin romper nada.
7. **Staging nunca recibe `META_*`, `GOOGLE_SC_*` ni `GBP_*`**: corre con datos reales clonados y mandaría conversiones reales a Meta y editaría fichas reales de Google. Está escrito como comentario en `deploy-staging.yml` encima del `.env.production`.

## 5. nginx

Los cambios de nginx van en dos tandas (ver runbook): **tanda A** (noindex en web-staging, app y admin + `.well-known` como JSON) se puede aplicar en cualquier momento; **tanda B** (404 real y redirects de `eltemplo.org`) va **después** de que la web nueva esté en producción y verificada: con el `404` real, una ruta no prerenderizada deja de caer en el shell de la SPA. El procedimiento, con el diff aplicable y el chequeo de que el vhost live conserva las líneas de certbot, está en el runbook del plan 195-13 (`deploy/RUNBOOK-195-NGINX.md`). Requiere SSH: gate humano.

## 6. Cómo usar "solo web"

Sirve para publicar un post del blog, cambiar horarios, sedes o el WhatsApp de ventas, o reintentar un build web fallido, sin tocar la API, la app ni el admin.

1. GitHub › Actions › **Deploy** (producción) o **Deploy Staging** › **Run workflow**.
2. Elegir la rama (`master` para producción, `staging` para staging: el job de deploy solo corre en esas ramas) y **target: `solo-web`**.
3. Run workflow. Se construye únicamente la web (con los datos actuales de `GET /api/web/site-data`), se verifica con `verify-seo-output.mjs --require-api`, se hace el backup del directorio de la web y se publica. Si el smoke test falla, se restaura solo la web (la API no se reinicia).
4. Con target `todo` (el valor por defecto) se despliegan los 4 proyectos. Un push sigue detectando qué cambió, como siempre.

La primera vez, validar el botón con un dispatch en staging: el contexto `inputs.target` se validó solo leyendo la documentación de GitHub.
