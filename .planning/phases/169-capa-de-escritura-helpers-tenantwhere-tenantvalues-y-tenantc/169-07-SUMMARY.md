---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 07
subsystem: backend
tags:
  [multi-tenancy, cli, fail-closed, exencion-anotada, exit-codes, vitest, tdd]

# Dependency graph
requires:
  - plan: 169-01
    provides: "tenantWhere, tenantValues y el tipo TenantContext en src/modules/shared/tenant.ts"
  - plan: 169-06
    provides: "dependencia OPERATIVA (worktree único + tests serializados), no lógica"
provides:
  - "src/db/scripts/require-tenant.ts: el --tenant=<id> obligatorio de los scripts CLI que escriben tablas gym-owned, con exit code 2 por error de uso y validación de existencia contra la DB (D-06)"
  - "Contrato D-07 escrito en el docblock: el CLI NO exige status active, a diferencia de los crons y del webhook"
  - "scripts/seed-onboarding-aura.ts como ejemplar de tenantWhere + tenantValues en un camino sin request"
  - "Las 6 exenciones de scripts de plataforma, grepeables por `tenant-safe:` y con motivo escrito"
  - "test/unit/require-tenant.test.ts: 16 tests que no abren ninguna conexión, con gate RED real previo a la implementación"
affects:
  - "169-08, 169-09 (para CON-04 ya no queda ningún camino sin request: sólo la auditoría D-08/D-09 y el gate consolidado)"
  - "170 (el sentinel + lint de CI leen las 6 anotaciones sembradas acá; hoy son 8 en toda la fase con las de tv_pairings y seedTemplates)"
  - "172-175 (todo script de escritura nuevo de la adopción se cuelga de este helper en vez de inventar su propio parseo)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capa de datos INYECTADA (TenantQueryFn) en vez de una conexión propia: es lo que hace testeable toda la validación sin MySQL, mismo idioma que el QueryFn de verify-tenant-uniques.ts"
    - "Error de USO como clase propia con exitCode 2 adentro (TenantArgError), en vez de números sueltos repartidos por los call sites"
    - "El parámetro argv es opcional con default process.argv.slice(2): el script no pasa nada y el test pasa todo"
    - "Aserción de AUSENCIA del id en el string del SQL, no sólo de presencia en params: sin eso una interpolación pasa en verde"
    - "Anotación de exención como comentario de bloque separado, INMEDIATAMENTE después del docblock de cabecera — un /* */ no puede anidarse dentro de un /** */"

key-files:
  created:
    - el-templo-api/src/db/scripts/require-tenant.ts
    - el-templo-api/test/unit/require-tenant.test.ts
  modified:
    - el-templo-api/scripts/seed-onboarding-aura.ts
    - el-templo-api/src/db/run-migrations.ts
    - el-templo-api/src/db/scripts/verify-tenant-backfill.ts
    - el-templo-api/src/db/scripts/verify-tenant-uniques.ts
    - el-templo-api/src/db/seed.ts
    - el-templo-api/src/db/seed-spom.ts
    - el-templo-api/scripts/wellhub-sandbox.ts

key-decisions:
  - "Este plan SÍ hizo gate RED real (test commiteado fallando por módulo inexistente) antes de la implementación, a diferencia de los planes 01 a 06 de la fase, que registraron el orden inverso. El helper es puro y sin DB, así que el ciclo costaba 3 segundos"
  - "El `as const` que el retrofit necesitaba en teoría NO hace falta: se verificó con tsc que tenantValues preserva los tipos literales, así que el enum de Drizzle compila sin él. Se sacó y quedó escrito en el archivo, porque las fases 172-175 van a envolver cientos de INSERT con enums"
  - "La anotación de exención va en un comentario de bloque APARTE, pegado abajo del docblock de cabecera: el formato canónico es /* tenant-safe: … */ y un comentario de bloque no se puede anidar dentro del /** */ existente"
  - "requireTenant devuelve el tenantId PARSEADO y no el `id` de la fila: son el mismo valor por construcción de la query, y usar el parseado deja el tipo `number` sin narrowing de un `unknown` de MySQL"
  - "El aviso de D-07 compara POSITIVAMENTE contra 'active' (mismo criterio que listActiveTenants y country-scope): un estado futuro del enum también dispara el aviso en vez de colarse en silencio"

metrics:
  duration: "~18min"
  completed: 2026-07-28
---

