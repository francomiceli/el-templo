---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 27
subsystem: testing
tags: [tenancy, multitenancy, drizzle, vitest, fastify, security, members]

requires:
  - phase: 173-26
    provides: "test/fixtures/members-gimnasio-dos.ts (ciclo de vida, precondiciones, helpers de mensaje) y test/tenancy/iso-03-members-listados.test.ts como plantilla de estilo"
provides:
  - "test/tenancy/iso-03-members-ficha.test.ts: 10 describes (26 tests) cubriendo las 10 rutas de la ficha del socio"
  - "Fix: POST /:userId/photo/upload-url ya no genera URL prefirmada para un socio ajeno (T-173-27-06)"
  - "Extensión del fixture members-gimnasio-dos.ts: una fila de financial_transactions por ficha"
  - "Hallazgo documentado: PUT /:userId/password tiene DOS barreras independientes (ruta + service)"
affects: [173-28, 173-29, 173-30, 173-31]

tech-stack:
  added: []
  patterns:
    - "Foto multi-columna leída de la base (fotoDelUsuario/fotoDeLaNota) antes y después de cada escritura — mismo idioma que fotoDeLaTransaccion (172-18)"
    - "Rol mínimo REAL documentado en el docblock cuando el fixture no tiene el rol más barato disponible (admin en vez de gestion/recepcion)"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-members-ficha.test.ts
  modified:
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/test/fixtures/members-gimnasio-dos.ts

key-decisions:
  - "Se agregó un chequeo de existencia (tenantWhere) a POST /:userId/photo/upload-url antes de generar la URL prefirmada — gap real detectado por el threat model del propio plan (T-173-27-06), fuera del files_modified declarado pero dentro del módulo members (Rule 2)."
  - "Se extendió el fixture compartido members-gimnasio-dos.ts con una fila de financial_transactions por ficha, necesaria para un control positivo real de financial-history (antes no había ningún dato que distinguir de un total vacío)."
  - "GET /:userId/referrals: no se persiguió la hipótesis de una fila cross-tenant corrupta en `referrals` (getReferralOverview no tiene tenantWhere propio en su SELECT de vínculos) porque el módulo referrals está diferido a 174/175 y el único camino de escritura actual (assignReferrerToMember) ya impide crear esa fila — documentado en deferred-items.md, no arreglado."

requirements-completed: [ADO-02]

duration: ~100min
completed: 2026-08-09
---

# Phase 173 Plan 27: Ficha del socio — 10 rutas, el caso de toma de control de cuenta Summary

**Batería ISO-03 (26 tests, 10 describes) sobre las 10 rutas de la ficha del socio — historial financiero, conceptos pendientes, notas (CRUD), referidos, foto y password —, con un fix de seguridad real (URL de foto para socio ajeno) descubierto por el propio threat model del plan.**

## Performance

- **Duration:** ~100 min (estimado; incluye ~6 corridas completas de ~150-160s cada una más la corrida completa de `test/tenancy`, ~415s)
- **Completed:** 2026-08-09
- **Tasks:** 2 (ambas en el mismo archivo, según el plan)
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments

- Las 10 rutas de la ficha (`financial-history`, `outstanding-concepts`, `notes` ×4, `referrals` ×2, `photo/upload-url`, `password`) tienen caso de aislamiento + control positivo, 26/26 verde.
- **Fix de seguridad real:** `POST /:userId/photo/upload-url` generaba la URL prefirmada de R2 (con el `userId` embebido en el key) para CUALQUIER gimnasio antes de este plan — el `UPDATE` sobre `users.photo_url` ya estaba scopeado (no-op para un socio ajeno), pero la generación de la URL en sí no chequeaba nada. Corregido con el mismo patrón 404 que el resto de la ficha.
- Password (`PUT /:userId/password`, el caso más grave de la fase): evidencia leída de la base (`password_hash` antes/después, idéntico para el rechazo, distinto para el control), y un hallazgo de diseño documentado abajo (dos barreras independientes).
- Sonda 173-21 corrida sobre el archivo completo (members + 8 tablas en `TENANT_STRICT_MODULES`, sin commitear, revertida): 26/26 verde con el sentinel en throw, cero `TenantSentinelError`.
- Corrida de `test/tenancy` completo (17 archivos, 302 tests): 300 verdes, los únicos 2 rojos son los ya documentados como ajenos (dueño 173-30, `con-06-lint.test.ts`).

