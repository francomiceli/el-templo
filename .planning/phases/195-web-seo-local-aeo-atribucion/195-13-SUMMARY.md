---
phase: 195-web-seo-local-aeo-atribucion
plan: "13"
subsystem: nginx
tags: [nginx, seo, noindex, redirects, well-known, deep-links, runbook]
requires: ["195-11", "195-12"]
provides:
  - "Vhosts de deploy/nginx en su estado objetivo: 404 real y redirects 301/302 reales (eltemplo.org y web-staging), X-Robots-Tag noindex sin bloquear robots.txt (web-staging, app, admin, prod y staging), .well-known como application/json (app y app-staging)"
  - "deploy/RUNBOOK-195-NGINX.md: merge de 3 vias que conserva las lineas de certbot, backup, nginx -t, reload, rollback, verificacion con curl, etapa 2 y Removals"
affects: [195-14]
key-files:
  created:
    - deploy/RUNBOOK-195-NGINX.md
  modified:
    - deploy/nginx/eltemplo.org
    - deploy/nginx/web-staging.eltemplo.org
    - deploy/nginx/app.eltemplo.org
    - deploy/nginx/app-staging.eltemplo.org
    - deploy/nginx/admin.eltemplo.org
    - deploy/nginx/admin-staging.eltemplo.org
decisions:
  - "La aplicacion al servidor NO la hizo el ejecutor. Task 3 (checkpoint de aplicacion por SSH) queda DIFERIDA al rollout: pendiente de aprobacion de Franco en el rollout, despues de que la web nueva este en produccion"
  - "El runbook aplica con git merge-file (live + base del repo antes de 195-13 + target del repo) en vez de copiar o aplicar un patch: conserva ssl_certificate*/options-ssl/bloques de certbot sin depender del contexto exacto del live. La base se identifica por mensaje de commit (^feat(195-13)), como el rollout de 195-11"
  - "Redirects con regex ^/ruta/?$ (con y sin barra final) en vez de location = exacta: con la barra final el directorio generado por Nuxt (curso-entrenadores/index.html, meta-refresh) seguia respondiendo antes que el redirect"
metrics:
  tasks: 3 (2 ejecutadas, 1 diferida)
  commits: 2
  completed: 2026-10-07
---

# Phase 195 Plan 13: nginx (404 real, redirects, noindex etapa 1, .well-known) Summary

Los 6 vhosts del repo describen el nginx objetivo de la fase y `deploy/RUNBOOK-195-NGINX.md` explica como aplicarlo sin romper TLS (merge de 3 vias, no copia). No se hizo ningun SSH, scp ni rsync remoto: la aplicacion en el servidor queda pendiente de aprobacion de Franco en el rollout.

## Commits

| Hash        | Mensaje                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| `7415b4a6f` | feat(195-13): nginx 404 real, redirects reales, noindex etapa 1 y .well-known        |
| `105aaaf60` | docs(195-13): runbook de nginx con merge de 3 vias, verificacion, rollback y etapa 2 |

## Que cambia en cada vhost

