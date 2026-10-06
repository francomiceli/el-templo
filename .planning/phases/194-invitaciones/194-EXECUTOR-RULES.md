# Fase 194 — Reglas para el ejecutor (gsd-executor, model sonnet)

Este archivo es INPUT de todos los planes 194-NN. Leerlo entero antes de la primera tarea.

## Entorno

- Worktree: `/home/franco/projects/et-194-invitaciones`, rama `feat/194-invitaciones`. Trabajar SOLO acá. Usar rutas absolutas en cada comando (el cwd se resetea entre llamadas).
- `node_modules` de los 3 paquetes y `.env`/`.env.development` de la API ya están symlinkeados/copiados. **PROHIBIDO instalar o actualizar dependencias** (`pnpm add`, `pnpm install`, `npm i`, `pnpm update`). Si algo "falta", parar y reportarlo en el SUMMARY.
- `vue-tsc` NO está instalado y NO se instala (D-27). Los frontends se verifican con `pnpm lint` + `pnpm build` (quasar build) dentro de cada paquete.

## Tests

- **SOLO en foreground**, con timeout amplio. Forma canónica:
  `cd /home/franco/projects/et-194-invitaciones/el-templo-api && timeout 900 pnpm exec vitest run <archivo1> [<archivo2>] --hookTimeout 600000`
- **PROHIBIDO** `run_in_background`, `&`, `nohup`, loops de espera con `sleep`/`pgrep`/`ps` (se matchean a sí mismos y quedan colgados). Nunca dos vitest a la vez (las DB por worker se pisan).
- **NUNCA la suite completa** (`pnpm test` sin archivo). Solo los archivos que el plan nombra en `<verify>`. La suite completa la corre CI.
- Si un test de integración falla por provisioning de DB (timeout de `provisionWorkerDB`, `ER_LOCK_DEADLOCK` en setup), re-correr UNA vez el mismo archivo antes de diagnosticar.
- Nunca hardcodear `users.id` en tests (crear usuarios con las fábricas). Fechas siempre relativas (`todayInTz(tz)`, `addDays`), nunca literales de calendario salvo en tests unitarios puros de funciones de fecha.
- Toda query directa a `users`/`subscriptions`/`invitations` en un test lleva `tenantWhere(tabla, TEMPLO_CTX)` (o el ctx del fixture) — si no, `lint:tenant`/`typecheck:tests` fallan.

## Gates estáticos (correr al cerrar cada tarea de API)

- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm exec tsc --noEmit`
- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm lint:tenant`
- `cd /home/franco/projects/et-194-invitaciones/el-templo-api && pnpm typecheck:tests` (cuando el plan toca tests)

## Código

- API: logs con `request.log`/`app.log`/`this.log` (Pino), nunca `console.*`. Front: `createLogger()` de `src/utils/logger.ts`.
- Sin `any`. `catch (err: unknown)` + `instanceof Error`.
- Toda query nueva: `tenantWhere(tabla, ctx)` en lecturas/updates, `tenantValues(ctx, {...})` en inserts, y `s.tenant_id = ${ctx.tenantId}` inline en SQL crudo (el lint juzga por statement). `tenant_id` SIEMPRE server-side, jamás del body.
- Comentar en español, con la decisión que se implementa (`// Fase 194 D-XX: ...`).

## Migraciones

- SQL escrito a mano en `el-templo-api/src/db/migrations/NNNN_nombre.sql`, **en el MISMO commit** que el schema `.ts`.
- Antes de crear una migración: `ls /home/franco/projects/et-194-invitaciones/el-templo-api/src/db/migrations/*.sql | sort | tail -3` y además `git -C /home/franco/projects/et-194-invitaciones ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | sort | tail -2` y lo mismo con `origin/staging`. La fase reserva **0255-0259**; si alguno ya está ocupado en master/staging, PARAR y reportar (no renumerar por cuenta propia).
- **NUNCA** `;` dentro de un comentario `--`. **NUNCA** `drizzle-kit push`, `drizzle-kit migrate`, `pnpm db:push`, `pnpm db:generate`.
- `mysqlEnum("nombre_columna", [...])`: el primer argumento ES el nombre físico de la columna y debe coincidir byte a byte con el SQL (nombre y lista de valores en el mismo orden).
- Statements de datos idempotentes (`WHERE NOT EXISTS`, guards por estado esperado). Datos de test NUNCA en una migración.
- **NO correr `pnpm db:migrate` ni `pnpm db:verify-uniques`** contra la DB local `eltemplo`: la comparten otros worktrees (tren v6.1 con otras migraciones). La DB de test por worker se provisiona sola.
- El "push de schema" de esta fase = los tests de integración provisionan la DB de test con el runner propio (`test/setup.ts` → `splitSqlStatements`). Un plan de schema NO está completo hasta que un test que toca la tabla/columna nueva pasa.

## Git

- `git add` SIEMPRE por ruta explícita. **PROHIBIDO** `git add -A`, `git add .`, `git commit -a`.
- Un commit por tarea: `feat(194-NN): ...`, `test(194-NN): ...`, `fix(194-NN): ...`.
- **NO commitear docs fuera de `.planning/phases/194-invitaciones/`** (nada de STATE.md, ROADMAP.md, memorias). El SUMMARY del plan sí va en el phase dir.
- Si el pre-commit (lint-staged) falla: arreglar y hacer un commit NUEVO (no `--amend`).
- **NUNCA** `git push`, nunca SSH, nunca tocar `master`/`staging`.
- `git stash` prohibido (stack compartido entre worktrees).

## Lecciones acumuladas de la fase

(El orquestador agrega acá, entre planes, las trampas que encontraron los ejecutores anteriores. Leerlas.)
