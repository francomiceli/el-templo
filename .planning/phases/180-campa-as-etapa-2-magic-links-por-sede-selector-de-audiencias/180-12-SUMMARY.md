---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 12
subsystem: auth
tags: [magic-link, deep-links, capacitor, vitest, quasar]

# Dependency graph
requires:
  - phase: 180-11
    provides: "useMagicLink() (canje token->sesion compartido web/nativo), MAGIC_LINK_ROUTE_BY_DESTINATION, resolveMagicLinkRoute"
provides:
  - "Canje del magic link en la superficie nativa (App/Universal Links): appUrlOpen extrae el token y llama a useMagicLink().exchange() ANTES de navegar, compartiendo el mismo composable que la ruta web /r/trial"
  - "resolveDeepLinkRoute() y extractDeepLinkToken() exportadas y testeadas: primeros tests unitarios de src/boot/deep-links.ts"
affects: [180-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El listener de appUrlOpen delega en dos funciones puras exportadas (resolveDeepLinkRoute, extractDeepLinkToken) + una función privada de resolución de hint (resolveDestinationHint) que reutiliza resolveMagicLinkRoute — mismo patrón anti open-redirect que MagicLinkPage.vue (180-11): el destino sale siempre de MAGIC_LINK_ROUTE_BY_DESTINATION, nunca de la URL."
    - "El canje corre FUERA de los try/catch de navegación: la sesión queda persistida (authStore.setAuth) aunque router.push falle por app fría, preservando el mecanismo pendingRoute/setPendingRoute que ya existía."
    - "Reutilización de la rama auth-check preexistente (if !authStore.isAuthenticated ... else ...) sin duplicarla: tras un canje exitoso authStore.isAuthenticated ya es true de forma síncrona (Pinia), así que la misma rama que antes decidía login-vs-push ahora decide degradación-a-login vs navegación-directa sin código nuevo."

key-files:
  created:
    - el-templo-app/test/deep-links.test.ts
  modified:
    - el-templo-app/src/boot/deep-links.ts

key-decisions:
  - "target para el caso 'canje fallido con sesión previa' se resuelve del hint ?d= (resolveDestinationHint, vía resolveMagicLinkRoute), NO del target fijo de resolveDeepLinkRoute — así un token vencido con sesión existente aterriza en el mismo destino que hubiera dado un canje exitoso con ese hint, en vez de forzar siempre /reservas?trial=1."
  - "handleAppUrlOpen y exchangeAndResolveTarget quedan como funciones anidadas dentro del callback de boot() (closures sobre router), no top-level: evita tener que tipar explícitamente el parámetro Router de vue-router/quasar boot (no usado en ningún otro boot file del proyecto) y mantiene el acceso a router idéntico al código preexistente."
  - "Test file mockea src/boot/axios y boot/axios (vi.hoisted) únicamente para resolver el import-chain (deep-links.ts → useAuthStore.ts → boot/axios sin alias en vitest.config.ts, mismo problema documentado en el SUMMARY 180-11) — las funciones puras bajo test (resolveDeepLinkRoute, extractDeepLinkToken) nunca llaman a api. NO se mockea @capacitor/* (acceptance criteria explícito del Task 2)."

requirements-completed: [ML-03]

# Metrics
duration: ~20min
completed: 2026-08-24
---

# Fase 180 Plan 12: Canje del magic link en el listener nativo (D-01) Summary

**`appUrlOpen` ahora canjea el token con el mismo `useMagicLink().exchange()` que usa la ruta web, cerrando la superficie de más valor (teléfono con la app instalada) que hasta ahora ignoraba el token "deliberadamente" (D-21 de la fase 119, invertido por D-01).**

## Performance

- **Duration:** ~20min (2 tasks)
- **Completed:** 2026-08-24
- **Tasks:** 2/2 ejecutados
- **Files modified:** 2 (1 modificado, 1 nuevo)

## Accomplishments

- `el-templo-app/src/boot/deep-links.ts`: `resolveDeepLinkRoute` y `extractDeepLinkToken` exportadas (antes la primera era privada, la segunda no existía). El handler de `appUrlOpen` extrae el token del query, y si hay token, `await`ea `useMagicLink().exchange(token)` ANTES de decidir la navegación: éxito ⇒ destino de la respuesta (`resolveMagicLinkRoute(result.destination)`); fallo ⇒ destino derivado del hint `?d=` (`resolveDestinationHint`, misma validación anti open-redirect que la ruta web). El manejo de app fría (`try router.push / catch → setPendingRoute`) queda intacto y el canje corre siempre fuera de ese `try`.
- `el-templo-app/test/deep-links.test.ts` (nuevo): 10 tests unitarios de las dos funciones puras — trial con/sin query, path no reconocido, URL no parseable (ambas funciones), token vacío/ausente, token URL-encoded decodificado.
- Docblock actualizado: ya no dice que el token "se ignora deliberadamente" — documenta D-01 (fase 180) y que el destino sigue derivándose de una lista cerrada, nunca de la URL.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Canje del token en el listener nativo** - `c7e0c816` (feat)
2. **Task 2: Tests unitarios del boot de deep links** - `bd6604b8` (test)

**Plan metadata:** este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-app/src/boot/deep-links.ts` (modificado) - `resolveDeepLinkRoute`/`extractDeepLinkToken` exportadas, `resolveDestinationHint` (privada), `exchangeAndResolveTarget`/`handleAppUrlOpen` anidadas en `boot()`, docblock actualizado (D-01)
- `el-templo-app/test/deep-links.test.ts` (nuevo) - 10 tests de las funciones puras, sin mockear Capacitor

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el destino en el camino de degradación (canje fallido) sale del hint `?d=` validado contra `MAGIC_LINK_ROUTE_BY_DESTINATION` — no del `target` fijo que devuelve `resolveDeepLinkRoute` (que sigue existiendo solo para reconocer el path `/r/trial` y como fallback cuando no hay token en absoluto).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueo de import-chain en el test] `boot/axios` sin alias rompía la resolución del módulo bajo test**

- **Found during:** Task 2, primer intento de correr `deep-links.test.ts`
- **Issue:** `deep-links.ts` importa `useAuthStore`, que importa `boot/axios` (sin prefijo `src`) — ese alias solo existe en el build de Quasar (webpack/vite), no en `vitest.config.ts` (que solo aliasea `src`). Mismo problema ya documentado en el SUMMARY del plan 180-11 para `useMagicLink.test.ts`.
- **Fix:** se mockeó `src/boot/axios` y `boot/axios` con `vi.hoisted()` (mismo andamiaje que `useMagicLink.test.ts`), exclusivamente para que el import-chain resuelva — las funciones puras bajo test nunca invocan `api`.
- **Files modified:** `el-templo-app/test/deep-links.test.ts`
- **Verificación:** `pnpm exec vitest run --no-file-parallelism test/deep-links.test.ts` → 10/10 verde; `grep -c "@capacitor" test/deep-links.test.ts` → 0 (Capacitor no se tocó)
- **Commit:** incluido en `bd6604b8` (corregido antes de commitear, no generó un commit separado)

---

**Total deviations:** 1, de andamiaje de test (mock de un import transitivo no relacionado con Capacitor), sin impacto de comportamiento. Ninguna requirió una decisión arquitectural (Rule 4).

## Known Stubs

Ninguno — el canje nativo queda completamente wireado contra `useMagicLink().exchange()` (el mismo contrato real de `POST /api/campaigns/exchange` consumido por la ruta web del plan 180-11).

## Threat Flags

Ninguno — el `<threat_model>` del plan (T-180-55 a T-180-58) ya cubre la única superficie nueva (URL entrante del SO vía `appUrlOpen`); las mitigaciones (`resolveDeepLinkRoute` con lista cerrada de destinos, sin log de tokens, canje con `catch` interno de `exchange()` que nunca lanza) se preservan sin cambios respecto al diseño del plan.

## Issues Encountered

Ninguno más allá de la Deviation 1 (andamiaje de test, sin pérdida de tiempo relevante).

## Verification

- `pnpm dlx --package vue-tsc@2.2.10 --package typescript@5.9.3 vue-tsc --noEmit -p .quasar/tsconfig.json` → **17 errores, idéntico al baseline pre-existente**, corrido después de cada task. Ninguno de los 17 pertenece a `deep-links.ts` ni a `deep-links.test.ts` (confirmado con `grep -i "deep-links"` sobre la salida completa → 0 matches).
- `pnpm exec vitest run --no-file-parallelism` (suite completa de la app) → **133/135 tests verdes**. Las 2 fallas son `test/level-display.test.ts` (pre-existentes, ya documentadas en `deferred-items.md` por el plan 180-05 — mencionadas explícitamente como "ignorar" en el contexto de ejecución de este plan). `deep-links.test.ts`: 10/10 verde. `useMagicLink.test.ts`: 12/12. `router-guard.test.ts`: 15/15. `calendar-link.test.ts`: 5/5.
- Acceptance criteria de los 2 tasks verificados con los greps/comandos exactos que pide el plan: conteos de `export function resolveDeepLinkRoute`/`export function extractDeepLinkToken` (1 cada uno), `useMagicLink` (3, >=1 requerido), ausencia de "ignore the token value entirely"/"se ignora" (0), presencia de `setPendingRoute` (2, >=1 requerido), ausencia de logs con literal "token" (0), ausencia de `@capacitor` en el test (0), presencia de un caso `null` para URL no parseable (2 casos, uno por función).
- Worktree limpio tras cada commit (`git status --short` vacío tras Task 1 y Task 2).

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas, no hay migraciones ni cambios de config nativa (`AndroidManifest.xml`/`Info.plist` no tocados por este plan — el `.well-known` y el build de tiendas quedan para el checkpoint de 180-16).

## Next Phase Readiness

- Las dos superficies (web `/r/trial` del plan 180-11, y nativa `appUrlOpen` de este plan) canjean el mismo token con el mismo `useMagicLink().exchange()`, cumpliendo el objetivo declarado del plan ("las dos superficies canjean el mismo token con el mismo código").
- **Gate humano pendiente (plan 180-16):** prueba en device real — abrir el link del email en un teléfono CON la app instalada y confirmar login + navegación al destino correcto. La lógica está cubierta por tests unitarios (funciones puras) pero NO hay test de integración con Capacitor real (`App.addListener`) — es infraestructura nativa, fuera del alcance de vitest en `node` environment. Este plan no puede cerrar ese gate por sí solo.
- **Recordatorio del antecedente de la fase 119** (mencionado en el contexto de esta ejecución): el `.well-known` de `app.eltemplo.org` devolvía HTML del SPA en vez de JSON en el pasado — este plan NO modificó nada de serving/infraestructura del `.well-known` (fuera de `files_modified`); si ese problema persiste, el canje nativo de este plan nunca se disparará porque el SO no asociará el dominio con la app. Verificar el `.well-known` como parte del checkpoint 180-16, no asumido resuelto por este plan.
- Sin deuda de código pendiente de este plan. El worktree `et-180` sigue con `node_modules` operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-24_

## Self-Check: PASSED

- FOUND: el-templo-app/src/boot/deep-links.ts (worktree et-180, modificado)
- FOUND: el-templo-app/test/deep-links.test.ts (worktree et-180, nuevo)
- FOUND: commit c7e0c816 (feat, Task 1)
- FOUND: commit bd6604b8 (test, Task 2)
- Worktree et-180: `git status --short` vacío tras ambos commits
