---
phase: 203-carga-sin-parpadeos
plan: 01
status: complete
completed: 2026-10-28
commits: [ff96429e1, 5b01a68ae, 1b904d7ab]
---

# 203-01 — Preparar la medición (SUMMARY)

## Qué quedó

- `deploy/verify-api-http.sh` (`ff96429e1`): ALPN + `/health` por h2 y h1.1; con `VERIFY_API_EMAIL`/`VERIFY_API_PASSWORD` (o `read -rsp`) compara status + claves de 14 endpoints de arranque por los dos protocolos, logout en `trap EXIT`, email enmascarado. Nunca llama al `POST .../plan-summary/seen`.
- `deploy/nginx/api.eltemplo.org` y `api-staging.eltemplo.org` = config viva tal cual (`5b01a68ae`), después el diff (`1b904d7ab`).
- `deploy/nginx/conf.d/eltemplo-api-log.conf`: `log_format api_timed` (prefijo combined + `proto= rt= urt= uct= host=`) y `map $request_uri $api_loggable` (excluye `/api/admin/tv/control/screen`).

## Línea base pública (antes de tocar nada)

`--public-only` contra `https://api-staging.eltemplo.org` y `https://api.eltemplo.org`: 3/3 OK en los dos (ALPN h2, `2 200`, `1.1 200`). **El 443 ya negocia h2 antes de tocar nada** (Pitfall 1 confirmado).

## Lectura del server (SSH solo lectura con OK de Franco, 2026-10-28)

- nginx 1.18.0, Ubuntu 22.04.5.
- Ruta real de los vhosts: `sites-enabled/api.eltemplo.org` → symlink a `/etc/nginx/sites-available/api.eltemplo.org`; `sites-enabled/api-staging.eltemplo.org` → symlink a `/etc/nginx/sites-available/api-staging.eltemplo.org`. El plan 02 instala en `sites-available/`.
- `nginx.conf`: `access_log /var/log/nginx/access.log;` a nivel http (línea 40), `include /etc/nginx/conf.d/*.conf;` (línea 60) antes de `sites-enabled/*` (61) → el `log_format` de conf.d está disponible para los vhosts.
- **Open Question 5 resuelta: los vhosts de la API NO tienen `access_log off`.** El HALLAZGOS estaba equivocado: la API (incluida la TV) escribe en `access.log` heredado del bloque http. Los únicos `access_log off` son de `auraclub.net` (aura-web).
- Disco: `/` 20G, 7.5G libres (62 %). `access.log` ~75-130 MB/día sin comprimir, ~2.8 MB gz.
- logrotate `/var/log/nginx/*.log`: daily, rotate 14, compress, delaycompress, sync a S3 de los `.gz` → cubre `api.access.log` y `api-staging.access.log` sin cambios.
- El vhost de prod usa el certificado `live/app.eltemplo.org/` (SAN compartido); no es secreto, se conserva.
- Secretos en la config: ninguno (solo rutas de certificados).

## Desviaciones

1. **Log aditivo, no reemplazo.** Como no había `access_log off` que reemplazar, un `access_log` nuevo en el `server` habría cortado el `access.log` heredado para la API (la TV y la API dejarían de verse ahí). Se redeclara `access_log /var/log/nginx/access.log;` junto al nuevo: `access.log` queda exactamente como hoy y se suma el log con tiempos. Si más adelante se quiere sacar la API/TV de `access.log`, es borrar esa línea.
2. **Verify del plan con `grep` sin `-F`.** Los patrones con `$api_loggable` / `$request_time` fallan con grep BRE (el `$` ancla). Con `grep -F` los cinco chequeos pasan; el contador awk de `access_log off` da 0 en los dos vhosts.
3. `grep -nE '(PASSWORD|EMAIL)='` también devuelve las líneas 51 y 56 del script (`VERIFY_API_EMAIL="${VERIFY_API_EMAIL:?...}"` y `MASKED_EMAIL=`): leen del env, no hay credenciales literales.

## Para el plan 02

- Copiar `deploy/nginx/conf.d/eltemplo-api-log.conf` → `/etc/nginx/conf.d/` y los vhosts → `/etc/nginx/sites-available/` (backup antes), `nginx -t` y `reload` con OK por paso, staging primero.
- Señal de aplicado: `api-staging.access.log` con líneas `proto=`.
