# Fase 195 — Reglas de ejecución (comunes a los 14 planes)

> Todo plan de la fase 195 referencia este archivo. El ejecutor lo lee COMPLETO antes de la primera tarea.
> El orquestador agrega abajo, en "Lecciones acumuladas", lo aprendido en cada plan.

## 1. Dónde se trabaja

- **Solo** en el worktree `/home/franco/projects/et-195-seo` (rama `feat/195-seo-web`). Rutas absolutas siempre.
- **Nunca** leer ni editar código en `/home/franco/projects/el-templo` (su `el-templo-web/` está atrasado). La única excepción: COPIAR archivos `.env*` gitignoreados (ver §2).
- Ejecución SECUENCIAL: un plan por vez, worktree compartido. No lanzar subagentes que editen en paralelo.

## 2. Entorno

- **Env de la API:** si falta `/home/franco/projects/et-195-seo/el-templo-api/.env.development`, copiar `.env` y `.env.development` desde `/home/franco/projects/el-templo/el-templo-api/` (cp). Verificar que siguen ignorados: `git -C /home/franco/projects/et-195-seo check-ignore el-templo-api/.env el-templo-api/.env.development` debe imprimir las dos rutas. Nunca commitearlos ni imprimir su contenido.
- **Dependencias:** el worktree nace sin `node_modules`. Si falta `node_modules` en el proyecto que el plan toca (`el-templo-api`, `el-templo-web`, `el-templo-app`, `el-templo-admin`, y la raíz para Husky), correr `pnpm install --frozen-lockfile` en ese directorio **solo si el prompt del orquestador dice explícitamente que Franco aprobó la instalación con lockfile**. Si no lo dice: DETENERSE y reportar "falta aprobación de pnpm install --frozen-lockfile". `--frozen-lockfile` no cambia el árbol de dependencias.
- **Prohibido** `pnpm add`, `pnpm update`, `pnpm install <paquete>`, `npx <paquete>@latest` o editar dependencias en `package.json`. La ÚNICA dependencia nueva de la fase es `@capacitor-community/in-app-review` y solo en el plan 195-12, detrás de su checkpoint.
- `vue-tsc` NO está instalado en app/admin: no instalarlo. App y admin se verifican con `pnpm lint` + `pnpm build`.

## 3. Tests y verificación (lecciones de la fase 173)

- Tests SIEMPRE en foreground, con timeout de Bash de 600000 ms. **Prohibido** `run_in_background`, `&`, loops de espera con `pgrep`/`sleep`, y correr dos vitest a la vez (se dropean las DB de test).
- Nunca la suite completa (la corre CI). Solo el/los archivo(s) que el plan nombra.
- API integración: `cd /home/franco/projects/et-195-seo/el-templo-api && pnpm exec vitest run test/<ruta>.test.ts`
- API unit (sin DB): `cd /home/franco/projects/et-195-seo/el-templo-api && pnpm exec vitest run --config vitest.config.unit.ts test/unit/<archivo>.test.ts`
- API typecheck: `npx tsc --noEmit` + `pnpm typecheck:tests`; lint de tenancy: `pnpm lint:tenant`.
- Web: `cd /home/franco/projects/et-195-seo/el-templo-web && pnpm exec nuxi typecheck && pnpm lint && pnpm run generate && node scripts/verify-seo-output.mjs` (el verificador existe desde el plan 195-03).
- App: `cd /home/franco/projects/et-195-seo/el-templo-app && pnpm lint && pnpm build` (+ `pnpm exec vitest run <archivo>` para unit tests).
- Admin: `cd /home/franco/projects/et-195-seo/el-templo-admin && pnpm lint && pnpm build`.
- Workflows YAML: `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" <archivos>`.

## 4. Base de datos

