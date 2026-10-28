---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 21
subsystem: testing
tags:
  [
    tenancy,
    members,
    users,
    test-harness,
    sentinel,
    tenant-safe,
    cleanAllTestData,
    sonda-temporal,
    tenant-tables,
  ]

# Dependency graph
requires:
  - phase: 172-adopci-n-1-piloto-finance
    provides: "el patron tenant-safe embebido en el SQL + el precedente FK-safe de cleanAllTestData (172-13)"
  - plan: 173-01
    provides: "tsconfig.test-check.json commiteado (ratchet de typecheck de test/)"
  - plan: 173-17
    provides: "members/service.ts y members/routes.ts cerrados a nivel archivo"
  - plan: 173-19
    provides: "listMembers/exportMembers/exportSepaMembers scopeados"
provides:
  - "cleanAllTestData con los DOS statements de `users` clasificados (DELETE -> exencion embebida en el SQL, UPDATE -> filtro tenant_id=1), regla de decision de 4 categorias escrita en la cabecera de test/helpers.ts"
  - "createEligibleFreemium estampa tenantId via tenantValues (default 1): ultimo INSERT de users en test/helpers.ts sin gimnasio explicito, cerrado"
  - "test/setup.ts: admin@test.com estampa tenant_id explicito en vez de confiar en el DEFAULT 1"
  - "test/fixtures/second-tenant.ts verificado SIN CAMBIOS: ya cumple (tenantValues + limpiarSegundoGimnasio filtrada por tenant_id, FK-ordenada)"
  - "Procedimiento reproducible de la sonda temporal (encendido/apagado/pre-check) documentado para 173-22..25"
  - "Hallazgo critico documentado (no corregido, fuera de alcance): auth/routes.ts NO sobrevive al throw pese a 5 anotaciones tenant-safe, porque son comentarios TS sobre una cadena de Drizzle y no llegan al SQL — bloquea la utilidad de la sonda para 173-22..25 hasta que se resuelva"
affects: [173-22, 173-23, 173-24, 173-25, 173-30]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regla de decision de 4 categorias (doc 07 §4(d)) escrita como comentario de bloque en la CABECERA de test/helpers.ts, no solo junto a cleanAllTestData: limpieza global -> exencion tenant-safe embebida en el SQL; conveniencia acotable -> filtro WHERE tenant_id = ? parametrizado; lectura de evidencia -> exencion; tabla todavia no strict -> NO se anota (apaga el tripwire de quien migre despues)"
    - "El canal del sentinel (SQL embebido) y el canal del lint (comentario TS anclado por AST al call site) son DOS canales distintos que NO se sustituyen entre si (D-17, fase 170) — un /* tenant-safe: ... */ escrito arriba de una cadena de Drizzle query builder satisface al lint pero es invisible para el sentinel, que solo lee el string SQL final"
    - "La sonda temporal (agregar `members` a mano en TENANT_STRICT_MODULES, correr, revertir con Edit — NUNCA `git checkout --` sobre un archivo con cambios propios sin confirmar antes que sean solo la sonda) es el unico modo de medir avance real de 173-22..25 sin hacer el switch"

key-files:
  created: []
  modified:
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/setup.ts

key-decisions:
  - "El DELETE FROM users de cleanAllTestData se anota tenant-safe (exencion): borra a proposito TODOS los gimnasios (incluido el 2, que siembran second-tenant.ts e iso-03), preservando solo admin@test.com. Filtrar por El Templo dejaria vivas filas del gimnasio 2 entre archivos del mismo worker (isolate: false)."
  - "El UPDATE users SET boarding_pass_used=0 de cleanAllTestData NO se anota: pasa a filtro (AND tenant_id = 1) porque apunta a una fila fija y ya unica (admin@test.com, siempre El Templo) — acotarla no cambia el comportamiento."
  - "test/fixtures/second-tenant.ts se dejo intacto: ya cumple todo lo que el plan pedia (inserts via tenantValues con tenantId explicito, limpiarSegundoGimnasio filtrada y FK-ordenada). Tocarlo sin necesidad hubiera violado la regla lockeada de la fase 171 (el fixture se consume, no se rediseña)."
  - "El hallazgo de auth/routes.ts NO se corrigio en este plan: el archivo no esta en files_modified (D-02), y la correccion requiere decidir COMO embeber una exencion legible por el sentinel en una cadena de Drizzle query builder — no hay precedente en el repo (todas las exenciones documentadas son sobre sql crudo). Documentado en deferred-items.md con opciones para quien lo resuelva."

