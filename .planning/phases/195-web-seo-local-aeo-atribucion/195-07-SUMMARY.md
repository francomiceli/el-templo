---
phase: 195-web-seo-local-aeo-atribucion
plan: "07"
subsystem: api-db + admin + app
tags: [attribution, signup, channel, ia, tenancy, capi-prereq, migrations]
requires: ["195-06"]
provides:
  - "Tabla signup_attributions (mig 0272), tenant-scoped, modulo strict `marketing`"
  - "classifyChannel puro (IA > manual > utm/click ids > ref > promo > referrer > directo) + CHANNELS, AI_HOSTS, MANUAL_ORIGINS, MANUAL_ORIGIN_CHANNEL"
  - "recordSignupAttribution / recordSignupAttributionBestEffort / recordRegisterAttribution (marketing/attribution-service.ts)"
  - "POST /api/auth/register acepta `attribution`; POST /api/admin/members/trial acepta `origin` (enum) y `campaign`"
  - "App: utils/attribution.ts (first-touch + payload) y boot `attribution`; encabezado de /register con la sede"
affects: [195-08, 195-10]
tech-stack:
  added: []
  patterns:
    - "Gancho en ruta caliente = 1 llamada a un helper del modulo (recordRegisterAttribution): el diff en auth/routes.ts queda en 11 lineas"
    - "Atribucion best-effort: schema valida largo (400), el servicio revalida charset y DESCARTA lo invalido en vez de rechazar el alta"
key-files:
  created:
    - el-templo-api/src/db/migrations/0272_signup_attributions.sql
    - el-templo-api/src/db/schema/signup-attributions.ts
    - el-templo-api/src/modules/marketing/channel.ts
    - el-templo-api/src/modules/marketing/attribution-service.ts
    - el-templo-api/src/modules/marketing/schemas.ts
    - el-templo-api/test/unit/marketing-channel.test.ts
    - el-templo-api/test/marketing/attribution.test.ts
    - el-templo-app/src/utils/attribution.ts
    - el-templo-app/src/utils/__tests__/attribution.test.ts
    - el-templo-app/src/boot/attribution.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-admin/src/components/TrialMemberFormDialog.vue
    - el-templo-admin/src/types/member.ts
    - el-templo-app/quasar.config.js
    - el-templo-app/src/pages/RegisterPage.vue
    - el-templo-app/src/stores/useAuthStore.ts
decisions:
  - "Largo fuera de rango en `attribution` = 400 (lo pedia el plan, T-195-24); charset invalido (fbclid/gclid/fbp/host/landing/ft implausible/caracteres de control) = se descarta el campo, el alta sigue"
  - "El primer origen gana: segundo insert para el mismo usuario no pisa (ON DUPLICATE KEY UPDATE id = id)"
  - "Un utm_source/medium que no se reconoce da canal 'otro' y GANA a ref/promo/referrer (utm explicito); una campana sola no cambia el canal"
  - "utm_source=meta (sin medio) es meta_ads: es la etiqueta de los anuncios. instagram/facebook sin medio pago son organicos"
  - "El origen manual del admin (MANUAL_ORIGINS) se resuelve primero en classifyChannel; el admin_trial guarda la 'campana' en utm_campaign"
  - "x-real-ip con lista ('a, b') no pasa net.isIP: queda NULL (no se adivina cual es la IP real)"
metrics:
  tasks: 3
  commits: 5
  completed: 2026-10-07
---

# Phase 195 Plan 07: Atribucion propia de altas Summary

Cada alta (registro web/Android/iOS y "Nuevo en Prueba" del admin) guarda UNA fila en `signup_attributions` con lo crudo que mando el cliente, la plataforma y el canal clasificado en el server (incluida IA por referrer y por `utm_source`). Un error al guardar el origen nunca bloquea el alta. La app manda el origen (query de la web + first-touch + plataforma) y el encabezado de `/register` ya no dice "Park" para cualquier sede.

