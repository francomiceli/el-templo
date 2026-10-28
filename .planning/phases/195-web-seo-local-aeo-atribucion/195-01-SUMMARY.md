---
phase: 195-web-seo-local-aeo-atribucion
plan: "01"
subsystem: api-db + web
tags: [seo, branches, migrations, sedes, drizzle, nuxt]
requires: []
provides:
  - "branches con 16 columnas web (fuente unica de sedes, D-10) + unique (tenant_id, web_slug)"
  - "Migracion 0271 con datos de sedes de produccion y WhatsApp de ventas AR/ES"
  - "Web estatica corregida: JBJ 1018, sin Chapadmalal, Park como espacio de comunidad, conteos derivados"
affects: [195-02, 195-03, 195-04]
tech-stack:
  added: []
  patterns:
    - "Conteos de copy derivados de data/sedes.ts (sedesCount), nunca literales"
    - "Test de migracion de datos sobre sedes preexistentes en la DB de test (INSERT solo de las que faltan, DELETE solo de las insertadas)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0270_branches_web_fields.sql
    - el-templo-api/src/db/migrations/0271_seed_branches_web.sql
    - el-templo-api/test/migrations/0270-0271-branches-web.test.ts
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/test/communications/prompt-endpoint.test.ts
    - el-templo-web/data/sedes.ts
    - el-templo-web/data/expansion-maps.ts
    - el-templo-web/app.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/pages/gladius.vue
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/components/SectionLocations.vue
    - el-templo-web/components/SectionConversion.vue
    - el-templo-web/components/SectionHero.vue
    - el-templo-web/components/SectionIdentity.vue
    - el-templo-web/components/FranExpansion.vue
    - el-templo-web/components/AppPrefooter.vue
    - el-templo-web/data/faq.ts
    - el-templo-web/data/academy.ts
    - el-templo-web/data/ecosystem.ts
    - el-templo-web/data/gladius.ts
    - el-templo-web/data/app-landing.ts
    - el-templo-web/data/franquicias.ts
    - el-templo-web/public/llms.txt
decisions:
  - "latitude/longitude con decimal mode number (drizzle-orm 0.45.1 lo admite): el schema devuelve number, el SQL crudo devuelve string"
  - "0270 como UN solo ALTER con las 16 columnas (atomico) mas un segundo ALTER para la unique, en vez de un ALTER por columna"
metrics:
  tasks: 3
  commits: 4
  completed: 2026-10-07
---

# Phase 195 Plan 01: Datos de sedes primero Summary

Fix de datos de sedes (D-01): la web estatica ya no publica "Alem 3958", Chapadmalal, "8 sedes" ni el `wa.me/54223XXXXXXX`, y `branches` queda con las columnas web y los datos de sedes (migraciones 0270/0271) que consumiran el endpoint (195-02) y el build (195-03).

## Commits

| Hash | Mensaje |
|------|---------|
| `f51c1bdd6` | feat(195-01): columnas web de branches + datos de sedes |
| `50714957f` | fix(195-01): JBJ 1018, sin Chapadmalal, Park comunidad y conteos reales |
| `013cf5359` | fix(195-01): restaurar finales de linea CRLF en academy.ts y llms.txt |

(El orden real fue web antes que API porque los tests de la API quedaron bloqueados por contencion de DB, ver "Issues". El contenido final de los tres commits es el pedido por el plan.)

## Tasks

1. **Columnas web + 0270/0271 + test** (`f51c1bdd6`): schema Drizzle (16 columnas + `uq_branches_tenant_web_slug`), SQL a mano en el bloque 0270-0279, test de 13 casos.
2. **Aplicar 0270/0271 en la DB local**: `pnpm db:migrate` OK, `_migrations` con las dos; segunda corrida imprime "No new migrations to apply". Sin commit (estado de DB).
3. **Parche de la web estatica** (`50714957f` + `013cf5359`).

## Estado de la DB local (`eltemplo`, tenant 1)

`pnpm db:migrate` tambien aplico migraciones de master que faltaban en la DB local compartida: 0254, 0258 (ademas de 0270 y 0271). Esta DB local no tiene sede BCN.

