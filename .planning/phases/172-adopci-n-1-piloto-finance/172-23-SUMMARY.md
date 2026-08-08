---
phase: 172-adopci-n-1-piloto-finance
plan: 23
subsystem: docs
tags:
  [
    tenancy,
    finance,
    receta,
    adopcion,
    d-11,
    doc-no-versionado,
    cierre-de-fase,
    pendientes-heredados,
  ]

# Dependency graph
requires:
  - plan: 172-01
    provides: "la advertencia de que .docs/ NO esta versionada y este doc se escribe en el checkout principal"
  - plan: 172-19
    provides: "los 3 insumos del cierre: la sede virtual propia, el bloqueo del alta y la fuga de autocompletar"
  - plan: 172-20
    provides: "EXCEPCIONES_NOMBRADAS exportada y la plantilla del gate de cobertura"
  - plan: 172-21
    provides: "el switch, la reconciliacion 47 vs 51 y el hallazgo del sentinel por-query"
  - plan: 172-22
    provides: "el estado real de la rama en staging (CI verde, D-12 vacio, UAT ok) y el patron FK-safe de la limpieza"
provides:
  - ".docs/saas-multitenancy/07-receta-adopcion.md — la receta repetible de adopcion por modulo (D-11), 348 lineas, 7 secciones, destilada de los 22 SUMMARY del piloto"
  - "El estado de cierre de la fase escrito donde el proximo agente lo va a leer: rama, worktree, sin-migraciones y los pendientes heredados"
affects: [173, 174, 175, 176]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un doc de receta se escribe DESPUES del cierre y leyendo los SUMMARY, no antes leyendo los planes: la diferencia entre los dos es exactamente lo que la receta tiene que decir"
    - "El doc vive en .docs/, que esta en .gitignore: no es untracked, es IGNORADO — no puede entrar en un commit ni por accidente, y por eso no existe en ningun worktree"

key-files:
  created:
    - .docs/saas-multitenancy/07-receta-adopcion.md
  modified: []

key-decisions:
  - "El numero de entradas borradas que va en la receta es 51 y no 47: el plan pedia 47 (el criterio contaba 33 sobre tablas strict + 14 no-finance en archivos del modulo) pero el lint reporto 51 stale. Las 4 de diferencia son colaterales de los planes 02 y 04 (tablas JOINEADAS en queries que se scopearon). La receta usa 51 Y explica la diferencia, porque la leccion no es el numero sino que el criterio de un plan es un PISO"
  - "Se agrego una seccion 0 (definicion operativa de 'modulo adoptado') fuera de las 7 que pedia el plan: sin ella la receta arranca con precondiciones sin haber dicho de que es precondicion"
  - "Los 3 insumos del 172-19 (sede virtual propia, bloqueo del alta, fuga de autocompletar) NO se agruparon en una seccion propia: la sede virtual va en §1.4 (es precondicion del GIMNASIO, no del modulo) y las otras dos son deuda de la 173, no receta — quedan en este SUMMARY y en deferred-items.md"
  - "REQUIREMENTS.md NO se toco, misma convencion que el 172-20: ISO-01/ISO-02 siguen Pending con la 171 en master y ningun docs(172-XX) de la fase lo modifico. Es contabilidad de cierre de milestone"
  - "La fase NO se marca completa en ROADMAP (checkbox de fase ni fecha): eso lo hace la verificacion, no el ultimo plan"

patterns-established:
  - "Receta de adopcion como artefacto de cierre de fase: la escribe el ultimo plan, leyendo los SUMMARY de los anteriores, con la regla de que todo numero esta medido y toda trampa esta fechada en el plan que la pago"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-31
---

# Phase 172 Plan 23: La receta de adopción, y el cierre de la fase Summary

**`.docs/saas-multitenancy/07-receta-adopcion.md` existe: 348 líneas, 7 secciones numeradas, 13 archivos concretos del repo nombrados y todos los números medidos — 23 planes, 52 commits, 88 archivos, 51 entradas de allowlist borradas, 38 rutas ISO-03, 0 migraciones. Está destilada de los 22 SUMMARY del piloto y no de los 22 planes, que es exactamente el punto: la diferencia entre lo que los planes decían y lo que pasó es el contenido de la receta. La corrección más cara quedó escrita con su explicación (el plan mandaba borrar **47** entradas de allowlist y eran **51**), y con ella la regla que la generaliza: el criterio de un plan es un PISO, no un techo — corré el lint y listá las stale reales antes de borrar. Con esto la fase 172 queda con sus 23 planes ejecutados y a la espera de verificación.**

## Performance

