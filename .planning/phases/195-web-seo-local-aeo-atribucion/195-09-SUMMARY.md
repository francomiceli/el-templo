---
phase: 195-web-seo-local-aeo-atribucion
plan: "09"
subsystem: api-db
tags: [google, search-console, gbp, business-profile, jwt, rs256, cron, tenancy, migrations]
requires: ["195-08"]
provides:
  - "Migracion 0274: search_console_stats (strict en el modulo `marketing`), sin unique: idempotencia por borrar el periodo y reinsertar"
  - "Modulo marketing/google: config (null sin credenciales, con motivo), auth sin SDK (JWT RS256 con node:crypto + refresh token OAuth), SearchConsoleService, GbpSyncService, buildLocationPatch/patchHash puros"
  - "Job marketing-google: Search Console semanal (lunes 07:00 AR) y GBP diario (05:30 AR), por gimnasio con templo-marketing"
  - "Scripts locales scripts/gbp-authorize.ts (refresh token) y scripts/gbp-list-locations.ts (mapeo ficha -> sede, borrador de la 0276 con --write)"
affects: [195-10, 195-11, 195-14]
tech-stack:
  added: []
  patterns:
    - "Google sin SDK: fetch nativo + node:crypto (createSign RSA-SHA256), errores con status y codigo de error, jamas el cuerpo ni secretos"
    - "Patch parcial: cada clave ausente (horarios, telefono, direccion) queda FUERA del updateMask, porque con el mask completo Google borraria el dato de la ficha"
    - "Token lazy: una corrida de GBP apply sin cambios no toca a Google (ni el token endpoint)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0274_search_console_stats.sql
    - el-templo-api/src/db/schema/search-console-stats.ts
    - el-templo-api/src/modules/marketing/google/config.ts
    - el-templo-api/src/modules/marketing/google/auth.ts
    - el-templo-api/src/modules/marketing/google/gbp.ts
    - el-templo-api/src/modules/marketing/google/location-id.ts
    - el-templo-api/src/modules/marketing/google/search-console.ts
    - el-templo-api/src/jobs/marketing-google.ts
    - el-templo-api/scripts/gbp-authorize.ts
    - el-templo-api/scripts/gbp-list-locations.ts
    - el-templo-api/test/unit/google-auth.test.ts
    - el-templo-api/test/unit/gbp-patch.test.ts
    - el-templo-api/test/unit/gbp-scripts.test.ts
    - el-templo-api/test/unit/marketing-google-job.test.ts
    - el-templo-api/test/marketing/google-search-console.test.ts
    - el-templo-api/test/marketing/gbp-sync.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/src/index.ts
    - el-templo-api/.env.example
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
decisions:
  - "GBP arranca en off. En dry-run SIEMPRE valida con validateOnly=true (no guarda el hash). En apply solo manda si cambio el hash del patch; despues del 200 guarda hash y fecha"
  - "El patch omite lo que no tiene dato: sede sin horarios publicados (hoy Moreno) no manda regularHours, sin telefono propio ni WhatsApp no manda phoneNumbers, sin calle no manda storefrontAddress. El updateMask se arma con las claves presentes"
  - "Telefono de la ficha = branches.phone o, si no hay, +<WhatsApp de ventas del pais>"
  - "websiteUri = https://eltemplo.org[/es]/sedes/<slug>?utm_source=google&utm_medium=organic&utm_campaign=gbp-<slug> (la atribucion propia de 195-07 lo clasifica como google organico)"
  - "Search Console: periodo [hoy-9, hoy-3] en UTC, se baja TODO el periodo (paginado por startRow de 25000, tope 40 paginas) antes de abrir la transaccion de borrar y reinsertar: un fallo a mitad de camino no borra lo que habia"
  - "Credenciales globales (env), como Meta: si otro gimnasio recibe templo-marketing, el origen de la web (eltemplo.org) y las credenciales serian las de El Templo"
metrics:
  tasks: 3
  commits: 5
  completed: 2026-10-07
---

# Phase 195 Plan 09: Google (Search Console semanal + sync de Business Profile) Summary

