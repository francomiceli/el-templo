---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 14
subsystem: api
tags:
  [tenancy, multi-tenant, drizzle, subscriptions, finance, coach-load, mysql]

# Dependency graph
requires:
  - phase: 172-adopci-n-1-piloto-finance
    provides: "TenantContext/tenantWhere/tenantValues helpers, batería ISO-03, y las deudas nombradas D-13/D-15/IN-01 en subscriptions/service.ts y ticket-service.ts"
  - phase: 173-11
    provides: "branch-consistency.ts (assertBranchDelGimnasio/resolveBranchDelGimnasio)"
  - phase: 173-07
    provides: "scheduling/booking-service.ts y routes.ts ya con ctx en reserve/adminAddBooking"
provides:
  - "getMemberSubscription(ctx, userId) filtrado por gimnasio — cierra la fuga de /coach-load/autocompletar/:userId"
  - "assignPlan estampa tenantValues en su insert de subscriptions — un gimnasio nuevo puede dar de alta un plan"
  - "Guard SUB_HAS_ACTIVE_TRANSACTIONS con tenantWhere(financialTransactions) en el ON — el 409 no filtra datos de otro gimnasio"
  - "3 sitios de escritura de user.branch_id (D-05/ADO-07) resuelven la sede con assertBranchDelGimnasio antes de escribir"
  - "0 accesos sin tenantWhere/tenantValues a users/user_status_history en subscriptions/service.ts (verificado contra copia de allowlist sin esas 2 entradas)"
affects: [174-adopcion-subscriptions, 173-30-switch-members]

tech-stack:
  added: []
  patterns:
    - "ctx: TenantContext | null para métodos alcanzados por un helper compartido fuera de alcance (activateScheduledSub, recomputeUserStatus) — con ctx real se aplica el guard, con null se preserva el comportamiento previo documentado como deuda con dueño"
    - "El gimnasio se nombra INLINE en el statement — un fragmento SQL armado en un const de arriba e interpolado después NO lo ve el lint (mordida repetida, corregida en recomputeUserStatus)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/analytics/ticket-service.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
    - el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/subscriptions/user-status-history.test.ts

key-decisions:
  - "El fix de D-13 (ctx primero en getMemberSubscription) obligó al compilador a nombrar ~14 call sites más allá de los 2 mencionados en el plan (routes.ts directo, member-routes.ts de la app, scheduling/booking-service.ts) — todos con ctx ya resoluble via assertTenant/request.scope, ninguno requirió ensanchar el alcance de negocio."
  - "Se decidió cerrar COMPLETAMENTE las 2 entradas de allowlist de subscriptions/service.ts (users, user_status_history) en vez de limitarse a los 3 sitios D-05 — el plan lo pedía explícitamente en su <context> ('Entradas objetivo: user_status_history, users') y en el bullet de <verification>, aunque el texto de las Tasks solo detallaba D-13/D-15/D-05. Esto migró recomputeUserStatus (el único acceso a user_status_history del archivo, con 11 llamadores) y 5 métodos más (editSubscriptionStartDate, resumeSubscription, autoResumeDuePauses, getPricingPreview, listScheduleChanges) que no tenían ctx."
  - "recomputeUserStatus y activateScheduledSub aceptan ctx: TenantContext | null — el único llamador sin ctx real es autoExpireSubscriptions, alcanzado por getMemberSubscriptions/getMemberSubscriptionHistory (D-02 los deja para la 174). Con null se preserva el comportamiento previo, documentado con dueño."

patterns-established:
  - "Guard de cobros vivos con 2 tablas strict: el tenantWhere de la tabla joineada va en el segundo argumento del innerJoin (el ON), nunca en el .where() — mismo patrón que branches en cash-register-service.ts, ahora también en subscriptions/service.ts."

requirements-completed: [ADO-02, ADO-07]

duration: ~3h (no se registró timestamp de inicio explícito)
completed: 2026-08-08
---

# Phase 173 Plan 14: D-13/D-15/D-05 en subscriptions/service.ts Summary

**Cierre de las 3 deudas heredadas del piloto de finance (fuga de coach-load, guard de cobros vivos sin filtrar, y anclas de sede sin validar contra el gimnasio) más el cierre completo de las 2 entradas de allowlist de `subscriptions/service.ts` sobre `users`/`user_status_history`.**

## Performance

- **Tasks:** 3/3 completadas
- **Files modified:** 11 (2 commits)

## Accomplishments