## Commits

| Hash | Mensaje |
|------|---------|
| `6bfc4d540` | feat(195-07): tabla signup_attributions (0272), clasificador de canal con IA y gates de tenancy |
| `28c6ed7c5` | style(195-07): prettier sobre auth/routes.ts y members/routes.ts antes de agregar los ganchos |
| `379f63ec3` | feat(195-07): atribucion en register y en el alta de prueba del admin |
| `d7bcac1f6` | feat(195-07): admin 'Como nos conocio' y campana en Nuevo en Prueba |
| `29cf0aecc` | feat(195-07): la app manda el origen del alta y el encabezado de registro usa la sede |

## Contrato para los planes siguientes

- **Tabla** `signup_attributions`: `(tenant_id, user_id)` unique; `platform` en `web|android|ios|admin|unknown`; `captured_via` en `register|admin_trial`; `channel` es uno de `CHANNELS` (16). `client_ip`/`user_agent` quedan para CAPI y `pii_purged_at` para la purga de 195-08 (a <= 7 dias). `fbc` ya viene armado (`fb.1.<ft o ahora>.<fbclid>`), `fbp` solo con charset valido.
- **195-08 (CAPI):** excluir `platform IN ('ios','unknown')` y `captured_via = 'admin_trial'` si no hay consentimiento/IP (el admin no guarda IP). Una fila `ios` sigue contando en la atribucion propia. No hay consentimiento guardado: para Barcelona (D-25) el job debe filtrar por pais de la sede (`branch_id` -> `branches.country`), la tabla no lo tiene.
- **195-10 (Reportes):** agrupar por `channel`, `utm_campaign`, `branch_id`; `manual_origin` distingue lo cargado a mano. La "campana" del admin vive en `utm_campaign`. Siempre `tenantWhere(signupAttributions, ctx)`.
- **App → API:** body `attribution` = `{ utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, src_ref, landing, fbp, ft, platform }` (todo opcional salvo `platform` desde la app). Un cliente viejo sin el campo queda `platform='unknown'`.

## Tests y resultados

Todos en foreground, un archivo (o los 2-3 de gates, en corridas separadas) por vez, con la config aislada `eltemplo_t195_*` (temporales borrados al terminar, nada sin commitear).

| Archivo | Resultado |
|---------|-----------|
| `test/unit/marketing-channel.test.ts` (unit) | 52/52 |
| `test/db/tenant-tables.test.ts` | 18/18 |
| `test/migrations/0192-0195-tenant-columns.test.ts` | 6/6 |
| `test/migrations/0196-tenant-unique-contracts.test.ts` | 12/12 |
| `test/marketing/attribution.test.ts` | 39/39 |
| `npx tsc --noEmit` (api) | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| `pnpm typecheck:tests` | DISCREPANCIAS: 15 (igual que la base; ninguna en archivos de este plan) |
| App `src/utils/__tests__/attribution.test.ts` | 45/45 |
| App `pnpm lint` + `pnpm build` | 0 errores (2 warnings preexistentes: `Capacitor` en `axios.ts`, `watch` en `useSessionPlayer.ts`); build OK |
| Admin `pnpm lint` + `pnpm build` | 0 errores (8 warnings preexistentes de `pdf/*`); build OK |
| `pnpm db:migrate` | aplico `0272_signup_attributions.sql` en `eltemplo` (local) |

El plan pedia un 400 o truncado ante `utm_source` de 2000 caracteres: se eligio 400 (coherente con `maxLength`) y esta testeado, junto con el borde exacto (150/500/255 se aceptan, +1 es 400).

### Mutation testing (hecho, honesto)