# Phase 169 Plan 07: Scripts CLI — `--tenant` obligatorio y las 6 exenciones Summary

La última superficie sin request de CON-04 queda cerrada: un script que escribe una tabla gym-owned ahora exige `--tenant=<id>`, verifica contra la DB que ese gimnasio exista antes de tocar una sola fila, y los seis scripts de plataforma que no lo necesitan dicen por escrito por qué.

## Performance

- **Duration:** ~18 min
- **Tasks:** 2 (3 commits de código + el gate RED)
- **Files:** 2 creados, 7 modificados
- **Tests:** 16 verdes en `test/unit/require-tenant.test.ts`

## Tasks Completed

| Task | Nombre                                          | Commit                    | Archivos                                                               |
| ---- | ----------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| 1    | Helper `require-tenant.ts` + test (RED → GREEN) | `e1fa91f4` → `978402e1`   | `test/unit/require-tenant.test.ts`, `src/db/scripts/require-tenant.ts` |
| 2    | Retrofit del ejemplar + 6 anotaciones           | `df2455bc` (+ `d980234f`) | `scripts/seed-onboarding-aura.ts` y los 6 exentos                      |

## Task 1 — el helper, con gate RED de verdad

**El ciclo TDD se respetó literalmente, y es la primera vez en la fase.** El test se escribió primero, se corrió contra un módulo que no existía (`Cannot find module '../../src/db/scripts/require-tenant'`, 3,2 s) y **ese fallo se commiteó** (`e1fa91f4`) antes de escribir una línea de implementación. Los planes 01 a 06 registraron el orden inverso porque sus tests eran MySQL-backed y cada vuelta costaba 100 s; acá el helper es puro y el ciclo costaba segundos, así que no había excusa.

**Superficie pública, exacta a la tabla de `<interfaces>`:**

| Export                  | Forma                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `TenantQueryFn`         | `(sql, params?) => Promise<Array<Record<string, unknown>>>`                               |
| `TenantArgError`        | `extends Error` con `readonly exitCode = 2`                                               |
| `queryFnFromConnection` | adapta la `Connection` de `mysql2/promise` que devuelve `createSingleConnection()`        |
| `parseTenantArg`        | `--tenant=<id>` y `--tenant <id>`; rechaza ausente, vacío, no-numérico, no-entero, `<= 0` |
| `requireTenant`         | parsea → `SELECT id, status FROM tenants WHERE id = ?` → `{ tenantId }`                   |
| `failTenantArg`         | stderr + `process.exit(2)` para uso, `1` para el resto                                    |

**Los dos contratos que no son obvios y por eso están probados aparte:**

1. **El id viaja parametrizado (T-169-34).** El test afirma que `params` es `[777]` **y que el string del statement NO contiene `777`**. La segunda mitad es la que importa: una implementación que interpolara el id en el SQL _y además_ lo pasara por `params` habría pasado una aserción de sola inclusión.
2. **Un gimnasio no activo NO corta (D-07).** El test recorre los **dos** estados no activos del enum (`suspended` y `archived`), afirma que los dos resuelven el contexto igual y que los dos avisan por `console.warn` exactamente una vez. Un helper que cortara sólo con `suspended` pasaría un test que probara nada más ese valor. El docblock deja escrito que la diferencia con el criterio de los crons y del webhook —que sí filtran sólo activos— es **la decisión y no un olvido**, para que nadie lo "unifique" después: el CLI es tooling de operador y un gimnasio suspendido sigue necesitando exports y limpiezas.

**Un test extra que el plan no pedía:** que con el flag ausente `requireTenant` **no llegue a consultar la DB** (`calls` vacío). El valor del helper es cortar mientras cortar todavía no cuesta nada; que corte "en algún momento" no alcanza.

**El docblock** lista los 6 scripts exentos con su motivo, explica los códigos de salida heredados de `verify-tenant-uniques.ts` (0/1/2), y declara lo que el helper **no** hace: no verifica contra qué base se está corriendo (T-169-37, aceptado — staging y prod comparten host MySQL), con el puntero al guard `SELECT DATABASE()` para quien agregue un script de escritura nuevo.

## Task 2 — el ejemplar y las 6 exenciones

