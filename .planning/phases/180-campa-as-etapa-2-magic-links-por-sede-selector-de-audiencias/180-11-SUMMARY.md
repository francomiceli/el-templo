---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 11
subsystem: auth
tags: [magic-link, vue-router, pinia, vitest, quasar, tenancy-free-frontend]

# Dependency graph
requires:
  - phase: 180-06
    provides: "POST /api/campaigns/exchange (canje token->sesion, shape MagicLinkExchangeResult, 401 generico uniforme, Referrer-Policy: no-referrer)"
  - phase: 180-08
    provides: "send firma tokens de login consumidos por este canje"
provides:
  - "useMagicLink(): canje token->sesion compartido web/nativo, con reemplazo de sesion (D-04) y degradacion (D-05) cubiertos por tests"
  - "isMagicLinkOnboardingBypass(userId): bypass de onboarding D-21 atado al userId exacto del canje, sin campo status/freemium en el perfil"
  - "resolveGuardRedirect(): decision del guard global extraida a funcion pura, con authAgnosticRoutes (magic-link) y la excepcion de onboarding D-21"
  - "Ruta publica /r/trial (magic-link) + MagicLinkPage.vue: cierra el 404 latente de la fase 119"
  - "Ruta protegida /volver + VolverPage.vue: destino de bajas/prueba-no-convertida (D-13) con CTA de WhatsApp"