| Vhost                                 | Cambio                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eltemplo.org` (443)                  | `error_page 404 /404.html` + `location = /404.html { internal; }`; `try_files ... =404` sin `/index.html`; 301 `/curso-entrenadores` a `/academy`; 302 `/qr/bcn` y `/qr/aura-club` a la app; la location de assets repite HSTS y `X-Content-Type-Options` (Pitfall 3) |
| `web-staging.eltemplo.org` (80 y 443) | lo mismo (paridad para probar antes de prod) + `X-Robots-Tag noindex, nofollow` en server y en assets, sin bloquear robots.txt                                                                                                                                        |
| `app` / `app-staging`                 | noindex en server y assets; `location =` para `apple-app-site-association` y `assetlinks.json` con `default_type application/json`, `try_files $uri =404` y los headers de seguridad repetidos, antes de `location /`                                                 |
| `admin` / `admin-staging`             | noindex en server y assets                                                                                                                                                                                                                                            |

Todos los archivos llevan el comentario "NO tienen las lineas de certbot: aplicar con el runbook". Terminan en CRLF, como en la base (se edito con un script que preserva `\r\n`).

## Verificacion

| Chequeo                                                                                                        | Resultado                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greps del `<verify>` de Task 1 (404, sin `/index.html =404`, 301, TEMPLOPASSBCN, noindex sin "disallow", AASA) | OK                                                                                                                                                                                                                                                 |
| `location = /404.html` en eltemplo.org                                                                         | 1                                                                                                                                                                                                                                                  |
| `return 302` / `return 301 /academy` en eltemplo.org                                                           | 2 / 1                                                                                                                                                                                                                                              |
| `default_type application/json` en app y app-staging                                                           | 2 / 2                                                                                                                                                                                                                                              |
| Balance de llaves y terminadores de los 6 vhosts (script propio)                                               | OK en los 6                                                                                                                                                                                                                                        |
| `nginx` local                                                                                                  | **No existe** (`command -v nginx` vacio, sin `/usr/sbin/nginx`, tampoco docker/podman) y no se instalo. No se pudo correr `nginx -t -c`. La validacion de sintaxis real es `sudo nginx -t` en el servidor, paso 1.6 del runbook (antes del reload) |
| Greps del `<verify>` de Task 2 (existe, `nginx -T`, `bak-195`, `Disallow`, `no-existe-195`, >= 80 lineas)      | OK, 324 lineas                                                                                                                                                                                                                                     |
| Runbook: comandos con "Pedir OK a Franco antes de correr"                                                      | 8 (los ocho SSH/scp: 2 de lectura, backup, bajada del vhost, scp, install + `nginx -t`, reload, rollback)                                                                                                                                          |
| Runbook: curls de verificacion                                                                                 | mas de 30 con resultado esperado                                                                                                                                                                                                                   |
| Runbook: sin IPs, usuarios, claves ni valores de secrets                                                       | OK (placeholders `<SSH_USER>@<SERVER_HOST>`)                                                                                                                                                                                                       |
| Simulacion del procedimiento de merge                                                                          | ver abajo                                                                                                                                                                                                                                          |
| Prettier sobre el runbook                                                                                      | aplicado (las tablas se reformatearon)                                                                                                                                                                                                             |

### Simulacion del merge de 3 vias (sin tocar el servidor)

Se armo en el scratchpad un "live" simulado por vhost = base del repo + lineas de certbot (en el 443 de `eltemplo.org`/`web-staging`; `listen 443 ssl`, 3 lineas de certbot y un bloque 80 de redireccion agregado al final en app/admin) y, en `eltemplo.org`, sin la linea HSTS (el drift real). Con los comandos exactos del runbook:

- `git merge-file -p live base target`: 0 conflictos en los 6 vhosts y las 3 lineas `ssl_certificate*` presentes en el resultado de cada uno.
- Live con finales CRLF: da conflictos; normalizado con `tr -d '\r'` (paso 1.3) da 0. Por eso el runbook normaliza.
- `sed -i '/^        add_header Strict-Transport-Security/d'` (decision HSTS de 1.5) quita solo la linea de la location de assets y deja intacta la de nivel server si existiera.
- El bloque de la etapa 2 se probo extrayendo el script de Python del propio runbook: inserta 1 bloque en app y 2 en web-staging (80 y 443), y deja `return 200 "User-agent: *\nDisallow: /\n";`.

No se probo contra el live real (no se hizo SSH): el runbook pide revisar `diff -u live new` y 0 conflictos antes de subir.

## Evidencia del estado live (curl publico GET/HEAD, 2026-10-07)

| Chequeo                                                                                       | Resultado hoy                                                                                                          |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `eltemplo.org/no-existe-195`                                                                  | `200 text/html` (soft-404)                                                                                             |
| `eltemplo.org/404.html`                                                                       | `200`                                                                                                                  |
| `eltemplo.org/curso-entrenadores`, `/qr/bcn`, `/qr/aura-club`                                 | `200 text/html` (meta-refresh, no redirect)                                                                            |
| `eltemplo.org/sedes/juan-b-justo/`                                                            | `200`, `grep -c ExerciseGym` = 0 (la web nueva NO esta en prod, precondicion de la tanda B)                            |
| `/`, `/sedes`, `/es/sedes/barcelona`                                                          | `200`, mismo tamano (125730 bytes): todo cae en `index.html`                                                           |
| `/_nuxt/x.js` inexistente                                                                     | `404` (la location de assets no tiene fallback)                                                                        |
| `eltemplo.org/sitemap.xml`                                                                    | 18 lineas, 3 `<loc>` (web vieja)                                                                                       |
| `x-robots-tag` en web-staging, app, app-staging, admin, admin-staging                         | ausente en los 5                                                                                                       |
| `/robots.txt` en app, app-staging, admin, admin-staging                                       | `200 text/html` (es el `index.html` de la SPA)                                                                         |
| `/robots.txt` en web-staging                                                                  | `text/plain`: `User-agent: *` / `Allow: /` / `Sitemap: https://eltemplo.org/sitemap.xml` (apunta al sitemap de PROD)   |
| `app.eltemplo.org/.well-known/assetlinks.json` y `apple-app-site-association` (y app-staging) | `200 text/html`, 909 bytes: el fallback de la SPA                                                                      |
| `Strict-Transport-Security` en `eltemplo.org`, `web-staging` y `app`                          | **ausente**                                                                                                            |
| Headers de `eltemplo.org/`                                                                    | `nginx/1.18.0 (Ubuntu)`; `x-frame-options`, `x-content-type-options`, `x-xss-protection`, `referrer-policy` (sin HSTS) |
| `eltemplo.org/favicon.ico`                                                                    | `expires`, `cache-control: public, immutable` y SIN `x-content-type-options` (confirma el Pitfall 3)                   |
| `http://app.eltemplo.org/`, `http://web-staging.eltemplo.org/`                                | `301` a https                                                                                                          |

