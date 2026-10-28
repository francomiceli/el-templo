---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 29
subsystem: testing
tags:
  [
    tenancy,
    members,
    iso-03,
    gate,
    fail-closed,
    cobertura,
    manifiesto,
    bidireccional,
    baseline,
    excepciones-nombradas,
  ]

# Dependency graph
requires:
  - plan: 173-26
    provides: "iso-03-members-listados.test.ts — 9 rutas de listado/export"
  - plan: 173-27
    provides: "iso-03-members-ficha.test.ts — 10 rutas de la ficha del socio"
  - plan: 173-28
    provides: "iso-03-members-altas-y-staff.test.ts — 11 rutas de escritura"
  - phase: 172-adopci-n-1-piloto-finance
    plan: 20
    provides: "iso-03-cobertura.test.ts — la plantilla completa del gate (motor, bidireccionalidad, excepciones, fixtures sinteticos)"
  - phase: 171-backstop
    provides: "test/tenant-manifest.ts (TENANT_MANIFEST, 372 rutas clasificadas)"
provides:
  - "test/tenancy/iso-03-cobertura-members.test.ts — el gate fail-closed BIDIRECCIONAL de la bateria ISO-03 de members: 8 tests (4 contra el manifiesto real + 4 de motor con fixtures sinteticos)"
  - "RUTAS_MEMBERS derivadas del TENANT_MANIFEST por los 3 prefijos (/api/admin/members, /api/admin/users, /api/admin/leads) — una ruta nueva de socios/staff/leads entra sola al gate en cuanto el gate ISO-01 la obliga a clasificarse"
  - 'esRutaDelModulo(url): criterio de prefijo `url === P || url.startsWith(P + "/")`, corrigiendo la trampa de barra final que la plantilla de finance no necesitaba resolver (finance no tiene rutas ''peladas'')'
  - "CASOS_BASELINE = 30 con docblock de que bajarlo es una decision de diseno, no un ajuste"
  - "Los 30 describes de ruta de los 3 archivos (173-26/27/28) ya estaban normalizados a la clave LITERAL del manifiesto — cero cambios necesarios en esos 3 archivos (a diferencia del piloto, que tuvo que renombrar 12 describes)"
  - "EXCEPCIONES_NOMBRADAS vacia (Readonly<Record<string,string>> = {}), con su propio gate probado igual: las 30 rutas del modulo se cubren directamente, sin necesidad de excluir ninguna hoy"
  - "ISO-03 (subset members) CERRADO: 30/30 rutas members/users/leads tenant-scoped con caso, y el gate que impide que eso envejezca en silencio"