**`scripts/seed-onboarding-aura.ts`** llama a `requireTenant(queryFnFromConnection(connection))` **antes de la primera query** (línea 34, contra la primera query en la 41), usa `and(tenantWhere(auraConfig, ctx), eq(auraConfig.sourceType, …))` con `tenantWhere` como **primer término** —la convención del doc 03 §3— y `tenantValues(ctx, {...})` en el INSERT. Los dos `console.log` nombran el `tenantId`, así que el operador ve en qué gimnasio escribió, y el `main().catch` pasa por `failTenantArg(err, "seed-onboarding-aura")` para que la falta del flag salga con **2** y no con el **1** genérico de antes. El docblock cambió la línea de uso a `--tenant=1` y agrega que el script es idempotente **por gimnasio**.

**Las 6 anotaciones** llevan el motivo textual de la tabla del plan más una línea que aclara que la fase 170 (sentinel + lint de CI) es la que las lee. Van en un comentario de bloque **aparte**, pegado abajo del docblock de cabecera: el formato canónico es `/* tenant-safe: … */` y un comentario de bloque no se puede anidar dentro del `/** */` que esos archivos ya tienen. `seed.ts` y `seed-spom.ts` no tenían docblock de cabecera, así que la anotación quedó como primeras líneas del archivo.

**Cero cambio de comportamiento en los 6**, verificado por `git diff --numstat` sobre el commit: `7 insertions, 0 deletions` en cada uno de los seis.

## Verificación

| Verificación                                                            | Resultado                                  |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| `npx tsc --noEmit`                                                      | **exit 0** (después de cada task)          |
| `npx vitest run test/unit/require-tenant.test.ts --no-file-parallelism` | **16 passed**                              |
| Gate RED previo (mismo comando, sin el helper)                          | **1 failed**, `Cannot find module`         |
| `exitCode = 2` fuera de comentarios en `require-tenant.ts`              | 1 (≥ 1, como exige el plan)                |
| Patrón `throw` ligado a `status`/`active` fuera de comentarios          | **0** (D-07: no corta)                     |
| `tenant-safe:` en los 6 scripts exentos                                 | 6/6, cada uno con su motivo                |
| `git diff --numstat` de `run-migrations.ts`, `seed.ts`, `seed-spom.ts`  | **0 líneas borradas**                      |
| Cero `any` explícito en los 3 archivos del plan                         | OK                                         |
| `git diff --diff-filter=D` post-commit                                  | sin borrados en ninguno de los 3           |
| `git status` del worktree tras cada commit                              | limpio (symlink de `node_modules` borrado) |

### Las 3 corridas manuales, contra la base **local** (`localhost` / `eltemplo`)

| Invocación                                | Exit  | Salida                                                                                               |
| ----------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `npx tsx scripts/seed-onboarding-aura.ts` | **2** | `Falta el gimnasio: este script escribe tablas gym-owned y no adivina en cuál. Uso: --tenant=<id> …` |
| `... --tenant=999999`                     | **2** | `No existe ningún gimnasio con id 999999. Verificá el id contra la tabla \`tenants\` de ESTA base …` |
| `... --tenant=1`                          | **0** | `onboarding_completion aura_config already exists for tenant 1, skipping.`                           |

La tercera corrida **salteó** en vez de insertar: la fila ya existía en la base local y el SELECT con `tenantWhere` la encontró en el gimnasio 1, que es el camino idempotente. Cero SSH y cero contacto con staging o producción.

### Los 3 scripts npm de los exentos siguen corriendo

| Comando                                            | Resultado                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `npx tsx src/db/run-migrations.ts`                 | `No new migrations to apply`, exit 0                                      |
| `npx tsx src/db/scripts/verify-tenant-uniques.ts`  | exit 0, M8 completo                                                       |
| `npx tsx src/db/scripts/verify-tenant-backfill.ts` | exit 0, `Tablas con filas de tenant <> 1: 0`, 2 warnings M9 preexistentes |

Los dos warnings de `audit_log.target_id` son **preexistentes** (aristas lógicas M9 con una fila huérfana cada una) y no tienen relación con este plan.

## Deviations from Plan

**1. [Rule 3 — Blocking] El `as const` del retrofit era innecesario, y sacarlo es información para la adopción**