## Deviations from Plan

**1. [Rule 1 - Bug de diseno] Redirects con regex y barra final opcional**

- **Found during:** Task 1.
- **Issue:** el plan pedia `location = /curso-entrenadores` (y `= /qr/bcn`, `= /qr/aura-club`). Con la barra final (`/curso-entrenadores/`) nginx no matchea la exacta y `location /` sirve `curso-entrenadores/index.html`, el meta-refresh que justamente se quiere sacar.
- **Fix:** `location ~ ^/curso-entrenadores/?$ { return 301 /academy; }` (idem `qr/bcn` y `qr/aura-club` con `return 302`). Los conteos de aceptacion se mantienen (`return 301 /academy` = 1, `return 302` = 2). `location = /404.html` si es exacta, como pide el plan.
- **Commit:** `7415b4a6f`.

**2. [Rule 2 - Faltante critico] Headers de seguridad repetidos en las locations `.well-known`**

- **Issue:** esas locations definen `add_header X-Robots-Tag` y por eso dejan de heredar `X-Frame-Options` y `X-Content-Type-Options` del server (mismo Pitfall 3).
- **Fix:** se repiten los tres headers dentro de cada una.
- **Commit:** `7415b4a6f`.

**3. Merge de 3 vias en vez de "diff exacto contra el repo"**

- El plan pedia "el diff exacto contra el repo" por vhost. Un diff fijo depende del contexto del live (que no se puede leer sin SSH). `git merge-file` entrega lo mismo (solo se aplican los cambios del plan) y avisa con conflictos si el live difiere en las lineas vecinas. Probado en simulacion.

**4. Ejecutor sin `nginx` local** (esperado por el plan): no hubo `nginx -t -c`. Ver Verificacion.

## Hallazgos para Franco

