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
- **Tras 195-02 (2026-10-07):**
  - Iterar tests rápido: tras UNA corrida con `globalSetup` (~3 min), usar copia de la config SIN la línea `globalSetup` (la DB `eltemplo_t195_1` persiste, ~5 s por corrida).
  - El sentinel de tenancy aplica también en tests: todo acceso a tablas gym-owned (incluido cleanup) con `tenantWhere`/`tenantValues`. Un error en `finally` tapa las aserciones: verificar que el cleanup no falle.
  - `schedules` no tiene FK compuesta de tenant: todo JOIN con `activities`/`branches` lleva `tenantWhere` en cada tabla. `cleanAllTestData` no borra `branches`: borrar por `code` + `tenantWhere`.
  - `npx prettier --check <archivos>` antes de commitear.
  - **Sedes sin horarios publicados son válidas** (local: MORENO solo tiene Yoga especial → `openingHours: []`). Web/schema deben tolerarlo: página de sede publicada igual, sin `openingHoursSpecification` y con copy "consultá horarios por WhatsApp". NO cambiar el filtro D-30 (pregunta abierta para Franco en la guía final).
  - Endpoint: `GET /api/web/site-data` (módulo `src/modules/web-public/`), `ENTRADAS_BASELINE` ahora **448**; `KNOWN_KEY_PATTERNS` incluye `"web.%"`.
- **Tras 195-03 (2026-10-07):**
  - **NO pushear ni mergear esta rama antes del rollout en 2 pasos**: desde 195-03 el `build-web` de deploy falla si prod no tiene `/api/web/site-data` (lo resuelve 195-11 + `deploy/ROLLOUT-195.md`).
  - Contrato web: `import { webData, webSedes, findWebSede, brandName } from "~/data/sedes"`; rutas nuevas → `prerenderRoutes`; chequeos nuevos → al final de `CHECKS` en `scripts/verify-seo-output.mjs`. Blog: `updatedAt` puede ser null (usar `publishedAt`).
  - Generate local: `node scripts/fetch-web-data.mjs && pnpm exec nuxt generate --extends <capa>` (Node 20). La web no tiene `@types/node`: no importar `node:*` en `nuxt.config.ts`/código Nuxt.
  - **195-04 debe agregar al fixture una sede con `openingHours: []`** (y chequeo en el verificador: página publicada, sin `openingHoursSpecification`).
  - **Footer (decisión del orquestador):** `AppFooter.vue:106-108` deja de mostrar "Av. Constitución 6745" fijo → mostrar "<N> sedes en Mar del Plata + Barcelona" con link a `/sedes` (N desde los datos). Lo hace 195-04.
  - `llms.txt` ya enlaza `/sedes/<slug>` y `/es/sedes/<slug>`: esas páginas llegan en 195-04..06.
- **Tras 195-04 (2026-10-07):**
  - El crawler de nitro (`crawlLinks`) genera páginas linkeadas aunque no estén en `prerenderRoutes`: testear existencia en el verificador. Rutas nuevas (disciplinas, profes, primera clase, planes) → `prerenderRoutes(data)`; chequeos al final de `CHECKS`.
  - Reusar: `composables/useSedeSeo.ts`, `articleNode(post, author)` (acepta `Person`), `buildRegisterUrl(params, attribution)` (195-06), `sedePath`.
  - El fixture tiene casos borde a propósito (Moreno sin horarios, geo exacta/parcial, dirección con `</script>` en Mario Bravo): no "limpiarlos".
  - Harness de mutación web reutilizables en el scratchpad `mut04/` (sin commitear).
- **Tras 195-05 (2026-10-07):**
  - Formato: `.vue` de la web con `pnpm exec eslint --fix` (NO prettier: choca con `vue/html-self-closing`); `.ts`/`.mjs` con `npx prettier --write`.
  - Tras escribir regex con escapes unicode, verificar que no quedaron caracteres combinantes literales (U+0300-036F).
  - Para `/es`: `PlanesContent`/`PrimeraClaseGratisContent` ya reciben `country`; envolver en `PageShell` + `usePageSeo`.
  - Helpers del verificador: `parseDisciplinas`, `parseProfes`, `nameMatches`, `stripNonLdScripts`, flag `--src-data-dir`.
  - **Para 195-14 (guía final):** incluir la lista "Datos de contenido que Franco tiene que completar" de `195-05-SUMMARY.md` (profes, bio de Ignacio 10 vs 20 años, Aura Verticales/Acrobacias/Open Gym, planes, "Dónde se dicta", Moreno/D-30, tags del blog, títulos/metas).