- **classifyChannel (51 mutantes):** 4 sobrevivieron al primer intento y mejoraron el test: `utm_source=meta` solo (sin medio), `fbclid` con un utm desconocido (`otro`), y dos mutantes equivalentes por redundancia (`OWN_HOSTS` y el sufijo `.eltemplo.org` hacian lo mismo: se dejo solo el sufijo). Final: todos mueren.
- **API (65 mutantes sobre servicio, helper de register, rutas, schemas y members):** primera pasada 5 sobrevivientes. Mejoraron tests: `ft` futuro (> ahora + 1 dia), host en mayusculas, recorte de espacios, blancos a NULL. Equivalentes documentados:
  - rama de array en `x-real-ip` (Node nunca entrega ese header como array, une con ", "): se simplifico el codigo y se testeo la lista;
  - `maxLength: 15` de `ft` (la `pattern ^[0-9]{1,15}$` ya lo impone);
  - quitar `additionalProperties: false` de `signupAttributionBodySchema` (el servicio solo lee claves conocidas, el efecto es cero);
  - `body.utm_campaign ?? manualCampaign` vs el orden inverso (los dos caminos son excluyentes: register nunca trae `manualCampaign`, el admin nunca trae body).
  Mutantes de aislamiento: sin `tenantValues` en el insert, sin `tenantWhere` no aplica (solo hay insert en la API de este plan), el test de gimnasio 2 (alta real en una sede de otro gimnasio + fila sembrada) mata el primero.
  Mutantes de "no bloquea el alta": sin `try/catch` mata 3 tests (register con insert que explota, alta de prueba, servicio con FK invalida).
- **App `attribution.ts` (47 mutantes):** 9 sobrevivientes en la primera pasada. Bug real hallado: `readParam` truncaba `ft` a 15 caracteres ANTES de validar digitos, asi que un `ft` de 16 digitos pasaba como uno valido de 15 (corregido: `ft` se lee sin truncar y se valida). El resto: limites de `utm_term`/`gclid`, caracteres de control, `noeltemplo.org` como externo, truncado del host, constante `et_ft_app_v1`, y `catch` de `buildSignupAttribution` (test con query `null`). Dos ramas muertas se eliminaron (`Array.isArray(parsed)` redundante, `toLowerCase` sobre `URL.hostname`). Final: 0 sobrevivientes.

## Deltas de gates de tenancy