- **Duration:** ~35 min (lectura de los 22 SUMMARY + el doc)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`)
- **Files:** 1 creado (348 líneas) — **cero archivos versionados**, cero archivos de `src/`, cero de `test/`

## Task Commits

| Task | Nombre                              | Commit | Archivos                                                             |
| ---- | ----------------------------------- | ------ | -------------------------------------------------------------------- |
| 1    | escribir la receta con lo aprendido | —      | `.docs/saas-multitenancy/07-receta-adopcion.md` (**no commiteable**) |
| 2    | cerrar los cabos sueltos de la fase | —      | este SUMMARY                                                         |

**Ninguna de las dos tasks produce un commit de código, y es lo correcto.** `.docs/` está en `.gitignore:22`, así que el doc **no es untracked: es IGNORADO** — `git status --porcelain .docs/` sale **vacío** y `git check-ignore -v` lo confirma. No puede entrar en un commit ni por accidente, y por eso tampoco existe en ningún worktree. El único commit de este plan es el de metadata (`SUMMARY` + `STATE` + `ROADMAP`).

## Task 1 — la receta

### Verificación de los criterios de aceptación

| Criterio                                                             | Resultado                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| El archivo existe en `.docs/saas-multitenancy/`                      | ✅                                                                                                                  |
| ≥ 120 líneas                                                         | ✅ **348**                                                                                                          |
| Las 7 secciones numeradas                                            | ✅ **7** (`grep -c "^## [1-7]\."`), más una §0 de definición operativa                                              |
| ≥ 6 archivos concretos del repo                                      | ✅ **13**                                                                                                           |
| Números reales del piloto                                            | ✅ 23 planes · 52 commits · 88 archivos (+12.136/−2.222) · **51** entradas · **38** rutas · 501→450 · 0 migraciones |
| `git status --porcelain .docs/` no lo muestra staged                 | ✅ vacío (está **ignorado**, ni siquiera aparece como untracked)                                                    |
| Cabecera con fecha y estado, formato de `06-estrategia-migracion.md` | ✅                                                                                                                  |

### Los 13 archivos que la receta nombra

`transaction-service.ts` · `reports/service.ts` · `cash-register-service.ts` · `coach-load-routes.ts` · `finance/routes.ts` · `auth/routes.ts` · `src/db/tenant-tables.ts` · `src/db/sentinel/analyze.ts` · `tenant-lint-allowlist.json` · `src/scripts/snapshot-finance-endpoints.ts` · `test/helpers.ts` · `test/tenant-manifest.ts` · `test/fixtures/second-tenant.ts` · `test/tenancy/iso-03-cobertura.test.ts`.

### La corrección al plan que la receta lleva escrita

El `<action>` del plan pedía escribir **"47 entradas borradas"**. El número real es **51**, y la diferencia importa más que el número:

- El criterio del plan (33 entradas sobre tablas strict + 14 no-finance en archivos del módulo) da **exactamente 47** medido sobre el árbol — el plan no contó mal lo que contó.
- `pnpm lint:tenant` reportaba **51** `staleNoLongerViolating`. Las 4 de diferencia (`analytics/ltv-service.ts|users`, `analytics/ticket-service.ts|subscription_plans`, `analytics/ticket-service.ts|subscriptions`, `coach/service.ts|users`) son **colaterales** de los commits `6fe25129` (172-02) y `5b0db52b` (172-04): tablas **joineadas** en las mismas queries que se scopearon, que el motor del lint cuenta como accesos propios.
- Dejarlas habría dejado el lint **rojo** igual que agregarlas (una entrada stale es discrepancia, D-14).

La receta usa 51, explica la diferencia y generaliza la lección en §2 y en el checklist de §6: **el criterio del plan es un piso, corré el lint y listá las stale REALES antes de borrar**.

### Los insumos que no estaban en ningún plan previo

Cinco cosas entraron a la receta porque las produjeron los últimos planes y no existían cuando la fase se planificó:

1. **Un gimnasio nuevo necesita su propia sede virtual "Templo Online"** (172-19). Va en **§1.4**, deliberadamente separada de las precondiciones del módulo: es precondición del **gimnasio**, y su lugar natural es el checklist de onboarding del tenant 2.
2. **El sentinel de runtime evalúa por QUERY, no por tabla** (172-21). Sección propia (**§4h**), con las tres consecuencias juntas: el sentinel no cubre las queries multi-tabla, la lente estática del lint sí es por tabla, y **el switch descansa en las dos**. De ahí sale la regla operativa de que la sonda de la demo va sobre una query de **una sola tabla** y sobre un método que algún test ejercite.
3. **El orden de commits del switch: allowlist PRIMERO, entrada strict DESPUÉS** (172-21), con el motivo (el gate D-15 se cae mientras conviven) y los dos mensajes de commit copiables.
4. **`--no-file-parallelism` es MÁS RÁPIDO**, no una concesión (172-21): `test/setup.ts` provisiona una base por worker a ~96 s y con un worker se paga una vez.
5. **El patrón FK-safe de la limpieza de `beforeEach` y el re-barajado de workers de CI** (172-22): conexión única del pool con `FOREIGN_KEY_CHECKS = 0`, y la advertencia de que **agregar archivos de test puede detonar una bomba FK latente en un archivo que nadie tocó** — con el caso real, que puso CI rojo y no era el sentinel.

### Desviación de forma: hay una sección 0

El plan pedía 7 secciones. Se agregó una **§0 "Qué significa adoptar un módulo"** con las cinco condiciones que tienen que cumplirse juntas. Sin ella la §1 arranca listando precondiciones sin haber dicho de qué son precondición, y el criterio de terminado —que es el corazón de la receta— quedaba repartido entre la §2 y el checklist. Las 7 secciones pedidas están las 7, numeradas 1-7.

## Task 2 — el estado de cierre de la fase

### Rama y worktree

- **Rama `feat/172-adopcion-finance`**, worktree `/home/franco/projects/et-172`, base `a6272df0` (= `origin/master` con CR-CAJA adentro). **52 commits de código**, `git diff --shortstat` contra la base: **88 archivos, +12.136 / −2.222**.
- **EN STAGING**, con CI verde: merges **`387c0aaf`** (la fase entera) y **`211c0003`** (el fix FK-safe `2579bc6b`). El suite completo pasa **con el sentinel en throw**.
- **PENDIENTE de tren a master.** Es una **decisión aparte y del usuario**, no de esta fase: staging-first estricto. Nada de esta fase se mergea a master sin que Franco lo pida explícitamente.
- **El worktree `/home/franco/projects/et-172` queda VIVO hasta el UAT en producción.** No borrarlo al cerrar la fase: tiene el `node_modules` propio, el `.env` y —sobre todo— es donde se reproduce cualquier cosa que aparezca en el UAT de prod sin tocar el checkout principal.

### La fase NO aplicó migraciones

**Cero migraciones en los 23 planes.** La adopción es 100% código: las columnas `tenant_id` las puso la fase 167 y las uniques compuestas la 168. **El tope de numeración no se movió** — la 166 aplicó `0190` y `0191`, la 168 aplicó hasta `0196`, y **la próxima fase que necesite una migración reserva desde `0197`**, igual que si esta fase no hubiera existido.

### Pendientes heredados (para el próximo agente)

| #   | Pendiente                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Dueño                                     | Ancla                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | **`aura_balances` / `aura_transactions` siguen FUERA de `TENANT_STRICT_MODULES`** — se llaman como tablas de plata pero son de gamification, y una tabla entra a la lista cuando su **módulo dueño** la migra entera, no cuando su nombre encaja en un rubro (D-05). El docblock de `tenant-tables.ts` lo dice con su motivo, para que no se lea como un olvido.                                                                                                            | fase de gamification (fuera de v6.0 core) | docblock de `src/db/tenant-tables.ts`                                                          |
| 2   | **El resto de los módulos se migra en 173-175**: `members` (173), `subscriptions` + `scheduling` (174), `analytics` + resto del core (175). La allowlist quedó en **450 entradas** — todas de módulos sin migrar.                                                                                                                                                                                                                                                           | 173/174/175                               | `tenant-lint-allowlist.json`                                                                   |
| 3   | **El `DEFAULT 1` de `tenant_id` sigue en pie** en las 87 tablas gym-owned. Es lo que hace que una escritura sin `tenantValues` nazca en El Templo en silencio (T-168-15) en vez de reventar. Sacarlo es una decisión de cierre de milestone, no de una fase de adopción.                                                                                                                                                                                                    | cierre de v6.0                            | `src/db/schema/tenant-column.ts`                                                               |
| 4   | **🔴 FUGA VIVA — `GET /coach-load/autocompletar/:userId`** devuelve `planName`, `amount`, `currency` y `currentEndDate` de un socio de **otro gimnasio**, al rol **coach**: `getMemberSubscription(userId)` es la única llamada del handler sin `ctx` (`subscriptions/service.ts` ~L919). Fuera de alcance por D-07 (`subscriptions` no es tabla strict de finance). Severidad hoy: ninguna (un solo gimnasio en prod). **Bloqueante al onboardear el segundo.**            | **fase 173**                              | el `it` "FUGA CONOCIDA" de `iso-03-finance-coach-load.test.ts` — al arreglarlo se pone en ROJO |
| 5   | **BLOQUEO DE ADOPCIÓN — `POST /coach-load/alta`** no es usable por un gimnasio que no sea El Templo: `assignPlan` inserta `subscriptions` sin `tenantValues` (~L1592) → la sub nace con el `DEFAULT 1` y el charge, bien filtrado, la rechaza y rollea todo. Fail-closed, no es fuga.                                                                                                                                                                                       | **fase 173**                              | el `it` "limitacion conocida" del mismo archivo                                                |
| 6   | **`canAccessBranch` (`src/modules/shared/branch-access.ts`) resuelve la sede sin filtro de gimnasio**: para un admin decide por **país**, así que `requireBranchAccess` deja pasar una sede ajena del mismo país. En finance lo frena el guard del handler, pero **toda ruta que use ese preHandler como único guard de sede es un agujero**.                                                                                                                               | **fase 173** o un plan propio             | documentado en el caso de `POST /transactions` de `iso-03-finance-transacciones.test.ts`       |
| 7   | **`REQUIREMENTS.md` está atrasado para TODA la familia ISO**: `ISO-01` e `ISO-02` siguen `Pending` aunque la fase 171 los entregó y están en master, y ningún `docs(172-XX)` de esta fase lo tocó. Además, la letra de `ISO-03` ("no expone ni escribe datos del tenant B") choca con el pendiente #4 hasta que la 173 lo arregle. **Es contabilidad de cierre de milestone, en un solo pase, y hay que decidir si ISO-03 se marca con esa fuga viva o después de la 173.** | cierre de v6.0                            | `deferred-items.md` (anotado desde el 172-20)                                                  |

**Backlog no-tenancy que salió del UAT** (fuera de fase, del front): exponer `validationStatus` en el listado de cobros y renderizar el chip real Validado/Pendiente — hoy `CobrosPage.vue:70` hardcodea "Pendiente" para toda fila no anulada (deuda WR-03 declarada en su propio comentario).

### Punteros

- **La receta:** `/home/franco/projects/el-templo/.docs/saas-multitenancy/07-receta-adopcion.md`. ⚠️ **No está versionada** (`.gitignore:22`) — vive **solo** en el checkout principal y no existe en ningún worktree. Las fases 173-175 la abren desde ahí; si el checkout se pierde, se pierde la receta.
- **Dónde se agregan las rutas nuevas:** `el-templo-api/test/tenancy/iso-03-cobertura.test.ts`. El gate **deriva** las rutas del `TENANT_MANIFEST` por prefijo, así que una ruta finance nueva **se reclama sola** en cuanto el gate ISO-01 la obliga a clasificarse: hay que escribirle el `describe` con la clave literal del manifiesto (`<MÉTODO> <url>`) y sus dos `it` (aislamiento + control positivo), y subir `CASOS_BASELINE`. `EXCEPCIONES_NOMBRADAS` está **exportada** y hoy tiene una sola entrada (`GET /api/admin/analytics/advanced-finance`, dueño fase 175).
- **La plantilla del gate** para cuando 173-175 cierren su propia batería es ese mismo archivo: se copia cambiando **una constante** (el prefijo del módulo) y la lista de archivos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug del plan] El número de entradas de allowlist del `<action>` era 47 y el real es 51**

- **Found during:** Task 1
- **Issue:** el `<action>` del plan pide escribir "entradas de allowlist borradas (**47**)". El 172-21 midió **51** con el lint y borró las 51 (501 → 450). Escribir 47 en el doc canónico de las fases 173-175 habría propagado un número que el propio piloto ya había corregido, y —peor— habría enterrado la lección que lo generaliza.
- **Fix:** la receta dice **51**, explica de dónde salen las 4 de diferencia (colaterales de tablas joineadas, commits `6fe25129` y `5b0db52b`) y convierte el hallazgo en regla: el criterio de un plan es un piso, se corre el lint y se listan las stale reales antes de borrar. Aparece en §2, en §7 y en el checklist de §6.
- **Files modified:** `.docs/saas-multitenancy/07-receta-adopcion.md`
- **Commit:** — (archivo ignorado)

### Desviaciones de alcance (menores, documentadas)

**2. Hay una §0** de definición operativa además de las 7 secciones pedidas. Ver arriba.

**3. Los conteos de commits y de diff son los MEDIDOS ahora, no los del enunciado.** El plan hablaba de "~51 commits" y de "+12.100/−2.211": lo medido contra `a6272df0` da **52 commits** y **+12.136/−2.222**. La diferencia es exactamente el fix FK-safe `2579bc6b`, que entró **después** del merge `387c0aaf` (que sí fue 88 archivos / +12.100/−2.211). La receta escribe los dos números con esa explicación, porque "51 al mergear + 1 fix que destapó CI" es más útil que cualquiera de los dos solo.

**4. `REQUIREMENTS.md` no se tocó**, misma convención que el 172-20 y que toda la fase. Queda como pendiente #7.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 3 de alcance. Ninguna cambia lo que la fase construye.

## Issues Encountered

**El doc no se puede verificar con `git status`.** `.docs/` está en `.gitignore`, así que el archivo **no aparece** ni como untracked. El criterio del plan ("`git status --porcelain .docs/` no lo muestra staged") se cumple de forma más fuerte que la esperada, pero conviene decirlo con todas las letras para que nadie lea la salida vacía como "el archivo no se escribió": la verificación correcta es `test -f` + `wc -l` + `git check-ignore -v`, las tres corridas.

**Este plan no corrió un solo test ni tocó el worktree `et-172`.** No cambia código, así que no hay nada que vitest pueda decir. La verificación de la fase la dio el 172-22 (CI verde en staging con el sentinel en throw, diff D-12 vacío, UAT del staff aprobado).

## Deferred Issues

Los 7 pendientes heredados están en la tabla de arriba y en `deferred-items.md`. Ninguno es de este plan; los cuatro que tienen dueño asignado (4, 5, 6 → fase 173) están **anclados con aserciones ejecutables** que se ponen en rojo el día que se arreglen.

## Threat Flags

Ninguno. Este plan no toca código, no crea rutas, no cambia permisos, no toca schemas, no instala paquetes y no modifica un solo archivo versionado del repo.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-23-01 | ✅ el doc se escribió **después** del cierre, leyendo los 22 SUMMARY (no los planes), y nombra 13 archivos concretos y 8 números medidos. La corrección 47 → 51 es la prueba de que se leyó lo que pasó y no lo que se planeó |
| T-172-23-02 | ✅ el doc es de procedimiento: no incluye un solo dato de socio, monto real ni credencial                                                                                                                                     |
| T-172-SC    | ✅ este plan no instaló nada                                                                                                                                                                                                  |

## Next Phase Readiness

**La fase 172 queda con sus 23 planes ejecutados y a la espera de VERIFICACIÓN** (`/gsd:execute-phase 172` corre el verifier). La fase **no** se marca completa en el ROADMAP desde este plan: eso lo hace la verificación.

Lo que sigue después, en orden y como decisiones separadas:

1. **Verificación de la fase.**
2. **Tren a master** — decisión del usuario, staging-first estricto. La rama está en staging con CI verde desde el 172-22.
3. **UAT en producción**, con el worktree `et-172` todavía vivo.
4. **Fase 173 (members)**, que arranca con **dos rojos esperándola** y son buenos rojos: al pasarle `ctx` a `getMemberSubscription` y `tenantValues` al insert de `assignPlan`, los dos `it` anclados de `iso-03-finance-coach-load.test.ts` se ponen en rojo y hay que convertirlos en casos de aislamiento y control normales. Está escrito adentro de cada uno. Y con `07-receta-adopcion.md` abierto: el orden, la forma y las trampas ya no se discuten.

**Sin blockers.**

## Self-Check: PASSED

Archivos:

```
FOUND: /home/franco/projects/el-templo/.docs/saas-multitenancy/07-receta-adopcion.md (348 líneas)
FOUND: .planning/phases/172-adopci-n-1-piloto-finance/172-23-SUMMARY.md
IGNORADO (correcto): git check-ignore -v → .gitignore:22 .docs/
VACÍO (correcto): git status --porcelain .docs/
```

Verificaciones del doc:

```
7   secciones numeradas (grep -c "^## [1-7]\.")
13  archivos concretos del repo nombrados (pedía ≥ 6)
348 líneas (pedía ≥ 120)
51 / 38 / 23 / 501 / 450 / 88 / 0 migraciones — todos presentes y medidos
```

Commits: este plan **no produce commits de código** por diseño. El único es el de metadata (`172-23-SUMMARY.md` + `STATE.md` + `ROADMAP.md`).

**ADO-01 e ISO-03 no se marcan desde este plan.** ADO-01 exige `finance` adoptable por un gimnasio nuevo y `POST /coach-load/alta` todavía no lo es (deuda de `subscriptions`, fase 173); ISO-03 tiene sus 38 rutas con caso y su gate, pero la letra del requisito choca con la fuga viva de `/coach-load/autocompletar`. Las dos son decisiones de **cierre de milestone** y están anotadas como pendiente #7.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