affects: [173-30, 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'El criterio de prefijo de un gate de cobertura NO puede asumir que ningun prefijo del modulo tiene rutas ''peladas'' (sin segmento despues): `url === P || url.startsWith(P + "/")` es el criterio general y seguro; `url.startsWith(P + "/")` a secas solo es seguro cuando se verifico explicitamente que ninguna ruta del modulo es el prefijo exacto (el caso de finance, no el de members/users)'
    - "Un gate de cobertura con MULTIPLES prefijos itera `PREFIJOS.some(...)` en vez de un solo `url.startsWith(PREFIJO)`: la funcion `esRutaDelModulo` centraliza el criterio para que la mutacion de prueba (Task 2) y el gate de excepciones (que tambien necesita 'esta clave matchea algun prefijo del modulo') usen la MISMA logica, sin duplicarla"
    - "La plantilla del gate de cobertura (172-20) NO se copia cambiando una sola constante: son minimo 3 cambios medibles (criterio de prefijo, cantidad de prefijos, baseline+archivos) y hay que verificar CADA UNO contra el manifiesto real antes de asumir que aplica igual"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts
  modified: []

key-decisions:
  - "El criterio de prefijo se escribio como funcion compartida `esRutaDelModulo(url)` en vez de repetir `PREFIJOS.some(...)` en los 3 lugares que lo necesitan (RUTAS_MEMBERS, y el gate de excepciones) — mismo argumento DRY que ya aplico la plantilla de finance para `sinComentarios`/`clavesDeLosDescribe`"
  - "EXCEPCIONES_NOMBRADAS se dejo vacia PERO con su gate completo intacto (existencia en manifiesto + fuera de los 3 prefijos + motivo >= 20 chars): se prueba igual que si tuviera entradas, mutando una entrada tramposa en el Task 2, para que el dia que una fase futura necesite excluir una ruta 'members-like' de otro modulo (mismo patron que advanced-finance para finance), el gate ya este ejercitado y no se este confiando en codigo nunca visto en rojo"
  - "Los 3 archivos de la bateria (173-26/27/28) no necesitaron NINGUN cambio: sus describes ya nombraban la clave completa del manifiesto (a diferencia del piloto finance, que tuvo que normalizar 12). Confirmado por script antes de escribir el gate: 30 describes de ruta -> 30 claves unicas, las 30 presentes textualmente en TENANT_MANIFEST"
  - "El numero real de la trampa de barra final es 26, no 28 como estimaba el plan: la misma trampa alcanza tambien a /api/admin/users (GET y POST bare), no solo a /api/admin/members. Documentado en el docblock del archivo con el numero medido y transcripto abajo con la salida real del rojo provocado"

patterns-established:
  - 'Gate de cobertura de una bateria de aislamiento con MULTIPLES prefijos: mismo patron de 172-20 (criterio derivado + excepciones nombradas + bidireccionalidad + baseline con docblock + motor con fixtures) pero con el criterio de prefijo generalizado a `url === P || url.startsWith(P + "/")` para no asumir que ningun prefijo tiene una ruta pelada. Es la forma que deberian copiar 174/175 si alguno de sus modulos tiene una ruta bare (ej. `POST /api/admin/<modulo>` sin sub-recurso).'

requirements-completed: [ADO-02]

# Metrics
duration: ~35min
completed: 2026-08-09
---

# Phase 173 Plan 29: El gate de cobertura de la batería de members Summary

**`iso-03-cobertura-members.test.ts` cruza las 30 rutas `tenant-scoped` de los 3 prefijos del módulo (`/api/admin/members` 24 + `/api/admin/users` 5 + `/api/admin/leads` 1) contra las que los 30 describes de los planes 173-26/27/28 dicen cubrir, en las dos direcciones, con el criterio de prefijo `url === P || url.startsWith(P + "/")` — la corrección medida a la plantilla de finance, que un `startsWith` con barra final habría perdido en silencio `GET`/`POST /api/admin/members` **y** `GET`/`POST /api/admin/users` (4 rutas, no 2 como estimaba el plan: bajo el criterio incorrecto el conteo real dio 26, no 28). Probado encendiendo el rojo a propósito en los CUATRO modos de falla que el gate existe para prevenir (faltantes, fantasmas, la trampa de la barra final, y una excepción con motivo tramposo), los cuatro revertidos y verificados. ISO-03 (subset members) queda cerrado: 30/30 con gate propio, y `test/tenancy` completo sigue en el mismo estado conocido (339/341 — los 2 rojos son `con-06-lint.test.ts`, ya documentados como ajenos, dueño 173-30).**

## Performance

- **Duration:** ~35 min (de los cuales ~14 min son las 6 corridas de vitest: 1 verde + 4 de rojo provocado a ~97s c/u + 1 corrida de `test/tenancy` completo a ~481s)
- **Completed:** 2026-08-09
- **Tasks:** 2/2
- **Files:** 1 creado (471 líneas), 0 modificados fuera de la propia demostración de rojo (revertida)

## Task Commits

1. **Task 1: Escribir el gate con los 3 prefijos y el criterio de barra corregido** - `15ec3ba1` (feat)

**Task 2 no generó commit**: consistió en encender y revertir 4 mutaciones de prueba sin dejar cambios permanentes (según lo pedido explícitamente por el plan — "sin commitear"). El estado final es idéntico al de después de Task 1: `git status --porcelain` vacío.

**Plan metadata:** sin commit de metadata — instrucción explícita del prompt de ejecución: "NO toques STATE.md, ROADMAP.md ni commitees NADA en el checkout principal — SUMMARY y deferred-items quedan SIN commitear".

_Nota: los commits viven en `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`), sobre `08c0ee05` (HEAD de 173-28)._

## Files Created/Modified

