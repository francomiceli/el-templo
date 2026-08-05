---
phase: 172-adopci-n-1-piloto-finance
plan: 01
subsystem: infra
tags: [git-worktree, pnpm, tenancy, typecheck, lint-tenant, ci-gate]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues / assertTenant / forEachActiveTenant)"
  - phase: 170-sentinel-lint
    provides: "src/db/sentinel/, pnpm lint:tenant y tenant-lint-allowlist.json (ratchet)"
  - phase: 171-backstop
    provides: "test/tenant-manifest.ts y test/fixtures/second-tenant.ts"
provides:
  - "Worktree /home/franco/projects/et-172 en feat/172-adopcion-finance, base a6272df0 (origin/master con CR-CAJA adentro)"
  - "Baseline verde registrado: tsc exit 0, lint:tenant DISCREPANCIAS 0, allowlist en 501 entradas"
  - "Gate D-13 cerrado con evidencia: CR-CAJA en master Y corriendo en staging"
affects: [172-02, 172-03, 172-04, 172-05, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worktree por fase desde origin/master recién fetcheado (fases 166-171)"
    - "pnpm install --frozen-lockfile: instala, pero falla si el árbol de dependencias cambiaría"
    - "Branch de fase sin upstream: git push sin argumentos no puede deployar a producción"

key-files:
  created:
    - /home/franco/projects/et-172/el-templo-api/.env
    - /home/franco/projects/et-172/el-templo-api/.env.development
  modified: []

key-decisions:
  - "D-13 cerrado con evidencia (a)+(b): master == staging == a6272df0 y /health de staging 200 OK post-deploy, más confirmación explícita de Franco de CI verde"
  - "El worktree se creó desde a6272df0 (no desde 29e61c8b): CR-CAJA reescribió coach-load-routes.ts y subscriptions/service.ts, los dos archivos que esta fase migra — partir de antes garantizaba conflicto"
  - "node_modules propio con --frozen-lockfile en vez del symlink de las fases 166-170: 23 planes de typechecks/tests no aguantan un symlink que hay que crear y borrar alrededor de cada commit"
  - "Al worktree se le sacó el upstream (git worktree add lo dejó trackeando origin/master)"

patterns-established:
  - "Baseline verde ANTES de tocar una línea: tsc + lint:tenant como línea de partida del ratchet"
  - "Conteo de allowlist registrado al arrancar (501) para que D-06 pueda medir el descenso a 0 en finance"

requirements-completed: [ADO-01]

# Metrics
duration: 6min
completed: 2026-07-30
---

# Phase 172 Plan 01: Base de ejecución y gate D-13 Summary

**Worktree `et-172` montado sobre `a6272df0` (origin/master con CR-CAJA adentro), verde de arranque — tsc 0 errores, `lint:tenant` 0 discrepancias, allowlist en 501 entradas — con el gate de secuencia D-13 cerrado por evidencia de merge Y de deploy.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-30T20:16:00Z
- **Completed:** 2026-07-30T20:23:00Z
- **Tasks:** 2/2 (1 checkpoint + 1 auto)
- **Files modified:** 0 versionados (el plan crea infraestructura local, no código)

## Accomplishments

- **Gate D-13 cerrado con evidencia de las DOS condiciones por separado**, que era el punto del checkpoint: no alcanza el merge, hacía falta el deploy.
- **Worktree `/home/franco/projects/et-172`** en `feat/172-adopcion-finance`, base `a6272df0`, con `.env` + `.env.development` copiados desde `et-170-sentinel` y dependencias instaladas desde el lockfile.
- **Baseline verde registrado** para que el ratchet de la fase tenga línea de partida medible: `tsc --noEmit` exit 0 (19 s), `pnpm lint:tenant` exit 0 con `DISCREPANCIAS: 0` y **501 entradas** en `tenant-lint-allowlist.json`.
- **Checkout principal intacto:** cero archivos nuevos bajo `el-templo-api/` (los 5 modificados y los 3 untracked que aparecen ahí son de otra sesión, con mtime 2026-07-11 — verificado).

## Evidencia del gate D-13 (Task 1)

**Condición 1 — CR-CAJA mergeado a master.** `git fetch origin` + `git log --oneline -5 origin/master`:

```
a6272df0 test(caja): la caja del cobro sigue la sede del socio + override y 403
362d795a feat(cobros): select de Sede del cobro en renovación y cobro suelto (CR-CAJA)
1f033f62 fix(caja): la caja del cobro en efectivo sigue la sede del socio (CR-CAJA)
29e61c8b Merge staging into master — tren fases 170 (sentinel + lint de tenancy) y 171 (backstop)
```

Los 3 commits de CR-CAJA están **encima** del tren de las fases 170+171. `git rev-parse origin/master origin/staging` devuelve el mismo SHA en las dos ramas: `a6272df02adf7eae85518e994f8fa2d1d27bd23a`. O sea: master y staging son **el mismo commit**, no dos historias parecidas.

**Condición 2 — CR-CAJA corriendo en staging.** Evidencia aceptada: **(a) + (b)**, las dos formas de mayor preferencia del plan.

- **(a) Endpoint de salud post-deploy:** `curl -s https://api-staging.eltemplo.org/health` →

  ```
  {"status":"ok","timestamp":"2026-07-30T20:19:36.291Z"}
  HTTP 200
  ```

  **Salvedad honesta, escrita para que nadie la lea de más:** este endpoint devuelve `status` y `timestamp`, **no un SHA ni una versión**. Por sí solo prueba que la API de staging está viva después del deploy, **no** que el binario que corre contenga `a6272df0`. Es evidencia necesaria pero no suficiente, y por eso se sumó (b).

- **(b) Confirmación explícita de Franco:** CI de staging verde sobre `a6272df0` ("ci verde, pushea a master") y deploy de staging terminado. Es la forma (b) literal del plan: pipeline de deploy, no solo el merge.

**Respuesta al resume-signal:** "cr-caja en master y en staging".

No se ejecutó la forma (c) (cobrar en staging con un socio de otra sede y ver la caja del socio) — el UAT funcional de CR-CAJA corre por su propio carril y no bloquea esta fase.

## Task Commits

1. **Task 1: Gate D-13** — sin commit (checkpoint de verificación humana; no produce archivos)
2. **Task 2: Crear el worktree et-172 y dejarlo verde** — sin commit de código: el `<files>` del plan dice literalmente `ninguno versionado`. Lo que produce (el worktree, `.env`, `node_modules`) es infraestructura local gitignoreada o fuera del árbol.

**Plan metadata:** el commit de este SUMMARY + STATE + ROADMAP en el checkout principal.

## Verificación (todos los criterios de aceptación)

| Criterio                                                     | Resultado                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `rev-parse --abbrev-ref HEAD` = `feat/172-adopcion-finance`  | ✅                                                        |
| `merge-base --is-ancestor origin/master HEAD`                | ✅ exit 0 (HEAD **es** `a6272df0`)                        |
| `.env` existe y tiene líneas `DB_`/`DATABASE_`               | ✅ 5 líneas                                               |
| `src/modules/shared/tenant.ts`                               | ✅                                                        |
| `src/db/sentinel/install.ts`                                 | ✅                                                        |
| `test/tenant-manifest.ts`                                    | ✅                                                        |
| `test/fixtures/second-tenant.ts`                             | ✅                                                        |
| `pnpm exec tsc --noEmit`                                     | ✅ exit 0 (19 s)                                          |
| `pnpm lint:tenant`                                           | ✅ exit 0, `DISCREPANCIAS: 0`                             |
| Checkout principal sin archivos nuevos bajo `el-templo-api/` | ✅ (los untracked son de 2026-07-11, preexistentes)       |
| `git status --porcelain` en `et-172`                         | ✅ vacío (el `.env` y `node_modules` están gitignoreados) |

**Allowlist al arrancar: 501 entradas.** Es la línea de partida del ratchet — D-06 exige que las entradas de las tablas de `finance` bajen a **0** al cerrar la fase, y este número es contra qué se mide.

**Inventario de exenciones `tenant-safe` heredado: 10** (6 archivos enteros de plataforma/seeds + 3 sitios: `notification-cron.ts:754`, `tv/pairing.ts:145`, `wellhub/service.ts:135` + `scripts/wellhub-sandbox.ts`). Ninguno es de `finance`, que es exactamente lo que el plan quiere: si al cerrar la fase el inventario tiene una exención nueva en `finance`, alguien tomó un atajo.

**Advertencia del lint registrada para CI (no es discrepancia):** el gate D-14 de entradas ganadas **no corrió** porque no se pasó `--base` (uso local). El propio lint lo dice: "En CI el step tiene que pasar `--base` o el ratchet queda decorativo". Los otros tres gates sí corrieron.

## Decisions Made

- **Base `a6272df0`, no `29e61c8b`.** El plan admitía "`29e61c8b` o posterior si CR-CAJA entró después" — entró después. Importa más de lo que parece: CR-CAJA reescribió `finance/coach-load-routes.ts` y `subscriptions/service.ts`, que son **los dos archivos que esta fase migra**. Partir de `29e61c8b` habría garantizado conflicto en el merge final sobre exactamente las líneas que la fase toca.
- **`node_modules` propio en vez del symlink de las fases 166-170.** Aquellas fases resolvían `node_modules` por symlink a `et-167-columnas` para evitar el install, con la trampa documentada de tener que **borrarlo antes de cada commit** (la regla `node_modules/` del `.gitignore` no matchea un symlink). Con 23 planes por delante, cada uno con typechecks y tests, ese ritual es un footgun repetido 23 veces. El install costó **3,4 s** (store de pnpm caliente, lockfile byte-idéntico al de los worktrees hermanos: md5 `5f468b7517d6fef8c5e014a7353ede61`), así que el argumento de costo que justificaba el symlink no aplica acá.
- **Evidencia (a) sola no alcanzaba.** `/health` no expone SHA ni versión. Se registró como necesaria-pero-no-suficiente y se apoyó en (b). Anotarlo importa: dentro de tres semanas, "el health dio 200" leído solo puede parecer prueba de que el deploy tenía CR-CAJA, y no lo es.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Seguridad de supply chain] `pnpm install` → `pnpm install --frozen-lockfile`**

