# Fase 169 — Handoff del checkpoint de rollout (169-09 Task 2)

**Escrito:** 2026-07-28. Sesión pausada para reiniciar Claude Code y cargar el MCP de Playwright.

## Estado exacto

- **Planes 01-08: COMPLETOS** (SUMMARYs commiteados en esta rama de planificación).
- **Plan 169-09: Task 1 (gate consolidado) VERDE. Task 2 (rollout) PENDIENTE — checkpoint humano bloqueante.**
- **NADA pusheado.** Cero SSH, cero installs, cero bump de versión.

## Topología (no cambiar)

- Código de la fase: worktree `/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, **18 commits**, HEAD = `a70ee297`, base = `origin/master` = `1200b8af`.
- Tracking `.planning`: checkout principal `/home/franco/projects/el-templo` en `fix/referral-preview-y-refresh-ficha` (rama de planificación; commits docs con `git add <ruta>` + `git commit -- <ruta>`, forma pathspec — el índice compartido tiene entradas stageadas ajenas).
- Checkout principal COMPARTIDO con otra sesión (9 archivos de código modificados ajenos): prohibido checkout/stash/reset/editar código ahí.
- `node_modules` del worktree: symlink BORRADO. Recrear cuando haga falta:
  `ln -s /home/franco/projects/et-167-columnas/el-templo-api/node_modules /home/franco/projects/et-169-tenant-layer/el-templo-api/node_modules`
  y borrarlo antes de mirar `git status`/commitear. Cero `pnpm install`.

## Resultado del gate (Task 1, ya verde — no re-correr salvo pedido)

- `tsc --noEmit` exit 0. Gate de `any`: 0 hallazgos en los 20 archivos de la fase.
- 11 archivos de test de a uno (`--no-file-parallelism`): **120/120 verdes** (13+8+18+7+6+16 nuevos; 7+10+6+12+17 regresión).
- Desviación ambiental: archivos 4 y 5 necesitaron `--hookTimeout=300000` por CLI (provisioning de 196 migraciones tarda 97-160 s; techo preexistente de `vitest.config.ts:42`). Si CI cae con `Hook timed out` NO es bug de la fase.
- Inventario `tenant-safe:`: los 9 esperados con motivo. El grep crudo da 11 archivos — los 2 extra son prosa (`require-tenant.ts:44` docblock de formato, `schema/tv.ts:81` cita). Nota para la fase 170: el sentinel debe anclar en comentario de bloque en el sitio del write.
- Migraciones: cero (tope sigue `0196`). Árbol: limpio, 31 archivos, todos de la lista esperada. `version.txt` intacto.

## Mecánica de rollout ya verificada

- `origin/master` = `1200b8af` sin moverse → push a master sería **fast-forward**.
- `origin/staging` = `f934693c` con **30 commits ajenos parados** (merges 166/167/168, fix Aura, firma Wellhub, TV 164, mig 0188) → push a staging vía **rama descartable basada en origin/staging + merge --no-ff** (patrón 168-06). Los 17 archivos que difieren master↔staging NO intersectan con los 31 de la fase.

## Señales pendientes (cada una habilita SOLO su etapa; releer 169-09-PLAN.md Task 2)

1. `aprobado staging` → etapa A: push rama a origin + merge a staging + poller de CI cada 90 s.
2. `aprobado prod` (tras CI verde) → etapa B: merge de master, typecheck del árbol mergeado, push a master, seguimiento hasta smoke test.

## Paso previo decidido por Franco: smoke visual con Playwright MCP ANTES de aprobar staging

- MCP `playwright` ya registrado (scope local del proyecto, `npx -y @playwright/mcp@latest`, health ✔). Se reinició la sesión para cargar sus tools.
- WSLg disponible (`DISPLAY=:0`) → navegador en modo **visible** (headed) para que Franco mire en vivo. En cache solo está `chromium_headless_shell`; para headed usar el tool de instalación del propio MCP si falta el chromium completo.
- Plan del smoke (fase 100% backend — el QA de valor es regresión E2E por UI):
  1. Recrear symlink de node_modules en el worktree (api) y symlink análogo para `el-templo-admin` (buscar fuente por lockfile en et-167/et-166, `cmp` — NUNCA pnpm install).
  2. Levantar el API del worktree contra la base local de dev (`.env` ya copiados por el plan 01).
  3. Levantar `el-templo-admin` en dev apuntando `VITE_API_URL` al API local.
  4. Con Playwright (headed): login admin → alta de socio asistida (ejercita `createMemberSchema` con `additionalProperties:false`) → cobro → reserva/turno → vista TV pairing si aplica. Verificar que todo se comporta igual que siempre (con 1 tenant activo el resultado debe ser idéntico).
  5. Reportar a Franco con lo visto; recién ahí él decide `aprobado staging`.
- Al terminar el smoke: bajar servers, borrar symlinks, dejar worktree limpio.

## Al reanudar

Leer también: `169-09-PLAN.md` (reglas de rollout en `<interfaces>`), SUMMARYs 01-08, y skill `el-templo-change-control`. El `169-09-SUMMARY.md` NO existe aún a propósito: se escribe al cerrar el rollout con señales, horas y SHAs.