Un job semanal trae de la API de Search Console consultas, clics, impresiones, CTR y posicion por pagina a `search_console_stats`, con JWT RS256 propio (`node:crypto`, sin SDK). Un job diario sincroniza horarios, telefono, direccion y web de cada ficha de Google Business Profile desde `branches`, detras de `GBP_SYNC_MODE` (off por defecto, `dry-run` valida sin aplicar, `apply` solo ante cambios). Los horarios salen de la misma funcion que publica la web (`WebPublicService.getPublishedBranchesWithHours` -> `computeOpeningHours`). Sin credenciales todo es un no-op con log, y las claves y los tokens no llegan a logs ni a Sentry. Dos scripts locales (solo escritos y testeados con mocks, no se ejecutaron contra Google) le dan a Franco el refresh token y el mapeo ficha -> sede.

## Commits

| Hash | Mensaje |
|------|---------|
| `dd7184ae6` | feat(195-09): migracion 0274 search_console_stats, auth de Google sin SDK (JWT RS256) y patch GBP puro |
| `f9f847d57` | feat(195-09): servicios Search Console y GBP, job marketing-google y tests con fetch mockeado |
| `351ac91f4` | feat(195-09): scripts locales de GBP (refresh token y mapeo ficha-sede) con tests con mocks |
| `2ec23a841` | test(195-09): mutation testing de auth/config/patch/scripts, parseCallback y test del scheduler de Google |
| (este) | docs(195-09): summary plan 09 |

## Como correr los dos scripts (para Franco, en SU PC, nunca en el server)

Prerequisitos en Google Cloud (detalle en la guia 195-14): proyecto GCP con las APIs de Business Profile habilitadas y **acceso a la API aprobado por Google** (formulario, perfil verificado hace 60+ dias), cliente OAuth tipo "Aplicacion web" con redirect URI `http://127.0.0.1:53682/callback`, pantalla de consentimiento en **"In production"** (en "Testing" el refresh token vence a los 7 dias) y entrar con el usuario owner/manager de las fichas.

1. **Refresh token**
   ```
   cd el-templo-api
   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... pnpm exec tsx scripts/gbp-authorize.ts
   ```
   Imprime una URL de consentimiento. Abrirla, entrar con el owner, aceptar. El script recibe el `code` en el loopback (valida un `state` aleatorio), lo canjea y muestra el `refresh_token`. Se cierra solo (a los 5 minutos si nadie autoriza). Cargar el valor como secret `GBP_REFRESH_TOKEN` (prod). No imprime el client secret ni el access token.
2. **Mapeo ficha -> sede**
   ```
   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... GBP_REFRESH_TOKEN=... \
     pnpm exec tsx scripts/gbp-list-locations.ts           # solo muestra
   ... pnpm exec tsx scripts/gbp-list-locations.ts --write # ademas escribe el borrador
   ```
   Lista cuentas y fichas (id, titulo, direccion) y sugiere la sede por numero de calle (CONST 6745, JUJUY 3761, MORENO 3751, ALEM 1018, ALBERTI 2024, MOGOTES 618, BCN 368). Una sede sin ficha, con mas de una ficha posible, o una ficha que encaja con dos sedes, queda SIN mapear y se informa (no se adivina). Con `--write` genera `src/db/migrations/0276_gbp_location_ids.sql` con un `UPDATE branches SET gbp_location_id = '<id>' WHERE code = '<CODE>' AND tenant_id = 1` por coincidencia (revisarlo a mano antes de commitear; no pisa un archivo existente). Solo hace GETs de lectura.

Ambos aceptan las variables en el entorno o en `.env.development`.

## Contrato de entorno (ya en `.env.example`; el cableado a deploy es 195-11)

| Variable | Uso |
|----------|-----|
| `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` | JSON de la service account en base64 (`base64 -w0 key.json`). Sin ella: Search Console apagado |
| `GOOGLE_SC_SITE_URL` | default `sc-domain:eltemplo.org` |
| `GBP_SYNC_MODE` | `off` (default) / `dry-run` / `apply`. Un valor invalido apaga (ante la duda, no escribir en fichas reales) |
| `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` | los tres, o GBP apagado con el motivo en el log (nombra la variable que falta, jamas su valor) |

**Staging NUNCA con estas variables** (comparte datos con prod y GBP escribe en fichas reales).