- **Found during:** Task 2
- **Issue:** El plan dice "SOLO instalación del lockfile existente — está PROHIBIDO agregar o actualizar dependencias" y el threat register tiene T-172-SC (`Tampering` / `pnpm install` / `mitigate`) con la misma regla. Pero `pnpm install` a secas **no la hace cumplir**: si algo en el árbol resolviera distinto, pnpm **reescribe el lockfile en silencio** y el install sale verde igual. La prohibición quedaba dependiendo de que alguien mirara el `git status` después.
- **Fix:** `--frozen-lockfile`, que hace fallar el install si el lockfile tuviera que cambiar. La mitigación pasa de ser una intención escrita a un gate ejecutable.
- **Files modified:** ninguno (cambio de invocación)
- **Verification:** install exit 0 en 3,4 s y `git status --porcelain` en `et-172` **vacío** — el lockfile no se movió ni un byte.
- **Committed in:** sin commit (no hay archivo versionado)

**2. [Rule 2 - Seguridad operativa] Sacar el upstream del branch de fase**

- **Found during:** Task 2
- **Issue:** `git worktree add -b feat/172-adopcion-finance origin/master` deja el branch **trackeando `origin/master`** ("Branch 'feat/172-adopcion-finance' set up to track remote branch 'master'"). En este repo **todo push a `master` es un deploy a producción**, y con upstream configurado un `git push` sin argumentos dentro del worktree deploya la rama de la fase a prod. Es exactamente el modo de falla del incidente de la fase 78 (trabajo de fase sin terminar viajando a producción de arrastre), pero servido en un solo comando.
- **Fix:** `git branch --unset-upstream` en el worktree. Verificado: `rev-parse --abbrev-ref @{u}` ahora dice "no upstream configured".
- **Files modified:** ninguno (config de git local)
- **Verification:** `git -C /home/franco/projects/et-172 rev-parse --abbrev-ref --symbolic-full-name @{u}` → `fatal: no upstream configured`
- **Committed in:** sin commit