- `el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts` — el gate de cobertura de la batería ISO-03 de members (creado, commit `15ec3ba1`)

## Task 1: el gate, y por qué la plantilla no se copia cambiando una constante

### Lo que el plan pedía y cómo quedó

| Pieza                            | Cómo quedó                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Criterio de prefijo              | `esRutaDelModulo(url)`: `PREFIJOS.some((p) => url === p \|\| url.startsWith(p + "/"))` — función compartida, no repetida en cada lugar que la necesita |
| 3 prefijos                       | `PREFIJO_MEMBERS`, `PREFIJO_USERS`, `PREFIJO_LEADS`, sin barra final ninguno                                                                           |
| `CASOS_BASELINE`                 | `30`, con el mismo docblock de "sube con caso, baja solo si la ruta deja de existir"                                                                   |
| `ARCHIVOS_BATERIA`               | los 3 archivos de 173-26/27/28, en orden                                                                                                               |
| `EXCEPCIONES_NOMBRADAS`          | `{}` — vacía, pero con su gate (4º `it`) probado igual                                                                                                 |
| Bidireccional                    | `faltantes` + `fantasmas`, idéntico a la plantilla                                                                                                     |
| `sinComentarios` antes de buscar | copiada tal cual (docblocks de los 3 archivos listan sus rutas)                                                                                        |
| Motor con 4 fixtures sintéticos  | copiado tal cual, adaptado a `POST /api/admin/members/fixture-173-29`                                                                                  |
| No toca la base                  | `readFileSync`, cero imports de los 3 archivos de la batería                                                                                           |

### Verificación previa a escribir el gate: los 30 describes ya estaban normalizados

Antes de escribir una línea, se verificó con un script (`node --tsx` inline) contra `TENANT_MANIFEST` que los 30 `describe` de ruta de los 3 archivos de la batería (9 + 10 + 11) ya contenían la clave LITERAL del manifiesto — a diferencia del piloto finance, que tuvo que renombrar 12 describes en su Task 1. Este plan no tocó los 3 archivos: **0 cambios** en `iso-03-members-listados.test.ts`, `-ficha.test.ts`, `-altas-y-staff.test.ts`.

### El hallazgo del plan, medido en vivo

El `<objective>` advertía correctamente que el criterio de barra final de la plantilla (`iso-03-cobertura.test.ts`, seguro para finance porque ninguna ruta finance es el prefijo pelado) perdería `GET`/`POST /api/admin/members` si se copiara tal cual. Se verificó ANTES de escribir el archivo (script ad-hoc contra el manifiesto real) que el mismo criterio incorrecto también pierde `GET`/`POST /api/admin/users` — la misma trampa, un prefijo más. El plan estimaba que el conteo bajo el criterio incorrecto daría **28**; medido, da **26** (4 rutas perdidas: las 2 de members más las 2 de users). El docblock del archivo (líneas 43-75) documenta el número real medido, no el estimado, y explica por qué (`/api/admin/users` es tan "pelado" como `/api/admin/members`).

## Task 2: el rojo, demostrado en los CUATRO sentidos y revertido

Las cuatro mutaciones se aplicaron una por vez sobre el checkout del worktree, sin commitear, verificando `git status --porcelain` vacío después de cada revert.

### 1 — `faltantes`: comentar un describe existente

Se comentó (con `//` línea por línea) el bloque completo de `describe("verificacion de DNI unico — GET /api/admin/members/check-dni", ...)` en `iso-03-members-listados.test.ts` (líneas 527-561).

```
× toda ruta tenant-scoped de los 3 prefijos tiene caso de aislamiento
× la batería cubre exactamente las 30 rutas de members/users/leads del baseline
✓ todo caso de la batería apunta a una ruta que existe en el manifiesto
  (+ los 4 del motor y el de excepciones, verdes)

AssertionError: Rutas de members/users/leads "tenant-scoped" del manifiesto
que NO tienen caso en la batería ISO-03: GET /api/admin/members/check-dni.
QUÉ HACER: ...

AssertionError: La batería declara 29 rutas de members/users/leads
cubiertas y el baseline dice 30.: expected 29 to be 30
```

Revertido con `git checkout -- test/tenancy/iso-03-members-listados.test.ts`.