## Task Commits

1. **Fix T-173-27-06 (photo/upload-url)** - `0799dce4` (fix)
2. **Fixture: cobro sembrado para financial-history** - `bfcf2d7e` (feat)
3. **Task 1 + Task 2: iso-03-members-ficha.test.ts (10 describes, 26 tests)** - `db71492d` (feat)

_Nota: Tasks 1 y 2 del plan comparten el mismo archivo de test (mismo criterio que el resto de la batería ISO-03) y se desarrollaron y verificaron juntas antes del primer commit del archivo; por eso quedaron en un solo commit de test, separado del fix de seguridad y de la extensión del fixture, que sí son unidades de trabajo independientes._

**Nota sobre `files_modified`:** el plan declaraba solo `test/tenancy/iso-03-members-ficha.test.ts`. Se tocaron además `src/modules/members/routes.ts` + `schemas.ts` (Rule 2, ver Deviations) y `test/fixtures/members-gimnasio-dos.ts` (extensión necesaria para un control positivo real — el fixture es explícitamente compartido por los 3 planes de la batería, 173-26/27/28, según su propio docblock).

## Files Created/Modified

- `el-templo-api/test/tenancy/iso-03-members-ficha.test.ts` - Batería ISO-03, 10 describes (26 tests): las 10 rutas de la ficha del socio.
- `el-templo-api/src/modules/members/routes.ts` - `POST /:userId/photo/upload-url` ahora verifica existencia (tenantWhere) antes de generar la URL prefirmada; devuelve 404 para un socio ajeno.
- `el-templo-api/src/modules/members/schemas.ts` - Se agregó `404: errorSchema` a la respuesta de `uploadPhotoUrlSchema`.
- `el-templo-api/test/fixtures/members-gimnasio-dos.ts` - Se agregó una fila de `financial_transactions` por ficha (`transactionId`/`transactionAmount` en ambas interfaces).

## Decisions Made

- **Rol mínimo REAL = `admin`** en las 10 rutas (no `gestion`/`recepcion`, que `seedSecondTenant` no crea): `financial-history`/`outstanding-concepts` exigen `FINANCE_READ_ROLES` (excluye coach), `referrals`/`password` exigen `MEMBER_LIFECYCLE_ROLES` (excluye coach), y para `notes`/`photo` se usó `admin` también para no confundir el eje de tenancy con el gate de autoría de `canEditNote`. Documentado en el docblock del archivo, mismo criterio que `iso-03-finance-transacciones.test.ts` (172-18).
- **GET /:userId/referrals — control positivo con vínculo real, no con dilución sintética:** se siembra un vínculo legítimo entre dos socios del gimnasio 2 (vía el propio `POST` de la ruta) y se verifica que la resolución de nombre de la contraparte está scopeada (`tenantWhere(users, ctx)` en `getReferralOverview`). No se inventó un escenario de fila corrupta cross-tenant en `referrals` porque ese módulo está diferido a 174/175 (ver Deviations y deferred-items.md).
- **`financial-history` necesitaba datos sembrados reales** para que el control positivo no fuera un 200 vacío sin valor probatorio — se extendió el fixture compartido con una transacción por ficha (`kind: 'advance_payment'`, sin `transaction_links`, magnitudes distintas: 222 vs 888888).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical, threat model T-173-27-06] `POST /:userId/photo/upload-url` generaba URL prefirmada para un socio ajeno**