- Schema en `el-templo-api/src/db/schema/`; SQL **escrito a mano** en `el-templo-api/src/db/migrations/`, en el **bloque reservado 0270-0279** (D-28). Asignación: 0270 columnas web de `branches`, 0271 datos de sedes + WhatsApp, 0272 `signup_attributions`, 0273 tablas Meta, 0274 `search_console_stats`, 0275/0276 quedan para los datos de Franco (generador del plan 195-14).
- Antes de crear un archivo de migración, re-verificar que el número está libre en todas las ramas: `cd /home/franco/projects/et-195-seo && for b in $(git branch -a --format='%(refname:short)' | grep -v HEAD); do git ls-tree -r --name-only $b -- el-templo-api/src/db/migrations | grep -o '/0[0-9]\{3\}_' ; done | sort -u | tail`. Si 0270-0279 aparece ocupado por otra rama, DETENERSE y reportar.
- **Nunca** `;` dentro de un comentario `--` (el runner parte por `;` antes de sacar comentarios). **Nunca** `drizzle-kit push`/`drizzle-kit migrate`/`pnpm db:push`/`pnpm db:generate`.
- `mysqlEnum("<nombre_columna_físico>", [...])`: el primer argumento ES el nombre de columna y debe coincidir byte a byte con el SQL.
- El `.sql` va en el MISMO commit que el schema `.ts`.
- Datos de prod (sedes, slugs, WhatsApp) SOLO por migración, idempotentes y keyed por `code` + `tenant_id = 1`. Datos de test NUNCA en migración.
- Aplicar local: `cd /home/franco/projects/et-195-seo/el-templo-api && pnpm db:migrate` y confirmar con `SELECT name FROM _migrations ORDER BY name DESC LIMIT 3` (credenciales del `.env.development`; no imprimir la password).
- Ojo: la DB de test se provisiona aplicando TODAS las migraciones (`test/setup.ts`), así que todo INSERT de la 0271 existe en cada DB de test.

## 5. Gates de tenancy (al agregar tablas, rutas o jobs)

- Tabla gym-owned nueva → 5 lugares: `src/db/tenant-tables.ts` (`GYM_OWNED_TABLES` + `TENANT_STRICT_MODULES["marketing"]`), `test/db/tenant-tables.test.ts` (conteos `GYM_OWNED_TABLES.length` y `schemaTables.size` + `MODULOS_DECLARADOS`), `test/migrations/0192-0195-tenant-columns.test.ts` (`gymOwnedChecked`), `test/migrations/0196-tenant-unique-contracts.test.ts` (número y texto del Test 10), `TABLES_TO_CLEAN` en `test/helpers.ts` si tiene FK a `users`/`bookings`/`subscriptions` (antes de la tabla referenciada). Precedente exacto: `git -C /home/franco/projects/et-195-seo show 5442d4f28 -- el-templo-api/src/db/tenant-tables.ts el-templo-api/test/db/tenant-tables.test.ts el-templo-api/test/migrations el-templo-api/test/helpers.ts`.
- Ruta nueva → `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` y el título del `it` en `test/tenancy/iso-01-manifiesto.test.ts`.
- Job nuevo en `src/jobs/` → `JOBS_ESPERADOS` en `test/tenancy/con-04-crons-per-tenant.test.ts` (+ comentarios "N jobs"), cuerpo envuelto en `forEachActiveTenant` y salteando tenants sin el módulo `templo-marketing`.
- Accesos a tablas gym-owned: `tenantWhere`/`tenantValues` siempre; **nunca** sumar entradas a `tenant-lint-allowlist.json`.
- Baselines al arrancar la fase (base `30eef9921`): `ENTRADAS_BASELINE` 447 · `GYM_OWNED_TABLES` 99 · `schemaTables` 103 · `gymOwnedChecked` 99 · 0196 Test 10: 99 · `JOBS_ESPERADOS` 9. Cada SUMMARY anota el delta que aplicó ("447 → 448, +1") para que la integración con 194/v6.1 sume deltas en vez de copiar números.

## 6. Reglas de código

- Sin `any`; `catch (err: unknown)` + `instanceof Error`.
- API: Pino (`request.log`, `app.log`, `pino({ name })` en jobs). Fronts: `createLogger()` de `src/utils/logger.ts` (web: `utils/logger.ts`). Nunca `console.*` en código de app. Los scripts `.mjs` de build de la web escriben con `process.stdout.write`/`process.stderr.write`.
- Sin CDN nuevos. Sin SDKs de Meta/Google: `fetch` nativo + `node:crypto`.
- Composables con `cleanup()`, sin `onUnmounted` adentro. Stores Pinia con setup function.
- Integraciones externas: credenciales ausentes = no-op con `log.info`, nunca romper el arranque ni el build. Tokens nunca en logs (no loguear URLs con `access_token`).
- Env var nueva → `.env.example` del proyecto (el cableado a CI/CD lo hace el plan 195-11).

