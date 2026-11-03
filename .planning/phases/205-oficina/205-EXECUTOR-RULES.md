# 205 — Reglas para los ejecutores (gsd-executor, sonnet)

Se pasan en el prompt de cada plan. Heredan las lecciones de la fase 204 (`../204-usuarios-wellhub/204-EXECUTOR-RULES.md`).

## Entorno
- Worktree: `/home/franco/projects/et-oficina`, rama `feat/oficina`. Trabajar SOLO acá. Nunca tocar `/home/franco/projects/el-templo` (checkout principal compartido) ni otros worktrees.
- Este worktree SÍ tiene `node_modules` (symlinks). Se puede y se DEBE correr, siempre en foreground y con timeout amplio (≥ 300000 ms):
  - API: `cd /home/franco/projects/et-oficina/el-templo-api && npx tsc --noEmit` y `pnpm lint:tenant`.
  - Admin: `cd /home/franco/projects/et-oficina/el-templo-admin && pnpm lint` (sin `--fix` masivo: arreglar a mano lo que toque a archivos propios).
- **NO correr tests de integración** (no hay MySQL local; CI los corre). Sí se puede correr un test unitario puro del admin con `npx vitest run <archivo>` desde `el-templo-admin` si el archivo no toca red ni DB.
- PROHIBIDO `run_in_background`, PROHIBIDO cualquier loop de espera con `pgrep`/`sleep`.
- Comandos de git simples y separados. `git add` SIEMPRE por path explícito, nunca `-A` ni `.`. No pushear. No bumps de versión. No instalar dependencias. No commitear archivos fuera del alcance del plan. Los hooks de pre-commit pueden no correr acá: seguir el estilo de los vecinos (comillas dobles en la API, simples en el admin).

## Código
- Sin `any` (usar `unknown` + narrowing o interfaces). `catch (err: unknown)` + `instanceof Error`.
- API: logger Pino (`request.log` / `fastify.log` / `pino({ name })`). Nunca `console.*`. Admin: `createLogger()` de `src/utils/logger.ts`.
- `request.user` es `{ userId, email, role }` (es `userId`, no `id`).
- Tenancy: toda query sobre tablas `office_*` con `tenantWhere(tabla, ctx)` / `tenantValues(ctx, {...})` (`modules/shared/tenant.ts`, import por path directo). `ctx = assertTenant(request.scope, "office.<accion>")` tras `attachCountryScope`. Lecturas a `users`, `branches`, `staff_shifts`, `wellhub_events`, `schedules`, `class_coach_assignments` también con `tenantWhere` (sentinel).
- Validación: JSON schema nativo de Fastify (`schemas.ts`), con `response` declarado (fast-json-stringify solo serializa propiedades declaradas).
- Textos de UI y de los eventos en español rioplatense. Paleta de marca cálida: `color="primary"`, nunca hex, nunca azul.
- Fechas "hoy" siempre con `todayInTz(timezone)` de `shared/date-utils`, nunca `new Date().toISOString().slice(0,10)`.
- Tests: no hardcodear ids de `users` (usar `createStaffUser`/`createTestMember`). Fechas relativas a hoy. Queries directas del test con `tenantWhere(tabla, TEMPLO_CTX)`.

## Cierre de cada plan
- Commits atómicos por tarea: `feat(205-NN): ...` / `test(205-NN): ...`, con línea final `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Escribir `.planning/phases/205-oficina/205-NN-SUMMARY.md` (desvíos, bugs encontrados, dudas para Franco con la opción conservadora tomada) y commitearlo.
- Dejar el worktree limpio (`git status --short` vacío).