- **Found during:** Task 2, lectura de `read_first` (routes.ts) antes de escribir el caso de aislamiento de foto.
- **Issue:** La ruta no chequeaba si `request.params.userId` pertenecía al gimnasio del actor antes de generar la URL de R2 y calcular el `key` (`members/photos/{userId}-{timestamp}.{ext}`). El `UPDATE` posterior sobre `users.photo_url` sí estaba scopeado con `tenantWhere` (no-op para un socio ajeno), pero la URL en sí se generaba y devolvía igual — un staff del gimnasio 2 podía obtener una URL de subida válida para un `key` que nombra a un `userId` de otro gimnasio.
- **Fix:** Se agregó un `SELECT` con `tenantWhere(users, ctx) + eq(id, userId) + isNull(deletedAt)` antes de generar la URL; si no matchea, `404`. Mismo contrato D-06 que el resto de la ficha (socio ajeno = inexistente).
- **Files modified:** `src/modules/members/routes.ts`, `src/modules/members/schemas.ts` (agregado `404` a la respuesta documentada).
- **Verification:** Test dedicado en el archivo (aislamiento: 404 + `photo_url` sin cambios; control: 200 + `photo_url` persistido). Ratchet de typecheck limpio (175/175, 0 nuevos). `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-ficha.test.ts` → 26/26.
- **Committed in:** `0799dce4`

**2. [Rule 2-adyacente, infra de test] `financial-history` sin dato sembrado para el control positivo**

- **Found during:** Task 1, diseño del control positivo de `GET /:userId/financial-history`.
- **Issue:** El fixture compartido `members-gimnasio-dos.ts` (173-26) sembraba notas/perfil/historial de estado/logins/SEPA/balances/sesiones, pero ninguna fila de `financial_transactions` — sin eso, el control positivo de esta ruta sería un `200` con `rows: []`, indistinguible de una ruta rota que siempre devuelve vacío.
- **Fix:** Se agregó una fila de `financial_transactions` por ficha (`kind: 'advance_payment'`, sin `transaction_links` — está en `KINDS_ALLOWED_WITHOUT_LINKS`, no hace falta más), con importes de otro orden de magnitud (222 El Templo, 888888 gimnasio 2) siguiendo el mismo criterio que `debtAmount`.
- **Files modified:** `test/fixtures/members-gimnasio-dos.ts` (ambas interfaces `FichaTemplo`/`FichaGimnasioDos` + ambas funciones de siembra).
- **Verification:** Precondición nueva del archivo confirma el `tenant_id` de la transacción sembrada para cada gimnasio; control positivo de `financial-history` verifica el `id` y el `amount` exactos.
- **Committed in:** `bfcf2d7e`

---

**Total deviations:** 2 auto-fixed (1 Rule 2 sobre código de producción, 1 extensión de infra de test necesaria para una aserción real)
**Impact on plan:** El fix de `photo/upload-url` es una corrección de seguridad genuina, alineada explícitamente con el threat model del propio plan (T-173-27-06) — sin ella, el caso de aislamiento de esa ruta habría tenido que documentarse como "vulnerabilidad conocida" en vez de quedar cerrado. La extensión del fixture es infraestructura de test, sin impacto en producción. Ninguna de las dos amplía el alcance de la fase (D-02): ambas viven dentro del módulo `members` que esta fase ya migra.

## Issues Encountered

**El `outstanding-concepts` control positivo falló en la primera corrida** por un error de mi parte, no del código bajo test: el campo de respuesta es `balance` (no `amount`, que sí usa `financial-history`/`financial_transactions`) — corregido en el test antes del commit, sin tocar producción.

## Hallazgo: `PUT /:userId/password` tiene DOS barreras independientes (mutación de cierre)

El plan pedía romper el `tenantWhere` de `resetMemberPassword` (el método del `service.ts`) y observar el resultado. Se hicieron TRES corridas, todas revertidas con `git checkout --` sobre los archivos exactos tocados (verificado `git status --porcelain` limpio después de cada una):

| Mutación | Qué se rompió                                                                                                                                                   | Resultado                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `tenantWhere` del SELECT + UPDATE de `resetMemberPassword` (`service.ts`)                                                                                       | **26/26 verde — CERO rojos.**                                                                                                                                                             |
| 2        | (revertida la 1) `tenantWhere` del JOIN a `branches` + del WHERE sobre `users` en el chequeo de existencia de la RUTA (`routes.ts`, antes de llamar al service) | **26/26 verde — CERO rojos.**                                                                                                                                                             |
| 3        | Mutaciones 1 y 2 A LA VEZ (service Y ruta rotos simultáneamente)                                                                                                | **1 rojo, exactamente el describe de password** ("aislamiento: resetear el password de un socio de El Templo se rechaza... expected 204 to be 404"). Los otros 25 tests siguieron verdes. |

