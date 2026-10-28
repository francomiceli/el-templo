#!/bin/bash
# Verifica que la API responda igual por HTTP/2 y por HTTP/1.1 (fase 203, D-11/D-19).
#
# Uso:
#   deploy/verify-api-http.sh --public-only https://api-staging.eltemplo.org
#   VERIFY_API_EMAIL=... VERIFY_API_PASSWORD=... deploy/verify-api-http.sh https://api-staging.eltemplo.org
#
# --public-only: solo ALPN + /health por h2 y por h1.1 (sin credenciales).
# Sin el flag: además hace login con un socio de prueba y compara status + claves
# de los endpoints que pide la app al arrancar, por h2 y por h1.1.
# Credenciales SOLO por env (si falta la password, se pide sin eco). Nunca en el repo.
# Requiere: openssl, curl con HTTP/2, jq, date de GNU.

set -euo pipefail

usage() {
    echo "Uso: $0 [--public-only] <base-url>   (ej: $0 https://api-staging.eltemplo.org)" >&2
    exit 64
}

PUBLIC_ONLY=0
if [ "${1:-}" = "--public-only" ]; then
    PUBLIC_ONLY=1
    shift
fi
[ -n "${1:-}" ] || usage
BASE="${1%/}"
HOST="${BASE#https://}"
HOST="${HOST%%/*}"

fail=0
ok() { echo "OK   $*"; }
ko() { echo "FAIL $*"; fail=1; }

# --- Chequeos públicos ---
alpn=$(openssl s_client -connect "$HOST:443" -servername "$HOST" -alpn h2,http/1.1 </dev/null 2>/dev/null |
    awk -F': ' '/ALPN protocol/ {print $2}' || true)
[ "$alpn" = "h2" ] && ok "ALPN h2 ($HOST)" || ko "ALPN=${alpn:-ninguno} ($HOST)"

r=$(curl -s --http2 -o /dev/null -w '%{http_version} %{http_code}' "$BASE/health" || true)
[ "$r" = "2 200" ] && ok "h2 /health" || ko "h2 /health [$r]"

r=$(curl -s --http1.1 -o /dev/null -w '%{http_version} %{http_code}' "$BASE/health" || true)
[ "$r" = "1.1 200" ] && ok "h1.1 /health" || ko "h1.1 /health [$r]"

if [ "$PUBLIC_ONLY" = "1" ]; then
    exit $fail
fi

# --- Chequeos con socio de prueba ---
VERIFY_API_EMAIL="${VERIFY_API_EMAIL:?VERIFY_API_EMAIL is required}"
if [ -z "${VERIFY_API_PASSWORD:-}" ]; then
    read -rsp "Password del socio de prueba: " VERIFY_API_PASSWORD
    echo
fi
MASKED_EMAIL="${VERIFY_API_EMAIL:0:2}***"

LOGIN=$(curl -s --http1.1 -H 'Content-Type: application/json' \
    -d "$(jq -n --arg e "$VERIFY_API_EMAIL" --arg p "$VERIFY_API_PASSWORD" '{email: $e, password: $p}')" \
    "$BASE/api/auth/login" || true)
TOKEN=$(jq -r '.accessToken // empty' <<<"$LOGIN" 2>/dev/null || true)
REFRESH=$(jq -r '.refreshToken // empty' <<<"$LOGIN" 2>/dev/null || true)
unset LOGIN VERIFY_API_PASSWORD
if [ -z "$TOKEN" ]; then
    ko "login ($MASKED_EMAIL)"
    exit 1
fi
ok "login ($MASKED_EMAIL)"

# Revocar el refresh token de este login pase lo que pase.
logout() {
    if [ -n "${REFRESH:-}" ]; then
        curl -s --http1.1 -o /dev/null -H 'Content-Type: application/json' \
            -d "$(jq -n --arg r "$REFRESH" '{refreshToken: $r}')" "$BASE/api/auth/logout" || true
    fi
}
trap logout EXIT

# Lunes de la semana actual (tz de la máquina; si cae en otra semana igual responde 200).
WEEK=$(date -d "$(($(date +%u) - 1)) days ago" +%F)

# $1 = --http2 | --http1.1, $2 = path → "status claves-ordenadas"
probe() {
    local out code keys
    out=$(curl -s "$1" -H "Authorization: Bearer $TOKEN" -w '\n%{http_code}' "$BASE$2" || true)
    code=$(tail -n1 <<<"$out")
    keys=$(sed '$d' <<<"$out" | jq -cS 'if type=="object" then keys else type end' 2>/dev/null || echo nojson)
    echo "$code ${keys:-vacio}"
}

# Solo GETs de lectura. Nunca el POST .../plan-summary/seen (apagaría la pelotita del socio).
PATHS=(
    /api/auth/me
    /api/members/subscription/me/subscription
    /api/members/subscription/me/plan-status
    /api/members/subscription/me/plan-summary
    /api/members/programs/my-progress
    /api/members/me/current-program
    /api/members/me/enrollments
    /api/progression/stats
    /api/check-ins/today
    /api/communications/me/novedades
    /api/members/sponsors
    /api/communications/me/tarjetas
    "/api/sessions/weekly?weekStart=$WEEK"
    "/api/members/scheduling/my-bookings?weekStart=$WEEK"
)

for path in "${PATHS[@]}"; do
    r2=$(probe --http2 "$path")
    r1=$(probe --http1.1 "$path")
    if [ "$r2" = "$r1" ] && [[ "$r2" =~ ^(200|204)\  ]]; then
        ok "$path ($r2)"
    elif [[ "$path" == /api/sessions/weekly* ]] && [[ "$r2" =~ ^404\  ]]; then
        ko "$path h2=[$r2] h1=[$r1] (404: el socio no tiene plan ni inscripción, usar un socio con plan)"
    else
        ko "$path h2=[$r2] h1=[$r1]"
    fi
done

exit $fail