**3. [Rule 3 - Alcance del install] `pnpm install` solo en `el-templo-api`**

- **Found during:** Task 2
- **Issue:** El plan dice "correr `pnpm install`" sin decir dónde. El repo **no es un workspace de pnpm**: hay un lockfile por app (`el-templo-api`, `el-templo-admin`, `el-templo-app`, `el-templo-web`), así que "correr pnpm install" no tiene un único significado.
- **Fix:** Instalar solo en `el-templo-api`. La fase 172 es 100% backend (los 21 archivos del PATTERNS son todos de la API); instalar los otros 3 apps sería bajar cientos de MB de árbol de dependencias que nadie va a ejecutar — superficie de ataque sin contraparte.
- **Files modified:** ninguno
- **Verification:** tsc y lint:tenant, que son lo único que esta fase corre, salen verdes con eso.
- **Committed in:** sin commit

---

**Total deviations:** 3 auto-fixed (3 × Rule 2/3, todas endurecimientos)
**Impact on plan:** Cero scope creep. Las tres refuerzan mitigaciones que el propio plan ya pedía (T-172-SC, T-172-01-01, T-172-01-02) — no agregan trabajo ni cambian lo que la fase construye.

## Issues Encountered

**Advertencia de build scripts ignorados en el install** (`argon2`, `esbuild` ×3, `@firebase/util`, `protobufjs`): pnpm 10 no corre postinstall scripts sin aprobación explícita. **No se aprobó ninguno** — aprobar scripts de build es ejecutar código de terceros y eso no es una decisión que corresponda tomar de taquito en un plan de infraestructura. `tsc --noEmit` y `lint:tenant` salen verdes sin ellos, que es lo que este plan tenía que probar.

