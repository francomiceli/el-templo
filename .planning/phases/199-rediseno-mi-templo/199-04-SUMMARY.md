---
phase: 199-rediseno-mi-templo
plan: 04
subsystem: api-sponsors-tests
tags: [sponsors, integration-tests, tenancy, wcag, r2]
requires: [199-03]
provides:
  - test de integración de las 7 rutas admin de patrocinadores
  - test de integración de las 2 rutas del socio + métricas + aislamiento cross-tenant
  - test unitario de contrastRatio
affects: [199-05]
key-files:
  created:
    - el-templo-api/test/sponsors/sponsors-admin.test.ts
    - el-templo-api/test/sponsors/sponsors-member.test.ts
    - el-templo-api/test/sponsors/contrast.test.ts
  modified: []
requirements-completed: [D-18, D-19, D-20, D-21, D-24, D-25, D-26]
completed: 2026-10-15
---

# Phase 199 Plan 04: Tests de patrocinadores Summary

Tres archivos en `el-templo-api/test/sponsors/` (116 casos) que cubren las 9 rutas nuevas, el cálculo de contraste y los caminos de seguridad (guard de plataforma, canje con plan, logo del R2 propio, aislamiento entre gimnasios). No se corrieron (vitest corre en CI).

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `5369fc96a` test(199-04): integración admin de patrocinadores (roles, CRUD, contraste, límite, logo) + unidad de contraste
- Task 2: `e91159abf` test(199-04): integración del socio — feed por país/vigencia, canje con plan, eventos idempotentes, métricas y aislamiento

## Casos por archivo

| Archivo                   | Casos                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `contrast.test.ts`        | 13 (el `it.each` de hex inválido expande a 5 al correr: 17 efectivos) |
| `sponsors-admin.test.ts`  | 58                                                                    |
| `sponsors-member.test.ts` | 45 (el `it.each` cancelled/expired expande a 2: 46 efectivos)         |

## Cobertura destacada

- **Roles:** 401 en las 7 rutas; coach, gestion y socio 403 en las 7; admin, coach y socio del gimnasio 2 (`seedSecondTenant`) 403 sin tocar datos; owner y admin de El Templo entran.
- **L1 partner:** `partnerId` de un partner del gimnasio 2 -> 400 en alta y en edición; inexistente -> 400; propio -> 201/200.
- **L3 (199-02):** fechas inexistentes (`2026-13-45`, `2027-02-30`, `2026-00-10`) -> 400; textos vacíos tras trim -> 400 en alta y edición; límite en update con marca ya activa solo cuenta países AGREGADOS (editar/renombrar una marca activa con el límite bajado pasa; sumar un país lleno -> 400; liberando el cupo pasa).
- **L4 (199-03):** `/logo-upload-url` ramificado con `app.hasDecorator("r2")` (200 con R2, 503 sin R2, igual que blog/members); coach y socio dan 403 incluso sin R2 (guard antes que el 503); admin del otro gimnasio 403.
- **L6:** `PUT /settings` llega a su handler (respuesta `{ maxActivePerCountry: 7 }` sin clave `sponsor`).
- **L7/L8:** cero ids de `users` hardcodeados; todo sale de `createTestMember`/`createStaffUser`/`seedSecondTenant`. Fechas siempre con `todayInTz(zona de la sede)` + `addDays`, calculadas dentro de cada `it`; la zona AR se lee de la base y la de ES es la misma constante que va en el INSERT de la sede.
- **Logo R2 (T-199-09/T-199-48):** dominio ajeno, sufijo malicioso (`r2.test.example.evil.com`), prefijo equivocado, sin `R2_PUBLIC_URL`, barra final, PUT ajeno, y no-revalidación del logo guardado al editar otra columna (incluso cambiando `R2_PUBLIC_URL`). Variable restaurada en `afterAll`/`finally`.
- **Canje (D-21):** sin plan `redeemCode: null` (y el código ni aparece en el JSON); con plan lo recibe; carnet nunca; `active` vencido sin barrer (end_date -2) -> `canRedeem false` + redeem 400; `active` futuro/sin fecha -> true; `paused` con fecha pasada -> true; `cancelled`/`expired` -> false.
- **Eventos (D-25):** idempotencia con marcas de tiempo retrasadas por UPDATE (la prueba "no cambia" no depende de la resolución en segundos); 404 para inactiva/otro país/vencida/futura/inexistente (también `redeem`, que da 404 y no 400); 400 por tipo/params; 401; `userId` del body descartado.
- **Métricas y aislamiento:** views 2 / taps 1 / redeems 1; repetir no infla; cascade al borrar la marca; socio del gimnasio 2: feed vacío, 404 en los 3 tipos, 0 filas en ambos gimnasios; fila sembrada en el gimnasio 2 no suma a las métricas de El Templo.