- **D-13 cerrado**: `getMemberSubscription(ctx, userId)` filtra por gimnasio; `assignPlan` estampa `tenantValues` en su insert de `subscriptions`. Un gimnasio nuevo ya puede dar de alta un plan y que el coach autocomplete la carga sin caer en el gimnasio 1.
- **D-15/WR-02 cerrado**: el guard `SUB_HAS_ACTIVE_TRANSACTIONS` filtra `financial_transactions` en el `ON` del join — el 409 de cancelación ya no puede exponer ids/importes de otro gimnasio. IN-01 corregido (el comentario de `ticket-service.ts` ya no sobreafirma lo que el sentinel verifica).
- **D-05/ADO-07 cerrado en los 3 sitios nombrados**: `assignPlan`, `changePlanNow` y `activateScheduledSub` resuelven la sede de destino con `assertBranchDelGimnasio` antes de escribir `users.branch_id` — 404 "sede no encontrada", nunca 403.
- **Alcance ampliado, verificado**: las 2 entradas de allowlist `subscriptions/service.ts` × {`users`, `user_status_history`} quedan en **0 violaciones no listadas** al remover esas entradas de una copia de trabajo del lint — esto migró `recomputeUserStatus` (único acceso del archivo a `user_status_history`, 11 llamadores) y 5 métodos más.
- Las 2 aserciones autodestructivas del 172-19 en `iso-03-finance-coach-load.test.ts` se convirtieron en controles positivos, tal como sus propios docblocks anticipaban.

## Task Commits

1. **Tasks 1+2: D-13 (getMemberSubscription + assignPlan) y D-15/D-05 (guard de cobros + anclas de sede) + cierre de allowlist** — `107732e2` (feat)
2. **Task 3: iso-03-finance-coach-load — anclas convertidas en control positivo** — `c07527dc` (test)

_Nota: los commits 1 y 2 del plan se combinaron en un solo commit atómico (`107732e2`) porque D-13 y D-15/D-05 comparten el mismo mecanismo de cascada de `ctx` sobre el mismo archivo — separarlos por hunk habría sido artificial y riesgoso en un archivo de 6000+ líneas con ediciones entrelazadas._

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/service.ts` — `getMemberSubscription`, `assignPlan`, guard de cobros vivos, 3 sitios D-05, `recomputeUserStatus`, `editSubscriptionStartDate`, `resumeSubscription`, `autoResumeDuePauses`, `activateDueScheduledSubs`, `getPricingPreview`, `listScheduleChanges`, `bulkMigratePlan`, `pauseSubscription`, `getChangePlanPreview`, `getClassUsageThisWeek` — todos con `ctx` primero.
- `el-templo-api/src/modules/subscriptions/routes.ts` — 7 rutas ganan `assertTenant(request.scope, ...)`.
- `el-templo-api/src/modules/subscriptions/member-routes.ts` — 2 rutas member-facing (`/me/subscription`, catálogo de planes) ganan `assertTenant`.
- `el-templo-api/src/modules/finance/coach-load-routes.ts` — 3 call sites de `getMemberSubscription` pasan el `ctx` ya resuelto.
- `el-templo-api/src/modules/scheduling/booking-service.ts` — `getMemberClassesPerWeek` y `getBonusUsage` ganan `ctx`.
- `el-templo-api/src/modules/scheduling/routes.ts` — ruta `/bonus-usage` gana `assertTenant`.
- `el-templo-api/src/modules/analytics/ticket-service.ts` — comentario IN-01 corregido.
- `el-templo-api/src/jobs/auto-resume-pauses.ts` — `activateDueScheduledSubs`/`autoResumeDuePauses` reciben el `ctx` ya resuelto por gimnasio.
- `el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts` — 2 anclas convertidas en control positivo.
- `el-templo-api/test/subscriptions/lifecycle.test.ts`, `test/subscriptions/user-status-history.test.ts` — mocks/casts ajustados a las nuevas firmas.

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: (1) la cascada mecánica de `ctx` en `getMemberSubscription` se dejó correr hasta sus ~14 llamadores reales en vez de detenerse en los 2 nombrados por el plan, porque todos tenían `ctx` trivialmente resoluble y detenerse a mitad de camino habría dejado el código sin compilar; (2) se decidió cerrar completo el alcance de las 2 entradas de allowlist del archivo (no solo D-05), porque el `<context>`/`<verification>` del plan lo pedían explícitamente aunque el texto de las Tasks no lo detallara; (3) `ctx: TenantContext | null` para los 2 métodos alcanzados por el helper compartido `autoExpireSubscriptions`, documentando el gap restante con dueño fase 174 en vez de ensanchar el alcance a `scheduling/booking-service.ts`/rutas member-facing de la app.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cascada de `ctx` más allá de los 2 call sites nombrados por el plan**

- **Found during:** Task 1
- **Issue:** Cambiar `getMemberSubscription(userId)` → `getMemberSubscription(ctx, userId)` es un cambio de firma obligatorio (convención lockeada: "ctx PRIMERO para que un call site viejo no compile"). El plan solo nombraba el handler de `/autocompletar/:userId` como "el principal", pero el compilador nombró ~14 call sites más: 7 métodos internos de `subscriptions/service.ts` sin `ctx` (`pauseSubscription`, `getChangePlanPreview`, `bulkMigratePlan`, `getClassUsageThisWeek`, `resumeSubscription`, `editSubscriptionStartDate`, `getPricingPreview`), 2 rutas member-facing de la app (`subscriptions/member-routes.ts`) y 2 usos en `scheduling/booking-service.ts` (`getMemberClassesPerWeek`, `getBonusUsage`, alcanzados desde `reserve`/`adminAddBooking`, que YA tenían `ctx` desde el plan 173-07).
- **Fix:** Se agregó `ctx: TenantContext` como primer parámetro a los 7 métodos internos y se agregó `assertTenant(request.scope, "...")` a las 6 rutas que no lo tenían (incluidas 2 en `member-routes.ts` app-facing, donde `attachCountryScope` ya resuelve `request.scope` en el hook `onRequest` del plugin — no fue necesario tocar infraestructura).
- **Files modified:** `subscriptions/service.ts`, `subscriptions/routes.ts`, `subscriptions/member-routes.ts`, `scheduling/booking-service.ts`, `scheduling/routes.ts`.
- **Verification:** `pnpm exec tsc --noEmit` (0 errores) + `pnpm typecheck:tests` (0 drift) + `vitest run test/subscriptions test/finance test/scheduling` (58 archivos, 769 tests verdes).
- **Committed in:** `107732e2`.

**2. [Rule 1 - Bug] `const tenantFilter` hoisted arriba del SQL crudo NO lo veía el lint**

- **Found during:** Task 2 (verificación con `pnpm lint:tenant` sobre la copia de trabajo sin las 2 entradas)
- **Issue:** Se armó el filtro de gimnasio del `UPDATE users` crudo de `recomputeUserStatus` como `const tenantFilter = ctx ? sql\`...\` : sql\`\`;`unas líneas arriba del`tx.execute(sql\`...\`)`, e interpolado adentro. El lint (AST estático) no lo detectó como filtro inline — quedó 1 "acceso" reportado como no-listado (mordida 2.6 del mapa de patrones: "un `const conditions=[...]` de arriba NO cuenta").
- **Fix:** Se inlineó el ternario directo dentro del template `sql\`...\``del`UPDATE`, sin variable intermedia.
- **Files modified:** `subscriptions/service.ts`.
- **Verification:** `pnpm lint:tenant --allowlist=/tmp/allowlist-173-14-sin2.json` pasó de 1 a 0 unlisted violations para `subscriptions/service.ts`.
- **Committed in:** `107732e2`.