| code | web_slug | public_name | publish_on_web | web_kind |
|------|----------|-------------|----------------|----------|
| ALEM | juan-b-justo | Juan B. Justo | 1 | gym |
| CONST | constitucion | Constitución | 1 | gym |
| JUJUY | jujuy | Jujuy | 1 | gym |
| MOGOTES | mario-bravo | Mario Bravo | 1 | gym |
| MORENO | moreno | Moreno | 1 | gym |
| PARK | parque-primavesi | El Templo Park | 1 | community_space |
| ALBERTI | alberti | Alberti | 1 | gym |
| CHAPADMALAL | NULL | NULL | 0 | gym |
| ONLINE | NULL | NULL | 0 | gym |

`whatsapp.sales_number.AR = 5492235820521`, `.ES = 34680774331` en `tenant_settings`.

## Tests corridos

Todos en foreground, un archivo a la vez (con la config aislada, ver "Issues"):

| Archivo | Resultado |
|---------|-----------|
| `test/migrations/0270-0271-branches-web.test.ts` | 13/13 verdes (A forma x3, B datos x5 incl. otro tenant, C idempotencia, D WhatsApp x2, E sin `;` en comentarios x2) |
| `test/communications/prompt-endpoint.test.ts` | 14/14 verdes |
| `test/communications/sales-number.test.ts` | 6/6 verdes |
| `npx tsc --noEmit` (api) | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| Web: `nuxi typecheck` + `pnpm lint` | verdes (lint: 2 warnings `v-html` preexistentes) |
| Web: generate con prerender real + greps de aceptacion | sin "Alem 3958", "Chapadmalal", "8 sedes", "54223XXXXXXX", "logo-eltemplo.svg" en `.output/public`; `Juan B. Justo 1018` en `llms.txt`; "Espacio de comunidad" en `index.html` |

### Mutation testing (hecho, honesto)

- 0271 con 5 mutaciones a la vez: `INSERT IGNORE` -> `REPLACE INTO`, ES `...331` -> `...332`, PARK `community_space` -> `gym`, quitar `AND tenant_id = 1` del UPDATE de ALEM, un `;` dentro de un comentario. Fallaron exactamente los tests esperados: B datos (`expected 'gym' to be 'community_space'`), B otro gimnasio (`expected 'Juan B. Justo 1018' to be 'Calle ajena 1'`), D no pisa (`expected '5492235820521' to be '5491100000000'`), D siembra (`'34680774332'`), E (`;` en comentario). Los demas siguieron verdes.
- 0270 (reprovisionando la DB de test) con unique `(web_slug, tenant_id)` y `latitude decimal(9,5)`: fallaron A forma (`decimal(9,5)`) y A unique (`['web_slug','tenant_id']`).
- `prompt-endpoint.test.ts` sin la limpieza del namespace: falla con `expected '34680774331' to be null`. La limpieza que agregue es necesaria.

## Deltas de gates de tenancy

Ninguno. No hay tabla, ruta ni job nuevos. `branches` ya es gym-owned (`GYM_OWNED_TABLES` sigue en 99, `ENTRADAS_BASELINE` 447, `JOBS_ESPERADOS` 9). La unique nueva arranca con `tenant_id` (cumple el Test 5 de la 0196).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test de migracion rehecho para sedes preexistentes en la DB de test**
- **Found during:** Task 1 (primer run verde de provisioning)
- **Issue:** el plan decia "sembrando sedes con los codigos de prod (INSERT IGNORE)" y borrarlas en `afterAll`. La DB de test YA tiene PARK, CHAPADMALAL y ALBERTI (migraciones historicas) con `cash_registers` colgando por FK: el DELETE fallaba con `ER_ROW_IS_REFERENCED_2`.
- **Fix:** el test inserta solo las sedes que faltan, resetea las columnas web por UPDATE, y en `afterAll` borra solo las que inserto y reaplica la 0271 (idempotente) para dejar las preexistentes migradas.
- **Files modified:** `el-templo-api/test/migrations/0270-0271-branches-web.test.ts`
- **Commit:** `f51c1bdd6`

