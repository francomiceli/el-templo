# Reglas para ejecutores (milestone Egresos y rendiciones)

- Worktree ÚNICO: `/home/franco/projects/et-egresos`, rama `feat/egresos-rendiciones`. No tocar `/home/franco/projects/el-templo` ni otros worktrees. `node_modules` ya están (symlink a `et-199-mi-templo`): NO instalar ni actualizar dependencias.
- Leer `CLAUDE.md` del repo. Sin `any`, `catch (err: unknown)`, sin console.log (Pino en API, `createLogger()` en front). Comentarios en español.
- Migraciones: skill `.claude/skills/el-templo-db-migrations/`. Sin `;` dentro de comentarios SQL. Nunca `drizzle-kit migrate` ni `db:push`.
- Tests: SOLO los archivos tocados/creados, en FOREGROUND: `cd el-templo-api && npx vitest run <archivos> --hookTimeout=540000` (el provisioning de la DB de test tarda ~130 s). PROHIBIDO `run_in_background`, PROHIBIDO loops de espera con `pgrep`, PROHIBIDO la suite completa. Si el plan toca lecturas/inserts con tenancy, correr además `test/tenancy` relevantes que el plan indique.
- Typecheck: `cd el-templo-api && npx tsc --noEmit` = 0. Admin: `cd el-templo-admin && npx vue-tsc --noEmit` — línea base 27 errores preexistentes en `error TS`: no sumar.
- Commits atómicos por tarea con `git add` de archivos EXPLÍCITOS (nunca `-A` ni `.`). Mensajes en español (`feat(207): ...`, `fix(...)`, `test(...)`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Si lint-staged falla, arreglar y commit NUEVO (no amend).
- SUMMARY: escribir `NNN-PP-SUMMARY.md` junto al PLAN en `.planning/phases/<fase>/` del worktree `et-egresos` y commitearlo en la misma rama (commit `docs(NNN-PP): summary`). NO tocar STATE.md, NO usar `gsd-sdk state.*`, NO tocar el ROADMAP (lo marca el orquestador).
- NO pushear. NO bump de versión de la app.
- Si encontrás un bug real fuera del plan, arreglalo si es chico y está en el camino (documentarlo como desviación en el SUMMARY); si es grande, anotarlo en el SUMMARY y seguir.
- Si una decisión del plan resulta inviable: elegir la opción más conservadora, documentarla como desviación y seguir. No hacer preguntas bloqueantes.