## Tests y resultados

Todos en foreground, un archivo por vez, con la config aislada `eltemplo_t195_*` (temporales borrados al terminar). `fetch` siempre mockeado con `vi.stubGlobal`: ningun test llama a Google. Un archivo con `globalSetup` primero (reprovisiono con 0274, ~215 s) y los demas con la config sin `globalSetup`.

| Archivo | Resultado |
|---------|-----------|
| `test/unit/google-auth.test.ts` (unit) | 32/32 |
| `test/unit/gbp-patch.test.ts` (unit) | 24/24 |
| `test/unit/gbp-scripts.test.ts` (unit, extra) | 23/23 |
| `test/unit/marketing-google-job.test.ts` (unit, extra) | 7/7 |
| `test/db/tenant-tables.test.ts` (con globalSetup) | 18/18 |
| `test/migrations/0192-0195-tenant-columns.test.ts` | 6/6 |
| `test/migrations/0196-tenant-unique-contracts.test.ts` | 12/12 |
| `test/marketing/google-search-console.test.ts` | 32/32 |
| `test/marketing/gbp-sync.test.ts` | 42/42 |
| `test/tenancy/con-04-crons-per-tenant.test.ts` | 8/8 |
| `npx tsc --noEmit` (api) | verde |
| tsc standalone de los 2 scripts (`--module nodenext ...`, comando del plan) | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| `pnpm typecheck:tests` | DISCREPANCIAS: 15 (igual que la base; ninguna en archivos de este plan) |
| `pnpm db:migrate` | aplico `0274_search_console_stats.sql` en `eltemplo` (local); `_migrations` la lista |
| Acceptance greps | `createSign` en auth.ts (2), sin `googleapis`/`google-auth-library` en package.json, sin `;` en comentarios de la 0274, `GBP_SYNC_MODE` x1 en `.env.example`, `getPublishedBranchesWithHours` y `validateOnly` en gbp.ts, `"marketing-google.ts"` x1 en CON-04, `startMarketingGoogleJob` x2 en index.ts, `0276_gbp_location_ids.sql` NO existe |

### Mutation testing (hecho, honesto)

Harness `mut09.py` en el scratchpad (sin commitear): verifica baseline verde por grupo antes de empezar y que el archivo quedo restaurado despues de cada mutante (`git diff --quiet` o, con cambios pendientes, restauracion exacta desde la copia en memoria). 141 mutantes: **134 muertos por tests, 2 muertos por `lint:tenant` y 5 equivalentes**.

- **auth + config + patch + location-id (49):** 49/49 muertos. Algoritmo, vida del JWT, `aud`, `kid`, firma (SHA1 / contenido equivocado), cuerpo del canje (grant_type, secret, refresh token), error con el cuerpo crudo, error de red con mensaje, `signal`, forma del codigo de error, scopes, defaults de config, modo case-insensitive, trim, dias, orden, `+` del WhatsApp, mask, hash.
- **Scripts + job + cableado (26):** 25 muertos, 1 equivalente (`J8`: quitar el `if` de "ambos null" no cambia lo que se agenda, solo el log).
- **Search Console (34):** 32 muertos, 2 equivalentes: `S23` (consulta ausente guardada como "" en vez de null: la linea de abajo `query.length > 0 ? ... : null` la convierte igual) y `J5a` (sin el guard de config el servicio revienta DENTRO del barrido por gimnasio, que lo absorbe: cero fetch y cero filas igual que con el guard; solo cambia el ruido de logs, mismo caso que J5 de 195-08).
- **GBP (32):** 28 muertos por tests. `V6` (UPDATE sin `tenantWhere`) y `V25` (SELECT de branches sin `tenantWhere`) sobreviven a los tests porque `branches` no es strict en el sentinel, pero **`pnpm lint:tenant` los mata** (DISCREPANCIAS: 1 con cada uno, verificado a mano). Equivalentes: `V29` (quitar el `return` temprano de "sin fichas mapeadas": solo evita una consulta) y `J5b` (igual que J5a).
- **Mejoras que salieron del proceso** (tests nuevos o codigo): access_token vacio (antes se habria usado un `Bearer ` vacio), codigo de error de Google solo si tiene forma de codigo (`^[a-z_]{1,40}$`), `private_key` vacio, trim del `client_email`, WhatsApp que ya trae `+`, dias de horario fuera de 1..7 y "todos invalidos", el hash ignora claves `undefined`, dry-run tras apply sigue validando (el corte por hash es solo de apply), `signal` en el PATCH, recorte del detalle de error de Google, `parseCallback` extraido del servidor de loopback para poder testear la validacion del `state`, `GBP_SCOPE` usado por el script de autorizacion (una sola fuente del scope), numeros del test de "numero de calle mas largo" que realmente contienen el de la sede (`16745` vs `6745`).
- No aparecieron bugs de produccion en el codigo ya commiteado; los hallazgos fueron huecos de cobertura.

