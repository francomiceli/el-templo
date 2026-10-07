# Runbook nginx de la fase 195 (404 real, redirects, noindex, .well-known)

Aplica a mano en el servidor los cambios de `deploy/nginx/` de la fase 195. Todo SSH y todo `scp` es un gate humano: **cada comando de este runbook marcado "pedir OK a Franco antes de correr" se pide y se corre de a uno, nunca en lote, y el ejecutor nunca hace SSH por su cuenta.** Los comandos marcados "local" no tocan el servidor y no necesitan OK.

Este runbook lo referencia `deploy/ROLLOUT-195.md` sección 5.

## Qué cambia y por qué hay dos tandas

| Tanda | Vhosts                                                                                                                         | Cambio                                                                                                                                     | Cuándo                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A     | `web-staging.eltemplo.org`, `app.eltemplo.org`, `app-staging.eltemplo.org`, `admin.eltemplo.org`, `admin-staging.eltemplo.org` | `X-Robots-Tag: noindex, nofollow` (etapa 1, sin bloquear `robots.txt`) y, solo en app y app-staging, `.well-known` como `application/json` | En cualquier momento. No depende de la web nueva.                         |
| B     | `eltemplo.org` (y `web-staging.eltemplo.org`, que ya viene en A con el mismo cambio)                                           | 404 real (sin fallback a `index.html`) y redirects 301/302 reales                                                                          | **Solo después** de que la web nueva esté en producción (precondición 0). |
| D     | los 5 vhosts de la tanda A                                                                                                     | etapa 2: `robots.txt` que bloquea todo                                                                                                     | Semanas después, cuando Google ya desindexó.                              |

**Trampa que este runbook evita (Pitfall 4).** Los archivos de `deploy/nginx/` NO tienen las líneas `ssl_certificate*`, `include .../options-ssl-nginx.conf` ni los bloques de redirección que certbot agregó en el servidor. **Copiar un archivo del repo encima del vhost live rompe TLS.** Por eso el procedimiento es un merge de 3 vías (`git merge-file`) entre el vhost live, la versión del repo anterior a este plan y la versión nueva del repo: toma solo lo que cambió el plan y conserva lo de certbot.

## Estado live observado antes de aplicar (curl público, 2026-10-07)

| Chequeo                                                                                          | Resultado hoy                                                                                    | Resultado esperado después                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `https://eltemplo.org/no-existe-195`                                                             | `200 text/html` (soft-404)                                                                       | `404` (tanda B)                                                 |
| `https://eltemplo.org/404.html`                                                                  | `200`                                                                                            | `404` (es `internal`, solo se ve vía `error_page`)              |
| `https://eltemplo.org/curso-entrenadores`                                                        | `200 text/html` (meta-refresh)                                                                   | `301` a `/academy` (B)                                          |
| `https://eltemplo.org/qr/bcn` y `/qr/aura-club`                                                  | `200 text/html` (meta-refresh)                                                                   | `302` a `app.eltemplo.org/register?promo=...` (B)               |
| `https://eltemplo.org/sedes/juan-b-justo/`                                                       | `200`, 0 apariciones de `ExerciseGym` (web vieja)                                                | `200` con `ExerciseGym` (web nueva, precondición de B)          |
| `X-Robots-Tag` en web-staging, app, app-staging, admin, admin-staging                            | ausente                                                                                          | `noindex, nofollow` (A)                                         |
| `/robots.txt` de app y admin                                                                     | `200 text/html` (es el `index.html` de la SPA, sin reglas)                                       | igual en la etapa 1; `text/plain` con bloqueo en la etapa 2 (D) |
| `app.eltemplo.org/.well-known/assetlinks.json` y `apple-app-site-association` (y en app-staging) | `200 text/html`, 909 bytes (fallback de la SPA)                                                  | `application/json` (A + deploy de la app de 195-12)             |
| `Strict-Transport-Security` en `eltemplo.org` y `web-staging`                                    | **ausente** (el repo declara HSTS pero el live no lo emite)                                      | ver "Decisión HSTS" en 1.5                                      |
| Assets (`/favicon.ico`)                                                                          | sin `x-content-type-options` (la location de assets no hereda los headers del server, Pitfall 3) | con `x-content-type-options` (B)                                |

## 0. Precondiciones

Local, sin OK:

```bash
# Host y usuario salen de los secrets SERVER_HOST y SSH_USER de GitHub (no se escriben acá).
export SSH_TARGET="<SSH_USER>@<SERVER_HOST>"
mkdir -p ~/nginx-195 && cd ~/nginx-195
```