- **Encontrado en:** Task 2, durante la verificación.
- **Problema:** el retrofit se escribió con `sourceType: "onboarding_completion" as const` asumiendo que `tenantValues<V extends Record<string, unknown>>` iba a ensanchar el literal a `string` en la inferencia de `V`, lo que rompería el tipo del enum de Drizzle en el `.values()`. Es una suposición razonable y **es falsa**.
- **Fix:** se comprobó empíricamente sacando el `as const` y corriendo `npx tsc --noEmit`: **sale 0 igual**. TypeScript conserva los tipos literales al inferir `V` desde el objeto literal. Se sacó el `as const` (código más simple y honesto) y quedó escrito en el archivo, porque **las fases 172-175 van a envolver cientos de INSERT con enums** y sin este dato cada una iba a arrastrar un `as const` decorativo por todo el repo.
- **Commit:** `d980234f`.

**2. [Registro, no desviación] El test unitario tarda ~96 s de reloj, y no es por el test**

- **Encontrado en:** Task 1.
- **Problema:** el plan pide que el archivo "corra en menos de un segundo". El archivo en sí no abre ninguna conexión —lo prueba el gate RED, que falló en **3,2 s** con el módulo ausente—, pero `vitest.config.ts` declara `test/setup.ts` como `setupFiles`, y ese archivo registra un `beforeAll` **global** que provisiona la base MySQL del worker para **todo** archivo de test, incluidos los de `test/unit/`. Los ~96 s son ese provisioning, no las aserciones.
- **Fix:** ninguno. Cambiar ese comportamiento es tocar la config de vitest del repo entero (afectaría los ~10 archivos de `test/unit/` que ya existen con el mismo costo) y está fuera del alcance de esta fase. Queda registrado para que nadie lo lea como que el test toca MySQL: **no lo toca**. El criterio real del plan —"sin tocar MySQL", "al menos 8 tests"— se cumple con 16 tests y cero conexiones propias.
- **Commit:** ninguno.

**Sin desviaciones de alcance:** cero dependencias nuevas, cero migraciones, cero scripts nuevos en `package.json`, ninguna firma de service tocada.

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-169-32 | `requireTenant` corre antes de la primera query del retrofit y aborta con exit 2 sin el flag (probado en vivo); el SELECT y el INSERT pasan por `tenantWhere` / `tenantValues`             |
| T-169-33 | La existencia se valida contra `tenants` y el mensaje nombra el id pedido — probado en vivo con `--tenant=999999` y por unit test                                                          |
| T-169-34 | El SELECT es parametrizado; el test afirma `params === [777]` **y** que el string del statement no contiene `777`                                                                          |
| T-169-35 | **Aceptado por D-07:** un gimnasio suspendido o archivado resuelve igual y sólo avisa. El motivo de operador está escrito en el docblock para que no se "unifique" con los crons           |
| T-169-36 | Los 6 exentos llevan `tenant-safe:` con el motivo textual del plan, verificado archivo por archivo; ninguno con la anotación pelada                                                        |
| T-169-37 | **Aceptado y documentado:** el helper no verifica contra qué base corre. El docblock apunta al guard `SELECT DATABASE()` de `verify-tenant-uniques.ts` para el próximo script de escritura |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit                                       |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 16 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644`, `f3036876` — plan 169-03
- `3f69a1fe`, `d79d5569` — plan 169-04
- `58b4ea84`, `e2d7793f` — plan 169-05
- `64629f56`, `0847c8da` — plan 169-06
- `e1fa91f4` — `test(169-07): parser y validacion del --tenant obligatorio de los scripts CLI` (gate RED)
- `978402e1` — `feat(169-07): helper require-tenant, el --tenant obligatorio de los scripts CLI`
- `df2455bc` — `feat(169-07): retrofit de seed-onboarding-aura y anotacion de los 6 scripts exentos`
- `d980234f` — `refactor(169-07): sacar el as const del retrofit, tenantValues preserva los literales`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]` y **no se marcó completo**. Con este plan ya no queda ningún camino sin request sin cubrir —crons, webhook, `tv_pairings` y CLI están los cuatro—, pero CON-04 es un requisito de FASE y el plan 169-09 es el que corre el gate consolidado (inventario de exenciones, mapa criterio→prueba) que lo cierra. Marcarlo acá sería un falso positivo que el verificador de fase tendría que revertir, igual que decidieron los planes 01 a 06.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `el-templo-api/src/db/scripts/require-tenant.ts` presente en el worktree (226 líneas).
- `el-templo-api/test/unit/require-tenant.test.ts` presente (236 líneas, 16 tests verdes).
- Los 7 archivos modificados presentes y con la anotación / el retrofit aplicados.
- Commits presentes en `git log --all`: `e1fa91f4`, `978402e1`, `df2455bc`, `d980234f`.
- `git status` del worktree: limpio.