**3. [Rule 1 - Bug] Mock posicional (cast `as unknown as`) de `recomputeUserStatus` no detectado por el ratchet de tipos**

- **Found during:** Task 2 (corrida de `test/subscriptions`)
- **Issue:** `test/subscriptions/user-status-history.test.ts` accedía al método privado `recomputeUserStatus` vía `(svc as unknown as { recomputeUserStatus: (uid: number, tx) => Promise<void> }).recomputeUserStatus(userId, app.db)` — un cast que redefine localmente el tipo, invisible tanto para `tsc --noEmit` como para `pnpm typecheck:tests` (el ratchet no puede ver dentro de una aserción de tipo). El test pasaba en tipos pero fallaba en runtime ("Cannot read properties of undefined (reading 'select')") porque `tx` recibía el valor de `userId`.
- **Fix:** Se actualizó el tipo del cast a `(ctx, uid, tx) => Promise<void>` y la llamada a `recomputeUserStatus({ tenantId: TENANT_TEMPLO }, userId, app.db)`.
- **Files modified:** `test/subscriptions/user-status-history.test.ts`.
- **Verification:** `vitest run test/subscriptions test/finance test/scheduling` — 769/769 verdes.
- **Committed in:** `107732e2`.

**4. [Rule 3 - Blocking] `autoResumeDuePauses()` llamado sin `ctx` desde un test directo del service**

- **Found during:** Task 2 (typecheck del código fuente tras dar `ctx` a `autoResumeDuePauses`)
- **Issue:** `test/subscriptions/lifecycle.test.ts:442` instanciaba `SubscriptionService` a mano y llamaba `svc.autoResumeDuePauses()` sin argumentos — TS2554.
- **Fix:** Se pasó `TEMPLO_CTX` (constante ya definida en el archivo, `{ tenantId: TENANT_TEMPLO }`).
- **Files modified:** `test/subscriptions/lifecycle.test.ts`.
- **Verification:** `pnpm exec tsc --noEmit` (0 errores).
- **Committed in:** `107732e2`.

---

