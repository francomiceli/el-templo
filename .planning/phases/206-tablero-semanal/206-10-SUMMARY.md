---
phase: 206-tablero-semanal
plan: 10
subsystem: admin
tags: [weekly-board, admin, router, nav, landing]
requires: [206-09]
provides:
  - "TABLERO_ROLES (gestion, admin, owner, admin_sede) en templo-config.ts"
  - "Categoria 'Gerencia' primera en NAV_MODEL con la entrada Tablero"
  - "Ruta /tablero con allowedRoles = TABLERO_ROLES"
  - "landingForRole: owner/admin -> /tablero"
key-files:
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/router/routes.ts
requirements-completed: [SC-1, SC-5, D-01, D-02, D-03, D-28]
completed: 2026-11-03
---

# Phase 206 Plan 10: Menu, ruta y landing del Tablero Summary

El Tablero queda accesible: categoria "Gerencia" arriba de todo en el menu, ruta `/tablero` con guard por rol (espejo exacto de `CAJA_ROLES` del API) y landing de owner/admin en `/tablero`.

## Commits

| Commit | Subject |
| --- | --- |
| 4ee834749 | feat(206-10): tablero en el menu (Gerencia), ruta y landing de owner/admin |

## Que se hizo

- `templo-config.ts`: `TABLERO_ROLES = ['gestion','admin','owner','admin_sede']` (docblock: espejo de `CAJA_ROLES`, admin_sede ve solo su sede por API, el nav solo oculta). `NAV_MODEL` abre con `{ header: 'Gerencia', items: [{ path: '/tablero', label: 'Tablero', icon: 'dashboard', roles: TABLERO_ROLES }] }`, sin `templo` (generica). Docblock del modelo actualizado.
- `routes.ts`: importa `TABLERO_ROLES`; ruta hija `tablero` (lazy `pages/TableroPage.vue`, `meta.allowedRoles: TABLERO_ROLES`) anidada bajo `AdminLayout`, junto a `caja`, igual que las paginas hermanas (`TableroPage` usa `q-page`). `landingForRole`: la rama `DUENO_ROLES` devuelve `/tablero` (antes `/alumnos`); sin mover ramas: tv, coach con entrenamiento (Fran) -> `/sessions` van antes; admin_sede -> `/caja`, coach_actividad -> `/horarios`, resto (gestion) -> `/cobros` sin cambios. Docblock actualizado.

## Gates

| Gate | Resultado |
| --- | --- |
| api `pnpm exec tsc --noEmit` | exit 0 |
| api `pnpm lint:tenant` | exit 0 (DISCREPANCIAS: 0) |
| api `pnpm typecheck:tests` | exit 1, 17 discrepancias preexistentes; ninguna linea menciona archivos de la fase (grep `weekly`/`0319`/`tablero` sin resultados) |
| admin vue-tsc (binario aprobado de `el-templo-test-gsd`) | 26 `error TS` (linea base), ninguno en archivos de la fase |
| admin `pnpm lint` | exit 0 (0 errores, 8 warnings preexistentes) |
| `git status` | limpio (solo falta este SUMMARY, que se commitea al final) |

No se corrio `quasar build/dev` ni vitest local; la pantalla no fue vista en navegador.

## Tests de la fase: todos "pendiente de CI"

Ninguno se corrio local (regla del repo). Lista completa (`el-templo-api/test/`):

| Plan | Archivo |
| --- | --- |
| 01 | `migrations/0319-weekly-board.test.ts` |
| 01 | `db/tenant-tables.test.ts` (conteos 123/128 + modulo `weekly-board`) |
| 01 | `migrations/0192-0195-tenant-columns.test.ts` (123) |
| 01 | `migrations/0196-tenant-unique-contracts.test.ts` (123) |
| 02 | `weekly-board/week.test.ts` |
| 03 | `weekly-board/by-branch-embudo-renovaciones.test.ts` |
| 03 | regresion sin editar: `reports-trial-sessions.test.ts`, `renewals/renewals.test.ts` |
| 04 | `weekly-board/by-branch-caja-alumnos.test.ts` |
| 04 | regresion sin editar: `finance/income-by-branch.test.ts`, `reports/debt-management.test.ts`, `analytics/analytics.test.ts`, `analytics/internal-exclusion.test.ts` |
| 05 | `weekly-board/matrix.test.ts` (unit; corrio con un shim fuera del repo: 41 pass) |
| 06 | `weekly-board/weekly-board-routes.test.ts` |
| 06 | `weekly-board/weekly-board-access.test.ts` |
| 06 | `tenancy/iso-01-manifiesto.test.ts` (544) |
| 07 | `jobs/weekly-board-close.test.ts` |
| 07 | `tenancy/con-04-crons-per-tenant.test.ts` (12 jobs) |

08, 09 y 10 (admin) no tienen runner de tests: solo vue-tsc + lint; los helpers de 206-08 se verificaron con un script descartable (33 chequeos OK).

## Pendientes de confirmacion con Franco

Decisiones del orquestador "a revisar":

