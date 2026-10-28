# Fase 197 — Reglas para el ejecutor (gsd-executor, model sonnet)

Este archivo es INPUT de todos los planes 197-NN. Leerlo entero antes de la primera tarea. Ante una duda de
producto manda `197-CONTEXT.md` (D-01..D-18) y, detrás, `/home/franco/projects/el-templo/.docs/entrenar-197-decisiones.md`.

## Entorno

- Worktree: `/home/franco/projects/et-197-entrenar`, rama `feat/197-entrenar`. Trabajar SOLO acá, con rutas absolutas en
  cada comando (el cwd se resetea entre llamadas).
- El checkout principal `/home/franco/projects/el-templo` es de SOLO LECTURA para esta fase: se leen por ruta absoluta
  `.docs/entrenar-rediseno/...`, `.docs/entrenar-197-decisiones.md` y `.planning/sketches/015-entrenar-hoy/`,
  `016-player-bloque-libre/`. Única excepción: el plan 197-22 escribe SOLO bajo
  `/home/franco/projects/el-templo/.docs/entrenar-rediseno/despues/`.
- **No hay `node_modules` en el worktree y NO se instalan** (D12 del registro de decisiones, Franco). PROHIBIDO
  `pnpm install`, `pnpm add`, `npm i`, `pnpm update`, symlinks a los `node_modules` del checkout principal y cualquier
  comando que dependa de ellos (`pnpm test`, `pnpm exec vitest`, `tsc`, `vue-tsc`, `pnpm lint`, `pnpm lint:tenant`,
  `quasar build`). Si un plan parece necesitarlos, PARAR y reportarlo en el SUMMARY.
- Sin dependencias nuevas. Sin CDN. Sin bump de versión (`version.txt`, `package.json` quedan como están).

## Cómo se verifica cada plan (no hay typecheck ni tests locales)

- Los tests se ESCRIBEN (integración del API en `el-templo-api/test/`, unitarios donde hay lógica pura) pero corren en
  **CI**, no acá. El `<verify>` de cada tarea es estático: `grep`, `cmp`, `test -f`, `python3 -I -c` sobre el texto de
  los archivos, y revisión del diff (`git diff --stat`, `git diff <archivo>`).
- Comandos SOLO en primer plano. PROHIBIDO `run_in_background`, `&`, `nohup`, loops de espera con `sleep`/`pgrep`/`ps`.
- Greps de higiene en todo archivo tocado (tienen que NO imprimir nada):
  - `grep -nE "console\.(log|warn|error|info|debug)" <archivos>` (front: `createLogger()`; API: `request.log`/`fastify.log`).
  - `grep -nE ":\s*any\b|<any>|as any\b" <archivos>` (sin `any`; `catch (err: unknown)` + `instanceof Error`).
  - En `.vue`/`.scss` nuevos o tocados por D-16: `grep -nE "^\s*color:\s*rgba\(|^\s*color:\s*\\\$grey" <archivos>`
    (texto siempre en color sólido; `rgba` está permitido en fondos, sombras y bordes, nunca en `color:`).
- `grep -c` cuenta comentarios: si un gate cuenta tokens, filtrar comentarios antes
  (`grep -vE "^\s*(//|\*|/\*|<!--)" archivo | grep -c token`). Nunca un gate `== 0` sobre un archivo sin filtrar.
- Al cerrar cada plan: `git -C /home/franco/projects/et-197-entrenar status --porcelain` tiene que salir VACÍO.

## Código

- API: Fastify + Drizzle. Logs con `request.log` / `fastify.log` (Pino). Toda query NUEVA sobre una tabla gym-owned lleva
  `tenantWhere(tabla, ctx)` en lecturas/updates/deletes y `tenantValues(ctx, {...})` en inserts (`src/modules/shared/tenant.ts`,
  import por path directo). En `sql` crudo, `tenant_id = ${ctx.tenantId}` inline. El `ctx` sale SIEMPRE de
  `attachCountryScope(request, fastify.db)` + `assertTenant(request.scope, "<etiqueta>")`, nunca del body ni del query.
  `lint:tenant` corre en CI y falla con un acceso nuevo sin tenant.
- Columnas en `.select({...})` de un join: SIEMPRE calificadas (`schema.tabla.columna`).
- Front (Quasar + Vue 3.5 + Pinia setup stores): `createLogger()` de `src/utils/logger.ts`; composables exponen
  `cleanup()` y NO usan `onUnmounted` adentro; stores Pinia con `defineStore('x', () => {...})`.