**Total deviations:** 4 auto-fixed (1 blocking de cascada de firma, 1 bug de lint, 1 bug de test invisible al ratchet, 1 blocking de test roto)
**Impact on plan:** Los 4 son consecuencia mecánica directa del cambio de firma que D-13 exige (ninguno ensancha el alcance de negocio del plan). No scope creep hacia módulos ajenos: `scheduling/booking-service.ts` y `member-routes.ts` solo ganaron el `ctx` que ya tenían disponible, sin migrar ninguna query nueva de esos archivos.

## Ámbito NO cerrado (documentado, dueño fase 174)

- **`autoExpireSubscriptions`** (helper privado, llamado por `getMemberSubscriptions`/`getMemberSubscriptionHistory`, consumidos por `scheduling/booking-service.ts` y rutas member-facing de la app) sigue sin `ctx` real. `activateScheduledSub` y `recomputeUserStatus` lo reciben como `null` en ese único camino, preservando el comportamiento previo (sin filtro) — documentado en el docblock de ambos métodos con dueño explícito fase 174. Cerrar ese camino exige threadear `ctx` por `getMemberSubscriptions`/`getMemberSubscriptionHistory` y sus ~8 call sites, que es exactamente el trabajo que D-02 reserva para la adopción completa de `subscriptions`.
- **Los otros 4 inserts de `subscriptions`** (`changePlanNow`, `changePlanAfterCurrent`, `renewSubscription`, `bulkMigratePlan`) siguen sin `tenantValues`, cada uno con comentario de bloque "DEUDA CON DUEÑO — FASE 174".
- **Las 2 entradas de allowlist** (`subscriptions/service.ts` × `users`/`user_status_history`) siguen en el `tenant-lint-allowlist.json` committeado — su borrado real viaja con el switch de todo el módulo `members` a `TENANT_STRICT_MODULES` (dueño 173-30, D-14: "el switch va último y en dos commits"). Verificado que son seguras de borrar: `pnpm lint:tenant --allowlist=<copia sin las 2 entradas>` da 0 violaciones no listadas.

## Deviation aplicando Rule 1 al ancla `autocompletar` no nombrada por el plan

El plan (Task 3, acceptance criteria) solo detalla el ancla de `:1326` (describe "alta de alumno con plan"). Al cerrar D-13 se puso en rojo una SEGUNDA ancla autodestructiva en el mismo archivo, en el describe "autocompletar del socio" (`it.fails(...)`, líneas ~943-986), que el usuario había pre-señalado explícitamente en el handoff de esta tarea. Se convirtió siguiendo la misma instrucción de su propio docblock (sacar `.fails` y dejarlo como caso de aislamiento normal). Documentado acá porque el PLAN.md no la nombra por línea, pero SÍ la nombra el D-13 de 173-CONTEXT.md ("la fuga de GET /coach-load/autocompletar/:userId") y el handoff del orquestador.

## Issues Encountered

- El alcance real de "cerrar las 2 entradas de allowlist" resultó bastante más grande de lo que el texto de las Tasks detallaba (15 accesos a `users` + 1 a `user_status_history`, no solo los 3+2 nombrados por D-13/D-05), porque `recomputeUserStatus` es un cuello de botella con 11 llamadores que toca AMBAS tablas. Se resolvió sistemáticamente (inventario completo vía `pnpm lint:tenant` con la entrada removida de una copia de trabajo, iterando hasta 0 violaciones) en vez de detenerse en los sitios nombrados explícitamente, porque el `<context>`/`<verification>` del plan pedían el cierre completo y D-02 solo protege la tabla `subscriptions` (no `users`/`user_status_history` dentro de este archivo).
- No se registró el timestamp de inicio de la ejecución (paso `record_start_time` del workflow omitido al principio) — la duración reportada es aproximada.

## Self-Check: PASSED

Todos los 11 archivos modificados existen en el worktree (`/home/franco/projects/et-173/el-templo-api`) y los 2 commits (`107732e2`, `c07527dc`) existen en `git log --oneline --all` de esa rama.

## Next Phase Readiness

- Las 4 deudas heredadas del piloto (D-12/13/14/15, de las cuales este plan cerró D-13/D-15 y parte de D-05) que le correspondían a esta fase quedan cerradas para `subscriptions/service.ts`.
- La fase 174 (adopción completa de `subscriptions`) hereda: los otros 4 inserts sin `tenantValues`, el camino `autoExpireSubscriptions`/`getMemberSubscriptions`(plural)/`getMemberSubscriptionHistory` sin `ctx`, y la migración de `scheduling/booking-service.ts`/rutas member-facing de la app que dependen de esos métodos plurales.
- El plan 173-30 (switch de `members` a `TENANT_STRICT_MODULES`) puede borrar con confianza las 2 entradas de `subscriptions/service.ts` × `users`/`user_status_history` — verificado en este plan que dan 0 violaciones sin ellas.

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
