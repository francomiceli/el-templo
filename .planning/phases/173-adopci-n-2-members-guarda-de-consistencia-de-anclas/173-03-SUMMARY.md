---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 03
subsystem: tooling
tags: [snapshot, tenancy, members, xlsx, pii, fail-closed, d-10, in-02]

# Dependency graph
requires:
  - phase: 172-adopci-n-1-piloto-finance
    provides: "snapshot-finance-endpoints.ts como plantilla (D-12) y el hallazgo IN-02 del review"
  - plan: 173-01
    provides: "worktree et-173 sobre el backmerge 395243a4, y los gates pnpm typecheck:tests / pnpm lint:tenant"
provides:
  - "$HOME/.el-templo-snapshots/173/antes.json: la linea de base del criterio 4 de la fase, 11 endpoints en 200, truncado=false en todos, 0600, fuera de todo checkout"
  - "huella de parametros 57bdcd98a4a3eae4: el valor que la foto de DESPUES tiene que reproducir o el --diff aborta"
  - "el-templo-api/src/scripts/snapshot-members-endpoints.ts: captura y diff del modulo de socios"
  - "fix IN-02: un snapshot cortado antes de agotar total deja de declararse completo, en los DOS scripts"
affects:
  [
    "173-31 (el diff de cierre)",
    "todos los planes de migracion de src/ de la 173",
    174,
    175,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parametros PII por env + huella sha256 en el archivo: el diff puede exigir entradas iguales sin escribir el dato"
    - "normalizacion de xlsx por indice fijo de columna (c000..): filas como objeto para que el ordenamiento generico no pueda reordenar columnas"

key-files:
  created:
    - el-templo-api/src/scripts/snapshot-members-endpoints.ts
  modified:
    - el-templo-api/src/scripts/snapshot-finance-endpoints.ts

key-decisions:
  - "GET /api/admin/leads NO EXISTE (el unico endpoint del prefijo es PATCH /:userId): se sustituyo por GET /api/admin/members?status=prueba, que es la lectura equivalente"
  - "Ningun endpoint de socios acepta rango de fechas: el RANGO literal se conserva declarado y deliberadamente NO enviado"
  - "DESVIACION Rule 1: un endpoint truncado ahora invalida la captura entera (exit 1 + archivo .parcial); antes el script decia 'captura completa' y salia 0 con 4 endpoints truncados"
  - "DESVIACION Rule 2: DNI y telefono entran por env y solo su huella sha256 va al archivo — cablearlos seria una fuga de PII permanente en el historial de git"
  - "MAX_PAGINAS subido de 50 a 200: con 5720 socios a 100 por pagina la captura necesita 58 paginas y el valor de finance la habria truncado"
  - "--help sale con 0 y no con el 2 de error de uso: la verificacion del plan lo encadena con &&"

patterns-established:
  - "El flag que delata una captura incompleta tiene que gobernar tambien el exit code y el nombre del archivo, o el resumen tapa lo que el flag denuncia"
  - "Antes de copiar un script de snapshot a otro modulo: verificar la clave del array del sobre (finance rows, members members) y el limit maximo del schema"

requirements-completed: [ADO-02]

# Metrics
duration: ~95min
completed: 2026-08-04
---

# Phase 173 Plan 03: Snapshot de socios y linea de base — Summary

**La foto del criterio 4 existe y es verificable: 11 endpoints en 200 con `truncado: false` en todos, 5720 socios paginados hasta agotar `total`, tomada contra staging antes de que la fase toque una sola linea de `src/` — y en el camino se arreglo que un snapshot cortado se declarara completo, que era el modo de falla que habria hecho mentir a esa foto.**

## Performance

- **Duration:** ~95 min (incluye el checkpoint humano bloqueante del Task 3)
- **Tasks:** 3/3
- **Files modified:** 2 versionados (1 nuevo + 1 modificado) + 1 artefacto fuera del repo

## Task Commits

1. **Task 1: Fix IN-02 — los dos `break` marcan el truncado (D-15)** — `88ab4c19`
2. **Task 2: `snapshot-members-endpoints.ts` (D-10)** — `518e9b47`
3. **Task 3: Captura del `antes.json` contra staging** — sin commit (el artefacto vive fuera del repo por diseno)

---

## Task 1 — el fix IN-02

Los dos `break` del final del loop de paginacion cortaban sin setear `truncado`. Ahora los tres caminos de corte reciben el mismo trato, con un warn unico (`avisarTruncado`) que nombra endpoint, pagina, el par `filas/total` y el motivo:

| Corte                                   | Antes             | Ahora                                       |
| --------------------------------------- | ----------------- | ------------------------------------------- |
| tope de `MAX_PAGINAS`                   | `truncado = true` | `truncado = true` (sin cambio)              |
| pagina sin la clave de filas como array | corte silencioso  | `truncado = true` si `filas.length < total` |
| pagina vacia antes de agotar `total`    | corte silencioso  | `truncado = true` si `filas.length < total` |

`grep -c "truncado = true"` → **3**. `pnpm exec tsc --noEmit` → **exit 0**.

### La prueba en caliente

Server falso: pagina 1 con 3 filas y `total: 10`, pagina 2 con `rows: []`.

```
! ...pending-tray: captura TRUNCADA en 3/10 filas (página 2: la página vino vacía
  antes de agotar el total). El diff de este endpoint puede dar falsos positivos.
200 (3 filas) TRUNCADO
```

Camino feliz (paginacion que si agota `total`, 6 filas en 2 paginas): `0` truncados, exit **0**. El flag no se dispara solo.

### El agujero que la prueba en caliente destapo

Con los 4 endpoints truncados, el script **igual imprimia "Captura completa: los 7 endpoints en 200", guardaba en la ruta pedida y salia 0**. El flag delataba en el JSON y el resumen lo tapaba — justo lo contrario de para lo que existe. Ver desviacion Rule 1 abajo.

---

## Task 2 — `snapshot-members-endpoints.ts`

11 endpoints. Los 6 primeros comparten path (`/api/admin/members`) y se distinguen por una **etiqueta**: sin ella se habrian pisado entre si en el mapa `endpoints` y el snapshot habria guardado uno solo.

| #   | Endpoint                                  | Etiqueta              | Pagina | Clave de filas |
| --- | ----------------------------------------- | --------------------- | ------ | -------------- |
| 1   | `GET /api/admin/members`                  | `sin-filtro`          | si     | `members`      |
| 2   | `GET /api/admin/members`                  | `estado-activo`       | si     | `members`      |
| 3   | `GET /api/admin/members`                  | `estado-prueba-leads` | si     | `members`      |
| 4   | `GET /api/admin/members`                  | `por-sede`            | si     | `members`      |
| 5   | `GET /api/admin/members`                  | `deudores`            | si     | `members`      |
| 6   | `GET /api/admin/members`                  | `busqueda-texto`      | si     | `members`      |
| 7   | `GET /api/admin/members/search`           | `typeahead`           | no     | `members`      |
| 8   | `GET /api/admin/members/branches`         | `selector-de-sedes`   | no     | `branches`     |
| 9   | `GET /api/admin/members/check-duplicates` | `duplicados`          | no     | `matches`      |
| 10  | `GET /api/admin/members/export`           | `xlsx-alumnos`        | no     | xlsx           |
| 11  | `GET /api/admin/members/export-sepa`      | `xlsx-domiciliacion`  | no     | xlsx           |

### Las tres lecciones, conservadas

**(a) ajv strippea en silencio.** Cada nombre de querystring verificado **literal, uno por uno**, contra el bloque del schema que le corresponde en `src/modules/members/schemas.ts`:

| Schema                    | Linea  | Parametros usados                                                  | Verificado |
| ------------------------- | ------ | ------------------------------------------------------------------ | ---------- |
| `listMembersSchema`       | `:174` | `search` · `branchId` · `debtorOnly` · `status` · `page` · `limit` | OK ×6      |
| `searchMembersSchema`     | `:238` | `search` (requerido, minLength 1) · `limit`                        | OK ×2      |
| `checkDuplicatesSchema`   | `:656` | `dni` · `phone`                                                    | OK ×2      |
| `exportMembersSchema`     | `:706` | `status` · `includeGreekLevel`                                     | OK ×2      |
| `exportSepaMembersSchema` | `:740` | `status`                                                           | OK ×1      |

Dos trampas que la verificacion literal caza y el ojo no:

- **`listMembersSchema` tiene `limit: { maximum: 100 }`**, no 200 como los schemas de finance. Copiar `LIMITE_POR_PAGINA = 200` habria dado **400 en la primera pagina**.
- **El `status` de `export-sepa` es un enum MAS CHICO** (`"activo" | "todos"`) que el del listado (`todos/freemium/prueba/activo/inactivo`). Mandarle `"prueba"` si da 400.

**(b) paginar hasta agotar `total`.** Verificado sobre datos reales: `sin-filtro` recorrio **5720/5720** filas.

**(c) el orden no es senal.** `ordenarArray` impone orden total propio antes de comparar.

### Dos capacidades que finance no necesitaba

**Clave de filas por endpoint.** `/api/admin/members` devuelve `{ members, total, page, limit, totalDebtByCurrency }` — el array se llama **`members`, no `rows`**. Con el `rows` cableado del script original, el chequeo de forma habria fallado y el script habria guardado **solo la pagina 1 en silencio**, sin marcar nada: pasa por la rama "marcado como paginado pero la forma no lo es", que devuelve `truncado: false` a proposito. Un modo de falla mudo, en el endpoint mas importante del snapshot.

Como el merge conserva el sobre de la pagina 1 y solo reemplaza las filas, **`totalDebtByCurrency` viaja entero** — que es lo que pedia D-10: es un agregado que sale de una query APARTE de las filas.

**Lectura de `.xlsx`.** Con `exceljs`, que ya era dependencia (`package.json:40`, la usa `members/routes.ts:66`). **Cero dependencias nuevas.** Se guarda el contenido, nunca el binario ni su hash: `routes.ts` hace `workbook.created = new Date()` antes de serializar, asi que un hash daria diff en cada corrida sin que cambie una celda.

Cada fila se guarda como **objeto con clave por indice fijo de columna** (`c000`, `c001`, ...) y no como array. Motivo: `normalizar` ordena todos los arrays, y sobre un array de celdas eso **reordenaria las columnas, que si son senal**. Con claves indexadas solo se pueden mover filas, que no lo son. El encabezado va aparte, asi el contrato de columnas puede diferir por si solo.

**Prueba de que era necesario:** dos capturas independientes contra el mismo server falso (cada una con su propio `workbook.created`) dieron `SIN DIFERENCIAS en 11 endpoints`, exit 0.

---

## Task 3 — la captura contra staging

Franco autorizo SSH de solo lectura. Los 4 valores se resolvieron **en el server**, sin que el PII pasara por el chat: `.env.production` leido con abort si `DB_NAME != eltemplo_staging`, JWT HS256 de owner firmado con `crypto` nativo (el `JWT_SECRET` no salio del server), y sede/DNI/telefono de un `SELECT ... ORDER BY id LIMIT 1` sobre `eltemplo_staging`.

**Entorno:** `eltemplo_staging`, tenant 1 = "El Templo", **5720 socios, 7 sedes**. `SNAPSHOT_BRANCH_ID=3` (1947 socios, la de mas volumen).

### El gate del paso 1, resuelto — y lo que destapo

**El deploy del backmerge SI corrio:** `dist/index.js` del staging API con mtime 17:58 y `el-templo-web.previous` 17:59. O sea que **`deploy-staging.yml` NO esta gateado por CI**: desplego `395243a4` aunque CI diera rojo. Consecuencia para D-10: `a36b759d` (primer pago acotado al gimnasio) **ya estaba vivo cuando se saco la foto**, que es exactamente lo que el paso 1 del checkpoint queria garantizar.

El CI rojo era deuda preexistente de `cc242c8c` (agrego `direct_debit` al enum y dejo 5 aserciones de `revenueByMethod` esperando 5 claves). Arreglado aparte en `22ae11eb` (ya en `origin/staging`) y mergeado a la rama de la fase en `d70af1ca`. **Toca solo archivos de test: cero impacto en runtime, no contamina la foto.**

### La linea de base — conteos por endpoint (criterio 4 de la fase)

| Endpoint                                    | status | filas / total                                  | `totalDebtByCurrency` | truncado |
| ------------------------------------------- | ------ | ---------------------------------------------- | --------------------- | -------- |
| `/members` [sin-filtro]                     | 200    | **5720 / 5720**                                | `ARS 584999`          | false    |
| `/members` [estado-activo]                  | 200    | **129 / 129**                                  | `ARS 295000`          | false    |
| `/members` [estado-prueba-leads]            | 200    | **2 / 2**                                      | `[]`                  | false    |
| `/members` [por-sede] (branchId 3)          | 200    | **1947 / 1947**                                | `ARS 30000`           | false    |
| `/members` [deudores]                       | 200    | **9 / 9**                                      | `ARS 584999`          | false    |
| `/members` [busqueda-texto] (`search=a`)    | 200    | **5707 / 5707**                                | `ARS 385000`          | false    |
| `/members/search` [typeahead]               | 200    | **50**                                         | —                     | false    |
| `/members/branches` [selector-de-sedes]     | 200    | **7**                                          | —                     | false    |
| `/members/check-duplicates` [duplicados]    | 200    | **1 match**                                    | —                     | false    |
| `/members/export` [xlsx-alumnos]            | 200    | **hoja "Alumnos": 5720 filas, 11 columnas**    | —                     | false    |
| `/members/export-sepa` [xlsx-domiciliacion] | 200    | **hoja "Domiciliación": 0 filas, 11 columnas** | —                     | false    |

Encabezados capturados (contrato de columnas, verificable por si solo):

- **Alumnos:** Nombre · Email · DNI · Telefono · Sucursal · Nivel · Plan · Estado · Vencimiento · Fecha Nac. · Direccion
- **Domiciliación:** Socio · Email · Plan · Sucursal · Nombre del deudor · NIF / CIF · IBAN · Direccion · Codigo Postal · Poblacion · Pais

### El artefacto

```
-rw------- 1 franco franco 11299918 /home/franco/.el-templo-snapshots/173/antes.json
```

`600`, **11.3 MB**, fuera de todo checkout (`$HOME/.el-templo-snapshots/`, ni `.planning/` ni el worktree). `git -C /home/franco/projects/et-173 status --porcelain` **vacio**.

Claves de raiz: `baseUrl · branchId · busqueda · capturadoEn · endpoints · parametrosHash · rango`. **El DNI y el telefono NO estan** — solo su huella. `capturadoEn: 2026-08-04T22:30:51.150Z`.

### El valor que la foto de DESPUES tiene que reproducir

> **`parametrosHash: 57bdcd98a4a3eae4`**

El `--diff` **aborta con exit 2** si las dos capturas no comparten esta huella (probado en caliente: cambiar solo el `branchId` de 14 a 99 la movio a `909ff88d78b272c0` y el diff corto). Los tres valores que la componen son **reproducibles de forma determinista** repitiendo el `SELECT ... ORDER BY id LIMIT 1` sobre `eltemplo_staging` (tenant 1) y usando `SNAPSHOT_BRANCH_ID=3`.

**El plan 173-31 tiene que capturar el "despues" con esos mismos tres valores o el diff no corre.**

---

## Deviations from Plan

### **[Rule 1 - Bug] Un endpoint truncado no invalidaba la captura**

- **Found during:** Task 1, en la prueba en caliente del flag
- **Issue:** con 4 de 7 endpoints truncados, `capturar()` imprimia **"Captura completa: los 7 endpoints en 200"**, guardaba en la ruta pedida (`antes.json`, no `.parcial`) y **salia 0**. El `huboFallas` solo miraba `status !== 200`. El flag `truncado` quedaba fiel en el JSON y el resumen lo contradecia.
- **Por que no se podia dejar asi:** el paso 3 del checkpoint del Task 3 es "verificar que `truncado` es `false` en todos". Con el resumen mintiendo, esa verificacion dependia de que un humano leyera 11 lineas de salida a ojo tres semanas antes de usar el archivo. Y el `<done>` del Task 1 dice literal "un snapshot cortado deja de declararse completo" — el flag solo no alcanzaba.
- **Fix:** `truncado` alimenta `huboFallas` igual que un no-200. El archivo se guarda como `.parcial`, se listan los endpoints truncados por nombre con la sugerencia de subir `MAX_PAGINAS`, y el exit es 1.
- **Files:** `el-templo-api/src/scripts/snapshot-finance-endpoints.ts` (y viaja en la copia de members)
- **Commit:** `88ab4c19`

### **[Rule 2 - Seguridad] DNI y telefono por env, solo su huella en el archivo**

- **Found during:** Task 2
- **Issue:** `check-duplicates` necesita un DNI y un telefono **reales** para devolver algo distinto de `matches: []` (con valores inventados contesta lo mismo antes y despues: cero senal). Cablearlos en el script seria una fuga de PII **permanente e irreversible en el historial de git** — el mismo umbral que el threat model del plan aplica al `antes.json`, pero sobre un archivo que si se commitea.
- **Fix:** `SNAPSHOT_DUP_DNI` / `SNAPSHOT_DUP_PHONE` / `SNAPSHOT_BRANCH_ID` por env (fail-closed: exit 2 si falta alguna), y del archivo sale solo su **sha256 truncado a 16 hex**. `--diff` aborta si las huellas difieren. El `branchId` no es PII y viaja en claro para que el archivo se lea solo.
- **Files:** `el-templo-api/src/scripts/snapshot-members-endpoints.ts`
- **Commit:** `518e9b47`
- **Efecto colateral util:** la huella tambien cubre `BUSQUEDA`, `RANGO` y los dos limites de pagina, asi que un cambio de constante entre capturas tampoco puede pasar como diff de datos.

### **[Rule 3 - Bloqueante] `GET /api/admin/leads` no existe**

- **Found during:** Task 2
- **Issue:** el plan (y D-10 del CONTEXT) piden capturar `GET /api/admin/leads`. **Esa ruta no existe.** El unico endpoint del prefijo es `PATCH /api/admin/leads/:userId` (`leads-routes.ts:52`), confirmado contra el manifiesto (`test/tenant-manifest.ts:329`, una sola entrada) — y es una escritura, que este script no hace nunca.
- **Fix:** sustituido por `GET /api/admin/members?status=prueba`. Los "leads" son `users` con `status='prueba'`: es la lectura equivalente y la que usa el staff. Cae dentro de "seleccion fina de endpoints, Claude's Discretion" (D-10). Confirmado por Franco en el checkpoint antes de la captura.

### **[Nota, no desviacion] Ningun endpoint de socios acepta rango de fechas**

Verificado contra los 5 schemas: no hay `dateFrom`/`dateTo` ni analogo. Es la diferencia de fondo con finance, que es un modulo de movimientos; el padron de socios es un corte al dia de hoy. El `RANGO` literal se conserva **declarado y deliberadamente no enviado**, por dos motivos escritos en el docblock: viaja al header (y `--diff` lo compara) y le deja el patron listo a un endpoint futuro para que no use `new Date()`.

### **[Nota, no desviacion] `MAX_PAGINAS` de 50 a 200**

Con 5720 socios y el `limit` maximo de 100 que impone `listMembersSchema`, la captura sin filtro necesita **58 paginas**. El valor de finance (50) **habria truncado el endpoint mas importante del snapshot** — y con el fix del Task 1 ya puesto, habria abortado la captura en vez de mentir, que es la falla correcta pero igual habria costado una vuelta.

### **[Nota, no desviacion] `--help` sale con 0**

En el script de finance, `--help` cae en "elegi exactamente un modo" → `ErrorDeUso` → exit **2**. La verificacion del Task 2 encadena `tsc --noEmit && ... --help`, asi que habria fallado. Se agrego manejo explicito de `--help`/`-h` que imprime el USAGE y sale 0.

### **[Externo al plan] CI rojo preexistente y el deploy sin gate**

`22ae11eb` (arreglo de las 5 aserciones de `revenueByMethod` que `cc242c8c` dejo esperando 5 claves en vez de 6) fue resuelto por el coordinador fuera de este plan y mergeado a la rama de la fase en `d70af1ca`. Toca solo archivos de test. Se documenta aca porque **destapo que `deploy-staging.yml` no esta gateado por CI**: staging se desplego con CI rojo. Para D-10 jugo a favor (el backmerge estaba vivo antes de la foto), pero es un hecho del pipeline que la fase deberia tener presente.

---

## Riesgos de senal de la foto (declarados, NO resueltos)

Dos endpoints entraron al snapshot con senal debil. **No invalidan la linea de base** —capturan el contrato y el `total`— pero no van a cazar una regresion de conteo:

1. **`export-sepa` devolvio 0 filas.** No hay socios con `country='ES'` en staging. Lo que si queda protegido es el **contrato de columnas** (las 11 cabeceras se capturaron y el diff las compara por si solas) y el hecho de que el endpoint siga devolviendo 200. Una regresion de FILAS de este export **solo la caza el UAT (D-11) o produccion**.
2. **`estado-prueba-leads` devolvio 2 filas.** Como sustituto de `/leads` es una muestra muy fina: dos socios de prueba pueden cambiar de estado por razones de negocio entre las dos capturas y producir un diff que no es regresion (o taparla).

Para el plan 173-31: si alguno de estos dos difiere, **mirar la causa antes de asumir regresion**; y si los dos dan igual, eso no es evidencia fuerte de que el camino SEPA este sano.

---

## Para los planes siguientes de la fase

1. **La foto ya esta sacada. Los planes de migracion de `src/` estan habilitados** (Franco confirmo: "snapshot antes capturado").
2. **La huella `57bdcd98a4a3eae4` es el valor que el "despues" tiene que reproducir.** `SNAPSHOT_BRANCH_ID=3` + DNI/telefono del `SELECT ... ORDER BY id LIMIT 1` sobre `eltemplo_staging` (tenant 1). Si no coincide, el `--diff` sale 2 y no compara nada.
3. **Al copiar el script a otro modulo (174/175): chequear la clave del array del sobre y el `limit` maximo del schema.** Las dos cosas mordieron aca y las dos fallan en silencio (`rows` cableado guarda la pagina 1 sin marcar nada; un `limit` de mas da 400).
4. **`deploy-staging.yml` no esta gateado por CI.** Un push a staging se despliega aunque CI este rojo.
5. Cuando la fase toque `members/schemas.ts`, **si agrega o renombra una querystring hay que revisar `ENDPOINTS`**: ajv strippea en silencio, asi que un nombre viejo no da 400 — da un snapshot que dice filtrar y no filtra.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. El plan no agrega superficie de red ni de auth: el script solo hace GETs autenticados con un token que entra por env y nunca se loguea ni se escribe. Las 4 mitigaciones del threat model del plan estan aplicadas y verificadas:

| Threat ID   | Mitigacion                                                           | Evidencia                                                                          |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| T-173-03-01 | archivo fuera del repo, `chmod 0600`, `git status --porcelain` vacio | `-rw------- ... /home/franco/.el-templo-snapshots/173/antes.json`, worktree limpio |
| T-173-03-02 | los dos `break` marcan `truncado`, probado en caliente               | commit `88ab4c19` + salida del server falso                                        |
| T-173-03-03 | cada querystring verificada literal contra su bloque de schema       | tabla de 5 schemas / 13 parametros, todos OK                                       |
| T-173-03-04 | rango literal fijo (y en este modulo, ademas, no enviado)            | `RANGO` const, sin `new Date()` fuera de `capturadoEn`                             |

Se agrego una mitigacion que el threat model no preveia: **el DNI y el telefono de `check-duplicates` no se escriben en el archivo ni en el script**, solo su huella sha256 (desviacion Rule 2).

## Self-Check: PASSED

- `el-templo-api/src/scripts/snapshot-members-endpoints.ts` — FOUND
- `el-templo-api/src/scripts/snapshot-finance-endpoints.ts` (modificado) — FOUND
- `/home/franco/.el-templo-snapshots/173/antes.json` — FOUND (`600`, 11299918 bytes, fuera de todo checkout)
- 11/11 endpoints con `status: 200` y `truncado: false` — verificado leyendo el JSON, no la salida de consola
- `parametrosHash: 57bdcd98a4a3eae4` — verificado en el archivo
- Commit `88ab4c19` — FOUND
- Commit `518e9b47` — FOUND
- `pnpm exec tsc --noEmit` exit 0 · `pnpm typecheck:tests` `DISCREPANCIAS: 0` · `pnpm lint:tenant` `DISCREPANCIAS: 0` · `prettier --check` limpio