**2. [Rule 2 - Critical] Caso extra: la 0271 no toca sedes de otro gimnasio**
- Sin el filtro `tenant_id = 1` el UPDATE tocaria un `ALEM` de otro tenant (T-195-01). Se agrego el test (tenant propio 90195, mismo code y mismo `web_slug`, verifica ademas que la unique es por tenant). Su mutation fallo como se esperaba.

**3. [Rule 1 - Bug] Conteos hardcodeados en componentes no listados por el plan**
- **Found during:** Task 3
- **Issue:** `SectionHero.vue` y `SectionIdentity.vue` tenian `const sedesCount = 8;` (copy visible "8 sedes"); `FranExpansion.vue` tenia "7 sedes"; `pages/blog/[slug].vue` apuntaba al logo svg 404 en el schema del blog. El acceptance grep los habria encontrado.
- **Fix:** Hero/Identity/FranExpansion derivan de `sedesCount`; el blog usa `favicon-192x192.png`.
- **Commit:** `50714957f`

**4. [Rule 1 - Bug] CRLF normalizado a LF por mi script de edicion**
- `data/academy.ts` y `public/llms.txt` eran CRLF; mi edicion en Python los paso a LF y ensucio el diff (900+ lineas). Restaurado en un commit nuevo (`013cf5359`, sin amend); el diff neto de los dos commits es el cambio real.

**5. [Rule 3 - Blocking] `pnpm run generate` de la web no prerenderiza con `node_modules` symlink**
- Ver "Issues" mas abajo. Se verifico con una capa de Nuxt temporal fuera del repo; no se toco `nuxt.config.ts`.

**Otras diferencias menores:** las coordenadas de las otras sedes en `data/sedes.ts` se alinearon con la lista aproximada del plan (las anteriores eran inventadas); la unique en 0270 se escribio sin backticks para cumplir el grep del acceptance (`uq_branches_tenant_web_slug (tenant_id, web_slug)`); `drizzle decimal` con `mode: "number"`.

## Issues Encountered / Lecciones para los planes siguientes

1. **Otro ejecutor corre vitest en paralelo sobre el mismo MySQL (worktree `et-empeza`, fase 194).** El `globalSetup` de cada corrida hace `DROP DATABASE eltemplo_test_*`, asi que dos corridas simultaneas se destruyen mutuamente (`Unknown database 'eltemplo_test_1'`, `Table ... doesn't exist`). Perdi varias corridas y probablemente rompi alguna de ellas. **Solucion que funciona, sin tocar el repo:** crear TEMPORALMENTE copias con otro prefijo de DB y borrarlas despues (nunca commitearlas):
   ```
   cd /home/franco/projects/et-195-seo/el-templo-api
   sed 's/eltemplo_test_\${POOL_ID}/eltemplo_t195_${POOL_ID}/' test/setup.ts > test/setup-local195.ts
   sed -e "s/SCHEMA_NAME = 'eltemplo_test'/SCHEMA_NAME = 'eltemplo_t195_none'/" -e "s/LIKE 'eltemplo_test\\\\\\\\_%'/LIKE 'eltemplo\\\\\\\\_t195\\\\\\\\_%'/" test/setup-global.ts > test/setup-global-local195.ts
   sed -e 's#test/setup-global.ts#test/setup-global-local195.ts#' -e 's#test/setup.ts#test/setup-local195.ts#' vitest.config.ts > vitest.local195.config.ts
   pnpm exec vitest run --config vitest.local195.config.ts <archivo> --hookTimeout 600000
   ```
   (Para iterar sin reprovisionar: misma config sin la linea `globalSetup`; la DB `eltemplo_t195_1` persiste.) Antes de arrancar conviene mirar `ps -eo pid,args | grep "[v]itest.mjs"` para no pisar al otro. Para esperar a que termine sin loops: `timeout 570 tail --pid=<pid> -f /dev/null`.