Para la tanda B, comprobar que la web nueva ya está en producción (todos estos curls son públicos, no necesitan OK):

```bash
# 1) Página de sede con schema nuevo: esperado >= 1 (hoy da 0)
curl -s https://eltemplo.org/sedes/juan-b-justo/ | grep -c ExerciseGym
# 2) Páginas nuevas existen: esperado 200 en cada línea
for p in /sedes /es /es/sedes/barcelona /blog /sedes/juan-b-justo /llms.txt /sitemap.xml; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://eltemplo.org$p"
done
# 3) Cada URL del sitemap responde 200 (con el soft-404 de hoy todo da 200, por eso el chequeo 1 es el que discrimina)
curl -s https://eltemplo.org/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | while read -r u; do
  printf '%s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "$u"
done | grep -v ' 200$' || echo "todas 200"
```

Si el chequeo 1 da 0, o algún post del blog / sede da otra cosa que 200, **no aplicar la tanda B**: con el 404 real una ruta que no existe en el build deja de caer en la SPA (Pitfall 2) y pasa a ser un 404 duro.

## 1. Lectura del live, backup y merge local (procedimiento común)

Se repite para cada vhost `V` de la tanda que se aplica. Orden recomendado para minimizar riesgo: `web-staging.eltemplo.org` (canario) → `app-staging.eltemplo.org` → `admin-staging.eltemplo.org` → `app.eltemplo.org` → `admin.eltemplo.org`; y `eltemplo.org` al final (tanda B).

### 1.1 Volcar la config viva (solo lectura)

Pedir OK a Franco antes de correr:

```bash
ssh "$SSH_TARGET" 'sudo nginx -T' > nginx-live-$(date +%F).txt
```

Pedir OK a Franco antes de correr (confirma que `sites-enabled` apunta a `sites-available` y que el archivo editable es ese):

```bash
ssh "$SSH_TARGET" 'ls -l /etc/nginx/sites-enabled/'
```

### 1.2 Backup en el servidor

Pedir OK a Franco antes de correr (una vez por vhost; `V` es el nombre del archivo, por ejemplo `app.eltemplo.org`). Un `.bak-195` dentro de `sites-available` no se carga (nginx solo incluye `sites-enabled`):

```bash
V=app.eltemplo.org
ssh "$SSH_TARGET" "sudo cp -p /etc/nginx/sites-available/$V /etc/nginx/sites-available/$V.bak-195"
```

### 1.3 Bajar el vhost live a la máquina local

Pedir OK a Franco antes de correr:

```bash
ssh "$SSH_TARGET" "sudo cat /etc/nginx/sites-available/$V" | tr -d '\r' > live.$V
```

(`tr -d '\r'` normaliza finales de línea: los archivos del repo son CRLF y el live puede serlo también. nginx trata el `\r` como espacio, pero el merge necesita LF en los tres lados.)

### 1.4 Merge de 3 vías, local

Local, sin OK. Correr desde la raíz del repo con la rama de la fase 195 integrada. La base es la versión del vhost anterior al commit `feat(195-13)` (se identifica por mensaje, no por SHA, para sobrevivir a rebases):

```bash
REPO=<ruta al repo>
BASE=$(git -C "$REPO" log --format=%H --grep='^feat(195-13)' -1)^
git -C "$REPO" show "$BASE:deploy/nginx/$V" | tr -d '\r' > base.$V
tr -d '\r' < "$REPO/deploy/nginx/$V" > target.$V
git merge-file -p live.$V base.$V target.$V > new.$V; echo "conflictos: $?"
```

El `echo` imprime la cantidad de conflictos. Si no es `0`, **parar**: el live tiene algo distinto en las líneas vecinas (típico en el bloque del puerto 80 que certbot reescribe como redirección). Abrir `new.$V`, resolver a mano los marcadores `<<<<<<<`, y mostrarle el diff a Franco antes de seguir. Nunca subir un archivo con marcadores.

### 1.5 Revisar antes de subir (local, sin OK)

```bash
diff -u live.$V new.$V                                   # solo deben aparecer los cambios de la fase 195
grep -c '<<<<<<<\|>>>>>>>' new.$V                        # esperado: 0
test "$(grep -c ssl_certificate live.$V)" = "$(grep -c ssl_certificate new.$V)" && echo "certbot intacto"
```

Esperado: ninguna línea `ssl_certificate*`, `include .../options-ssl-nginx.conf` ni `# managed by Certbot` aparece en el diff como borrada, y `certbot intacto` se imprime.