- **Tras 195-06 (2026-10-07):**
  - Atributos de links que dependen del cliente: calcular en `onMounted` del propio componente (`app:mounted` no alcanza; Vue prod no corrige atributos al hidratar).
  - E2E de navegador real disponible sin instalar: Chrome por CDP con `node --experimental-websocket`, harness `mut06/e2e.mjs` del scratchpad (sin `--user-data-dir`, limpiar storage al arrancar).
  - `useState` no se llama en handlers async (usar `getConsent()`); `useHead({ link })` usa `type`; Nuxt auto-importa `utils/` (evitar exports con el mismo nombre).
  - **Contrato `/register` para 195-07** (en `195-06-SUMMARY.md`): `branchId`, `branchName`, `utm_*`, `fbclid`, `gclid`, `promo`, `src_ref`, `landing`, `ft`, `fbp`. La API revalida longitud y charset. En `/es` sin consentimiento no viaja ningún parámetro.
  - **Para 195-08 (extra, decisión del orquestador):** la reescritura de `/privacidad` también debe mencionar GA4 + Meta Pixel con consentimiento para Barcelona (el banner enlaza ahí), y agregar en el footer un link discreto "Barcelona" → `/es/` (hoy nada enlaza `/es`).
  - **Para 195-14 (guía):** pendientes de Franco de `195-06-SUMMARY.md` (UAT con IDs reales en /es, GA4 Realtime AR post-deploy, voseo/copy en /es y catálogo AR en /es/planes, altas BCN que rechazan banner llegan sin atribución).
- **Tras 195-07 (2026-10-07):**
  - Provisioning: UN archivo con `globalSetup` primero (~6 min); después los demás con la config sin `globalSetup`. Nunca 3 archivos a la vez con globalSetup (cuelga el hook). La DB `eltemplo_t195_1` tiene hasta 0272: una migración nueva (0273+) obliga a reprovisionar.
  - Antes de editar un `.ts` "caliente" de la API: `npx prettier --check` sobre la base; si está sucio, commit aparte solo de formato y los ganchos en helpers del módulo `marketing` (minimiza conflicto con 194).
  - AJV con `additionalProperties:false` DESCARTA claves no declaradas (no da 400): declarar todo campo nuevo del body.
  - `signup_attributions` NO guarda consentimiento ni país: CAPI (195-08) filtra España por país de la sede/tenant (D-25) e iOS/unknown por `platform` (D-24).
  - Baselines ahora: `GYM_OWNED_TABLES` 100 · `schemaTables` 104 · `gymOwnedChecked` 100 · 0196 Test 10: 100 · `ENTRADAS_BASELINE` 448 · `JOBS_ESPERADOS` 9 · módulo `marketing` en `TENANT_STRICT_MODULES`.
- **Tras 195-08 (2026-10-07):**
  - Lint de tenancy cuenta `schema.<tabla>` dentro de `sql` como acceso y exige `tenantValues` en el mismo `.values()`.
  - `bookings` unique `(socio, horario, fecha)`: varias reservas del mismo alumno en tests → fechas distintas. `createTestMember` ya deja una fila `signup_attributions` (`unknown`).
  - Harness de mutación: nunca bajo un `timeout` más corto que el lote; verificar baseline verde ANTES y archivo restaurado (`git diff --quiet <archivo>`) DESPUÉS de cada mutante.
  - Tests que siembren `ad_spend_daily` para el gimnasio 2: borrarla antes de `limpiarSegundoGimnasio`.
  - Env de Meta: `META_ACCESS_TOKEN` (no `META_CAPI_ACCESS_TOKEN`), `META_CAPI_START_AT`. Hay cron horario `runPiiPurge` (IP/UA > 7 días) que corre siempre.
  - Baselines: `GYM_OWNED_TABLES` 102 · `schemaTables` 106 · `gymOwnedChecked` 102 · 0196 T10: 102 · `JOBS_ESPERADOS` 10 · `ENTRADAS_BASELINE` 448.
  - **Para 195-14 (guía):** pendientes de `195-08-SUMMARY.md` (aprobar `/privacidad` + completar marcador de razón social/NIF/domicilio ES antes de deployar, no activar CAPI hasta tener el texto en prod, `test_event_code`, proceso de oposición manual, `META_*` jamás en staging).
