# Fase 203 — Línea base (2026-10-28)

Medida sobre el `access.log` de nginx que YA existía (el plan 02 se canceló: HTTP/2 ya estaba activo y la API ya se logueaba en `access.log`, ver 203-01-SUMMARY). SSH de solo lectura con OK de Franco el 2026-10-28.

**Ventana:** tres días hábiles completos, 23-10 (viernes), 26-10 (lunes) y 27-10 (martes). App en prod: 1.8.6 / 1.9.0, **antes de "Tu plan"** (sin el `plan-status` de la pelotita).

**Limitaciones:**
- `access.log` no separa prod de staging (mismo nginx, formato `combined` sin `$host`). El tráfico de staging es chico y se toma como ruido.
- El formato no tiene tiempos de respuesta. Los tiempos del server ya están en el HALLAZGOS §1 (p50 11 ms, p90 30 ms): **el server no es el problema** y no se volvieron a medir.
- La plataforma sale del User-Agent: `Android` → android; `iPhone|iPad|CFNetwork|Darwin` → ios; el resto → web. En "web", los `/auth/me` son casi todos del **admin** (sus rutas `/api/admin/*` están excluidas, por eso tiene 0 pedidos después de abrir). **Aperturas de la app de socios = ios + android.**
- Afuera: el sondeo de la TV (`/api/admin/tv/control/screen`, ~350-370k/día) y todo `/api/admin/*`.

## Aperturas por día

| Día | iOS | Android | App socios | Web (≈ admin) |
|---|---|---|---|---|
| 23-10 | 436 | 829 | 1265 | 358 |
| 26-10 | 529 | 694 | 1223 | 285 |
| 27-10 | 502 | 740 | 1242 | 352 |

Apertura = `GET /api/auth/me` con 200.

## Pedidos por apertura

**Pedidos en los 30 s posteriores a cada `/auth/me`** (misma IP + UA, sin contar el `/auth/me`). Es la mejor aproximación a "arranque en frío"; incluye lo que el socio toque en esos 30 s.

| Día | iOS mediana / p90 | Android mediana / p90 |
|---|---|---|
| 23-10 | 18 / 30 | 17 / 30 |
| 26-10 | 18 / 28 | 19 / 36 |
| 27-10 | 22 / 29 | 19 / 34 |

Con el `/auth/me`, la mediana da **18-23 pedidos al abrir**, coherente con el inventario del HALLAZGOS (18).

**Método del HALLAZGOS** (pedidos a `/api/members|auth|progression|check-ins|communications/me|sessions` ÷ aperturas, día entero, incluye el admin en el divisor): 21.6 (23-10), 23.2 (26-10), 21.2 (27-10). El HALLAZGOS decía ~15 con el mismo método: el rediseño de Mi Templo (199) y lo que vino después sumaron pedidos.

**Línea base de arranque en frío con plan activo: 19 pedidos** (18 del HALLAZGOS + `plan-status` de MainLayout por la pelotita de "Tu plan", que salió a prod el 28-10 y no está en esta ventana). Las medianas medidas (19-23 con `/auth/me`) quedan por encima porque incluyen la navegación de los primeros 30 s.

**Meta de la fase (SC-4/D-15):** con plan activo, menos de 18 pedidos al abrir (esperado 17 tras los planes 04/11).

## Señales de duplicados (rutas por día, 27-10)

| Ruta | Pedidos | Por apertura de socio |
|---|---|---|
| `GET /api/members/scheduling/my-bookings` | 5495 | 4.4 |
| `GET /api/members/me/enrollments` | 2049 | 1.65 |
| `GET /api/members/me/current-program` | 2049 | 1.65 |
| `GET /api/members/programs/my-progress` | 1969 | 1.6 |
| `GET /api/sessions/weekly` | 1641 | 1.3 |
| `GET /api/members/scheduling/weekly` | 1529 | 1.2 |
| `GET /api/members/scheduling/bonus-usage` | 1523 | 1.2 |
| `GET /api/progression/stats` | 1309 | 1.05 |
| `GET /api/check-ins/today` | 1290 | 1.04 |

`enrollments` y `current-program` salen siempre juntos y por encima de 1 por apertura (el doble pedido al arranque, plan 04/11). `my-bookings` es ~4 por apertura (×2 al arranque, plan 05, más Reservas). Los otros dos días dan el mismo patrón.