requirements-completed: [ADO-02]

# Metrics
duration: ~70min
completed: 2026-08-08
---

# Phase 173 Plan 21: La infraestructura de test lista para el throw sobre `users` Summary

**`cleanAllTestData` sobrevive al throw del sentinel sobre las 8 tablas del módulo `members` (incluida `users`, la más joineada del sistema): sus dos statements sobre `users` —antes deliberadamente sin clasificar, con una nota escrita a nombre de esta fase por el piloto (172-13)— ahora TOMAN esa decisión (exención embebida en el SQL para el DELETE global, filtro `tenant_id = 1` para el UPDATE de una sola fila), la regla de decisión de 4 categorías queda escrita en la cabecera del archivo para que 173-22..25 la usen, y la sonda temporal —verificada en caliente con `members` puesto a mano en `TENANT_STRICT_MODULES`— confirma que `test/helpers.ts`, `test/setup.ts` y `test/fixtures/second-tenant.ts` no producen NINGÚN throw propio. La misma corrida destapó un hallazgo crítico fuera de alcance: `auth/routes.ts` (login/register) tiene 5 anotaciones `tenant-safe` que nunca llegan al SQL que ve el sentinel, así que login mismo hace throw en cuanto `users` es strict — documentado en `deferred-items.md`, no corregido acá.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-08-08
- **Tasks:** 2/2
- **Files modified:** 2 (`test/helpers.ts`, `test/setup.ts`) — `test/fixtures/second-tenant.ts` verificado sin cambios

## Accomplishments