## Deltas de gates de tenancy

| Gate | Delta |
|------|-------|
| `GYM_OWNED_TABLES` | 102 -> 103, +1 (`search_console_stats`) |
| `schemaTables` (tenant-tables.test) | 106 -> 107, +1 |
| `gymOwnedChecked` (0192-0195) | 102 -> 103, +1 |
| 0196 Test 10 (numero y texto) | 102 -> 103, +1 |
| `TENANT_STRICT_MODULES["marketing"]` | `["ad_spend_daily", "meta_capi_events", "signup_attributions"]` -> + `"search_console_stats"` (el modulo ya existia en `MODULOS_DECLARADOS`) |
| `TABLES_TO_CLEAN` | + `schema.searchConsoleStats` (sin FK a users, se limpia igual) |
| `JOBS_ESPERADOS` (CON-04) | 10 -> 11, +1 (`marketing-google.ts`, orden alfabetico: antes de `marketing-meta.ts`); titulo del Test 6 "los 11 jobs" |
| `ENTRADAS_BASELINE` | sin cambios (448): no hay rutas |
| `tenant-lint-allowlist.json` | sin tocar |

**Baselines resultantes para la integracion con 194/v6.1**: `GYM_OWNED_TABLES` 103 · `schemaTables` 107 · `gymOwnedChecked` 103 · 0196 Test 10: 103 · `ENTRADAS_BASELINE` 448 · `JOBS_ESPERADOS` 11. Sumar los deltas (+1, +1, +1, +1, +1), no copiar los numeros.

## Deviations from Plan

### Auto-fixed / agregado

**1. [Rule 1/2 - Critical] El patch es parcial y el `updateMask` sale de las claves presentes**
- **Issue:** el plan fija `updateMask=regularHours,phoneNumbers,storefrontAddress,websiteUri`. Con una clave ausente del body (sede sin horarios publicados como Moreno, sin telefono ni WhatsApp, sin calle) Google **borraria** ese dato de la ficha.
- **Fix:** `buildLocationPatch` omite lo que no tiene dato y `updateMaskFor(patch)` lista solo las claves presentes. Testeado con unit e integracion (Moreno no manda `regularHours`; sin WhatsApp no manda `phoneNumbers`).
- **Commit:** `dd7184ae6`, `f9f847d57`

**2. [Rule 2 - Critical] Token de acceso lazy**
- El plan decia solo "una segunda corrida sin cambios no hace PATCH". Ademas no pide el token a Google en esa corrida: en el uso normal (diario, sin cambios) GBP no toca la red. Un refresh token vencido se loguea una sola vez por gimnasio (`log.error` sin secretos) y cuenta cada ficha como fallida.
- **Commit:** `f9f847d57`

**3. [Rule 2 - Critical] Un 4xx/5xx/red/no-JSON de Search Console nunca borra datos**
- Se baja todo el periodo (todas las paginas) antes de abrir la transaccion de borrar y reinsertar. Testeado con una segunda pagina que falla (25000 filas en la primera).
- **Commit:** `f9f847d57`

**4. [Rule 3 - Blocking] `normalizeLocationId` en un modulo propio (`google/location-id.ts`, no listado en el plan)**
- **Issue:** el script `gbp-list-locations.ts` lo necesitaba y, importado desde `gbp.ts`, arrastraba el schema, Fastify y el servicio de la web; ademas el `tsc` standalone del plan fallaba por la augmentation de `FastifyRequest.user`.
- **Fix:** modulo minimo sin dependencias, importado por el servicio y por el script. Con eso el comando standalone del plan sale 0 sin `tsconfig.scripts.json` temporal.
- **Commit:** `351ac91f4`