**Decisión HSTS (solo vhosts `eltemplo.org` y `web-staging`).** El repo repite `Strict-Transport-Security` en la location de assets (el server del repo ya lo declara), pero el live hoy no emite HSTS en ninguna respuesta (ver tabla). Agregarlo solo en los assets sería una política nueva con `includeSubDomains` sobre el dominio raíz (afecta a `api`, `app` y `admin` por un año) y no es parte de esta fase. Recomendación: **no adoptarlo ahora**. Sacar esas líneas del archivo a subir:

```bash
sed -i '/^        add_header Strict-Transport-Security/d' new.$V   # solo las de 8 espacios (dentro de la location de assets)
```

Si Franco decide adoptar HSTS deliberadamente (como cambio aparte, con `includeSubDomains` revisado), omitir este `sed`.

### 1.6 Subir, instalar y recargar

Pedir OK a Franco antes de correr (sube el archivo a `/tmp`, sin tocar nginx):

```bash
scp new.$V "$SSH_TARGET:/tmp/$V.new"
```

Pedir OK a Franco antes de correr (instala y valida la sintaxis; **todavía no recarga**, nginx sigue sirviendo la config anterior):

```bash
ssh "$SSH_TARGET" "sudo install -m 644 -o root -g root /tmp/$V.new /etc/nginx/sites-available/$V && sudo nginx -t"
```

Esperado: `syntax is ok` y `test is successful`. **Si `nginx -t` falla: ir directo a la sección C (rollback) para ese vhost**, no recargar.

Pedir OK a Franco antes de correr:

```bash
ssh "$SSH_TARGET" 'sudo nginx -t && sudo systemctl reload nginx'
```

Después correr los curls de verificación de la sección que corresponda (A o B) antes de pasar al vhost siguiente.

## A. Etapa 1: noindex + `.well-known` (se puede aplicar en cualquier momento)

Vhosts: `web-staging.eltemplo.org`, `app-staging.eltemplo.org`, `admin-staging.eltemplo.org`, `app.eltemplo.org`, `admin.eltemplo.org`. Para cada uno, correr 1.2 a 1.6 (en `web-staging` aplicar también el 404 real y los redirects de la tanda B: es el mismo archivo, y sirve de ensayo previo en staging; no depende de prod porque la web de staging se regenera con su propio deploy).

Qué agrega en cada archivo (todo ya está en `deploy/nginx/<V>`, el merge lo trae):

```nginx
# a nivel server, junto a los otros add_header
add_header X-Robots-Tag "noindex, nofollow" always;

# dentro de la location de assets (que define su propio add_header y por eso no hereda el del server)
add_header X-Robots-Tag "noindex, nofollow" always;
add_header X-Content-Type-Options "nosniff" always;

# solo app y app-staging, ANTES de "location /"
location = /.well-known/apple-app-site-association { default_type application/json; try_files $uri =404; ... }
location = /.well-known/assetlinks.json            { default_type application/json; try_files $uri =404; ... }
```

No hay ninguna regla de bloqueo en `robots.txt` en esta etapa: **es a propósito** (D-26). Con `robots.txt` bloqueando, Google no puede rastrear, no ve el `noindex` y las URLs ya indexadas pueden seguir apareciendo.

Verificación (públicos, sin OK). Esperado `x-robots-tag: noindex, nofollow` en cada uno:

```bash
for h in web-staging app app-staging admin admin-staging; do
  printf '%s: ' "$h"; curl -sI "https://$h.eltemplo.org/" | grep -i '^x-robots-tag' || echo "FALTA"
done
```

Un asset también lo lleva (Pitfall 3). Esperado `x-robots-tag: noindex, nofollow` y `x-content-type-options: nosniff`:

```bash
ASSET=$(curl -s https://app.eltemplo.org/ | grep -oE '(src|href)="[^"]+\.(js|css)"' | head -1 | cut -d'"' -f2)
curl -sI "https://app.eltemplo.org$ASSET" | grep -iE '^(x-robots-tag|x-content-type-options)'
```

La producción NO debe quedar noindex. Esperado `0`:

```bash
curl -sI https://eltemplo.org/ | grep -ic '^x-robots-tag'
```

`.well-known` con content-type JSON. Esperado `application/json` (y `200`). Mientras la app con el fix de 195-12 no esté deployada, el archivo no está en el servidor y la respuesta esperada es `404` en vez del HTML de 909 bytes de hoy: ya no es un soft-404.