## 7. Commits

- `git -C /home/franco/projects/et-195-seo add <rutas explícitas>` — **nunca** `-A`, `.` ni `git commit -a`.
- Mensaje `feat(195-NN): ...` / `test(195-NN): ...` / `fix(195-NN): ...` / `docs(195-NN): ...`, en español, terminando con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Si lint-staged falla: arreglar y hacer un commit NUEVO (no `--amend`).
- **Nunca** `git push`. **Nunca** commitear en el checkout principal `/home/franco/projects/el-templo`.
- El SUMMARY del plan se escribe en `/home/franco/projects/et-195-seo/.planning/phases/195-web-seo-local-aeo-atribucion/195-NN-SUMMARY.md` y se commitea en el worktree.

## 8. Checkpoints

- Tareas `checkpoint:*`: el ejecutor se DETIENE, no ejecuta la acción gateada (SSH, instalación, push) y devuelve el bloque `## CHECKPOINT REACHED` con el texto exacto para Franco. Nunca se auto-aprueban.

## 9. Lecciones acumuladas (las agrega el orquestador después de cada plan)

- **Entorno ya preparado por el orquestador (2026-10-07):** `node_modules` de raíz, api, admin, app y web son SYMLINKS a instalaciones con lockfile idéntico a la base (no instalar nada, no correr `pnpm install`, no tocar los symlinks; están excluidos vía `.git/info/exclude`). `el-templo-api/.env` y `.env.development` ya copiados. Typecheck de la API verde en la base. DB local de dev = `eltemplo` (compartida con el checkout principal; aplicar 0270+ ahí está OK).
- **195-10 (del plan-checker):** las sedes de test con `web_slug` (`sede-a-195`, `sede-b-195`) también necesitan `publish_on_web = 1` para que la regla "exactamente una sede publicada" las vea.
- **Tras 195-01 (2026-10-07):**
  - **Otra sesión (fase 194) corre vitest sobre el mismo MySQL**: dos corridas con el mismo prefijo se dropean las DB. Usar SIEMPRE la config aislada `eltemplo_t195_*` (recetas `sed` exactas en `195-01-SUMMARY.md` §"Lecciones", archivos temporales sin commitear, borrarlos al terminar). Antes de correr: `ps -eo pid,args | grep "[v]itest.mjs"`; para esperar sin loops: `timeout 570 tail --pid=<pid> -f /dev/null`. Siempre `--hookTimeout 600000` (provisioning 2-6 min).
  - DB de test trae solo PARK, CHAPADMALAL, ALBERTI, ONLINE, TEST (con `cash_registers` por FK: nunca borrarlas). CONST/JUJUY/MORENO/ALEM/MOGOTES/BCN NO existen → sembrarlas en el test y borrar solo lo sembrado.
  - **Web `generate` en este entorno es falso verde** (exit 0 pero `/` da 500). Usar Node 20 (`PATH=/home/franco/.nvm/versions/node/v20.19.0/bin:$PATH`) y la capa `pnpm exec nuxt generate --extends /tmp/claude-1000/-home-franco-projects-el-templo/27b5606a-d446-4c12-be2b-97739cfcd25a/scratchpad/nuxt-layer`; verificar que salgan ~24+ rutas. Borrar `el-templo-web/.data/` y el symlink `el-templo-web/dist` antes de commitear. En CI (install fresco) no aplica.
  - `academy.ts` y `public/llms.txt` son CRLF: preservar `\r\n`.
  - `pnpm typecheck:tests` YA está rojo en la base (15 discrepancias ajenas): como gate, comparar contra la base, no exigir 0.
  - `select().from(schema.branches)` sin lista de columnas ahora trae las 16 columnas web (incluye `gbp_*`): el endpoint público proyecta SOLO campos públicos.
  - Conteos de copy en la web derivan de `sedesCount` (data/sedes.ts), nunca literales.
