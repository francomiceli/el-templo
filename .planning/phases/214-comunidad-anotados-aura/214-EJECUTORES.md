# Fase 214 — Reglas y lecciones para los ejecutores

Lectura obligatoria antes de ejecutar cualquier plan de la fase. El orquestador la actualiza con las
lecciones de cada plan.

## Dónde se trabaja

- Solo en `/home/franco/projects/et-comunidad` (rama `feat/comunidad-anotados-aura`).
- Nunca se edita ni se commitea en `/home/franco/projects/el-templo` ni en otros worktrees. De ellos solo
  se usan los `node_modules` ya enlazados por symlink (plan 01).

## Reglas duras

- No instalar ni actualizar dependencias (`pnpm add`, `pnpm install`, `npm install`, ni `npx` de un
  paquete que no esté ya en `node_modules`).
- Sin push, sin SSH, sin tocar producción. Las consultas de `consultas/` no se corren.
- Sin bump de versión. Sin `any`. Logging con Pino (API) o `createLogger()` (app y admin).
- `git add` siempre por ruta explícita, nunca `-A` ni `.`. En la carpeta de la fase hay un `.tsv` sin
  trackear que NO se agrega nunca (`consultas/02-aura-por-fuente-anonimo.resultado-2026-11-17.tsv`).
- Si lint-staged falla, se arregla y se hace un commit NUEVO. Nunca amend.
- Migraciones a mano, con el número libre verificado contra `origin/master` y `origin/staging` en el
  momento (`git fetch` antes), el `.sql` en el mismo commit que el schema, sin `;` dentro de comentarios
  SQL y sin datos de prueba. Nunca `drizzle-kit push` ni `drizzle-kit migrate`.
- Tests y typecheck SOLO en foreground y con timeout amplio. Prohibido `run_in_background` y los loops de
  espera con `pgrep` o `sleep`. Nunca dos vitest a la vez.
- La suite de integración corre en CI, no en local. En local: typecheck, lint y como máximo el archivo de
  test angosto que pide el plan.
- Si aparece una decisión de producto que el plan no resuelve: se toma la opción más conservadora, se
  sigue, y se informa en la respuesta final. No se frena a preguntar (D-68).

## Typecheck: el criterio es "cero errores nuevos"

Línea de base registrada por el plan 01 en `TYPECHECK-BASELINE.md`:

| App | Comando (desde la carpeta de la app) | Errores de base |
|---|---|---|
| API | `npx tsc --noEmit` | 0 |
| App | `/home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json` | 21 |
| Admin | el mismo `vue-tsc` por ruta absoluta | 36 |

- Donde un plan diga "`tsc` da 0" para la app o el admin, vale "no hay errores nuevos respecto de la
  línea de base". En la API sí tiene que dar 0.
- `vue-tsc` se invoca por la ruta absoluta de arriba, no con `npx` (lo descargaría).
- Si se redirige la salida de un comando a un archivo, que sea fuera del repo.

## Notas por plan (del verificador de planes)

- **Plan 08 y consulta 08:** `completed_sessions.duration` está en SEGUNDOS (lo guarda
  `sessions/routes.ts:480-485`), aunque el comentario del schema diga minutos.
- **Plan 13, tarea del job de copia de la foto de ficha:** `users.photo_url` se guarda al generar la URL
  de subida, antes de que el archivo exista. El job tiene que ignorar las URLs con menos de 15 minutos
  (el timestamp va en el nombre del archivo) para no marcar como fallida una foto que todavía se está
  subiendo.
- **Plan 23, sello de antigüedad:** `VeteranSeal.vue` hoy NO respeta `prefers-reduced-motion`. Hay que
  agregarlo, no darlo por hecho.
- **Planes 21 y 27:** el texto "Motivo: {etiqueta}." del rechazo de foto es un supuesto registrado en
  `214-DECISIONES-AUTONOMAS.md` §5. Se usa tal cual.

## Respuesta final de cada ejecutor (máximo 12 líneas, en español)

1. Estado: COMPLETO / PARCIAL / BLOQUEADO.
2. Commits (hash corto y asunto).
3. Typecheck y lint: resultado contra la línea de base.
4. Desvíos respecto del plan y por qué.
5. Decisiones que tomó por su cuenta.
6. Lecciones para los ejecutores siguientes.

## Lecciones acumuladas

- (plan 01) Los `.env` de la API están enlazados y apuntan a `DB_HOST=localhost`.
- (plan 01) Ningún worktree con este lockfile tiene `vitest` en el admin: los tests del admin no se
  pueden correr en local.
- (plan 02) **Tests unitarios puros: correrlos con la config unitaria**, que no usa base de datos y tarda
  menos de un segundo: desde `el-templo-api`, `npx vitest run --config vitest.config.unit.ts
  test/unit/<archivo>.test.ts`. Solo incluye `test/unit/**`. Verificado: `test/unit/aura-amounts.test.ts`
  da 6 de 6 en verde.
- (plan 02) **No correr tests con la config por defecto** (`npx vitest run <archivo>` a secas): su
  `test/setup.ts` se cuelga 120 segundos provisionando la base de pruebas y deja los tests "skipped". Los
  tests de integración se escriben y se dejan para CI. Si un plan pide correr uno, se informa "queda para
  CI" y se sigue.
- (plan 02) `pnpm typecheck:tests` ya viene en rojo en este entorno (175 errores de base, en archivos
  ajenos). Se compara solo por los archivos tocados, no por el total.
- (plan 02) lint-staged no siempre reformatea: correr `npx prettier --write <archivos tocados>` antes de
  commitear.
- (plan 02) Los tests de integración que afirman montos viejos quedan rotos hasta el plan 03.
  `milestoneAura` mantiene su firma y devuelve 15 / 25 / 50. Los montos viven en
  `el-templo-api/src/modules/aura/amounts.ts`.
- (plan 03) `pnpm typecheck:tests` imprime mucho: filtrarlo con `grep` por los nombres de los archivos
  tocados. `attendance.test.ts` ya traía un TS2300 por un import duplicado: es previo, no se arregla.
- (plan 03) Quedan rotos a propósito hasta el plan 09 los tests `*-aura-cap`, `session-complete-streak` y
  las aserciones de `training_completion` en `streak-service`.
- (orquestador) **No aplicar migraciones en la base local** (`pnpm db:migrate`, `db:push`): la base local
  de Franco tiene datos de pruebas en curso. Las migraciones se escriben y se verifican por lectura y por
  su test, que corre en CI.
- (plan 04) La migración de re-valorización es la `0344_aura_revaluation.sql`. La numeración sigue desde
  la 0345 (planes 12 y 16), siempre verificando con `git fetch` que el número esté libre.
- (plan 04) En tests de integración, para sembrar `attendance` y `completed_sessions` sirve
  `app.dbPool.query` directo. `splitSqlStatements` ya saca los comentarios.
- (plan 04) El runner de migraciones saltea las sentencias que fallan con "already exists" y trata la
  migración como ya aplicada: por eso los `CREATE TABLE` de respaldo van primero.