**5. [Rule 2 - Critical] Tests extra no listados en el plan**
- `test/unit/gbp-scripts.test.ts` (matching ficha -> sede, SQL sin `;` en comentarios, canje del code, listado paginado, validacion del `state`) y `test/unit/marketing-google-job.test.ts` (cron y huso por tipo de credencial, try/catch por tick, cableado en `index.ts`). CLAUDE.md pide tests y el pedido de la fase pedia testear los scripts con mocks.
- **Commit:** `351ac91f4`, `2ec23a841`

**6. Otras diferencias menores**
- `config.ts` expone `resolveSearchConsoleConfig`/`resolveGbpConfig` (config + motivo) ademas de los `get*Config` del plan, para loguear por que quedo apagado sin filtrar valores.
- Los scripts llevan `/* tenant-safe: ... */` (no tocan la DB), como `wellhub-sandbox.ts`.
- `search_console_stats` en Drizzle declara el indice como `(tenant_id, period_end, page)` (Drizzle no expresa prefijos); el SQL real usa `page(191)`. El verificador de indices de la 0196 lo acepta.
- `GBP_SCOPE` se exporta de `auth.ts` y lo usa el script de autorizacion; el refresh token OAuth no lleva scope al renovar (va implicito en el consentimiento).

## Issues Encountered / Lecciones para los planes siguientes

1. **Estado entre tests que mutan datos compartidos:** un test que cambia el telefono o el id de ficha de una sede de fixture rompe a los siguientes si `beforeEach` no restaura TODAS las columnas mutables (me paso con `gbp_location_id` y `phone`). Restaurar por columna en `resetMine`, no solo el hash.
2. **El sentinel de tenancy no cubre `branches`** (no es strict): una consulta sin `tenantWhere` pasa los tests y la atrapa `pnpm lint:tenant`. Los mutantes de aislamiento sobre tablas no strict se verifican con el lint, no con vitest.
3. **Prettier sobre `test/unit/*.test.ts` con glob** reformatea archivos ajenos (me ensucio 5): pasar siempre rutas exactas. Los revertí con `git checkout -- <archivo>` antes de commitear.
4. **Mutantes de string con prettier:** el texto a mutar tiene que salir del archivo ya formateado (varios `old` del harness no matcheaban por saltos de linea de prettier; el harness los reporta como SKIP en vez de contarlos como muertos).
5. **`vi.mock("node-cron")` + `vi.hoisted`** permite testear el scheduler sin DB: capturar `schedule.mock.calls` (expresion, callback, `{ timezone }`) y ejecutar el callback con una `db` falsa verifica el try/catch de cada tick.
6. **DB de test:** `eltemplo_t195_1` queda provisionada con 0274; la proxima migracion (0275+) obliga a reprovisionar. Dos corridas de vitest de otra sesion (fase 194, `eltemplo_test_*`) siguieron activas todo el tiempo sin colisionar gracias al prefijo propio.

## Pendientes para Franco