- **La regla de decisión de 4 categorías está escrita donde el próximo la va a buscar**: un comentario de bloque en la CABECERA de `test/helpers.ts` (no solo junto a `cleanAllTestData`), con las 4 categorías del doc 07 §4(d) — limpieza global → exención, conveniencia acotable → filtro, lectura de evidencia → exención, tabla no strict → no se anota — y un contraejemplo explícito ("si alguien agrega acá un `tenant-safe` sobre un statement que SÍ se podría acotar, eligió la categoría equivocada").
- **Los dos statements de `users` de `cleanAllTestData` ya no son una decisión pendiente.** El `DELETE FROM users WHERE NOT (email <=> 'admin@test.com')` lleva `/* tenant-safe: limpieza global de la base de test (todos los gimnasios): borra todo socio/staff salvo admin@test.com, que sobrevive entre archivos del mismo worker */` embebido en el SQL — verificado que el patrón coincide byte a byte con el que `analyzeSql` reconoce (comentario de bloque entre el verbo y el `FROM`, motivo no vacío). El `UPDATE users SET boarding_pass_used = 0 WHERE email = 'admin@test.com'` pasó a `AND tenant_id = 1`: es un filtro, no una exención, porque apunta a una fila fija y ya única.
- **`createEligibleFreemium` tenía un throw esperándolo y nadie lo había visto** (mismo patrón que `ensureEfectivoCaja` en 172-13): su `INSERT INTO users` pasa por `app.db` sin `tenantValues`. Con `users` strict, cualquiera de sus ~23 call sites (todos de El Templo hoy) haría throw en cuanto se prenda el switch. Ahora acepta `overrides.tenantId` opcional (default 1) y estampa via `tenantValues`, preservando el comportamiento byte por byte para los call sites existentes.
- **`test/setup.ts`: `admin@test.com` estampa `tenant_id` explícito** en vez de confiar en el DEFAULT 1 de la columna — mismo riesgo (T-168-15) que ya mordió a `cash_registers` en la fase 172. Esta conexión es mysql2 propia (no pasa por `app.dbPool`), así que el sentinel nunca la habría visto hacer throw — se migra igual porque el riesgo real (estampar en el gimnasio equivocado) no depende de que haya un vigilante mirando (mismo razonamiento del 172-13 para este archivo).
- **`test/fixtures/second-tenant.ts` se auditó completo y se dejó SIN CAMBIOS.** Sus dos inserts de staff (`createStaffUser`) y los dos de socios (`createTestMember`) ya pasan `tenantId: TENANT_DOS` explícito; `limpiarSegundoGimnasio` ya filtra `WHERE tenant_id = ...` en cada DELETE, en orden FK-seguro (incluido el DELETE de `audit_log` que la propia 173-04 agregó cuando migró `shared/audit-log.ts`). No siembra directamente ninguna de las otras 4 tablas del módulo (`member_profiles`, `member_notes`, `member_logins`, `user_sepa_details`), así que no había nada que estampar ahí.
- **El patrón FK-safe de `cleanAllTestData`** (conexión única del pool + `FOREIGN_KEY_CHECKS=0` durante todo el loop) ya estaba correcto — verificado, no modificado.
- **Verificación EN CALIENTE, sin sonda** (el `<verify>` literal de ambas tasks): `pnpm typecheck:tests` sin deuda nueva (185/185, 0 discrepancias) y `pnpm exec vitest run --no-file-parallelism test/tenancy test/db` → **273/275 verdes**, con los **2 rojos exactamente los ya conocidos y owned por 173-30** (`con-06-lint.test.ts`, baseline de deuda vs. lo que 173-01..20 ya migró — el orquestador ya los tenía anotados antes de que empezara este plan).
- **Verificación EN CALIENTE, CON la sonda** (`members` + las 8 tablas puestas a mano en `TENANT_STRICT_MODULES`, revertida sin commitear): confirmó que **ninguno de mis 3 archivos produce un throw propio** — pero destapó que `auth/routes.ts` (login/register, NO es un archivo de este plan) sí lo hace, en cada login, arrastrando 148 de 275 tests a rojo por una causa completamente ajena a `test/helpers.ts`/`setup.ts`/`second-tenant.ts`. Ver "Hallazgo crítico" abajo y `deferred-items.md`.

## Task Commits

| Task | Nombre                                                  | Commit     | Archivos          |
| ---- | ------------------------------------------------------- | ---------- | ----------------- |
| 1    | `cleanAllTestData` y el resto de `test/helpers.ts`      | `f7809624` | `test/helpers.ts` |
| 2    | `test/setup.ts`, `second-tenant.ts` y la sonda temporal | `66fe08cf` | `test/setup.ts`   |

Los dos commits viven en `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`, sobre `37aeeeca` del plan 19). El SUMMARY + `deferred-items.md` van en el checkout principal, sin commitear (por instrucción explícita de esta ejecución).

## Files Created/Modified

- `el-templo-api/test/helpers.ts` — regla de decisión de 4 categorías en la cabecera; los 2 statements de `users` de `cleanAllTestData` clasificados (exención + filtro); `createEligibleFreemium` con `tenantId` explícito vía `tenantValues`.
- `el-templo-api/test/setup.ts` — `admin@test.com` estampa `tenant_id` explícito en el INSERT del provisioning por worker.
- `el-templo-api/test/fixtures/second-tenant.ts` — sin cambios (verificado que ya cumple).

## Decisions Made

1. **DELETE global de `users` → exención; UPDATE de una fila → filtro.** Aplicando la regla de 4 categorías caso por caso, no "una exención para todo `users`": el DELETE es deliberadamente cross-tenant (limpia el gimnasio 2 también), el UPDATE apunta a una fila fija que ya es única por email — acotarla con `tenant_id = 1` es más preciso y no cambia el comportamiento.
2. **`test/fixtures/second-tenant.ts` no se tocó.** Es un fixture lockeado desde la fase 171 ("se consume, no se rediseña"). La auditoría confirmó que ya satisface todo lo que el plan pedía; tocarlo sin necesidad habría sido una violación de esa regla, no una mejora.
3. **El hallazgo de `auth/routes.ts` se documentó, no se corrigió.** No es un archivo de `files_modified` (D-02, cirugía mínima), y la corrección correcta no es mecánica: requiere decidir un mecanismo nuevo (no hay precedente en el repo) para embeber una exención legible por el sentinel en una cadena de Drizzle query builder, en vez de un comentario TS que solo el lint ve. Se dejaron las opciones evaluadas (raw `sql` vs. helper con `sql.raw()`) para quien lo resuelva.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `createEligibleFreemium` no estampaba `tenantId`**