- **Tras 195-09 (2026-10-07):**
  - `beforeEach` restaura TODAS las columnas que algún test muta. `branches` no es strict en el sentinel: su aislamiento lo verifica `lint:tenant`.
  - Prettier: rutas exactas, NUNCA globs (reformatea archivos ajenos).
  - Scheduler sin DB: `vi.mock("node-cron")` + `vi.hoisted`.
  - DB `eltemplo_t195_1` con hasta 0274.
  - Baselines: `GYM_OWNED_TABLES` 103 · `schemaTables` 107 · `gymOwnedChecked` 103 · 0196 T10: 103 · `JOBS_ESPERADOS` 11 · `ENTRADAS_BASELINE` 448.
  - **Para 195-11:** variables `GOOGLE_*`/`GBP_*`/`META_*` SOLO en prod, nunca staging.
  - **Para 195-14 (guía):** pasos de `195-09-SUMMARY.md` (service account SC, acceso GBP API, OAuth + scripts `gbp-authorize`/`gbp-list-locations`, borrador 0276, dry-run antes de apply). Destacar: si `branches.phone` está vacío el sync pone el WhatsApp de ventas del país como teléfono de la ficha → cargar teléfonos reales por sede ANTES de `apply`.
- **Tras 195-10 (2026-10-07):**
  - Columna física de `bookings` es `booking_status` (revisar el 1er arg de `mysqlEnum` antes de SQL literal). `scope.country` no es null para el owner: usar `scope.isOwner` (patrón `finance/routes.ts`).
  - Lint de tenancy: `tenantWhere(` en el propio statement; evitar aliases `const t = schema.x`.
  - Baselines: `ENTRADAS_BASELINE` 450 · `GYM_OWNED_TABLES` 103 · `schemaTables` 107 · `gymOwnedChecked` 103 · 0196 T10: 103 · `JOBS_ESPERADOS` 11.
  - **Para 195-14 (guía):** nombres de campaña de Meta con el slug de la sede (`juan-b-justo-octubre`) para bajar el gasto a sede; `utm_campaign={{campaign.name}}` obligatorio; retención de `search_console_stats`; moneda de la cuenta publicitaria AR (si factura en USD ajustar `COUNTRY_CURRENCY`).
- **Tras 195-11 (2026-10-07):**
  - `deploy-staging.yml` es CRLF, `deploy.yml` LF: normalizar y restaurar finales de línea al editar.
  - Un secret de la API solo llega al servidor con un deploy de la API (push a `el-templo-api/**` o dispatch `todo`); `solo-web` no lo actualiza.
  - **Para 195-13:** crear `deploy/RUNBOOK-195-NGINX.md` (lo referencia `ROLLOUT-195.md` §5).
  - **Para 195-14 (guía):** tabla de secrets de `195-11-SUMMARY.md` (solo prod), UAT del dispatch `solo-web` en staging después del paso 1 del rollout, paso 1 identificado por mensaje de commit, teléfonos reales antes de `GBP_SYNC_MODE=apply`.
- **Tras 195-12 (2026-10-07):**
  - `el-templo-app/node_modules` ya NO es symlink (install propio con el plugin `@capacitor-community/in-app-review` 8.0.0, aprobado por Franco). `src-capacitor/node_modules` también propio.
  - `upload-artifact@v4` descarta carpetas ocultas por defecto (`include-hidden-files`). **195-13:** revisar si `web-dist` tiene archivos ocultos con el mismo problema.
  - Archivos sin trackear al mutar: verificar restauración con `diff` contra respaldo (no `git diff`).
  - **Para 195-14 (guía):** fingerprints de `assetlinks.json` (Play Console, prod y staging) + `pnpm check-well-known --strict`; Associated Domains iOS `applinks:app.eltemplo.org`; ASO; builds de tienda (SIN bump en la fase: Franco decide la versión al armar el release); revisar `keep-awake` ausente en `src-capacitor/package.json`.
- **Franco 2026-10-07: NO hacer bump de versión de la app en esta fase.** El bump 1.9.0 (`079c5da2a`) se revirtió en `163b933e1`; `version.txt` queda en 1.8.1. Ningún plan toca `version.txt`, `package.json` "version" ni `bump-version.sh`. La guía (195-14) solo dice que la reseña in-app y la captura de origen requieren una build de tienda nueva, con la versión que Franco decida.