- **Drift de HSTS (no es parte del plan, requiere decision).** El repo declara `Strict-Transport-Security: max-age=31536000; includeSubDomains` en `eltemplo.org` y `web-staging`, pero el live no lo emite en ninguna respuesta de eltemplo.org, web-staging ni app. El plan manda repetirlo en la location de assets; en el repo quedo asi. Aplicarlo tal cual al live introduciria HSTS con `includeSubDomains` sobre el dominio raiz (afecta a api, app y admin por un ano). El runbook (1.5, "Decision HSTS") recomienda NO adoptarlo ahora y da el `sed` que saca esas lineas del archivo a subir; si Franco quiere adoptarlo, que sea un cambio aparte y consciente.
- **`web-dist` y archivos ocultos (leccion de 195-12).** Revise `el-templo-web/.output/public`: el unico archivo oculto es `email/.gitkeep` (marcador vacio de `public/email/`, sin contenido servido). No hay `.well-known` ni otras carpetas ocultas en la web, asi que `upload-artifact@v4` no pierde nada hoy. No se modifico el workflow (fuera de `files_modified`). Si la web llega a necesitar un `.well-known`, hay que agregar `include-hidden-files: true` al artifact `web-dist`, igual que se hizo con `app-dist` en 195-12.
- **El `robots.txt` de web-staging publica `Sitemap: https://eltemplo.org/sitemap.xml`** (sitemap de prod). Inofensivo con el noindex, pero staging anuncia el sitemap del sitio real. No se toco (es contenido de la web, no de nginx).
- `rsync --delete` en el deploy de la web: cualquier archivo puesto a mano en la raiz de la web (por ejemplo un HTML de verificacion de Search Console) se borra en cada deploy. Confirmar que la propiedad de Search Console se verifica por DNS (dominio) y no por archivo.

## Task 3: checkpoint de aplicacion en el servidor

**Estado: DIFERIDA. Pendiente de aprobacion de Franco en el rollout, despues de que la web nueva este en produccion.** El ejecutor no corrio ningun comando por SSH y no pidio la aprobacion (instruccion del orquestador: el paso queda diferido al rollout). La tanda A (noindex y `.well-known`) puede aplicarse en cualquier momento; la tanda B (404 real y redirects de eltemplo.org) solo cuando la precondicion 0 del runbook pase (hoy falla: `ExerciseGym` = 0 en la sede de JBJ). nginx pendiente: ver `deploy/RUNBOOK-195-NGINX.md`. La fase sigue con 195-14.

### Comandos exactos que se van a pedir aprobar en el rollout (de a uno, con `V` = vhost)

Con `SSH_TARGET="<SSH_USER>@<SERVER_HOST>"` (secrets `SSH_USER`, `SERVER_HOST`):

1. `ssh "$SSH_TARGET" 'sudo nginx -T' > nginx-live-$(date +%F).txt` (lectura)
2. `ssh "$SSH_TARGET" 'ls -l /etc/nginx/sites-enabled/'` (lectura)
3. Por vhost: `ssh "$SSH_TARGET" "sudo cp -p /etc/nginx/sites-available/$V /etc/nginx/sites-available/$V.bak-195"`
4. Por vhost: `ssh "$SSH_TARGET" "sudo cat /etc/nginx/sites-available/$V" | tr -d '\r' > live.$V` (lectura)
5. Por vhost: `scp new.$V "$SSH_TARGET:/tmp/$V.new"`
6. Por vhost: `ssh "$SSH_TARGET" "sudo install -m 644 -o root -g root /tmp/$V.new /etc/nginx/sites-available/$V && sudo nginx -t"`
7. Por vhost: `ssh "$SSH_TARGET" 'sudo nginx -t && sudo systemctl reload nginx'`
8. Solo si hace falta revertir: `ssh "$SSH_TARGET" "sudo cp -p /etc/nginx/sites-available/$V.bak-195 /etc/nginx/sites-available/$V && sudo nginx -t && sudo systemctl reload nginx"`

Los pasos locales del runbook (merge con `git merge-file`, `diff -u`, `sed` de HSTS) y todos los curls de verificacion no necesitan aprobacion. Orden recomendado: `web-staging`, `app-staging`, `admin-staging`, `app`, `admin` (tanda A) y `eltemplo.org` al final (tanda B). La etapa 2 (robots.txt que bloquea) repite los pasos 3 a 7 semanas despues.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. No hay endpoints, auth ni acceso a archivos nuevos: solo configuracion nginx versionada que todavia no esta aplicada.

## Self-Check: PASSED

- `deploy/RUNBOOK-195-NGINX.md` y los 6 vhosts existen; commits `7415b4a6f` y `105aaaf60` en `feat/195-seo-web`.
- No se hizo push, no se commiteo en el checkout principal, no se toco STATE.md ni ROADMAP.md.