| Gate | Delta |
|------|-------|
| `GYM_OWNED_TABLES` | 99 → 100, +1 (`signup_attributions`) |
| `schemaTables` (tenant-tables.test) | 103 → 104, +1 |
| `gymOwnedChecked` (0192-0195) | 99 → 100, +1 |
| 0196 Test 10 (numero y texto) | 99 → 100, +1 |
| `TENANT_STRICT_MODULES` | + modulo nuevo `marketing: ["signup_attributions"]` (y en `MODULOS_DECLARADOS` del test) |
| `TABLES_TO_CLEAN` | + `schema.signupAttributions` (antes de `users`) |
| `ENTRADAS_BASELINE` | sin cambios (448): no hay rutas nuevas, solo campos nuevos en dos rutas existentes |
| `JOBS_ESPERADOS` | sin cambios (9) |
| `tenant-lint-allowlist.json` | sin tocar |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ft` de 16+ digitos se truncaba y pasaba como valido (app)**
- **Found during:** mutation testing de `attribution.ts` (el test "ft de mas de 15" fallo).
- **Fix:** `ft` se lee sin truncar a 15 y se valida con `^[0-9]{1,15}$`; si no, se descarta (la API lo rechazaria con 400).
- **Commit:** `29cf0aecc`

**2. [Rule 2 - Critical] Revalidacion de charset en el servicio, no solo largo**
- El plan pedia largo en el schema; la regla del orquestador pide "longitud y charset". Como un 400 por charset bloquearia un alta legitima (campanas con espacios o acentos), el servicio descarta (NULL) lo invalido: ids de click/`fbp` solo `[A-Za-z0-9._-]` (alimentan a CAPI), host `[a-z0-9.-]`, `landing` debe empezar con `/`, `ft` dentro de 2020..ahora+1 dia, caracteres de control fuera de todos los textos. Esta testeado.
- **Commit:** `6bfc4d540`

**3. [Rule 3 - Blocking] Acceptance del gancho vs prettier**
- **Issue:** el criterio "diff de `auth/routes.ts` <= 15 lineas" y "`grep -c recordSignupAttributionBestEffort` = 2" no son compatibles con el formato del repo: el hook de lint-staged corre `prettier --write` sobre todo `.ts` staged, y `auth/routes.ts` y `members/routes.ts` NO estaban formateados en la base (prettier reescribe ~25 y ~95 lineas ajenas al plan).
- **Fix:** commit aparte solo de formato (`28c6ed7c5`) y despues el cambio funcional; el gancho de register es una llamada a `recordRegisterAttribution` (helper en el modulo `marketing` que arma plataforma/IP/UA y delega en el best-effort). Diff funcional en `auth/routes.ts` = **11 lineas** contra el commit de formato. Efecto colateral: `grep -c recordSignupAttributionBestEffort auth/routes.ts` da 0 (el simbolo de la ruta es `recordRegisterAttribution`); `members/routes.ts` si llama a `recordSignupAttributionBestEffort` (2 apariciones).
- **Para la integracion con 194:** `auth/routes.ts` y `members/routes.ts` tienen el reformateo de prettier del commit `28c6ed7c5`. Si 194 reescribe esos archivos, conviene descartar ese commit y reaplicar solo los ganchos (3 bloques en `auth/routes.ts`: import + campo `attribution` en `RegisterBody` + una llamada antes de "Get branch info for response"; en `members/routes.ts`: import, tipo del body y el bloque del `try`).
- **Commits:** `28c6ed7c5`, `379f63ec3`

**4. [Rule 2 - Critical] `x-real-ip` con lista de IPs**
- Una cadena `"203.0.113.7, 10.0.0.1"` no es una IP valida para `net.isIP`: queda NULL en vez de adivinar. Testeado.

### Otras diferencias menores

- `recordRegisterAttribution` y `RegisterAttributionRequest` (no estaban en el plan) viven en `attribution-service.ts` para sostener el gancho minimo.
- `registerHeaderText`, `toSignupPlatform` y `captureFirstTouch`/`buildSignupAttribution` viven en `utils/attribution.ts` (el plan solo listaba las dos ultimas): el titulo depende de los mismos params del contrato de 195-06 y asi queda testeado sin montar el componente. `branchName` se trunca a 60 caracteres (no se ignora si es mas largo, para no caer en "Park" con una sede equivocada).
- `src_ref` de la query de la web gana al `document.referrer` en el first-touch de la app; el `ft` de la web se conserva si es valido.
- El `promo` de la query no viaja dentro de `attribution` (ya viaja como `promoCode`/`code`); sirve solo para decidir si hay un origen que guardar.
- El server guarda `ref`/`promo` crudos aunque el codigo no resuelva (es la intencion del visitante); un codigo de partner escrito a mano (`code`) no se registra como ref/promo.

## Issues Encountered / Lecciones para los planes siguientes

1. **Provisionar la DB de test con 3 archivos a la vez colgo el hook (600 s).** Tres workers provisionando en paralelo + la otra sesion de vitest saturan MySQL. Correr UN archivo con `globalSetup` (tarda ~6 min la primera vez), y despues los demas con la config sin `globalSetup` (persiste `eltemplo_t195_1`). `0192-0195` tarda ~4.5 min incluso asi (re-provisiona su propia copia). Dejé las DB `eltemplo_t195_*` creadas con la 0272; la proxima migracion (0273) obliga a reprovisionar.
2. **Prettier y los archivos calientes:** antes de editar un `.ts` de la API, `npx prettier --check` sobre el archivo en la base. Si ya esta sucio, formatearlo en un commit aparte (como hice) para no mezclar ruido con el cambio funcional, porque el hook lo va a reformatear igual.
3. **AJV de Fastify quita las claves desconocidas** con `additionalProperties: false` (no da 400): un test de "clave desconocida" debe esperar 200/201 y que no persista. Los `origin/campaign` del admin hay que declararlos o se pierden en silencio (Pitfall 12, cubierto por test: el mutante "sin origin en el schema" muere con 7 tests).
4. **Mockear el insert de atribucion:** `vi.spyOn(app.db, "insert")` filtrando por la tabla es mas simple que renombrar tablas y prueba el camino real de la ruta (el servicio llama `db.insert` como metodo del mismo objeto que `fastify.db`).
5. **`recordSignupAttribution` usa `ON DUPLICATE KEY UPDATE id = id`** (no-op): no necesita `INSERT IGNORE` y el sentinel de tenancy lo acepta.
6. **Harnesses de mutacion** en el scratchpad (sin commitear): `mut07-channel.py`, `mut07-api.py` (65 mutantes, corre `attribution.test.ts` con la config rapida), `mut07-app.py`.

## Pendientes para Franco

1. **Migracion 0272 corre en prod al deployar** (tabla nueva, sin datos). Staging y prod comparten host MySQL (ver reglas de la fase).
2. **UAT manual en la app:** abrir `app.eltemplo.org/register?branchId=<id>&branchName=Juan%20B.%20Justo&utm_source=instagram&utm_medium=social` (o desde un link "Reservar online" de la web), registrar un alumno de prueba y verificar la fila en `signup_attributions` (canal `instagram`, `landing` si vino); registrar otro desde `/login?utm_source=chatgpt.com` navegando a Registrarse (first-touch, canal `ia`); y el encabezado: con `branchName` muestra la sede, con solo `branchId` sigue diciendo "Park" (QR impresos del Park).
3. **Admin:** "Nuevo en Prueba" ahora tiene "¿Como nos conocio?" y "Campana (opcional)": probarlo en una sede real y confirmar el canal en la fila.
4. **Builds de las tiendas:** el cambio de la app (boot + `RegisterPage`) llega a Android/iOS con la proxima build; hasta entonces esos registros llegan sin `attribution` (`platform='unknown'`, canal `directo`) y CAPI (195-08) los excluye. La web (PWA/app web) lo recibe al deployar.
5. **Barcelona:** las altas de `/es` sin consentimiento llegan sin `utm_*` (decision de 195-06, RGPD); la atribucion propia es parcial en Espana. La tabla no guarda consentimiento: 195-08 debe filtrar por pais de la sede para CAPI (D-25).
6. **Decision abierta para 195-10:** un utm que no se reconoce cae en canal `otro` y le gana a ref/promo/referrer. Si prefieren que el referido gane a un utm desconocido, es un cambio de una linea en `classifyChannel` (hoy esta fijado por tests).
7. **Lista de hosts de IA** (`AI_HOSTS` en `marketing/channel.ts`): mantenible, agregar un asistente nuevo alcanza para referrer y `utm_source`.

## Known Stubs

Ninguno. `consent_ads` (que mencionaba RESEARCH) no se creo: el plan no lo pide y D-25 se resuelve por pais de sede.

## Threat Flags

Ninguno nuevo. T-195-24 (400 por largo + descarte por charset), T-195-25 (best-effort probado con insert que explota y con FK invalida), T-195-26 (IP solo con `net.isIP`, columna `pii_purged_at` lista para la purga de 195-08), T-195-27 (tabla strict + test con una alta real en una sede del gimnasio 2), T-195-28 (enum + 400) mitigados y cubiertos por tests con mutation. T-195-29 (plataforma declarada por el cliente) aceptado: `unknown` = excluida de CAPI.

## Self-Check: PASSED

- Archivos creados existen (migracion, schema, 3 modulos marketing, 2 tests de API, util/boot/test de la app) y los 5 commits estan en `git log`.
- Worktree limpio salvo este SUMMARY; sin `*local195*` ni `dist` commiteados (`dist` de app/admin ignorados).