- **Found during:** Task 1 (revisión completa de `test/helpers.ts` pedida por el `<action>`)
- **Issue:** El `<action>` pide revisar "el resto de `test/helpers.ts`" por helpers que crean socios sin gimnasio explícito. `createEligibleFreemium` inserta en `users` (tabla que esta fase vuelve strict) sin `tenantValues`, vía `app.db` — el mismo pool que el sentinel envuelve.
- **Fix:** `overrides.tenantId` opcional (default 1) + `tenantValues` en el INSERT. Los ~23 call sites actuales (todos de El Templo) no cambian.
- **Files modified:** `test/helpers.ts`
- **Committed in:** `f7809624`

**2. [Rule 2 - Missing Critical] `admin@test.com` no estampaba `tenant_id` en `test/setup.ts`**

- **Found during:** Task 2
- **Issue:** El INSERT del provisioning por worker confiaba en el DEFAULT 1 de la columna. Mismo riesgo T-168-15 que ya mordió a `cash_registers` en la 172.
- **Fix:** `tenant_id` explícito (`TENANT_TEMPLO`, ya declarado en el archivo) en el INSERT.
- **Files modified:** `test/setup.ts`
- **Committed in:** `66fe08cf`

---

**Total deviations:** 2 auto-fixed (ambas Rule 2 — correctitud/completitud). Ninguna amplía el alcance declarado: las dos refuerzan exactamente lo que el plan pedía (que la infraestructura de test sobreviva al throw sin dejar gimnasios estampados por accidente).

## Issues Encountered

**Hallazgo crítico, documentado en `deferred-items.md`, NO corregido: `auth/routes.ts` no sobrevive al throw.** La verificación en caliente (sonda con `members` + las 8 tablas) mostró que **cualquier login** —incluido `admin@test.com`, no solo socios del gimnasio 2— devuelve 500, porque las 5 anotaciones `/* tenant-safe: ... */` de ese archivo (fase 173-15, líneas 82/99/125/475/657) son comentarios de TypeScript colgados sobre una cadena del query builder de Drizzle, y Drizzle nunca los reproduce en el SQL final que ve el sentinel — canal del LINT satisfecho, canal del SENTINEL no (D-17, distinción de canales de la fase 170). Esto **no es causado por este plan** (los 3 archivos que edité no producen throws propios, verificado), pero es un bloqueante real para que 173-22..25 puedan usar la sonda documentada más abajo: casi toda la batería ISO-03 pasa por `getAuthToken`/`registerUser`/`seedSecondTenant`, y todos esos caminos van a fallar en el login antes de llegar a medir lo que cada módulo necesita. Detalle completo, con opciones de arreglo evaluadas, en `deferred-items.md` (entrada `2026-08-08 — 173-21`).

**Nota sobre el conteo de `test/db/tenant-tables.test.ts` y `con-06-lint.test.ts` con la sonda encendida.** Además del hallazgo de arriba, dos gates de FORMA (no de throw) fallan por diseño en cuanto se agrega `members` a `TENANT_STRICT_MODULES` sin hacer el switch completo: (a) `tenant-tables.test.ts`'s "declara exactamente los módulos ya adoptados" (compara contra una lista hardcodeada que solo tiene `finance`) y (b) su D-15 ("ninguna tabla strict tiene entradas vivas en `tenant-lint-allowlist.json`" — hoy 79 entradas de las 8 tablas siguen ahí, a propósito, porque emparejar allowlist+strict es el trabajo del switch, 173-30). Estos DOS son esperados y NO indican throws de test — son coherencia de declaración, deliberadamente diferida.