- Formato a mano (en este worktree el pre-commit NO corre: `core.hooksPath=.husky/_` no existe acá, así que nadie formatea por vos). App (`el-templo-app/.prettierrc.json`): sin punto y coma, comillas simples, ancho 100, 2 espacios. API (Prettier por defecto): con punto y coma, comillas dobles, ancho 80, comas finales. Imitar el archivo vecino.
- Copy en español rioplatense con voseo y tildes ("clase", nunca "turno"). Comentarios en español citando la decisión
  (`// Fase 197 D-12: ...`).
- Tokens visuales: SOLO los de `src/css/_premium-card.scss` y `src/css/_brand.scss` (el plan 197-10 agrega los que faltan).
  No copiar CSS de los sketches ni hex sueltos en componentes nuevos salvo los que el plan nombra explícitamente.
  Escala tipográfica 28 / 17 / 16 / 13 / 11 (D-18). Hitbox ≥ 44 px en todo lo tocable. Margen 16, grilla de 8.
- Movimiento: toda animación nueva va dentro de `@media (prefers-reduced-motion: no-preference)`.

## Migraciones (planes 197-01)

- SQL a mano en `el-templo-api/src/db/migrations/NNNN_nombre.sql`, en el MISMO commit que el schema `.ts`.
- Numeración de la fase: **0285 y 0286**. La 0284 queda libre para la 196 (D restricciones). Antes de crear, chequear:
  `ls /home/franco/projects/et-197-entrenar/el-templo-api/src/db/migrations/*.sql | sort | tail -3` y
  `git -C /home/franco/projects/et-197-entrenar ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | sort | tail -3`
  (idem `origin/staging`). Si 0285/0286 ya existen en alguna, PARAR y reportar (no renumerar por cuenta propia).
- NUNCA `;` dentro de un comentario `--`. NUNCA `drizzle-kit push/migrate`, `pnpm db:push`, `pnpm db:generate`, `pnpm db:migrate`.
- `mysqlEnum("nombre_columna", [...])`: primer argumento = nombre físico de la columna; lista idéntica al SQL, valores
  nuevos AL FINAL.
- Datos de prod (la fila de `aura_config`) por migración, idempotente (`INSERT IGNORE`). Datos de test NUNCA en migración.

## Tests de integración del API (se escriben, corren en CI)

- Usuarios con las fábricas (`createTestMember`, `registerUser`); NUNCA ids de `users` hardcodeados.
- Fechas relativas: `todayInTz(tz)`, `shiftDate`, `mondayOf`, `dateToWeekNumber`, `dateToDayName`. Para fijar "hoy" se usa
  SOLO `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)` calculado desde `Date.now()` real, ANTES de
  loguear, y `vi.useRealTimers()` en `afterEach` (precedente `test/invitations/access-usage.test.ts`).
- `aura_config` NO se puede dar por sembrada: otros archivos del mismo worker la borran
  (`test/sessions/session-complete-streak.test.ts`). Todo archivo que dependa de la fuente `extra_block` la re-siembra en
  `beforeEach` (`INSERT ... ON DUPLICATE KEY UPDATE default_amount = 5`).
- `cleanAllTestData` no limpia `tenant_settings` ni `aura_config`. Queries directas de test sobre tablas strict
  (`users`, `subscriptions`, `extra_blocks_completed`) llevan `tenantWhere(tabla, CTX)`.
- Fixtures de sesiones de la fase: `el-templo-api/test/sessions/_free-blocks-fixtures.ts` (lo crea el plan 197-04). Reusarlo.

## Git

- `git add` SIEMPRE por ruta explícita. PROHIBIDO `git add -A`, `git add .`, `git commit -a`, `git stash`.
- Un commit por tarea: `feat(197-NN): ...`, `test(197-NN): ...`, `refactor(197-NN): ...`, `fix(197-NN): ...`.
  Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (o el que indique el orquestador).
- NO commitear docs fuera de `.planning/phases/197-entrenar-tabs-canasta-bloque-libre/` (nada de STATE.md, ROADMAP.md,
  memorias). El SUMMARY del plan sí va en el phase dir.
- NUNCA commitear en el checkout principal. NUNCA `git push`, nunca SSH, nunca tocar `master`/`staging`.
- Si un commit falla por un hook, NO usar `--no-verify` ni tocar `core.hooksPath`: parar y reportarlo.

## Lecciones acumuladas de la fase

(El orquestador agrega acá, entre planes, las trampas que encontraron los ejecutores anteriores. Leerlas.)