**Interpretación:** la ruta hace su propio chequeo de existencia (`SELECT users INNER JOIN branches` con `tenantWhere` en ambas tablas) ANTES de invocar `memberService.resetMemberPassword`, que a su vez tiene su PROPIO `tenantWhere` en el SELECT y en el UPDATE. Son dos capas independientes — ninguna de las dos por sí sola sostiene el aislamiento cuando se la mira aislada del resto, pero **ambas juntas** son necesarias y suficientes: hace falta romper las DOS simultáneamente para que el caso más grave de la fase (toma de control de cuenta) se vuelva ejercitable. Mismo patrón que el hallazgo de 172-18 (`buildListConditions` no daba rojo por el JOIN de `users`/`branches`) y el de 173-26 (`listMembers`, documentado en `deferred-items.md`) — la diferencia acá es que la ruta más crítica de la fase resultó tener redundancia real, no una ilusión de aislamiento sostenida por una sola capa.

Las tres mutaciones se revirtieron con `git checkout -- src/modules/members/service.ts src/modules/members/routes.ts` (la segunda vez hubo que reaplicar a mano el fix legítimo de `photo/upload-url`, que el `checkout --` de todo el archivo había revertido junto con la mutación — corregido antes de commitear, ver diff final limpio con solo los cambios intencionales).

## Sonda 173-21

`members` + las 8 tablas de D-01 (`users`, `user_branches`, `member_profiles`, `member_notes`, `member_logins`, `user_status_history`, `user_sepa_details`, `audit_log`) agregadas a `TENANT_STRICT_MODULES` en `src/db/tenant-tables.ts`, sin commitear. Corrida: `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-ficha.test.ts` → **26/26 verde, cero `TenantSentinelError`.** Revertido con `git checkout -- src/db/tenant-tables.ts`; `git status --porcelain src/db/tenant-tables.ts` vacío.

## Verificación

| Criterio                                                                               | Resultado                                                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-ficha.test.ts` | ✅ 26/26 (exit 0)                                                                              |
| `pnpm exec vitest run --no-file-parallelism test/tenancy` (directorio completo)        | ✅ 300/302 — los 2 rojos son `con-06-lint.test.ts`, ya documentados como ajenos (dueño 173-30) |
| `grep -c "403" test/tenancy/iso-03-members-ficha.test.ts`                              | ✅ 0                                                                                           |
| `describe` en el archivo                                                               | ✅ 11 (1 de precondiciones + 10 de rutas)                                                      |
| Las 10 claves literales del manifiesto presentes                                       | ✅ verificado por inspección contra `test/tenant-manifest.ts`                                  |
| `pnpm typecheck:tests` (ratchet, baseline 175)                                         | ✅ 0 errores nuevos, 0 empeorados                                                              |
| Mutación de cierre de `resetMemberPassword`                                            | ✅ corrida (3 variantes), documentada arriba, revertida (`git status --porcelain` limpio)      |
| Sonda 173-21                                                                           | ✅ corrida, 26/26 verde, revertida (`git status --porcelain` limpio)                           |
| `pnpm exec prettier --write` sobre los archivos tocados                                | ✅ antes del primer commit                                                                     |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Batería ISO-03 de `members`: 2 de 3 archivos completos (173-26 listados/export, 173-27 ficha). Falta 173-28 (altas/edición/baja + staff + ADO-07).
- El fix de `photo/upload-url` cierra el único gap de seguridad real encontrado en las 10 rutas de este plan; no hay deuda pendiente de esta ficha para 173-28/29/30/31.
- El hallazgo de `getReferralOverview` sin `tenantWhere` propio en su lectura de `referrals` queda en `deferred-items.md` para cuando el módulo `referrals` se migre (174/175) — no bloquea el cierre de esta fase porque el único camino de escritura actual ya impide la fila cross-tenant que ese hallazgo describe.

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-09_