## Resultados de verificación

- `pnpm -s typecheck:tests 2>&1 | grep -c "test/sponsors/"` = 0 tras cada task y al final. Confirmado también con `npx tsc -p tsconfig.test-check.json --noEmit | grep sponsors/` = 0.
- `npx tsc --noEmit` (el-templo-api) = 0 errores. `pnpm lint:tenant`: `DISCREPANCIAS: 0`.
- Greps de aceptación Task 1: `seedSecondTenant|TENANT_DOS` 3, `toBe(403)` 17, `toBe(401)` 7, `503` 5, `R2_PUBLIC_URL` 13, `r2.test.example.evil.com` = 1, ids hardcodeados = 0. PASS.
- Greps de aceptación Task 2: líneas ~1000 (>= 200), `Europe/Madrid` 1, `redeemCode` 26, `end_date|endDate` 10, `'paused'` 1, `toBe(404)` 7, `todayInTz(` 11, `addDays(` 12, `dateOffsetStr|todayStr` = 0, fechas fijas = 0. PASS.
- No se corrió vitest. Worktree limpio al terminar.

## Deviations from Plan

1. **[Realidad del framework] Claves de más no dan 400.** Fastify corre Ajv con `removeAdditional: true`: `additionalProperties: false` DESCARTA las claves extra en lugar de rechazar (el molde `novedades.test.ts` ya lo documenta). Donde el plan/comentarios podían sugerir 400 por props de más, el test afirma el comportamiento real: el body se sanea (mass assignment de `createdBy`, `views`, `taps`, `tenantId`, `userId` no tiene efecto). Igual criterio con `coerceTypes`: no se asertó 400 para `maxActivePerCountry: "6"` (se coerciona a 6); se usa `"abc"`/`null`/`7.5`.
2. **[Menor] `hasDecorator("r2")` en vez de `R2_ACCOUNT_ID`** para ramificar 200/503: es la condición exacta que usa el plugin (necesita las 4 variables), mismo resultado que el patrón de members.
3. **[Menor] Casos extra** sobre lo pedido: mass assignment, `userId` del body, límite del feed (`.limit`), orden por id al empatar `sortOrder`, ES+AR con el día de cada sede, `cancelled`/`expired`, redeem sobre carnet, cascade, fila sembrada en el gimnasio 2, `PUT /settings` extremos 1 y 50.
4. **[Menor] Estado de ES del plan 02:** el socio ES aparece bajo `Europe/Madrid`; el caso AR+ES compara el día de cada sede (`hoyAr <= hoyEs`) en vez de asumir cuál va adelante, para no depender de la hora de corrida.
5. **[Tooling]** La verificación de tipos se complementó con `tsc -p tsconfig.test-check.json` directo (el ratchet `typecheck:tests` solo reporta diferencias contra el baseline). No hay config de ESLint para `el-templo-api`; el formato lo cubrió Prettier (lint-staged).

No se encontraron bugs reales en código de producción: no hubo commits `fix(199-04)`. Sin ejecutar vitest no se pudo confirmar mutación; los casos fueron derivados leyendo `service.ts` y las rutas.

## Dudas abiertas (no bloqueantes)

- Los 116 casos corren por primera vez en CI: si algún assert depende de un detalle de runtime que la lectura estática no mostró (p. ej. `assignTestPlan` sobre el socio ES, resolución datetime de los backdates, la ruta raíz `/api/admin/sponsors` sin barra final), el primer rojo apuntará ahí.
- El feed del socio mapea cualquier país distinto de ES a AR (desviación 5 del plan 02): no está testeado porque hoy solo existen AR y ES.
- Carrera del límite de activas (duda del plan 02): sigue sin test (no determinista) y aceptada.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-15 (403 por rol y tenant 2 en las 7 rutas), T-199-16 (`redeemCode` null sin plan), T-199-17 (idempotencia y 404 en no visibles/otro tenant) y T-199-17b (logo fuera del R2 propio) quedan cubiertos por tests.

## Self-Check: PASSED

- Archivos existen: `sponsors-admin.test.ts`, `sponsors-member.test.ts`, `contrast.test.ts`.
- Commits `5369fc96a` y `e91159abf` presentes en `git log`; `git status --porcelain` vacío en el worktree.
