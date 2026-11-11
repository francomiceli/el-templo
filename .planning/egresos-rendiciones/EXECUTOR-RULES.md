# Reglas para ejecutores (milestone Egresos y rendiciones)

- Worktree ÚNICO: `/home/franco/projects/et-egresos`, rama `feat/egresos-rendiciones`. No tocar `/home/franco/projects/el-templo` ni otros worktrees. `node_modules` ya están (symlink a `et-199-mi-templo`): NO instalar ni actualizar dependencias.
- Leer `CLAUDE.md` del repo. Sin `any`, `catch (err: unknown)`, sin console.log (Pino en API, `createLogger()` en front). Comentarios en español.
- Migraciones: skill `.claude/skills/el-templo-db-migrations/`. Sin `;` dentro de comentarios SQL. Nunca `drizzle-kit migrate` ni `db:push`.
- Tests: SOLO los archivos tocados/creados, en FOREGROUND: `cd el-templo-api && npx vitest run <archivos> --hookTimeout=540000` (el provisioning de la DB de test tarda ~130 s). PROHIBIDO `run_in_background`, PROHIBIDO loops de espera con `pgrep`, PROHIBIDO la suite completa. Si el plan toca lecturas/inserts con tenancy, correr además `test/tenancy` relevantes que el plan indique.
- Typecheck: `cd el-templo-api && npx tsc --noEmit` = 0. Admin: `cd el-templo-admin && npx vue-tsc --noEmit` — línea base 27 errores preexistentes en `error TS`: no sumar.
- Commits atómicos por tarea con `git add` de archivos EXPLÍCITOS (nunca `-A` ni `.`). Mensajes en español (`feat(209-03): ...`, `fix(...)`, `test(...)`), terminando con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Si lint-staged falla, arreglar y commit NUEVO (no amend).
- SUMMARY: escribir `NNN-PP-SUMMARY.md` junto al PLAN en `.planning/phases/<fase>/` del worktree `et-egresos` y commitearlo en la misma rama (commit `docs(NNN-PP): summary`). NO tocar STATE.md, NO usar `gsd-sdk state.*`, NO tocar el ROADMAP (lo marca el orquestador).
- NO pushear. NO bump de versión de la app.
- Si encontrás un bug real fuera del plan, arreglalo si es chico y está en el camino (documentarlo como desviación en el SUMMARY); si es grande, anotarlo en el SUMMARY y seguir.
- Si una decisión del plan resulta inviable: elegir la opción más conservadora, documentarla como desviación y seguir. No hacer preguntas bloqueantes.
- **Plata en unidades ENTERAS (D-23).** Columnas `int`, schemas Ajv `type: "integer"`, aritmética entera. No existen `shared/money.ts`, `MoneyInput` ni `utils/money`: no recrearlos. El único decimal permitido es el tipo de cambio (`fx_rate`), que es informativo y nunca se suma.
- Tests: como mucho 2 archivos por corrida de vitest. Si una corrida falla con `Hook timed out` en `test/setup.ts` sin ejecutar tests, es el provisioning de la DB: reintentar una vez, sin correr `tsc` en paralelo. `npm run -s typecheck:tests` debe seguir en 18 discrepancias.
- Admin: tests unitarios con `cd el-templo-app && npx vitest run --root ../el-templo-admin <archivo>`. App: `cd el-templo-app && npx vue-tsc --noEmit` línea base 21.
- Fallos preexistentes que no son tuyos: 2 en `coach-load-alta.test.ts` y 1 en `office-routes.test.ts`.
- Sedes: siempre por su nombre de `branches`, nunca cantidades fijas ("las sedes de Argentina", no "las 6").
- Fastify corre con `removeAdditional` y `coerceTypes`: un campo extra del body se descarta sin 400, y `"12"` se convierte a 12.

## Cadena de la fase 209 (valen para todos sus planes)

- Leer antes de empezar: este archivo, `.planning/phases/209-egresos/209-CONTEXT.md`, el PLAN propio completo, los SUMMARY de los planes anteriores de la 209 (traen las firmas exportadas: usarlas, no reimplementar) y el `CLAUDE.md` del repo.
- Corridas de vitest: timeout del Bash de 600000 ms. No correr `tsc` en paralelo con vitest. Si el harness manda una corrida larga a segundo plano por su cuenta, esperarla con UN solo comando bloqueante (`tail --pid=<pid> -f /dev/null`) y leer el resultado completo.
- Gates de API: `npx tsc --noEmit` = 0, `npm run -s lint:tenant` = `DISCREPANCIAS: 0`, `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`.
- Gates de admin: `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 | grep -c "error TS"` = 27. Sin `console.*` (usar `createLogger()`), sin `any`, composables con `cleanup()` y sin `onUnmounted`, paleta cálida de la marca y sin azul, textos en español rioplatense con acentos.
- Tenancy: queries con `tenantWhere`/`tenantValues`. Nunca tocar la allowlist del lint de tenancy. No hardcodear ids de `users` en tests.
- `transaction-service.ts`, `movement-service.ts` y `cash-register-service.ts` son caminos de cobro y de Caja en producción: cambio mínimo y explicable en una línea, sin refactorizar alrededor. `test/finance/no-regresion-208.test.ts` queda verde SIN tocarlo.
- Migración de la fase: `0331_egresos_gastos_repartos_pagos.sql`, ya creada. Si un plan necesitara otra, va desde la 0332 y se anota en el SUMMARY.
- SUMMARY de cada plan: qué se hizo, desviaciones, decisiones del ejecutor, resultados exactos de tests y gates, y firmas exportadas o datos que necesitan los planes siguientes. El árbol queda limpio al final.