- **D-03:** owner/admin aterrizan en `/tablero`; gestion sigue en `/cobros`, admin_sede en `/caja`. Implementado tal cual.
- **D-10:** Embudo se congela con el mismo margen de 4 dias que Renovaciones (corrida del viernes). Nacho solo pidio margen para renovaciones.
- **D-24:** leads se editan en la semana en curso y la anterior; viven en su propia tabla, no se copian a la foto.
- **D-25:** columna informativa "Online" (sedes virtuales activas del pais), no suma al Total; Total de Cobrado = sedes fisicas.
- **D-27:** respeta el alcance por pais: admin/gestion de Argentina no ven Espana; owner ve todo.
- **D-28:** categoria nueva "Gerencia" al tope del menu (en vez de primer lugar de "Gestion", donde va Oficina).
- **A1:** un ingreso sin alumno cuenta en la sede del cobro.
- **A2:** montos en otra moneda que la de la sede quedan fuera de la celda, con aviso en pantalla.
- **A3:** el MySQL de prod corre en UTC (a las 00:05 AR ya es lunes para `CURDATE()`); si corre en hora AR, la foto de activos del lunes tendria un dia de diferencia.
- Tambien declaradas: D-14 (cobrado por sede del alumno vs Caja), D-29 (renovaciones por sede del alumno), `typecheck:tests` con 17 discrepancias preexistentes (confirmar en master/CI).

## Notas de merge contra `feat/oficina` (y el tren)

- `el-templo-admin/src/config/templo-config.ts` `NAV_MODEL`: esta fase agrega "Gerencia" como PRIMERA categoria; oficina agrega Oficina primera dentro de "Gestion". No se tocan las mismas lineas salvo el docblock de `NAV_MODEL` y la zona de constantes `*_ROLES`. Conservar las dos cosas.
- `el-templo-admin/src/router/routes.ts`: ambas ramas suman un import (`TABLERO_ROLES` / roles de oficina) en el mismo bloque y una ruta hija; conservar ambos.
- `el-templo-api/src/app.ts` y `src/index.ts`: ambas agregan import + `register`/`startXJob`; conservar todos.
- Conteos de tenancy: SUMAR deltas, no elegir un lado.
  - `GYM_OWNED_TABLES.length` y `gymOwnedChecked` (0192-0195, 0196): +2 (tablero), oficina +4 -> 121 + 2 + 4 = 127.
  - `schemaTables.size`: +2 (126 -> 128), oficina +4 -> 132.
  - `MODULOS_DECLARADOS`: agregar `weekly-board` junto al de oficina.
  - ISO-01 `ENTRADAS_BASELINE`: 542 + 2 (tablero) + N (rutas de oficina); ajustar titulo del `it` y comentario de historial.
  - CON-04 jobs: 11 -> 12 por cada rama; al mergear quedan 13 (`...notification-rules.ts, office-auto-topics.ts, reassign-multibranch.ts, tenure-milestones.ts, weekly-board-close.ts, wellhub-sync.ts`; titulo "exactamente los 13 jobs conocidos").
  - `tenant-tables.ts`, `TABLES_TO_CLEAN`, `limpiarSegundoGimnasio`, `schema/index.ts`: ambas ramas agregan al final; conservar ambos bloques.
- Migraciones: 0319 (tablero) no colisiona con 0316 (oficina). Con el tren (migs 0302-0314, master en 0319 tras esta fase) revisar que no haya otra 0319 y los mismos conteos de tenancy del tren.

## Checklist de UAT manual (staging; sin push desde aca)

1. **owner**: entra y aterriza en `/tablero`; ve "Gerencia > Tablero" arriba de todo en el menu; hay grupos Argentina (pesos) y Espana (euros); la columna Online esta apagada y no suma al Total.
2. **admin_sede**: ve una sola columna (su sede), sin Total / Semana anterior / flechas / Online; aterriza en `/caja`.
3. **gestion**: ve el Tablero en el menu y sigue aterrizando en `/cobros`. Un admin de Argentina no ve Espana. coach, coach_actividad, recepcion y tv no ven la entrada y `/tablero` los redirige.
4. **Leads**: cargar leads en una sede para la semana en curso y para la anterior; borrarlos deja "—" y % Reserva en "—"; una semana de hace 3 no deja editar (tooltip).
5. **Cotejo**: semana pasada, una sede: comparar contra Sesiones de prueba, Renovaciones, Deudas > Por deuda y Analiticas. Excepciones esperadas: cobrado por sede del alumno (D-14), renovaciones por sede del alumno (D-29), Online (D-25).
6. **Colores**: "Sin contactar" > 0 en rojo; la flecha de deuda hacia arriba en rojo.
7. **Fotos**: el lunes y el viernes siguientes al deploy, verificar que existan las fotos de la semana (chips "Cerrada" en caja/alumnos desde el lunes y en embudo/renovaciones desde el viernes).

## Decisiones del ejecutor

- La ruta se anido bajo `AdminLayout` (`path: '/'`, children), al lado de `caja`, como el resto de las paginas del admin; no hay "MainLayout" en este router (la nota de 206-09 hablaba de `q-page` en general).
- Se uso el binario de vue-tsc de `el-templo-test-gsd` (por indicacion) en vez de `pnpm exec vue-tsc`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. T-206-32 mitigada: `meta.allowedRoles = TABLERO_ROLES` en el guard + gate real `CAJA_ROLES` en el API con tests de 403 (206-06). T-206-33 aceptada.

## Self-Check: PASSED

- `el-templo-admin/src/config/templo-config.ts` y `routes.ts` modificados y commit 4ee834749 presente.
