# Fase 215 — Gates finales (plan 24)

Fecha: 2026-11-18. Rama `feat/regalar-aura`, worktree `/home/franco/projects/et-comunidad`. Todo corrido en foreground, uno por vez, sin instalar dependencias. Línea de base: `215-EJECUTORES.md` (API 0, app 20, admin 36). Ningún gate falló: no hay bloqueantes.

## Resultado

| Proyecto | Comando                                                                                                                   | Salida | Resultado                                                                                                  | Base                            | Veredicto                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| API      | `cd el-templo-api && npx tsc --noEmit`                                                                                    | exit 0 | 0 errores                                                                                                  | 0                               | Igual a la base                          |
| API      | `pnpm lint:tenant`                                                                                                        | exit 0 | DISCREPANCIAS: 0 (306 accesos cubiertos por exención)                                                      | 0                               | Igual a la base                          |
| API      | `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck:tests`                                                             | exit 1 | 263 errores totales, "Deuda NUEVA" 14 entradas y 2 empeoradas: 18 discrepancias contra su baseline         | 18 (las mismas de la 214 y 215) | Sin deuda de esta fase (ver abajo)       |
| API      | `pnpm lint`                                                                                                               | n/a    | El script no existe: el gate de la API es `lint:tenant` (plan 08)                                          | n/a                             | Se usa `lint:tenant`                     |
| App      | `cd el-templo-app && pnpm lint`                                                                                           | exit 0 | 0 errores, 2 warnings (`Capacitor` sin usar en `boot/axios.ts`, `watch` sin usar en `useSessionPlayer.ts`) | sin base registrada             | Warnings en archivos que la fase no tocó |
| App      | `cd el-templo-app && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json`   | exit 2 | 20 errores, ninguno en archivos de regalo, bandeja, campana ni Mi Templo                                   | 20                              | 0 errores nuevos                         |
| Admin    | `cd el-templo-admin && pnpm lint`                                                                                         | exit 0 | 0 errores, 8 warnings                                                                                      | sin base registrada             | Sin errores                              |
| Admin    | `cd el-templo-admin && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json` | exit 2 | 36 errores, ninguno en `RegalosAuraPage.vue`, `CoachGiftDialog.vue`, `SlotAttendancePanel.vue` ni rutas    | 36                              | 0 errores nuevos                         |

### `pnpm typecheck:tests` en detalle

Las 18 discrepancias son exactamente las que dejó la 214 (plan 32): `attendance.test.ts` (import duplicado de `appBranchName`, previo), `check-ins-roster`, `sender`, `reports`, los cuatro `test/unit/*-selection|generator` (extensiones de import ESM y `any` implícito), `cancel-guards`, `members-wellhub`, y los que empeoraron por poco (`analytics.test.ts` 2 a 4, `members.test.ts` 4 a 5). Dos entradas del baseline quedaron obsoletas (`attendance.test.ts` TS2769 y `lifecycle.test.ts` TS2834, ambas bajaron). Ningún archivo de test nuevo de la 215 aparece en la lista (`gift*`, `inbox*`, `0349*`, `0350-0351*`, `award-in-transaction`, `member-aura-movements`, `iso-03-notifications`). El baseline propio de ese gate está desactualizado y es deuda ajena a la fase.

## Tests unitarios puros (corridos en local)

API, con `npx vitest run --config vitest.config.unit.ts test/unit/<archivo>.test.ts`:

| Archivo                             | Resultado |
| ----------------------------------- | --------- |
| `aura-gift-rules.test.ts`           | 25 de 25  |
| `aura-gift-errors.test.ts`          | 16 de 16  |
| `aura-movement-labels.test.ts`      | 12 de 12  |
| `aura-amounts.test.ts`              | 7 de 7    |
| `notifications-inbox-rules.test.ts` | 27 de 27  |

App, con `timeout 300 pnpm exec vitest run <archivo>`:

| Archivo                                          | Resultado |
| ------------------------------------------------ | --------- |
| `src/utils/__tests__/gift-view.test.ts`          | 30 de 30  |
| `src/utils/__tests__/notifications-view.test.ts` | 31 de 31  |