### 2 — `fantasmas`: describe con clave inventada

Se agregó `describe("caso mutado 173-29 — GET /api/admin/members/inventado", ...)` (con un `it` trivial) en el mismo archivo.

```
× todo caso de la batería apunta a una ruta que existe en el manifiesto
✓ toda ruta tenant-scoped de los 3 prefijos tiene caso de aislamiento (aparte, sigue en verde: el faltante no existe)
✓ la batería cubre exactamente las 30 rutas del baseline (el fantasma no infla el conteo de cubiertas)

AssertionError: Casos de la batería cuyo describe nombra una ruta que NO
existe entre las rutas de members/users/leads del manifiesto:
GET /api/admin/members/inventado. Las causas son tres...
```

Revertido con `git checkout -- test/tenancy/iso-03-members-listados.test.ts`.

### 3 — Barra final: el criterio incorrecto, medido

Se cambió temporalmente `esRutaDelModulo` en el propio gate a `PREFIJOS.some((p) => url.startsWith(p + "/"))` (sin el `url === p`).

```
× todo caso de la batería apunta a una ruta que existe en el manifiesto
× la batería cubre exactamente las 30 rutas de members/users/leads del baseline

AssertionError: Casos de la batería cuyo describe nombra una ruta que NO
existe entre las rutas de members/users/leads del manifiesto:
GET /api/admin/members, GET /api/admin/users, POST /api/admin/members,
POST /api/admin/users.

AssertionError: El manifiesto tiene 26 rutas de members/users/leads
"tenant-scoped" y el baseline dice 30.: expected 26 to be 30
```

Confirma el hallazgo del docblock: son **4** rutas perdidas (dos de members, dos de users), y el número real es **26**, no 28. Las 4 rutas perdidas caen además como `fantasmas` (sus describes siguen nombrando la clave exacta, pero el criterio mutado ya no la reconoce como "ruta del módulo"), un efecto colateral que confirma que ambas direcciones del gate reaccionan a la misma trampa. Revertido con `git checkout -- test/tenancy/iso-03-cobertura-members.test.ts`.

### 4 — Excepción tramposa: motivo con marcador de trabajo pendiente

Se agregó a `EXCEPCIONES_NOMBRADAS` la entrada `"GET /api/admin/analytics/advanced-finance": "TODO"` (clave real del manifiesto, fuera de los 3 prefijos, para aislar el chequeo de motivo del chequeo de prefijo).

```
× las excepciones nombradas siguen existiendo, siguen fuera de los 3 prefijos y siguen con su motivo

AssertionError: Excepciones sin motivo utilizable:
GET /api/admin/analytics/advanced-finance. Igual que D-02 (fase 171) con
las entradas "global" del manifiesto: un motivo vacío, de dos palabras o
con marcador de trabajo pendiente vale lo mismo que nada.
```

Revertido con `git checkout -- test/tenancy/iso-03-cobertura-members.test.ts`.

### Cierre: `test/tenancy` completo, sin restos

Tras las 4 reversiones, `git -C /home/franco/projects/et-173 status --porcelain` vacío, y se corrió `test/tenancy` entero:

```
Test Files  1 failed | 18 passed (19)
     Tests  2 failed | 339 passed (341)
```

Los 2 rojos son `con-06-lint.test.ts` — exactamente los mismos 2 documentados como ajenos desde el 172-16 y confirmados por 173-26/27/28 (dueño 173-30, deuda de allowlist/lint no relacionada con este plan). El resto (339/339, incluidos los 8 tests nuevos de este gate) verde. **0 rutas del manifiesto quedan sin caso para los 3 prefijos.**

## Verificación