**Bandera para el primer plan que corra tests con MySQL real (172-04 en adelante):** `argon2` es un binding nativo y los tests que crean usuarios lo van a necesitar. Si aparece un `Cannot find module ... argon2.node` o similar, **la causa es esta advertencia, no el código de la fase**, y la salida es `pnpm approve-builds` — que es un gate humano de dependencias (sección 6 del skill de change-control), así que va con pregunta a Franco, no de oficio.

## User Setup Required

None — el `.env` se copió desde el worktree hermano `et-170-sentinel` y no requiere valores nuevos.

## Next Phase Readiness

**Listo para 172-02.** La base tiene las 4 capas de tenancy (helpers, sentinel, lint, manifiesto+fixtures) y CR-CAJA adentro, verde de arranque.

Tres cosas que los planes siguientes tienen que dar por sentadas:

1. **Todo el código se edita en `/home/franco/projects/et-172`.** El checkout principal está en `fix/referral-preview-y-refresh-ficha` con cambios sin commitear de otra sesión y ~403 commits atrás — ahí no existe ni `src/modules/shared/tenant.ts`. Los `.planning/` (incluidos los SUMMARY) sí van al checkout principal.
2. **La allowlist arranca en 501.** D-06 la mide contra ese número.
3. **`.docs/saas-multitenancy/` NO está versionada** y por lo tanto **no existe en `et-172`**. El plan que escriba `07-receta-adopcion.md` (D-11) tiene que crearlo en el checkout principal — un `git add` desde el worktree no lo va a capturar.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-01-SUMMARY.md`
- `FOUND` `/home/franco/projects/et-172/el-templo-api/.env`
- `FOUND` `/home/franco/projects/et-172/el-templo-api/tenant-lint-allowlist.json` (501 entradas)
- `FOUND` `/home/franco/projects/et-172/el-templo-api/node_modules/.modules.yaml`
- `FOUND` commit `daf33692` (SUMMARY) y `1c030cce` (STATE + ROADMAP)

**ADO-01 NO se marcó completo, deliberadamente.** El requisito dice "`finance` migrado al patrón completo (services reciben scope + `tenantWhere`/`tenantValues` + sentinel throw para sus tablas + aislamiento verde)" y lo citan **18 de los 23 planes** de la fase. Marcarlo desde el plan que sólo monta el worktree sería falso. Sigue `Pending` en REQUIREMENTS.md hasta el gate consolidado del final de la fase — misma convención que la 169 usó con CON-03 y CON-04.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
