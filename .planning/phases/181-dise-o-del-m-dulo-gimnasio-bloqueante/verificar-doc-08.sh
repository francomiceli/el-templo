#!/usr/bin/env bash
# Verificador estructural determinista del doc 08 (fase 181).
#
# Se corre desde la raíz del repo:
#   bash .planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/verificar-doc-08.sh [--final]
#
# NO usa `set -e`: acumula fallas y las reporta todas al final, en vez de
# abortar en la primera. Este script solo LEE el doc — nunca lo modifica.
set -uo pipefail

DOC="${DOC:-.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md}"

FINAL=false
for arg in "$@"; do
  if [ "$arg" = "--final" ]; then
    FINAL=true
  fi
done

FALLAS=0

ok() {
  echo "OK: $1"
}

falla() {
  echo "FALLA: $1"
  FALLAS=$((FALLAS + 1))
}

# C1: el archivo existe (si no, salir 1 de inmediato — no tiene sentido
# correr el resto de los checks contra un archivo inexistente).
if [ ! -f "$DOC" ]; then
  echo "FALLA: C1 - el archivo $DOC no existe"
  exit 1
fi
ok "C1 - el archivo $DOC existe"

# C2: exactamente 7 secciones "## Definición N —"
C2_COUNT=$(grep -cE '^## Definición [1-7] —' "$DOC")
if [ "$C2_COUNT" -eq 7 ]; then
  ok "C2 - hay 7 secciones '## Definición N —' ($C2_COUNT)"
else
  falla "C2 - se esperaban 7 secciones '## Definición N —', se encontraron $C2_COUNT"
fi

# C3: exactamente 4 subsecciones "### H-N "
C3_COUNT=$(grep -cE '^### H-[1-4] ' "$DOC")
if [ "$C3_COUNT" -eq 4 ]; then
  ok "C3 - hay 4 subsecciones '### H-N' ($C3_COUNT)"
else
  falla "C3 - se esperaban 4 subsecciones '### H-N', se encontraron $C3_COUNT"
fi

# C4: trazabilidad por definición — cada sección "## Definición ..." tiene
# que contener al menos una referencia a un REQ ID conocido en su cuerpo.
C4_MISSING=$(awk '
  function check(n, b) {
    if (n !~ /^Definición/) return;
    if (b ~ /(CAT|RUT|REG|VAL|EVO|PROF|PLAT|ONB|DIS)-[0-9][0-9]/) return;
    print n;
  }
  BEGIN { name = ""; body = ""; }
  /^## / {
    check(name, body);
    name = $0;
    sub(/^## /, "", name);
    body = "";
    next;
  }
  { body = body "\n" $0; }
  END { check(name, body); }
' "$DOC")

if [ -z "$C4_MISSING" ]; then
  ok "C4 - todas las secciones de Definición trazan a al menos un REQ ID"
else
  while IFS= read -r nombre; do
    falla "C4 - la sección '$nombre' no traza a ningún REQ ID"
  done <<<"$C4_MISSING"
fi

# C5: constancia literal de que el-templo-app no se transforma (D-04)
if grep -q 'el-templo-app' "$DOC" && grep -qi 'no se transforma' "$DOC"; then
  ok "C5 - constancia de que el-templo-app no se transforma"
else
  falla "C5 - falta la constancia literal de que el-templo-app no se transforma"
fi

# C6: constancia explícita del trigger de split de repos (H-4)
if grep -qi 'split de repos' "$DOC"; then
  ok "C6 - constancia del trigger de split de repos"
else
  falla "C6 - falta la constancia del trigger de split de repos"
fi

# C7: solo con --final — no deben quedar marcadores PENDIENTE
if [ "$FINAL" = true ]; then
  C7_COUNT=$(grep -c 'PENDIENTE' "$DOC" || true)
  if [ "$C7_COUNT" -eq 0 ]; then
    ok "C7 - no quedan marcadores PENDIENTE ($C7_COUNT)"
  else
    falla "C7 - quedan $C7_COUNT marcador(es) PENDIENTE"
  fi
fi

# C8: formato — prettier --check. Si el binario no está disponible, WARN
# (no cuenta como falla); si corre y el doc no está formateado, sí es falla.
if command -v pnpm >/dev/null 2>&1; then
  PRETTIER_OUT=$(pnpm exec prettier --check "$DOC" 2>&1)
  PRETTIER_EXIT=$?
  if [ "$PRETTIER_EXIT" -eq 0 ]; then
    ok "C8 - prettier --check pasa"
  elif echo "$PRETTIER_OUT" | grep -qiE 'command not found|ERR_PNPM_NO_(BIN|SCRIPT)|ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL|no se pudo encontrar el binario|not found: prettier|"prettier" not found'; then
    echo "WARN: prettier no disponible"
  else
    falla "C8 - prettier --check falla (el doc no está formateado)"
  fi
else
  echo "WARN: prettier no disponible"
fi

echo ""
echo "Resumen: $FALLAS falla(s)."
if [ "$FALLAS" -eq 0 ]; then
  exit 0
else
  exit 1
fi