El admin no corre tests en local (no tiene `vitest` en este lockfile, lección del plan 01).

## Guards de la regla D-22 y de las migraciones

- `grep -rniE "privad"` sobre los archivos nuevos de textos de la fase (reglas, errores, push, bandeja, textos y componentes de la app y del admin): una sola coincidencia, comentarios de `el-templo-api/src/modules/aura/movement-labels.ts` (líneas 3 y 41) que llaman "privado" al detalle de Aura de la 214. No es texto que vea el usuario ni promete discreción sobre los regalos: es la regla de la 214 que la 216 revisará.
- Comentarios con `;` en las migraciones `0349_aura_gifts.sql`, `0350_member_notifications.sql` y `0351_pending_notifications_inbox.sql`: ninguno (`grep -nE '^\s*--.*;'` vacío).
- Numeración: después de `git fetch`, `origin/master` y `origin/staging` no tienen ninguna migración 0348 a 0359; la 0348 sigue reservada para el repaso de la 214 (`.planning/phases/214-comunidad-anotados-aura/deploy-2/`).
- Las migraciones NO se aplicaron en la base local (regla de la fase).

## Migraciones de la fase y orden de despliegue

| Orden | Migración                              | Qué hace                                                                                                    |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0     | 0344 a 0347 (de la 214, ya en la rama) | Re-valorización, foto de perfil, `member_photos`, visibilidad. Van antes: la 215 sale de la punta de la 214 |
| 0     | 0348 (reservada)                       | Repaso de D-49 de la 214, se despliega aparte con el número libre del momento                               |
| 1     | `0349_aura_gifts.sql`                  | Tabla `aura_gifts` (regalos), con los dos candados de unicidad                                              |
| 2     | `0350_member_notifications.sql`        | Tabla `member_notifications` (bandeja)                                                                      |
| 3     | `0351_pending_notifications_inbox.sql` | Columnas `inbox_kind` e `inbox_ref_id` en `pending_notifications`                                           |

El código de la 215 necesita las tres para funcionar: no desplegar la API de la 215 sin que las migraciones 0349 a 0351 estén aplicadas.

## Conteos de tenancy finales

| Conteo                                                           | Antes (214) | Ahora |
| ---------------------------------------------------------------- | ----------- | ----- |
| `GYM_OWNED_TABLES.length` (`tenant-tables.test.ts`)              | 136         | 138   |
| `schemaTables.size` (`tenant-tables.test.ts`)                    | 141         | 143   |
| `gymOwnedChecked` (tests 0192-0195 y 0196)                       | 136         | 138   |
| `ENTRADAS_BASELINE` (`iso-01-manifiesto.test.ts`)                | 589         | 601   |
| `CASOS_BASELINE` subs y horarios (`iso-03-cobertura-subs-sched`) | 77          | 77    |
| `CASOS_BASELINE` members (`iso-03-cobertura-members`)            | 42          | 42    |

Las rutas nuevas de la fase suman 12 entradas al manifiesto: 3 del alumno (planes 06, tres rutas), 3 del staff para dar y ajustar (plan 08), 1 para anular (plan 09), 1 para la lista (plan 10) y 4 de la bandeja (plan 14).

## Tests de integración escritos en la fase que nunca corrieron en local

Todos corren en CI al pushear a staging (con OK de Franco). Primer lugar a mirar si fallan, según cada SUMMARY:

| Plan            | Archivo (cantidad de `it`)                                                                 | Primer lugar a mirar si falla en CI                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01              | `test/migrations/0349-aura-gifts.test.ts` (8)                                              | La sede sembrada con el `branchId` del socio de prueba, y los ids de asistencia arbitrarios (no hay FK a `attendance`)                                              |
| 02              | `test/migrations/0350-0351-inbox.test.ts` (9)                                              | Los defaults NULL como `null` o `"NULL"` y el tipo entero `/^int/` según la versión del motor                                                                       |
| 01, 02          | `test/db/tenant-tables.test.ts`, 0192-0195 y 0196                                          | Los conteos 138 / 143 / 138, el orden de borrado en `test/helpers.ts` y `limpiarSegundoGimnasio`                                                                    |
| 04              | `test/aura/award-in-transaction.test.ts` (7)                                               | El rollback y el duplicado con `isDuplicateKeyError`                                                                                                                |
| 04              | `test/aura/gift-eligibility.test.ts` (27)                                                  | `seedMemberWithPlan` (plan creado por un admin de prueba) y las zonas horarias del caso Auckland y Honolulu                                                         |
| 06              | `test/aura/gifts-member.test.ts` (16)                                                      | El orden de las caras (`checkedInAt` explícito), los casos de hoy que flaquean solo a medianoche y el 429 de candidatos (31 pedidos del mismo usuario)              |
| 07              | `test/aura/gift-settings.test.ts` (5)                                                      | Que cada test limpie su clave de `tenant_settings` (esa tabla no está en `cleanAllTestData`)                                                                        |
| 08              | `test/aura/gifts-coach.test.ts` (15)                                                       | La siembra del staff (`createStaffUser` con la sede de la clase), la sede de `seedGiftClass({ tz })` para el profe ajeno y el 404 por módulo apagado del gimnasio 2 |
| 09              | `test/aura/gifts-void.test.ts` (12)                                                        | La sede ajena del caso 4 (admin_sede recibe 404), el módulo `templo-gamification` del gimnasio 2 (caso 7) y el `DELETE` de una asistencia sembrada por SQL          |
| 10              | `test/aura/gifts-admin-list.test.ts` (10)                                                  | Caso 4 (admin_sede con una sola sede, creada por `seedGiftClass({ tz })`) y caso 8 (módulo prendido en el gimnasio 2)                                               |
| 11              | `test/aura/member-aura-movements.test.ts` (6 casos nuevos)                                 | `seedGiftClass` (primera sede real) y que `createStaffUser` reciba el `branchId` de esa sede                                                                        |
| 13              | `test/notifications/inbox-queue.test.ts` (13)                                              | Borrar a mano `memberNotifications`, `pendingNotifications`, `deviceTokens` y `notificationTemplates` antes de `limpiarSegundoGimnasio`                             |
| 14              | `test/notifications/inbox-routes.test.ts` (14) y 4 casos en `iso-03-notifications.test.ts` | `shown_at` es de segundos enteros: los empates se arman con segundos enteros y una base fija por test                                                               |
| 15              | `test/aura/gifts-push.test.ts` (9)                                                         | La espera de 1,1 s por `shown_at` y que el receptor sea una cara elegible (`seedMember` activo)                                                                     |
| 6, 8, 9, 10, 14 | `test/tenancy/iso-01-manifiesto.test.ts`, `mod-01-guard.test.ts`                           | `ENTRADAS_BASELINE` 601                                                                                                                                             |

## Hallazgos para el orquestador

- Ninguno bloquea. Este plan no tocó código.
- Los unitarios puros de la API y de la app están en verde. `aura-gift-rules` da 25 tests (la nota del plan 03 hablaba de 32 junto con los de montos: son archivos distintos).
- La suite de integración NO se corrió en local: corre en CI al pushear a staging, con OK de Franco. Son unos 155 `it` nuevos de la fase que nunca corrieron.
- Como esta rama sale de la punta de la 214 (también sin subir), en el primer push a staging corren juntas las dos suites.

## Consultas pendientes (solo lectura, las corre Franco)

| Consulta                                    | Para qué                                                                                       | Cuándo                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `consultas/01-medicion-regalos.sql`         | D-21: regalos y porcentaje de alumnos que regalan, por semana y sede, últimas 4 semanas        | Cada lunes durante las primeras 4 semanas          |
| `consultas/02-conciliacion-con-regalos.sql` | Criterio 8: el ledger, el saldo y los regalos tienen que cerrar (todos los bloques en 0 filas) | En staging y después en producción, tras desplegar |