```bash
curl -sI https://app.eltemplo.org/.well-known/assetlinks.json | grep -iE '^(HTTP|content-type)'
curl -sI https://app.eltemplo.org/.well-known/apple-app-site-association | grep -iE '^(HTTP|content-type)'
curl -sI https://app-staging.eltemplo.org/.well-known/assetlinks.json | grep -iE '^(HTTP|content-type)'
curl -sI https://app-staging.eltemplo.org/.well-known/apple-app-site-association | grep -iE '^(HTTP|content-type)'
```

La app sigue funcionando (fallback de la SPA intacto). Esperado `200` en ambos:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.eltemplo.org/login
curl -s -o /dev/null -w '%{http_code}\n' https://admin.eltemplo.org/
```

## B. 404 real y redirects en `eltemplo.org` (SOLO con la web nueva en producción)

Precondición: la sección 0 pasó entera. Vhost: `eltemplo.org`, con 1.2 a 1.6 (incluida la decisión HSTS de 1.5). Qué agrega:

```nginx
error_page 404 /404.html;
location = /404.html { internal; }
location ~ ^/curso-entrenadores/?$ { return 301 /academy; }
location ~ ^/qr/bcn/?$             { return 302 https://app.eltemplo.org/register?promo=TEMPLOPASSBCN; }
location ~ ^/qr/aura-club/?$       { return 302 https://app.eltemplo.org/register?promo=AURACLUB1; }
location / { try_files $uri $uri/index.html $uri.html =404; }     # sin /index.html al final
```

Verificación (públicos, sin OK). Cada línea con su resultado esperado:

```bash
# 404 real (hoy: 200). Esperado: 404
curl -s -o /dev/null -w '%{http_code}\n' https://eltemplo.org/no-existe-195
# el 404 responde con el shell de 404.html (HTML). Esperado: 404 y content-type text/html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://eltemplo.org/otra-ruta-que-no-existe-195
# 301 a /academy (con y sin barra). Esperado: HTTP/2 301 y location: https://eltemplo.org/academy
curl -sI https://eltemplo.org/curso-entrenadores | grep -iE '^(HTTP|location)'
curl -sI https://eltemplo.org/curso-entrenadores/ | grep -iE '^(HTTP|location)'
# 302 a la app con la promo. Esperado: HTTP/2 302 y location: https://app.eltemplo.org/register?promo=TEMPLOPASSBCN
curl -sI https://eltemplo.org/qr/bcn | grep -iE '^(HTTP|location)'
# Esperado: HTTP/2 302 y location: https://app.eltemplo.org/register?promo=AURACLUB1
curl -sI https://eltemplo.org/qr/aura-club | grep -iE '^(HTTP|location)'
# los PNG de los QR siguen sirviéndose. Esperado: 200 y content-type image/png
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://eltemplo.org/qr/AURACLUB1.png
# 404.html directo es internal. Esperado: 404
curl -s -o /dev/null -w '%{http_code}\n' https://eltemplo.org/404.html
# páginas reales siguen en 200 (una por línea). Esperado: 200 en las nueve
for p in / /sedes /sedes/juan-b-justo /es /es/sedes/barcelona /blog /sitemap.xml /robots.txt /llms.txt; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://eltemplo.org$p"
done
# un asset de _nuxt sigue sirviéndose con cache largo y con nosniff (Pitfall 3). Esperado: 200, cache-control, x-content-type-options
A=$(curl -s https://eltemplo.org/ | grep -oE '/_nuxt/[^"]+\.js' | head -1)
curl -sI "https://eltemplo.org$A" | grep -iE '^(HTTP|cache-control|x-content-type-options|strict-transport-security)'
# el sitemap completo sigue en 200 (si aparece alguna otra cosa, ir a C)
curl -s https://eltemplo.org/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | while read -r u; do
  printf '%s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "$u"
done | grep -v ' 200$' || echo "todas 200"
```

`strict-transport-security` en el asset aparece solo si se adoptó HSTS en 1.5; con la recomendación (no adoptarlo) no debe aparecer.

**Si alguna página real da 404: ir inmediatamente a C para `eltemplo.org`** y regenerar la web (dispatch `solo-web`, ver `ROLLOUT-195.md` sección 6) antes de volver a intentarlo.

Para `web-staging.eltemplo.org` repetir la lista cambiando el host (los redirects de `/qr/*` apuntan igual a `app.eltemplo.org`, igual que los `routeRules` de la web).

## C. Rollback

Por vhost. Pedir OK a Franco antes de correr:

```bash
V=eltemplo.org   # el vhost que hay que revertir
ssh "$SSH_TARGET" "sudo cp -p /etc/nginx/sites-available/$V.bak-195 /etc/nginx/sites-available/$V && sudo nginx -t && sudo systemctl reload nginx"
```

Si `nginx -t` falló en 1.6 antes de recargar, el servidor nunca dejó de servir la config anterior: el rollback solo restaura el archivo para que un `reload` futuro (o una renovación de certbot) no tome el archivo roto. Verificar después con un curl de la sección A o B que el comportamiento volvió al estado de la tabla "Estado live observado". Los `.bak-195` se pueden borrar cuando todo lleve una semana estable.

Emergencia (nginx no recarga y hay TLS roto): restaurar el `.bak-195` de **todos** los vhosts tocados con el mismo comando y `sudo systemctl status nginx` para confirmar que está `active (running)`.

## D. Etapa 2: bloquear `robots.txt` (semanas después, D-26)

**No aplicar antes de tiempo.** Condición: Search Console (propiedades de `web-staging`, `app`, `admin` y sus `-staging`) muestra las URLs fuera del índice (Páginas › "Excluida por la etiqueta noindex"), o ya se pidió su retiro en "Removals" (sección E). Si Franco prefiere bloquear de entrada, anotarlo como riesgo aceptado: las URLs ya indexadas pueden quedar visibles sin snippet porque Google no puede ver el `noindex`. La guía de 195-14 repite este recordatorio.

Vhosts: los 5 de la tanda A. Para cada uno: bajar el live (1.3 con su OK), insertar el bloque delante de cada `location / {` y subirlo (1.6). Es un archivo derivado del live, no del repo, así que el merge de 3 vías no aplica; tampoco hay que cambiar el repo.

Local, sin OK (`$V` ya bajado con 1.3; el bloque queda delante de `location / {`):

```bash
python3 -I - "live.$V" "etapa2.$V" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
block = '''    # Etapa 2 de noindex (fase 195, D-26): recien despues de que Google desindexo.
    location = /robots.txt {
        default_type text/plain;
        return 200 "User-agent: *\\nDisallow: /\\n";
    }

'''
t = open(src, encoding="utf-8").read()
n = t.count("    location / {\n")
assert n >= 1, "no se encontro location /"
assert "location = /robots.txt" not in t, "ya tiene robots.txt"
open(dst, "w", encoding="utf-8").write(t.replace("    location / {\n", block + "    location / {\n"))
print("insertado en", n, "bloque(s)")
PY
diff -u live.$V etapa2.$V
```

Esperado: un solo cambio por bloque `server` que sirve contenido, sin tocar líneas de certbot. Subir con 1.6 usando `etapa2.$V` en lugar de `new.$V`; hacer el backup con otro sufijo (`.bak-195-etapa2`) para no pisar el de la etapa 1.

Verificación (públicos, sin OK). Esperado `User-agent: *` y `Disallow: /`, `text/plain`:

```bash
curl -s https://app.eltemplo.org/robots.txt
curl -sI https://app.eltemplo.org/robots.txt | grep -i '^content-type'
curl -s https://web-staging.eltemplo.org/robots.txt
```

`eltemplo.org` NO se toca en esta etapa: su `robots.txt` sigue permitiendo todo. Esperado `Allow: /` y ningún `Disallow: /` solo:

```bash
curl -s https://eltemplo.org/robots.txt | grep -c '^Disallow: /$'   # esperado: 0
```

## E. Si Google sigue mostrando una URL vieja

1. Confirmar que la URL responde `noindex` y no está bloqueada: `curl -sI <url> | grep -i x-robots-tag` y, en la etapa 1, `curl -s https://<host>/robots.txt` no debe bloquearla. Si ya se aplicó la etapa 2 y la URL sigue indexada, **volver temporalmente a la etapa 1** (rollback de D) para que Google pueda ver el `noindex`.
2. En Search Console (la propiedad del host, no la de `eltemplo.org`): Inspección de URLs › pegar la URL › "Solicitar indexación" para que se vuelva a rastrear y vea el `noindex`.
3. Para sacarla ya: Search Console › Indexación › **Eliminaciones** › "Nueva solicitud" › "Quitar solo esta URL" o "Quitar todas las URL con este prefijo". Es temporal (unos 6 meses); lo que la saca de forma permanente es el `noindex` (o un 404/410) visible para Google.
4. Verificar en Google con `site:app.eltemplo.org` (o el host que corresponda) a los pocos días. Si queda alguna URL, repetir el paso 3 con esa URL exacta.
5. Una URL de `eltemplo.org` que dejó de existir (por ejemplo una de la web vieja) ahora responde 404 real: Google la saca sola al rastrearla. Se puede acelerar con "Eliminaciones".
