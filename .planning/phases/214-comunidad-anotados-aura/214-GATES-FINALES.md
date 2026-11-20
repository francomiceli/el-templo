# Fase 214 — Gates finales (plan 32)

Fecha: 2026-11-18. Rama `feat/comunidad-anotados-aura`, worktree `/home/franco/projects/et-comunidad`. Todo corrido en foreground, uno por vez, sin instalar dependencias. Línea de base: `TYPECHECK-BASELINE.md` (plan 01).

## Resultado

| Proyecto | Comando                                                                                                                   | Salida              | Errores                                                                                                    | Base                        | Veredicto                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| API      | `cd el-templo-api && pnpm exec tsc --noEmit`                                                                              | exit 0              | 0                                                                                                          | 0                           | Igual a la base                                                                             |
| API      | `pnpm typecheck:tests`                                                                                                    | exit 1              | 263 totales, 18 discrepancias contra su baseline propio (175)                                              | ya en rojo desde el plan 02 | Sin hallazgos de esta fase (ver abajo)                                                      |
| API      | `pnpm lint:tenant`                                                                                                        | exit 0              | 0 discrepancias (301 accesos cubiertos por exención)                                                       | 0                           | Igual a la base                                                                             |
| API      | `pnpm lint`                                                                                                               | no existe el script | n/a                                                                                                        | n/a                         | Se usa `lint:tenant` (plan 08)                                                              |
| App      | `cd el-templo-app && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json`   | exit 2              | 20                                                                                                         | 21                          | 0 errores nuevos (se fue el de `MainLayout.vue` `displayName`: ya no existe esa referencia) |
| App      | `pnpm lint`                                                                                                               | exit 0              | 0 errores, 2 warnings (`Capacitor` sin usar en `boot/axios.ts`, `watch` sin usar en `useSessionPlayer.ts`) | sin base registrada         | Warnings en archivos que la rama no tocó                                                    |
| Admin    | `cd el-templo-admin && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json` | exit 2              | 36                                                                                                         | 36                          | Idéntico, archivo por archivo, a la base                                                    |
| Admin    | `pnpm lint`                                                                                                               | exit 0              | 0 errores, 8 warnings (de `session-pdf-builder.ts` y similares)                                            | sin base registrada         | Sin errores                                                                                 |

### `pnpm typecheck:tests` en detalle

Resumen del gate: 263 errores totales, 14 "nuevos" y 2 "empeorados" respecto de su baseline de 175 (18 discrepancias, el mismo número que dejó el plan 31). El baseline propio ya estaba desactualizado y es deuda ajena a esta fase. Archivos con discrepancias y su origen:

| Archivo                                                                                                                                                                     | Tocado por la rama  | Nota                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/attendance/attendance.test.ts` (TS2300 x2, TS2769)                                                                                                                    | Sí (planes 03 y 11) | El `import { appBranchName }` duplicado ya existe en la base (líneas 25 y 46 en el merge-base): previo, no lo introdujo la rama. El TS2769 pasó de 2 a 1 |
| `test/check-ins/check-ins-roster.test.ts`                                                                                                                                   | No                  | Previo                                                                                                                                                   |
| `test/email/sender.test.ts`, `test/reports/reports.test.ts`                                                                                                                 | No                  | Previo                                                                                                                                                   |
| `test/unit/combos-generator.test.ts`, `full-body-selection.test.ts`, `tecnica-generator.test.ts`, `stretching-selection.test.ts`                                            | No                  | Previos (extensiones de import ESM y `any` implícito)                                                                                                    |
| `test/wellhub/members-wellhub.test.ts`, `cancel-guards.test.ts`, `test/subscriptions/lifecycle.test.ts`, `test/members/members.test.ts`, `test/analytics/analytics.test.ts` | No                  | Previos                                                                                                                                                  |

Comprobado con `git log <merge-base>..HEAD` por archivo: solo `attendance.test.ts` fue tocado por la rama, y su error ya estaba antes. Ningún archivo de test nuevo de la fase (`profile-photo*.test.ts`, `attendees.test.ts`, `earned-aura.test.ts`, `attendance-day-cap.test.ts`, `complete-aura-rule.test.ts`, `aura-revaluation-repaso.test.ts`, entre otros) figura en la lista.

## Tests unitarios puros de la app (`timeout 300 pnpm exec vitest run <archivo>`, uno por uno)

| Archivo                                      | Resultado |
| -------------------------------------------- | --------- |
| `src/utils/__tests__/tenure.test.ts`         | 9 de 9    |
| `src/utils/__tests__/aura-format.test.ts`    | 13 de 13  |
| `src/utils/__tests__/avatar-image.test.ts`   | 7 de 7    |
| `src/utils/__tests__/photo-messages.test.ts` | 11 de 11  |
| `src/utils/__tests__/attendees-view.test.ts` | 19 de 19  |
| `src/utils/__tests__/count-up.test.ts`       | 5 de 5    |

Los tests de administración no se corren en local (el admin no tiene `vitest` en este lockfile, lección del plan 01).

## Hallazgos para el orquestador

Ninguno que bloquee. Este plan no arregló nada. Observaciones:

- La rama no agrega errores de typecheck en ninguno de los tres proyectos.
- `typecheck:tests` de la API sigue en rojo por deuda ajena; conviene que el CI lo compare contra su baseline antes de confiar en él.
- La suite de integración NO se corrió en local: corre en CI al pushear a staging (con OK de Franco). Los tests de integración nuevos de la fase (planes 04 a 31) nunca corrieron; si fallan en CI, mirar primero las notas "si falla en CI" de cada plan en `214-EJECUTORES.md`.

## Consultas pendientes (solo lectura, las corre Franco)

Nadie las corrió desde esta fase (D-68). Todas llevan `SET SESSION TRANSACTION READ ONLY` y devuelven agregados.

| Consulta                                        | Para qué                                                                                                                                | Cuándo                                                                                                                                                   | Quién                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `consultas/04-importados-marzo.sql`             | Fecha real de alta de los 367 socios importados en marzo (D-29). Si el paso D devuelve filas, la corrección va por una migración aparte | Antes de decidir la antigüedad que se muestra; no bloquea el deploy                                                                                      | Franco (o con su OK) |
| `consultas/05-conciliacion-aura.sql`            | Conciliación de Aura alrededor de la 0344 y del repaso de D-49                                                                          | Bloques 0 y 1 antes del merge; bloques 2 a 6 después de la 0344 y del repaso; bloques 1, 4 y 6 en staging antes y después del repaso (4 y 6 deben dar 0) | Franco               |
| `consultas/06-visibilidad-por-defecto.sql`      | Cuántos alumnos aparecerían por defecto, menores, exterior y con foto de ficha (D-11, D-47)                                             | Antes del lanzamiento                                                                                                                                    | Franco               |
| `consultas/07-linea-de-base.sql`                | Reservas y asistencias por alumno activo por semana (D-36)                                                                              | Ejecutable en cualquier momento (datos históricos): "antes" con las 4 semanas previas a `@lanzamiento` y "después" con las 4 siguientes                  | Franco               |
| `consultas/08-calibracion-tiempo-propuesto.sql` | Cuántas sesiones reales de los últimos 90 días pasarían el 80 % del tiempo propuesto (D-20)                                             | Antes del lanzamiento; si muchas quedan bajo el 80 %, ajustar `SECONDS_PER_REP` o `MIN_BLOCK_SECONDS` en `sessions/proposed-time.ts`                     | Franco               |

## Nota sobre la suite de integración

La suite de integración corre en CI al pushear la rama a staging, con OK explícito de Franco. Hasta entonces lo verificado en la fase es typecheck, lint de tenencia y tests unitarios o angostos. El repaso de D-49 se mueve a `src/db/migrations/` recién en el segundo deploy (ver `deploy-2/README.md`).