affects: [180-12, 180-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bypass de sesion como flag module-scope atado a userId (no un booleano global, no un campo nuevo en useAuthStore): useMagicLink.ts#bypassUserId. Evita fuga en device compartido sin necesitar que logout() (fuera de files_modified del plan) lo resetee explicitamente — un login normal de OTRO usuario simplemente no matchea el userId"
    - "router/guards.ts: decision del beforeEach movida a funcion pura sin Pinia/vue-router, testeada con inputs planos (mismo estilo que test/whatsapp.test.ts); router/index.ts queda como adaptador delgado"
    - "vi.hoisted() para compartir mocks/arrays entre la factory de vi.mock y el cuerpo del test (evita el problema de exportar campos custom desde un modulo mockeado, que rompe vue-tsc contra el tipo del modulo real)"

key-files:
  created:
    - el-templo-app/src/composables/useMagicLink.ts
    - el-templo-app/test/useMagicLink.test.ts
    - el-templo-app/src/router/guards.ts
    - el-templo-app/test/router-guard.test.ts
    - el-templo-app/src/pages/MagicLinkPage.vue
    - el-templo-app/src/pages/VolverPage.vue
  modified:
    - el-templo-app/src/router/index.ts
    - el-templo-app/src/router/routes.ts

key-decisions:
  - "Bypass de onboarding D-21: el perfil (UserProfile) NO expone status/freemium (verificado con el grep que pide el plan) -> se implemento como bandera de SESION module-scope en useMagicLink.ts, atada al userId exacto que canjeo (isMagicLinkOnboardingBypass(userId)), no como campo nuevo de useAuthStore (useAuthStore.ts no esta en files_modified del plan). El guard consume esto via el input isFreemium que arma router/index.ts."
  - "MAGIC_LINK_ROUTE_BY_DESTINATION vive en useMagicLink.ts (no en guards.ts): la resolucion de destino es una preocupacion del canje/pagina, el guard solo decide login/home/onboarding/bar-challenge."
  - "MagicLinkPage.vue usa router.replace en TODOS los caminos (exito Y degradacion D-05), nunca router.push: el token no debe volver via el historial en ningun escenario (T-180-50)."
  - "/volver registrada con path absoluto '/volver' (no relativo 'volver') dentro del array children del layout protegido: funcionalmente identico en Vue Router (el padre es '/'), elegido para satisfacer el acceptance criteria literal del Task 4 sin ambiguedad."
  - "EXCHANGE_URL extraida como constante en useMagicLink.ts: el docblock necesitaba mencionar el path del endpoint sin duplicar el literal '/campaigns/exchange' (el acceptance criteria de Task 1 exige count==1)."

requirements-completed: [ML-02, ML-04, AUD-03]

# Metrics
duration: ~40min
completed: 2026-08-23
---

# Fase 180 Plan 11: La mitad cliente del magic link — canje web, guard puro, VolverPage Summary

**`useMagicLink()` (canje compartido web/nativo con reemplazo de sesión D-04 y degradación D-05 cubiertos por tests explícitos de orden), el guard global extraído a función pura con el bypass de onboarding D-21 atado al `userId`, y las dos páginas de aterrizaje (`/r/trial`, `/volver`) que cierran el 404 latente de la fase 119.**

## Performance

- **Duration:** ~40min (4 tasks)
- **Completed:** 2026-08-23
- **Tasks:** 4/4 ejecutados
- **Files modified:** 8 (6 nuevos, 2 modificados)

## Accomplishments

- `useMagicLink()`: `exchange(token)` llama a `POST /campaigns/exchange` y aplica D-04 (orden `clearTokens` → `setTokens` verificado explícitamente vía array compartido, no solo "se llamó a logout"), D-05 (401 nunca lanza, `{ok:false}`, `warn` no `error`) y D-21 (bypass module-scope atado al `userId` exacto). 12 tests, ninguno monta componentes.
- `router/guards.ts`: `resolveGuardRedirect()` — move mecánico de la lógica del `beforeEach` (auth, home-si-público, onboarding, crash-recovery del bar challenge) + `authAgnosticRoutes=['magic-link']` (ni login ni home) + excepción de onboarding atada a `isFreemium`. Función pura, sin Pinia ni `vue-router`. 15 tests, incluyendo el caso T-180-52 ("member NO freemium sigue yendo a onboarding").
- `router/index.ts` reducido a adaptador delgado: arma el input desde `authStore`/`userStore`/`isMagicLinkOnboardingBypass`/`hasPersistedActiveAttempt` y delega en `resolveGuardRedirect`.
- `/r/trial` + `MagicLinkPage.vue`: cierra el 404 latente (bug documentado en el `<objective>` del plan) — lee `?t=`/`?d=`, canjea, `router.replace` en TODOS los caminos (éxito y degradación), nunca renderiza el token.
- `/volver` + `VolverPage.vue`: CTA primario de WhatsApp vía `buildWhatsAppUrl` (sin número hardcodeado), sin ningún rastro de self-service de re-alta (D-13).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: `useMagicLink()` — canje, reemplazo de sesión (D-04) y degradación (D-05), con tests** - `1d7baaf1` (feat) + `4a5bb266` (fix: `EXCHANGE_URL` como constante para cumplir el acceptance criteria de conteo único)
2. **Task 2: Decisión del guard extraída a función pura (`authAgnosticRoutes` + D-21)** - `992d30ba` (feat)
3. **Task 3: Ruta `/r/trial` y página de aterrizaje `MagicLinkPage.vue`** - `660c2289` (feat)
4. **Task 4: `VolverPage.vue` — destino de bajas y prueba-no-convertida (D-13)** - `b4beb105` (feat)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-app/src/composables/useMagicLink.ts` (nuevo) - `useMagicLink()`, `MAGIC_LINK_ROUTE_BY_DESTINATION`, `resolveMagicLinkRoute`, `isMagicLinkOnboardingBypass`
- `el-templo-app/test/useMagicLink.test.ts` (nuevo) - 12 tests (orden D-04, niveles de log, token nunca logueado, fallback anti open-redirect, bypass D-21)
- `el-templo-app/src/router/guards.ts` (nuevo) - `resolveGuardRedirect`, `publicRoutes`, `authAgnosticRoutes`
- `el-templo-app/test/router-guard.test.ts` (nuevo) - 15 tests (auth, magic-link bypass, onboarding + D-21, T-180-52, crash-recovery)
- `el-templo-app/src/pages/MagicLinkPage.vue` (nuevo) - aterrizaje web de `/r/trial`
- `el-templo-app/src/pages/VolverPage.vue` (nuevo) - destino de bajas/prueba-no-convertida
- `el-templo-app/src/router/index.ts` - `beforeEach` reducido a adaptador delgado sobre `resolveGuardRedirect`
- `el-templo-app/src/router/routes.ts` - rutas `magic-link` (`/r/trial`, pública) y `volver` (`/volver`, protegida)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el bypass de onboarding D-21 quedó como **bandera de sesión atada al `userId`** (no un campo `status`/`freemium` del perfil — ese campo no existe, verificado con `grep -rn "status" src/stores/useUserStore.ts`) y no como un campo nuevo de `useAuthStore` (fuera de `files_modified`). `isMagicLinkOnboardingBypass(userId)` vive en `useMagicLink.ts` y lo consume `router/index.ts` al armar el input de `resolveGuardRedirect`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de expectativa, descubierto en verificación] `EXCHANGE_URL` extraída como constante**

- **Found during:** Task 1, verificación de acceptance criteria
- **Issue:** el acceptance criteria exige `grep -c "campaigns/exchange" useMagicLink.ts == 1`. El docblock inicial mencionaba el path en prosa (`POST /campaigns/exchange`) ADEMÁS del literal usado en el `api.post(...)`, dando count=2.
- **Fix:** se extrajo `const EXCHANGE_URL = '/campaigns/exchange'` y el docblock quedó referenciando `EXCHANGE_URL` en vez de repetir el literal.
- **Files modified:** `el-templo-app/src/composables/useMagicLink.ts`
- **Verificación:** `grep -c "campaigns/exchange" useMagicLink.ts` → 1; `pnpm test -- useMagicLink` 12/12 verde tras el cambio
- **Commit:** `4a5bb266`

**2. [Rule 1 - Bug de expectativa, descubierto en verificación] Comentario auto-matcheaba el propio grep de "sin store" en `guards.ts`**

- **Found during:** Task 2, verificación de acceptance criteria
- **Issue:** el acceptance criteria exige `grep -cE "useAuthStore|useUserStore|vue-router" guards.ts == 0` (función pura de verdad). El docblock decía textualmente "Sin stores, sin `vue-router`", auto-matcheando el propio grep que probaba su ausencia.
- **Fix:** reformulado a "Sin dependencias de Pinia ni del router" — mismo significado, sin los tokens literales que el grep busca.
- **Files modified:** `el-templo-app/src/router/guards.ts`
- **Verificación:** `grep -cE "useAuthStore|useUserStore|vue-router" guards.ts` → 0
- **Commit:** incluido en `992d30ba` (corregido antes de commitear, no generó un commit separado)

**3. [Rule 1 - Bug de expectativa, descubierto en verificación] Comentarios en `VolverPage.vue` auto-matcheaban el grep anti self-service**

- **Found during:** Task 4, verificación de acceptance criteria
- **Issue:** el acceptance criteria exige `grep -ciE "plan|checkout|pagar|suscrib" VolverPage.vue == 0`. Dos comentarios (docblock + nota de estilo referenciando "PlanExpiryDialog") contenían las palabras "planes", "checkout" y "Plan", dando count=2 aunque el componente en sí no tenía self-service de re-alta.
- **Fix:** reformulados sin esos tokens ("membresías"/"cobro" en vez de "planes"/"checkout"; "el diálogo de vencimiento de membresía" en vez de nombrar `PlanExpiryDialog` literalmente).
- **Files modified:** `el-templo-app/src/pages/VolverPage.vue`
- **Verificación:** `grep -ciE "plan|checkout|pagar|suscrib" VolverPage.vue` → 0
- **Commit:** incluido en `b4beb105` (corregido antes de commitear, no generó un commit separado)

**4. [Rule 1 - Bug bloqueante, descubierto durante ejecución, FUERA del código de este plan] `git stash pop` accidental contaminó el worktree con WIP de otra sesión**

- **Found during:** entre Task 1 y Task 2, al intentar comparar `test/level-display.test.ts` contra HEAD limpio para confirmar que sus 2 fallas eran pre-existentes (`git stash` seguido de `git stash pop`)
- **Issue:** `git stash` reportó "No local changes to save" (correcto: mis dos archivos nuevos eran untracked, no entran en un stash sin `-u`), pero el `git stash pop` subsiguiente aplicó `stash@{4}` — una entrada **de otra sesión/worktree** (`"On cambiar-plan-turnos: rehabilitar boton eliminar alumno"`), no relacionada con este plan. Produjo 4 conflictos `UU` (`useFinanceLoadApi.ts`, `auth/routes.ts`, `coach-load-routes.ts`, `auth/auth.test.ts`) y 6 archivos `.planning/*.md` modificados que no eran míos. Este es exactamente el escenario de `refs/stash` compartido documentado en `destructive_git_prohibition` (el stash es global, no por-worktree).
- **Fix:** el pop falló por conflictos y NO dropeó la entrada (`git stash list` la mostró intacta como `stash@{4}`, sin tocarla). Se revirtieron los 10 archivos afectados uno por uno con `git checkout HEAD -- <path>` (rutas explícitas, nunca un reset/clean/checkout en bloque), dejando el worktree solo con mis 2 archivos untracked del Task 1.
- **Files modified:** ninguno del plan — recuperación de un incidente de git, no un cambio de producto.
- **Verificación:** `git status --short` post-recuperación mostró únicamente los 2 archivos de `useMagicLink.ts`/`useMagicLink.test.ts`; `git stash list` conserva las 16 entradas originales sin pérdidas.
- **Acción tomada:** no se volvió a usar `git stash` en el resto de la ejecución del plan; la comparación contra HEAD limpio de `level-display.test.ts` se hizo corriendo el archivo de test directamente sin necesitar el stash.

---

**Total deviations:** 4. Tres de ajuste de comentarios/nombres para cumplir acceptance criteria literales (sin impacto de comportamiento), una de recuperación de un incidente de git ajeno al código del plan (sin pérdida de trabajo, ninguna entrada del stash tocada). Ninguna requirió una decisión arquitectural (Rule 4).

## Known Stubs

Ninguno — las 4 superficies del plan (`useMagicLink`, `guards.ts`, `MagicLinkPage.vue`, `VolverPage.vue`) están completamente wireadas contra el contrato real de `POST /api/campaigns/exchange` (180-06), sin datos mock ni placeholders.

## Threat Flags

Ninguno — las 6 mitigaciones del `<threat_model>` del plan (T-180-49 a T-180-54) están cubiertas explícitamente por los tests de `useMagicLink.test.ts` y `router-guard.test.ts`; no se detectó superficie nueva (endpoints, rutas de auth, acceso a archivos, cambios de schema) fuera de lo que el plan ya modelaba.

## Issues Encountered

Ver Deviation 4 (incidente de `git stash pop` ajeno al plan, recuperado sin pérdidas). Ningún otro bloqueo — el código siguió el spec del plan sin sorpresas de diseño; el grueso de los ajustes fueron de wording para cumplir greps literales de acceptance criteria.

## Verification

- `pnpm dlx --package vue-tsc@2.2.10 --package typescript@5.9.3 vue-tsc --noEmit -p .quasar/tsconfig.json` → **17 errores, idéntico al baseline pre-existente** (documentado en el contexto de ejecución), corrido después de cada task. Ninguno de los 17 pertenece a los 8 archivos de este plan.
- `pnpm test` (vitest) → **123/125 tests verdes**. Las 2 fallas son `test/level-display.test.ts` (`TRAINING_LEVELS` con 6 entradas vs. 5 esperadas), pre-existentes y **ya documentadas en `deferred-items.md` por el plan 180-05** — no tocado por ningún archivo de este plan (confirmado: último commit que tocó `level-display.ts`/su test es de la fase 99). No se agregó una entrada duplicada a `deferred-items.md`.
- `useMagicLink.test.ts`: 12/12 verde. `router-guard.test.ts`: 15/15 verde. Ninguno de los dos monta componentes (`grep -c "mount(" == 0` en ambos).
- Acceptance criteria de los 4 tasks verificados con los greps/comandos exactos que pide el plan (citados en la ejecución de este agente): conteos de `campaigns/exchange`, `logout()`, `localStorage`, `log.*token`, `cleanup`/`onUnmounted`, `: any`; `authAgnosticRoutes` count + ausencia de `magic-link` en `publicRoutes`; ausencia de `useAuthStore`/`useUserStore`/`vue-router` en `guards.ts`; `resolveGuardRedirect`/ausencia de `publicRoutes` en `index.ts`; `desafio-barra-timer` en el test; `/r/trial`/`magic-link` en `routes.ts`; `router.replace`/`router.push`/`setPendingRoute` en `MagicLinkPage.vue`; `buildWhatsAppUrl`/ausencia de números hardcodeados/`/volver`/ausencia de vocabulario de self-service en `VolverPage.vue`.
- Worktree limpio tras cada commit (`git status --short` vacío), verificado explícitamente tras la recuperación del incidente de `git stash` (Deviation 4).

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas, no hay migraciones.

## Next Phase Readiness

- `useMagicLink()`/`MAGIC_LINK_ROUTE_BY_DESTINATION`/`isMagicLinkOnboardingBypass` quedan disponibles para que el plan 180-12 (listener nativo de deep links, `deep-links.test.ts`) reuse el mismo canje sin duplicar lógica — es exactamente el propósito declarado en el docblock del composable ("compartido por la ruta web y el listener nativo").
- El checkpoint humano del plan 180-16 (verificación en device real, con y sin app instalada) puede correr contra esta implementación sin bloqueos.
- Sin deuda pendiente de este plan. El worktree `et-180` sigue con `node_modules` operativos; el `git stash` global del checkout compartido quedó intacto (16 entradas, ninguna dropeada).

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-app/src/composables/useMagicLink.ts (worktree et-180)
- FOUND: el-templo-app/test/useMagicLink.test.ts (worktree et-180)
- FOUND: el-templo-app/src/router/guards.ts (worktree et-180)
- FOUND: el-templo-app/test/router-guard.test.ts (worktree et-180)
- FOUND: el-templo-app/src/pages/MagicLinkPage.vue (worktree et-180)
- FOUND: el-templo-app/src/pages/VolverPage.vue (worktree et-180)
- FOUND: el-templo-app/src/router/index.ts modificado (worktree et-180)
- FOUND: el-templo-app/src/router/routes.ts modificado (worktree et-180)
- FOUND: commit 1d7baaf1 (feat, Task 1)
- FOUND: commit 4a5bb266 (fix, Task 1 follow-up)
- FOUND: commit 992d30ba (feat, Task 2)
- FOUND: commit 660c2289 (feat, Task 3)
- FOUND: commit b4beb105 (feat, Task 4)
- FOUND: este SUMMARY.md en el checkout principal
