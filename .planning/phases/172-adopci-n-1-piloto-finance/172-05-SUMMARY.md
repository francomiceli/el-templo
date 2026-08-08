---
phase: 172-adopci-n-1-piloto-finance
plan: 05
subsystem: tooling
tags: [d-12, snapshot, finance, baseline, staging, diff, determinismo]

# Dependency graph
requires:
  - phase: 172-01
    provides: "worktree et-172 verde sobre a6272df0 y gate D-13 cerrado (CR-CAJA en master Y en staging)"
provides:
  - "el-templo-api/src/scripts/snapshot-finance-endpoints.ts — captura + diff determinístico de los agregadores de finance"
  - "$HOME/.el-templo-snapshots/172/antes.json — línea de base de los números del staff ANTES del código de la fase (7 endpoints, 200, 99.483 bytes)"
  - "Herramienta reusable por las fases 173-175 cambiando SOLO la constante ENDPOINTS"
affects: [172-22, 172-23, 173, 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Script a demanda con docblock de usage local y de servidor, sin cablear a ningún pipeline (precedente dry-run-reassign-multibranch.ts)"
    - "Códigos de salida 0 OK / 1 corrió y falló / 2 error de USO (precedente verify-tenant-uniques.ts + failTenantArg)"
    - "Baseline de comparación tomada con rango de fechas FIJO y cerrado, nunca relativo"

key-files:
  created:
    - el-templo-api/src/scripts/snapshot-finance-endpoints.ts
  modified: []

key-decisions:
  - "El rango fijo se mapea al nombre de parámetro REAL de cada schema (accruedFrom/accruedTo en outstanding-balances, ninguno en cost-centers/all): mandar dateFrom a un schema que no lo declara no da 400, ajv lo strippea en silencio y el snapshot mentiría sobre su propio alcance"
  - "El script pagina hasta agotar `total` en vez de guardar la primera página: la fase cambia índices y con un tope de 200 filas el diff compararía CONJUNTOS DISTINTOS de filas"
  - "Una captura con algún endpoint fuera de 200 se guarda en `<ruta>.parcial`, nunca en la ruta pedida — un archivo llamado antes.json se usa como línea de base tres semanas después sin releer la salida de la corrida"
  - "El modo --diff no exige env: es comparación de archivos y no toca la red (el paso 3 del propio checkpoint lo corre sin credenciales)"
  - "El script NO detecta cambios de orden de las listas, a propósito: la fase toca índices y MySQL puede devolver los empates al revés sin que ningún número cambie"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-07-30
---

# Phase 172 Plan 05: Herramienta y línea de base de D-12 Summary

**La foto de los números del staff quedó tomada sobre el staging que ya tiene CR-CAJA y todavía no tiene la fase 172 — 7 endpoints en 200, 99.483 bytes en `$HOME/.el-templo-snapshots/172/antes.json` con permisos 0600 — con una herramienta cuyo determinismo se probó dos veces: contra un servidor falso que devuelve las filas mezcladas y contra el propio staging.**

## Performance

- **Duration:** ~15 min de ejecución efectiva (Task 1 ~13 min, Task 2 ~2 min), más ~70 min de espera en el checkpoint humano
- **Started:** 2026-07-30T21:27:00Z
- **Task 1 commiteado:** 2026-07-30T21:40:00Z
- **Baseline capturada:** 2026-07-30T22:51:17Z
- **Tasks:** 2/2 (1 auto + 1 checkpoint)
- **Files modified:** 1 versionado (nuevo)

## Accomplishments

- **`src/scripts/snapshot-finance-endpoints.ts`** (735 líneas): captura los 7 agregadores con GET, normaliza y guarda; modo `--diff` que compara y sale 1 si difieren. Cero dependencias nuevas (`fetch` nativo de Node 22, T-172-SC).
- **`antes.json` capturado** sobre `https://api-staging.eltemplo.org`, los 7 endpoints en **200**, cuerpos con datos de verdad (13 cajas con saldo, 62 movimientos, 42 transacciones, 7 deudas, summary con los 4 agregados).
- **Diff de control vacío** entre dos capturas seguidas contra el mismo staging: `SIN DIFERENCIAS en 7 endpoints`, exit 0.
- **La herramienta es reusable tal cual por las fases 173-175**: lo único específico de finance es la constante `ENDPOINTS`.

## Evidencia del checkpoint (Task 2)

**Captura de la línea de base** — `2026-07-30T22:51:17.769Z`, rango `2026-01-01 .. 2026-06-30`:

| Endpoint                                         | Status | Forma del cuerpo                                                    | Bytes  |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------- | ------ |
| `GET /api/admin/finance/transactions/summary`    | 200    | `{monthlyRevenue, revenueByBranch, revenueByKind, revenueByMethod}` | 683    |
| `GET /api/admin/finance/cash-registers/balances` | 200    | `array(13)`                                                         | 3.078  |
| `GET /api/admin/finance/pending-tray`            | 200    | `{limit, page, rows(3), thresholdDays, total}`                      | 1.216  |
| `GET /api/admin/finance/movements-history`       | 200    | `{limit, page, rows(62), total}`                                    | 25.847 |
| `GET /api/admin/finance/transactions`            | 200    | `{limit, page, rows(42), total}`                                    | 23.086 |
| `GET /api/admin/finance/cost-centers/all`        | 200    | `{centers}`                                                         | 421    |
| `GET /api/admin/reports/outstanding-balances`    | 200    | `{bucketTotals, limit, page, rows(7), statusTotals, total}`         | 3.881  |

Ninguno truncado (`truncado: false` en los 7). Archivo total: **99.483 bytes, permisos `600`**, en `$HOME/.el-templo-snapshots/172/antes.json` — fuera del repo y fuera de `.planning/` (T-172-05-01). `git status --porcelain` en `et-172` quedó **vacío**.

**Diff de control** (segunda captura seguida a `/tmp/control.json`, 8 segundos después, y comparación):

```
  igual   GET /api/admin/finance/cash-registers/balances
  igual   GET /api/admin/finance/cost-centers/all
  igual   GET /api/admin/finance/movements-history
  igual   GET /api/admin/finance/pending-tray
  igual   GET /api/admin/finance/transactions
  igual   GET /api/admin/finance/transactions/summary
  igual   GET /api/admin/reports/outstanding-balances

SIN DIFERENCIAS en 7 endpoints.
```

exit 0. `/tmp/control.json` se **borró** después de la verificación: tenía plata real y nombres de socios y no tenía por qué quedar en `/tmp`.

**El token (T-172-05-02).** Entró por env desde un archivo del scratchpad de la sesión, nunca por un archivo del repo. Verificado por `grep -F` sobre el snapshot: el token **no aparece**, y tampoco aparece ningún `authorization` / `bearer` / `eyJhbGciOi` (0 coincidencias). El modo `--diff` corrió **sin env**, que es lo que prueba que la comparación no necesita credenciales.

**Estado del staging en el momento de la captura (lo que hace válida la baseline para D-12).** La foto se tomó sobre staging **con CR-CAJA desplegado** (`a6272df0`, deploy verde confirmado hoy — gate D-13 del plan 172-01) y **sin una sola línea de la fase 172**: el único commit de la rama en ese momento era `173e2127`, que agrega un script a demanda **no cableado a ningún pipeline** y que no se deployó a ningún lado. Confirmación adicional aportada por el coordinador: `GET /api/admin/finance/coach-load/caja-efectivo?currency=ARS&branchId=1` respondió **200** con ese token — el contrato viejo, previo a CR-CAJA, habría dado 400 por `branchId` desconocido. O sea que la baseline **ya incluye** el cambio de caja, y el diff del plan 172-22 va a medir solo la migración de tenancy, que era exactamente el punto del gate.

**Respuesta al resume-signal:** "baseline capturada".

## Verificación (todos los criterios de aceptación de Task 1)

| Criterio                                                              | Resultado                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sin env / sin args → exit 2 con usage                                 | ✅ `VERIFY_DEL_PLAN_EXIT=2` (comando literal del `<verify>` del plan)                                               |
| Con `--out` y sin `SNAPSHOT_TOKEN` → exit 2                           | ✅                                                                                                                  |
| `grep -c "/api/admin/finance/"` ≥ 6                                   | ✅ **6**                                                                                                            |
| `grep -c "2026-01-01"` ≥ 1                                            | ✅ **2**                                                                                                            |
| No referenciado desde `*.json` / `*.yml` (ni package.json, ni deploy) | ✅ búsqueda vacía en todo el worktree                                                                               |
| `pnpm exec tsc --noEmit`                                              | ✅ exit 0                                                                                                           |
| `prettier --check`                                                    | ✅ limpio                                                                                                           |
| `pnpm lint:tenant`                                                    | ✅ `DISCREPANCIAS: 21` — **la deuda preexistente exacta** (9+4+6+2 de los planes 02/03/04/06), ni una entrada nueva |

**Dos corridas seguidas dan diff vacío (must-have #3): probado DOS veces, y la primera es la que vale.**

Contra el staging real, dos capturas separadas por 8 segundos dan diff vacío — pero eso solo prueba que en 8 segundos nadie cobró nada. La prueba de que el script **neutraliza el ruido** se hizo contra un servidor falso descartable (en el scratchpad, fuera del repo, no commiteado) que en cada request devuelve:

- las filas **en orden distinto** (mezcladas),
- `generatedAt`, `requestId` y `timestamp` de raíz **nuevos**,
- 450 filas que obligan a **recorrer 3 páginas**.

Resultado: dos capturas seguidas, **diff vacío, exit 0**. Y el fail-closed en el mismo banco de pruebas: cambiando **un solo monto** a mano, el diff sale **exit 1** e imprime `primer path divergente: .body.rows[7].amount` con los dos valores. También se verificó que un `timestamp` **dentro de una fila** sobrevive a la normalización (solo se borra el de la raíz) — borrar de más deja el diff ciego, que es peor que ruidoso.

Tercera verificación del mismo banco: con un token inválido, los 7 endpoints dan 401, el archivo se escribe en `malo.json.parcial`, `malo.json` **no se crea** y el proceso sale **1**.

## Decisions Made

- **El rango es el mismo, los nombres de parámetro no.** El plan pedía golpear los 7 endpoints con `dateFrom=2026-01-01&dateTo=2026-06-30`. Dos no aceptan esos nombres: `/api/admin/reports/outstanding-balances` usa `accruedFrom`/`accruedTo` y `/cost-centers/all` no filtra por fecha. Lo importante es **por qué eso no se detectaba solo**: Fastify compila ajv con `removeAdditional: true`, así que la propiedad desconocida **se strippea en silencio** y el endpoint responde 200 — el snapshot habría dicho "rango 2026-H1" sobre una respuesta con el histórico completo de deudas. Se mapeó el rango al nombre real de cada schema y quedó escrito en el docblock.
- **Paginar hasta agotar `total`.** Con la primera página de 200 filas alcanzaba para "capturar algo", pero esta fase **cambia índices**, y un cambio de índice puede cambiar qué filas caen en la página 1 sin que ningún número se haya movido: el diff compararía dos conjuntos distintos de filas y explotaría en falsos positivos. Hoy staging tiene 42 y 62 filas (una sola página), así que el loop no se ejercitó contra staging — sí contra el servidor falso, con 450 filas en 3 páginas. **Contra producción sí va a hacer falta.**
- **El orden de las listas NO es señal, a propósito.** Se ordena todo por clave estable (`id` y compañía) con desempate por la serialización completa. La contracara honesta: si la fase cambiara el `ORDER BY` visible del staff, este script **no lo va a decir**. Se eligió así porque MySQL puede devolver los empates al revés al cambiar de índice sin que un solo número cambie, y D-12 promete "los mismos números", que son los valores. Un cambio de orden visible lo tiene que cazar el UAT.
- **Una captura rota no se guarda con el nombre bueno.** Si algún endpoint no da 200, el archivo va a `<ruta>.parcial` y el proceso sale 1. El motivo es de archivo, no de código: un archivo llamado `antes.json` se va a usar como línea de base semanas después, sin que nadie relea la salida de la corrida que lo creó.
- **`--diff` no pide credenciales.** El paso 3 del propio checkpoint corre el diff sin env, y además es correcto: comparar dos archivos no toca la red. Exigir el token ahí habría sido pedir un secreto para no usarlo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El rango fijo mandado con nombres que dos schemas no declaran**

- **Found during:** Task 1
- **Issue:** El plan pedía los 7 endpoints con `dateFrom`/`dateTo`. `outstanding-balances` declara `accruedFrom`/`accruedTo` y `additionalProperties: false`; `cost-centers/all` no acepta rango. Con `removeAdditional: true` (default de Fastify) eso **no falla**: responde 200 sobre un universo de datos distinto al que el snapshot dice cubrir.
- **Fix:** cada endpoint recibe el mismo rango con el nombre que su schema declara; `cost-centers/all` va sin rango. Documentado en el docblock con el motivo.
- **Files modified:** `src/scripts/snapshot-finance-endpoints.ts`
- **Verification:** los 7 dieron 200 contra staging, y `outstanding-balances` devolvió 7 filas (no el histórico entero).
- **Committed in:** `173e2127`

**2. [Rule 2 - Correctitud del diff] Paginación completa**

- **Found during:** Task 1
- **Issue:** guardar solo la página 1 hace que el diff dependa del orden del servidor, que es justo lo que la fase modifica.
- **Fix:** loop hasta cubrir `total`, tope de 50 páginas (10.000 filas) con `truncado: true` y advertencia explícita si se alcanza.
- **Verification:** 450 filas en 3 páginas contra el servidor falso, diff vacío entre corridas.
- **Committed in:** `173e2127`

**3. [Rule 2 - Fail-closed] Captura incompleta a `.parcial` + exit 1, y rangos distintos = error de uso**

- **Found during:** Task 1
- **Issue:** el plan no decía qué hacer con un endpoint caído ni con dos snapshots incomparables. Sin regla, un `antes.json` con un 401 adentro se usa como baseline; y `--diff` entre capturas de rangos distintos imprimiría cientos de diferencias sin sentido.
- **Fix:** captura con fallas → `<ruta>.parcial` + exit 1; `rango` distinto entre snapshots → exit **2** (uso); `baseUrl` distinta → advertencia por stderr.
- **Verification:** probado en vivo con token inválido (`malo.json` no se creó).
- **Committed in:** `173e2127`

**4. [Rule 2 - Manejo del secreto y del dato] 0600, y `--diff` sin env**

- **Found during:** Task 1
- **Issue:** el archivo de salida tiene plata real y nombres de socios (T-172-05-01) y se creaba con el umask por defecto.
- **Fix:** `writeFile` con `mode: 0o600` más `chmod` explícito, línea recordando que no se commitea, y `--diff` liberado de exigir env.
- **Verification:** `stat` → `600`; el diff corrió sin `SNAPSHOT_TOKEN` en el entorno.
- **Committed in:** `173e2127`

**5. [Rule 2 - Determinismo] `status=todos` y `page`/`limit` explícitos**

- **Found during:** Task 1
- **Issue:** `pending-tray` resuelve `status` con un default que vive en el service. Un snapshot cuyo alcance depende de un default cambia de significado si alguien cambia el default.
- **Fix:** los parámetros que definen el universo van explícitos en la URL.
- **Committed in:** `173e2127`

**6. [Rule 2 - Trampa conocida del repo] Respuesta que no es JSON**

- **Found during:** Task 1
- **Issue:** si alguien apunta `SNAPSHOT_BASE_URL` al vhost del **front** de staging en vez de al de la API, nginx devuelve HTML (405) y `res.json()` habría tirado una excepción críptica a mitad de captura.
- **Fix:** se lee como texto y, si no parsea, se guarda `{ noEsJson: <primeros 500 chars> }` con el status real. El error queda legible en el archivo.
- **Committed in:** `173e2127`

---

**Total deviations:** 6 auto-fixed (1 × Rule 1, 5 × Rule 2)
**Impact on plan:** cero scope creep — las 6 son sobre el mismo archivo que el plan pedía y refuerzan lo que el propio plan quería (que el diff sea señal y no ruido, y que el snapshot no filtre nada).

## Issues Encountered

**Limitación declarada, no un problema encontrado:** `outstanding-balances` filtra por `status` con default `activa`. Si entre la captura de antes y la de después el staff gestiona una deuda en staging (la marca cobrada o incobrable), ese endpoint va a diferir **sin que la fase tenga la culpa**. Es ruido inherente a comparar datos vivos y no se puede eliminar desde el script; la salida es leer el primer path divergente, que dice exactamente qué fila y qué campo se movió.

**El loop de paginación no se ejercitó contra staging**: los endpoints paginados trajeron 3, 62, 42 y 7 filas, todas en una página. Contra producción (o contra un staging con más historia) sí va a paginar, y ahí es donde importa. La cobertura de ese camino la dio el servidor falso, con 450 filas en 3 páginas.

**El `.env` del worktree no jugó ningún papel**: este script no abre conexión a MySQL, solo hace GETs HTTP. Tampoco necesitó `argon2` ni ningún build script sin aprobar (la bandera que dejó el plan 172-01).

## User Setup Required

Ninguno nuevo. Para el plan **172-22** (la captura de "después") hace falta lo mismo que hoy: un JWT de admin/owner de staging vigente (el access token dura **30 minutos**) y la URL `https://api-staging.eltemplo.org`. El comando es idéntico cambiando `antes.json` por `despues.json`.

## Next Phase Readiness

**Listo.** El plan 172-22 tiene todo lo que necesita:

1. **`$HOME/.el-templo-snapshots/172/antes.json`** existe, con los 7 endpoints en 200 y con CR-CAJA adentro.
2. **El comando de comparación ya está escrito** y probado: `--diff=$HOME/.el-templo-snapshots/172/antes.json <despues.json>`, exit 0 = D-12 cumplido, exit 1 = hay un número que se movió y el script dice cuál.
3. **Tres cosas que el 172-22 no debe hacer:** no cambiar el rango (los snapshots dejarían de ser comparables y el script corta con exit 2), no capturar contra otra baseUrl, y no commitear ninguno de los dos archivos.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `/home/franco/projects/et-172/el-templo-api/src/scripts/snapshot-finance-endpoints.ts`
- `FOUND` `$HOME/.el-templo-snapshots/172/antes.json` (99.483 bytes, permisos 600, 7 endpoints en 200)
- `FOUND` commit `173e2127` en `feat/172-adopcion-finance`
- `AUSENTE (correcto)` cualquier snapshot bajo `.planning/` o dentro del repo — `git status --porcelain` en `et-172` vacío

**ADO-01 NO se marcó completo.** Este plan no migra una sola línea de `finance`: construye el instrumento con el que se va a medir si la migración salió bien. Igual que en 172-01, el requisito lo cierra el gate consolidado del final de la fase.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