1. **Search Console:** crear una service account en GCP (con la API de Search Console habilitada), agregar su `client_email` como usuario "Restricted" de la propiedad `sc-domain:eltemplo.org` (la propiedad se verifica por DNS, D-04) y cargar el JSON en base64 como secret `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` (el cableado a deploy lo hace 195-11). Hasta entonces el job queda apagado con log.
2. **Business Profile:** (a) solicitar el acceso a la API (formulario de Google, semanas, requiere perfiles verificados y activos hace 60+ dias); (b) crear el cliente OAuth "Aplicacion web" con la redirect `http://127.0.0.1:53682/callback` y pasar la pantalla de consentimiento a "In production"; (c) correr `gbp-authorize.ts` y `gbp-list-locations.ts --write`, revisar el borrador 0276 y commitearlo; (d) cargar los 3 secrets `GBP_*`; (e) activar primero `GBP_SYNC_MODE=dry-run` y mirar los logs (`GBP: no se pudo sincronizar una ficha` con el detalle de Google) antes de pasar a `apply`. **Hasta que Google apruebe la API el sync falla con 403/429 por ficha** (se loguea como warn, no rompe nada).
3. **Que se manda a la ficha:** si se manda `regularHours`, un dia SIN franja se interpreta como cerrado en Google. Las franjas salen de la grilla de clases regulares (D-30). Una sede sin horarios publicados (hoy Moreno, solo Yoga especial) NO toca los horarios de su ficha. Revisar en el dry-run que las franjas que arma `computeOpeningHours` coinciden con lo que quieren mostrar en Google.
4. **Telefono de la ficha:** si la sede no tiene `branches.phone`, se manda el WhatsApp de ventas del pais (`+5492235820521`, `+34680774331`). Si la ficha hoy muestra otro telefono, cargarlo en `branches.phone` antes de pasar a `apply` (sino se lo pisa con el WhatsApp).
5. **Credenciales globales:** como Meta, son del proceso, no del gimnasio. Si algun dia otro gimnasio recibe `templo-marketing`, su estadistica de Search Console iria al mismo tenant de la propiedad y las fichas llevarian `eltemplo.org` como web (el origen esta fijo en `gbp.ts`). Hoy solo El Templo lo tiene.
6. **Retencion de `search_console_stats`:** crece un periodo semanal por vez (hasta ~25000 filas por pagina de API, tope de 40 paginas). No hay purga: decidir una retencion (por ejemplo 12 meses) cuando se construya el reporte del admin.
7. **La migracion 0274 corre en prod al deployar** (tabla nueva, sin datos; staging y prod comparten host MySQL). El job nuevo arranca solo, pero queda apagado hasta que existan los secrets.
8. **Visibilidad en el admin:** este plan solo guarda los datos. La pantalla de Reportes que muestra `search_console_stats` es del plan 195-10.
9. **Para 195-14 (guia):** incluir los pasos de arriba (service account + usuario de la propiedad, solicitud de acceso a la API de GBP, OAuth in production, scripts locales, dry-run antes de apply) y que **staging nunca** lleva `GOOGLE_*`/`GBP_*`.
10. **Para 195-11 (deploy):** cablear `GOOGLE_SC_SERVICE_ACCOUNT_BASE64`, `GOOGLE_SC_SITE_URL` (opcional), `GBP_SYNC_MODE`, `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` solo en el workflow de prod. El scrub de Sentry de 195-08 ya redacta `assertion`, `refresh_token`, `client_secret`, `access_token` y `token`.

## Known Stubs

Ninguno. Los jobs estan completos y apagados por falta de credenciales (decision de diseno, no un stub). No hay UI en este plan: la visualizacion de `search_console_stats` es de 195-10.

## Threat Flags

Ninguno nuevo fuera del threat model. T-195-36 (la clave privada, la assertion, el client secret y los tokens no salen en errores ni en logs: tests con secretos centinela sobre cada camino de error y de log; Sentry ya los redacta desde 195-08), T-195-37 (GBP en `off` por defecto, `dry-run` solo con `validateOnly=true`, `apply` solo ante cambio de hash; con mutation), T-195-38 (Search Console con `webmasters.readonly`, GBP con `business.manage` en el refresh token del owner), T-195-39 (GSC semanal, GBP diario con PATCH solo ante cambios, errores aislados por ficha, tope de paginas) y T-195-40 (`.env.example` + nota en la guia) mitigados. Superficie agregada y mitigada: el id de ficha viaja en la ruta del PATCH, por eso `normalizeLocationId` solo acepta digitos (testeado con `locations/../accounts/9`); el servidor de loopback del script de autorizacion escucha solo en `127.0.0.1` y valida un `state` aleatorio.

## Self-Check: PASSED

- Archivos creados existen (0274, schema, 6 modulos `marketing/google`, job, 2 scripts, 6 archivos de test) y los 4 commits de codigo (`dd7184ae6`, `f9f847d57`, `351ac91f4`, `2ec23a841`) estan en `git log`.
- Sin `*local195*` ni `0276_gbp_location_ids.sql` en el worktree; sin borrados inesperados en los commits; worktree limpio salvo este SUMMARY.