Otros de la app con ~1 por apertura: `novedades`, `sponsors`, `especial-pass`, `subscription`, `communications/me/config|prompt|tarjetas`, `POST /auth/refresh` (~1277/día).

## Check-in POST 400

1 (23-10), 3 (26-10), 7 (27-10).

## Cómo repetir la medición

Después del deploy de la fase, con 2-3 días hábiles de uso, correr el mismo script (SSH de solo lectura, con OK de Franco):

```bash
ssh -i ~/.ssh/<KEY> ubuntu@<SERVER_HOST> 'bash -s' < baseline-203.sh
```

Cambiar la lista de archivos del `for` por los días a medir (`access.log.1` = ayer, `access.log.N.gz` = hace N días). El script:

```bash
set -u
AGG='
BEGIN { FS="\"" }
{
  split($1, a, " "); ip = a[1]; ts = a[4]
  split($2, r, " "); m = r[1]; p = r[2]; sub(/\?.*/, "", p)
  split($3, s, " "); st = s[1]; ua = $6
  if (p !~ /^\/api\//) next
  if (p ~ /\/tv\/control\/screen/) { tv++; next }
  if (p ~ /^\/api\/admin\//) { admin++; next }
  plat = (ua ~ /Android/) ? "android" : (ua ~ /iPhone|iPad|CFNetwork|Darwin/) ? "ios" : "web"
  n++; byplat[plat]++
  if (p ~ /^\/api\/(members|auth|progression|check-ins|communications\/me|sessions)\//) app++
  if (m == "POST" && p == "/api/members/attendance/check-in" && st == 400) ci400++
  split(ts, t, ":"); sec = t[2] * 3600 + t[3] * 60 + t[4]
  k = ip "|" ua
  if (m == "GET" && p == "/api/auth/me" && st == 200) {
    opens++; openplat[plat]++
    if (k in ws && !(k in done)) print "W " wp[k] " " wc[k] > "/dev/stderr"
    ws[k] = sec; wc[k] = 0; wp[k] = plat; delete done[k]
    paths["GET /api/auth/me"]++
    next
  }
  if ((k in ws) && sec - ws[k] <= 30 && sec >= ws[k]) wc[k]++
  else if (k in ws && !(k in done)) { print "W " wp[k] " " wc[k] > "/dev/stderr"; done[k] = 1 }
  paths[m " " p]++
}
END {
  for (k in ws) if (!(k in done)) print "W " wp[k] " " wc[k] > "/dev/stderr"
  printf "pedidos /api (sin TV ni admin): %d | TV control/screen: %d | admin: %d\n", n, tv, admin
  for (q in byplat) printf "  plataforma %s: %d pedidos, %d aperturas\n", q, byplat[q], openplat[q]
  printf "aperturas (GET /api/auth/me 200): %d\n", opens
  if (opens) printf "pedidos de app por apertura (método HALLAZGOS): %.1f (%d / %d)\n", app / opens, app, opens
  printf "check-in POST 400: %d\n", ci400
  print "top 20 rutas:"
  for (q in paths) printf "%8d %s\n", paths[q], q | "sort -rn | head -20"
}'
for f in /var/log/nginx/access.log.1 /var/log/nginx/access.log.2.gz /var/log/nginx/access.log.5.gz; do
  echo "=================== $f ($(sudo zcat -f "$f" | head -1 | awk '{print substr($4,2,11)}'))"
  sudo zcat -f "$f" | awk "$AGG" 2> /tmp/w203.txt
  echo "pedidos en los 30 s después de cada /auth/me (sin contar el /auth/me):"
  for q in ios android web; do
    awk -v q=$q '$2==q {print $3}' /tmp/w203.txt | sort -n | awk -v q=$q '{v[NR]=$1} END { if (NR) { i = int(NR*0.9); if (i < 1) i = 1; printf "  %s: n=%d mediana=%d p90=%d\n", q, NR, v[int((NR+1)/2)], v[i] } }'
  done
  rm -f /tmp/w203.txt
done
```

La comparación que importa: **mediana de pedidos en los 30 s después de abrir** por plataforma, y `enrollments`/`current-program`/`my-bookings` por apertura de socio.