## Sonda temporal — procedimiento reproducible para 173-22..25

1. **Pre-check obligatorio ANTES de encender:** `git -C /home/franco/projects/et-173 status --porcelain el-templo-api/src/db/tenant-tables.ts` tiene que salir **vacío**. Si no sale vacío, hay otra sonda viva — frenar, no revertir a ciegas.
2. **Encender:** editar `el-templo-api/src/db/tenant-tables.ts`, agregar a `TENANT_STRICT_MODULES`:
   ```ts
   members: [
     "audit_log", "member_logins", "member_notes", "member_profiles",
     "user_branches", "user_sepa_details", "user_status_history", "users",
   ],
   ```
3. **Correr** (foreground, `--no-file-parallelism` es MÁS RÁPIDO con un solo worker — la base de MySQL por worker cuesta ~96s, se paga una sola vez):
   ```bash
   cd el-templo-api && pnpm exec vitest run --no-file-parallelism <archivos-a-medir>
   ```
   Correr `prettier --write` **antes** de la corrida larga, no después.
4. **Apagar SIEMPRE, se haya usado o no el resultado:** revertir el archivo (`Edit` quitando el bloque agregado, o `git checkout -- el-templo-api/src/db/tenant-tables.ts` si el archivo no tiene NINGÚN otro cambio propio sin commitear).
5. **Post-check obligatorio:** `git -C /home/franco/projects/et-173 status --porcelain el-templo-api/src/db/tenant-tables.ts` tiene que quedar **vacío**. La sonda **nunca** se commitea: si entra a un commit, el gate D-15 tumba ese commit y la suite queda roja hasta el 173-30.
6. **Antes de confiar en el resultado:** resolver primero el hallazgo de `auth/routes.ts` de arriba (o acotar la corrida a archivos que no dependan de un login real), o la señal de "qué le falta a MI módulo" va a quedar enterrada bajo 148 rojos de una causa ajena.
7. **El error llega envuelto:** un `catch` sobre una llamada al ORM nunca ve `TenantSentinelError` directo — hay que mirar `.cause`, o (si el error cruzó por una respuesta HTTP, como en los tests que usan `app.inject`) el `message` de la respuesta 500 ya contiene el texto `"Failed query: ..."` de Drizzle, suficiente para identificar la tabla y el statement.

## Next Phase Readiness

**Listo para 173-22..25** en cuanto a la infraestructura compartida (`test/helpers.ts`, `test/setup.ts`, `test/fixtures/second-tenant.ts`): los tres sobreviven al throw, verificado con la sonda encendida.

**Bloqueante real para que la sonda sea ÚTIL (no para que exista):** el hallazgo de `auth/routes.ts` de "Issues Encountered". Recomiendo que se resuelva temprano en la ola de endurecimiento (173-22 o un plan chico dedicado), no que se difiera al switch (173-30), porque sin login funcionando bajo la sonda, 173-22..25 no pueden medir su propio avance con esta técnica.

**Sin blockers para el alcance propio de este plan.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-21-SUMMARY.md`
- `FOUND` commits `f7809624` (Task 1) y `66fe08cf` (Task 2) en `feat/173-adopcion-members` (`git log --oneline` en `/home/franco/projects/et-173`)
- `VERIFIED` `pnpm typecheck:tests` — 0 discrepancias (185/185 conocidos, sin deuda nueva)
- `VERIFIED` `pnpm exec vitest run --no-file-parallelism test/tenancy test/db` (sin sonda) — 273/275, los 2 rojos son los ya conocidos (`con-06-lint.test.ts`, owned 173-30)
- `VERIFIED` `grep -c "tenant-safe" test/helpers.ts` → 8 (≥ 8 pedido)
- `VERIFIED` con la sonda encendida y revertida: `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío al terminar
- `VERIFIED` `git diff --diff-filter=D --name-only HEAD~1 HEAD` vacío en ambos commits (sin borrados accidentales)
- `VERIFIED` `git status --porcelain` en `et-173` vacío tras los 2 commits

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