2. **`--hookTimeout 600000` es obligatorio:** el provisioning de la DB de test tarda 2 a 6 minutos (hook por defecto: 120 s, falla con "Hook timed out").
3. **La DB de test ya contiene sedes reales** (PARK, CHAPADMALAL, ALBERTI, ONLINE, TEST) con `cash_registers`: nunca borrarlas, y la 0271 ya corrio sobre ellas en el provisioning (PARK/ALBERTI llegan con slug, CHAPADMALAL con publish 0). Las demas sedes (CONST, JUJUY, MORENO, ALEM, MOGOTES, BCN) NO existen en la DB de test: el endpoint 195-02 tiene que sembrarlas en su test.
4. **Web `generate` en este entorno:**
   - `better-sqlite3` esta compilado para Node 20 (ABI v115): usar `export PATH=/home/franco/.nvm/versions/node/v20.19.0/bin:$PATH` (con Node 22 revienta con "Module did not self-register").
   - Con `node_modules` symlink, `pnpm run generate` **sale con exit 0 pero NO prerenderiza las paginas** (`/` da 500 `Package import specifier "#internal/nuxt/paths" is not defined`, solo 5 rutas): es un falso verde. Causa: Nitro externaliza `node_modules/.cache/nuxt/.nuxt` porque su realpath cae en el checkout principal. Solucion verificada (24 rutas): una capa fuera del repo con
     `export default defineNuxtConfig({ nitro: { externals: { inline: ["/home/franco/projects/el-templo/el-templo-web/node_modules/.cache/nuxt/.nuxt"] } } })` y correr `pnpm exec nuxt generate --extends <carpeta-de-la-capa>`. Capa guardada en el scratchpad de esta sesion (`.../scratchpad/nuxt-layer/nuxt.config.ts`). El plan 195-03 (verify-seo-output) debe correr contra una salida generada asi.
   - Los errores `fetch failed` a `localhost:3000/api/...` durante el prerender (blog, gladius) son preexistentes (la API no corre).
   - `nuxt generate` deja untracked `el-templo-web/.data/` y el symlink `el-templo-web/dist`: borrarlos (`rm -rf .data; rm dist`) antes de commitear. Ademas escribe cache en `node_modules/.cache` del checkout principal (gitignored).
5. **CRLF:** `el-templo-web/data/academy.ts` y `public/llms.txt` son CRLF. Editarlos con herramientas que preserven `\r\n` (o reconvertir con `sed -i 's/$/\r/'` y revisar `git diff --stat`). El plan 195-03 convierte llms.txt en generado.
6. **`pnpm typecheck:tests` ya viene en rojo en este entorno** (259 errores vs baseline 175, DISCREPANCIAS 15, en archivos que no toque: attendance, analytics, check-ins-roster, tests unit con TS2835). Ninguno es de mis archivos (verificado con `tsc -p tsconfig.test-check.json | grep`). No usarlo como gate sin comparar contra la base.
7. **Las migraciones de master 0254/0258 estaban sin aplicar en la DB local `eltemplo`** (compartida con el checkout principal); `db:migrate` las aplico junto con 0270/0271.
8. **Rama del worktree:** `feat/195-seo-web` (no `worktree-agent-*`); los guards genericos de HEAD no aplican, commit directo en esa rama como pide EXECUTION-RULES.
9. Precaucion para 195-02: `select().from(schema.branches)` sin lista de columnas ahora devuelve las 16 columnas nuevas (incluidos `gbp_synced_hash`/`gbp_location_id`); el endpoint publico debe proyectar solo campos publicos.

## Known Stubs

Ninguno. `place_id`, `phone`, `postal_code`, `maps_url` quedan NULL a proposito (llegan con los links de Franco, plan 195-14). El `wa.me` de `AppPrefooter.vue` y los de `sedes.ts` siguen estaticos hasta el plan 195-03.

## Threat Flags

Ninguno nuevo. La 0271 corre contra prod al deployar (staging y prod comparten host MySQL): mitigado con UPDATE por `code` + `tenant_id = 1`, idempotencia e `INSERT IGNORE` (todo cubierto por tests con mutation).

## Self-Check: PASSED

- 0270, 0271, el test y este SUMMARY existen; commits `f51c1bdd6`, `50714957f`, `013cf5359` presentes en `git log`.
- Worktree limpio salvo este SUMMARY; sin archivos temporales (`*local195*`) ni `.data`/`dist` de la web.