| Criterio                                                                                   | Resultado                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-cobertura-members.test.ts` | ✅ 8/8, exit 0 (~99s de pared, de los cuales ~95s son provisioning de `test/setup.ts` como `setupFiles` global — mismo hallazgo 169-07/172-20, el gate en sí corre en ms) |
| `grep -c "CASOS_BASELINE = 30"`                                                            | ✅ 2 (declaración + comentario)                                                                                                                                           |
| Declara los 3 prefijos y `ARCHIVOS_BATERIA` con los 3 archivos                             | ✅                                                                                                                                                                        |
| 4 `it` de motor sintético + `it` de gate de excepciones                                    | ✅ presentes y verdes                                                                                                                                                     |
| `describe.skip`/`.todo` no cuentan como cobertura                                          | ✅ probado con fixture sintético                                                                                                                                          |
| No importa los 3 archivos de la batería (`readFileSync`)                                   | ✅ único import es `TENANT_MANIFEST`                                                                                                                                      |
| `pnpm exec tsc --noEmit`                                                                   | ✅ exit 0                                                                                                                                                                 |
| `pnpm run typecheck:tests` (ratchet)                                                       | ✅ 175/175 baseline, 0 nuevos, 0 empeorados                                                                                                                               |
| Los 4 rojos provocados, transcritos                                                        | ✅ (ver arriba)                                                                                                                                                           |
| Rojo de la barra final: conteo real vs esperado por el plan                                | ✅ 26 medido (no 28 — hallazgo documentado)                                                                                                                               |
| `pnpm exec vitest run --no-file-parallelism test/tenancy` tras revertir                    | ✅ 339/341 (2 rojos ajenos, dueño 173-30)                                                                                                                                 |
| `git -C /home/franco/projects/et-173 status --porcelain`                                   | ✅ vacío                                                                                                                                                                  |
| Rutas del manifiesto sin caso (3 prefijos)                                                 | ✅ 0                                                                                                                                                                      |

## Decisions Made

### 1. Función compartida `esRutaDelModulo` en vez de repetir el criterio

El criterio de prefijo se necesita en dos lugares: derivar `RUTAS_MEMBERS` del manifiesto, y el 4º test (gate de excepciones) que verifica que ninguna excepción matchee alguno de los 3 prefijos. Escribirlo como función (`esRutaDelModulo(url): boolean`) en vez de repetir `PREFIJOS.some(...)` en los dos lugares evita que una futura corrección del criterio (por ejemplo, si aparece un 4º prefijo) se aplique en un lugar y se olvide en el otro — mismo argumento DRY que ya sostiene `sinComentarios`/`clavesDeLosDescribe` en la plantilla original.

### 2. `EXCEPCIONES_NOMBRADAS` vacía, pero con el gate intacto y probado

A diferencia de finance (que excluye `GET /api/admin/analytics/advanced-finance`), las 30 rutas de members/users/leads se cubren directamente sin necesitar ninguna exclusión. Se dejó la lista vacía en vez de borrar el 4º test: el día que una fase futura registre una ruta que se LLAME members/users/leads pero se adopte en otro módulo, el gate ya está ejercitado (Task 2, mutación 4) y no depende de código que nunca se vio fallar.

### 3. El número medido corrige la estimación del plan (26, no 28)

El `<objective>` del plan estimaba 28 como el conteo bajo el criterio incorrecto, razonando solo sobre `/api/admin/members`. Medido contra el manifiesto real (antes de escribir el archivo, y confirmado en la mutación 3 de Task 2), la misma trampa alcanza también a `/api/admin/users` (`GET`/`POST` bare), dando 26. Se corrigió la documentación del archivo para reflejar el número real medido en vez de repetir la estimación del plan sin verificar.

## Deviations from Plan

### Auto-fixed Issues

Ninguno. No hubo que tocar `src/` ni ningún fixture; los 3 archivos de la batería (173-26/27/28) no necesitaron cambios.

### Desviaciones de alcance (2, ninguna relaja una aserción)

**1. El número real de la trampa de barra final es 26, no 28** (ver Decision 3 arriba). Se documentó el número medido en el docblock del gate en vez de dejar la estimación del plan sin verificar.

**2. La mutación de la excepción tramposa (Task 2, mutación 4) usó una clave FUERA de los 3 prefijos** (`GET /api/admin/analytics/advanced-finance`, ya existente en el manifiesto) en vez de una clave del propio módulo, para aislar el chequeo de "motivo utilizable" del chequeo de "está fuera del prefijo" — con una clave del propio módulo, ambos checks fallarían a la vez y la demostración sería menos clara sobre cuál mecanismo se está probando. No estaba especificado en el plan; es una elección de claridad en la demostración, no un cambio de comportamiento del gate.

---

**Total deviations:** 0 auto-fixed + 2 de alcance (ambas de documentación/claridad de la demostración, ninguna relaja una aserción del gate).

## Issues Encountered

**El gate tarda ~99s en la corrida standalone aunque no toque la base.** Mismo hallazgo que 172-20: `test/setup.ts` es `setupFiles` para TODOS los archivos de `test/`, así que el provisioning del worker se paga igual. El gate en sí (los 8 `it`) corre en milisegundos.

**`test/tenancy` completo tardó ~481s** (single worker, `--no-file-parallelism`, 19 archivos) — dentro de lo esperable para la carpeta completa según los hallazgos acumulados de 173-24/25 sobre el costo de esta corrida.

## Deferred Issues

**Los 2 rojos de `con-06-lint.test.ts`** siguen siendo del **173-30** (allowlist stale + la lente estática) — sin cambios respecto de lo documentado desde el 172-16 y confirmado por 173-26/27/28. No se investigaron ni se tocaron: no son de este plan.

Ningún hallazgo nuevo para `deferred-items.md`: este plan no tocó `src/`, no ejecutó la sonda de `members` (no era necesario — el gate no toca la base) y no encontró código productivo nuevo fuera de su `files_modified`.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes, no modifica una línea de `src/` y su único archivo nuevo no abre una conexión.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-173-29-01 | ✅ criterio `url === P \|\| url.startsWith(P + "/")`, probado encendiendo el rojo con el criterio incorrecto (26 medido vs 30 correcto — no 28 como estimaba el plan) |
| T-173-29-02 | ✅ `sinComentarios` antes de buscar (copiada de la plantilla) + 4 `it` de motor sintético que prueban el borrador                                                     |
| T-173-29-03 | ✅ chequeo bidireccional (`faltantes` + `fantasmas`), con el rojo encendido a propósito en los dos sentidos (mutaciones 1 y 2 de Task 2)                              |
| T-173-29-04 | ✅ `it` que exige existir en el manifiesto, estar fuera de los 3 prefijos y tener motivo utilizable ≥ 20 chars, probado con la mutación 4                             |
| T-173-29-05 | ✅ `clavesDeLosDescribe` ignora `.skip`/`.todo`, probado con fixture sintético                                                                                        |
| T-173-29-06 | ✅ lee texto con `readFileSync`, no importa los archivos de la batería: exit 0 en ~99s de pared (~95s son provisioning ambiental, el gate en sí corre en ms)          |

## Next Phase Readiness

**El 173-30 (el switch) no tiene nada que esperar de este plan.** El gate no toca `src/`, no toca `tenant-lint-allowlist.json` y no enciende la sonda. Los 2 rojos conocidos de `con-06-lint.test.ts` siguen siendo su único dueño.

**ISO-03 (subset members) queda FUNCIONALMENTE cerrado**: 30/30 rutas members/users/leads `tenant-scoped` tienen caso (173-26/27/28) y este plan agrega el gate que impide que eso se degrade.

**`REQUIREMENTS.md` NO se tocó** — instrucción explícita del prompt de ejecución ("NO toques STATE.md, ROADMAP.md ni commitees NADA en el checkout principal"). `ADO-02` queda documentado como completado en el frontmatter de este SUMMARY para que 173-30 (o quien cierre el milestone) lo marque cuando corresponda.

## Self-Check: PASSED

- `FOUND` `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-29-SUMMARY.md`
- `FOUND` commit `15ec3ba1` en `feat/173-adopcion-members` (worktree `et-173`)
- `FOUND` `el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts`
- `VERIFIED` 8/8 verdes standalone, reportando 30 rutas cubiertas
- `VERIFIED` rojo en los CUATRO modos de falla (faltantes, fantasmas, barra final, excepción tramposa), cada uno transcrito y revertido
- `VERIFIED` `git -C /home/franco/projects/et-173 status --porcelain` vacío tras las 4 reversiones
- `VERIFIED` `test/tenancy` completo: 339/341 (2 rojos ajenos, dueño 173-30) — mismo estado conocido que 173-26/27/28
- `VERIFIED` `tsc --noEmit` exit 0
- `VERIFIED` `pnpm run typecheck:tests` 175/175 baseline, 0 nuevos, 0 empeorados

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-09_
