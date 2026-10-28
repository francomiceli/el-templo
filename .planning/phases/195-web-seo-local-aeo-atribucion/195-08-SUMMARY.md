---
phase: 195-web-seo-local-aeo-atribucion
plan: "08"
subsystem: api-db + web
tags: [meta, capi, outbox, ad-spend, insights, privacy, sentry, rgpd, tenancy, migrations]
requires: ["195-07"]
provides:
  - "Migracion 0273: meta_capi_events (outbox CAPI) y ad_spend_daily (gasto por campaña y dia), ambas strict en el modulo `marketing`"
  - "Modulo marketing/meta: config (null sin credenciales), hash SHA-256, builders puros, cliente Graph API con fetch nativo, MetaCapiService y MetaSpendService"
  - "Job marketing-meta: CAPI cada 10 min, gasto 06:15 AR, purga de IP/UA cada hora (siempre activa), por gimnasio con templo-marketing"
  - "Scrub de secretos en Sentry (src/sentry-scrub.ts) cableado a beforeSend y beforeBreadcrumb"
  - "/privacidad reescrita y link discreto Barcelona -> /es en el footer"
affects: [195-10, 195-11, 195-14]
tech-stack:
  added: []
  patterns:
    - "CAPI como outbox DERIVADO por job: cero hooks en caminos de pago/reservas (la 194 los reescribe). event_id determinista + unique (tenant_id, event_id) = idempotencia"
    - "Exclusion con motivo auditable: cada evento que nunca viaja queda en el outbox con skipped_es / skipped_ios / skipped_no_origin / skipped_window"
    - "Retencion de PII independiente de la integracion: la purga de IP/UA corre aunque Meta no este configurado"
key-files:
  created:
    - el-templo-api/src/db/migrations/0273_marketing_meta.sql
    - el-templo-api/src/db/schema/meta-capi-events.ts
    - el-templo-api/src/db/schema/ad-spend-daily.ts
    - el-templo-api/src/modules/marketing/meta/config.ts
    - el-templo-api/src/modules/marketing/meta/hash.ts
    - el-templo-api/src/modules/marketing/meta/capi-builder.ts
    - el-templo-api/src/modules/marketing/meta/client.ts
    - el-templo-api/src/modules/marketing/meta/capi-service.ts
    - el-templo-api/src/modules/marketing/meta/spend-service.ts
    - el-templo-api/src/jobs/marketing-meta.ts
    - el-templo-api/src/sentry-scrub.ts
    - el-templo-api/test/unit/meta-capi-builder.test.ts
    - el-templo-api/test/unit/sentry-scrub.test.ts
    - el-templo-api/test/marketing/meta-capi.test.ts
    - el-templo-api/test/marketing/meta-spend.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/src/index.ts
    - el-templo-api/src/instrument.ts
    - el-templo-api/.env.example
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
    - el-templo-web/pages/privacidad.vue
    - el-templo-web/components/AppFooter.vue
decisions:
  - "Variable del token = META_ACCESS_TOKEN (la del PLAN y de 195-11/195-14), no META_CAPI_ACCESS_TOKEN (la del RESEARCH): un solo token para CAPI y gasto"
  - "Pais fail-closed: CUALQUIER sede que no sea AR deja el evento en skipped_es (no solo ES). Se mira la sede del alumno, la de su alta y la del evento (clase de la prueba, sucursal del pago)"
  - "Plataforma por lista blanca: solo web, android y admin viajan. ios -> skipped_ios; unknown, null o cualquier otra -> skipped_no_origin"
  - "Registro web SIN user agent baja a system_generated (website lo exige y un evento invalido rechaza el lote)"
  - "NO se manda nombre ni apellido (hashedUserData los soporta, el servicio no los pasa): /privacidad lista exactamente lo que viaja"
  - "La purga de IP/UA NO depende de la config de Meta: cron horario siempre activo (ver Deviations 1)"
  - "Purga: registro enviado O descartado (cualquier estado distinto de pending/failed) O fila de mas de 7 dias"
  - "Credenciales GLOBALES (env): si otro gimnasio recibe templo-marketing, sus datos irian al mismo Pixel y su gasto se duplicaria por tenant (ver Pendientes)"
metrics:
  tasks: 3
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 08: Meta CAPI (outbox), gasto diario, /privacidad y scrub de Sentry Summary

Un job deriva del estado de la base los eventos `CompleteRegistration`, `Schedule` (prueba) y `Purchase` (primer pago con valor y moneda), los guarda en un outbox idempotente y los manda a Meta por lotes de 100 con email y telefono hasheados SHA-256. Nunca viajan usuarios de España (D-25) ni altas de iOS o de origen desconocido (D-24). Otro cron trae el gasto por campaña de la Marketing API. Sin credenciales o sin `META_CAPI_START_AT` todo queda apagado con un log. `/privacidad` describe la medicion real y los secretos no llegan ni a logs ni a Sentry.

## Commits

| Hash | Mensaje |
|------|---------|
| `6fa28653f` | feat(195-08): migracion 0273 (outbox CAPI + gasto), config, hashing y builders puros de Meta |
| `ab6b21797` | feat(195-08): servicios CAPI (outbox) y gasto de Meta, job marketing-meta y scrub de secretos en Sentry |
| `0f5843517` | feat(195-08): reescritura de /privacidad (medicion con Meta/Google, CAPI, RGPD, oposicion) y link Barcelona en el footer |

## TEXTO PENDIENTE DE APROBACIÓN DE FRANCO

**TEXTO PENDIENTE DE APROBACIÓN DE FRANCO — CAPI no se activa (no cargar `META_CAPI_START_AT` / `META_ACCESS_TOKEN`) hasta que esta versión de `/privacidad` esté en producción.**

El texto nuevo esta en `el-templo-web/pages/privacidad.vue`. Es un borrador honesto de lo que el sistema hace de verdad, no asesoramiento legal. Puntos a revisar:

1. **Marcador visible en la pagina**: `[PENDIENTE DE COMPLETAR POR FRANCO ANTES DE PUBLICAR: razon social, NIF y domicilio de la entidad responsable del tratamiento en España.]` (dentro de "España y el RGPD", clase `privacy__todo`, resaltado en dorado). No se invento ningun dato de la empresa. El meta description ya decia "El Templo Espacio Funcional S.A." (preexistente).
2. Agregue dos referencias a organismos de control que no estaban en el plan: la **AEPD** (para quien esta en España) y la **Agencia de Acceso a la Informacion Publica** como organo de control de la Ley 25.326 (Argentina). Son datos publicos, pero conviene que un asesor legal los confirme o los saque.
3. **Promesa de oposicion**: el texto dice que, al escribir a `comunidad@eltemplo.org` con el asunto "Oposicion a la medicion publicitaria", se excluyen sus datos del envio a Meta. **No hay mecanismo automatico** (ver Pendientes): hoy seria manual.
4. Lista de lo que viaja, tal como esta en el codigo: email y telefono hasheados, identificador interno hasheado, pais, tipo de accion + fecha + (primer pago) importe y moneda, identificadores de clic de Meta (`fbc`/`fbp`), y solo en registros web la IP y el navegador. Mas fuerte que lo que pedia el plan (que omitia `fbc`/`fbp` e importe/moneda): se agregaron porque se mandan.
5. Se reemplazo "sin recopilar datos personales" de la herramienta de diagnostico (Sentry corre con `sendDefaultPii: true`) por una descripcion mas veraz, y se agrego que la IP/navegador de cualquier registro (no solo web) se guarda hasta 7 dias.

## Deduplicación con el Pixel

Hoy es un **no-op**: el Pixel web solo dispara `PageView` y `Lead` (click en un CTA), eventos que CAPI no envia. No hay nada que deduplicar.

Si algun dia el Pixel dispara `CompleteRegistration`, `Schedule` o `Purchase`, **tiene que mandar el mismo `eventID` que CAPI**, porque Meta deduplica por `event_name` + `event_id`:

| Evento | `event_name` | `event_id` / `eventID` |
|--------|--------------|------------------------|
| Registro | `CompleteRegistration` | `reg-<userId>` |
| Reserva de prueba | `Schedule` | `trial-<bookingId>` |
| Primer pago | `Purchase` | `purchase-<subscriptionId>` |

Mientras eso no pase, el `fbc`/`fbp` que viaja en CAPI alcanza para que Meta una la conversion con el clic del anuncio.

## Unidad de `pricePaid` (verificada)

`subscriptions.price_paid` esta en **unidades enteras de la moneda** (pesos o euros, sin centavos): el admin lo renderiza con `formatPrice(amount, currency)` de `el-templo-admin/src/utils/format-price.ts`, cuyo docblock dice "Amount is in whole currency units (no minor units / cents)" (`formatPrice(70,'EUR')` = `€70`, `formatPrice(1500,'ARS')` = `$1.500`). Por eso `custom_data.value = pricePaid` **sin dividir por 100**; `currency` sale de `subscriptions.currency` (ARS o EUR) sin convertir. Test: Purchase de 45000 ARS y de 70 EUR.

## Contrato para los planes siguientes

- **Tablas**: `meta_capi_events` (`status` en `pending|sent|failed|skipped_es|skipped_ios|skipped_no_origin|skipped_window`, `attempts` hasta 5, `last_error` redactado) y `ad_spend_daily` (`spend` DECIMAL(14,2) llega como string, `currency` tal cual la informa la cuenta, `spend_date` string `YYYY-MM-DD` en el huso de la cuenta). **195-10 (Reportes)**: agrupar SIEMPRE por moneda (Pitfall 13), siempre con `tenantWhere`. Costo por alumno pago = gasto por `campaign_name` ~ `signup_attributions.utm_campaign` (se une por nombre de campaña: la plantilla de parametros de los anuncios tiene que usar `{{campaign.name}}`, ver guia 195-14).
- **Env vars** (ya en `.env.example`; el cableado a deploy es 195-11): `META_ACCESS_TOKEN`, `META_PIXEL_ID`, `META_CAPI_START_AT` (ISO obligatoria), `META_AD_ACCOUNT_IDS`, `META_GRAPH_VERSION` (default `v26.0`), `META_CAPI_TEST_EVENT_CODE`. Staging NUNCA.
- **CAPI** se prende con token + pixel + `META_CAPI_START_AT`. **Gasto** se prende con token + `META_AD_ACCOUNT_IDS` (no necesita pixel ni fecha). Son independientes.
- **195-14 (guia)** [CORREGIDO por el orquestador tras 195-14: sin `META_CAPI_START_AT` CAPI no envía nada]: texto de `/privacidad` aprobado y en prod -> cargar `META_CAPI_START_AT` = fecha del dia JUNTO con `META_CAPI_TEST_EVENT_CODE` y validar en Events Manager > Probar eventos (el mapeo de `action_source` es [ASUMIDO], research A2; ventana corta, los eventos reales de ese lapso quedan marcados como de prueba) -> borrar `META_CAPI_TEST_EVENT_CODE`. Ver `deploy/ROLLOUT-195.md` §4. Antes: `GET /me/adaccounts` con el token (research A1: el mismo token tiene que ver pixel y cuenta publicitaria).

## Tests y resultados

Todos en foreground, un archivo por vez, con la config aislada `eltemplo_t195_*` (temporales borrados al terminar, nada sin commitear). Un archivo con `globalSetup` primero (reprovisiono con 0273, ~195 s) y los demas con la config sin `globalSetup`.

| Archivo | Resultado |
|---------|-----------|
| `test/unit/meta-capi-builder.test.ts` (unit) | 47/47 |
| `test/unit/sentry-scrub.test.ts` (unit) | 24/24 |
| `test/db/tenant-tables.test.ts` (con globalSetup) | 18/18 |
| `test/migrations/0192-0195-tenant-columns.test.ts` | 6/6 |
| `test/migrations/0196-tenant-unique-contracts.test.ts` | 12/12 |
| `test/marketing/meta-capi.test.ts` | 45/45 |
| `test/marketing/meta-spend.test.ts` | 21/21 |
| `test/tenancy/con-04-crons-per-tenant.test.ts` | 8/8 |
| `npx tsc --noEmit` (api) | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| `pnpm typecheck:tests` | DISCREPANCIAS: 15 (igual que la base; ninguna en archivos de este plan: el `import()` dinamico de `instrument` en el test usa `.js` justamente para no sumar una) |
| `pnpm db:migrate` | aplico `0273_marketing_meta.sql` en `eltemplo` (local) |
| Web `nuxi typecheck` + `pnpm lint` | verde / 0 errores (2 warnings `v-html` preexistentes) |
| Web `nuxt generate` (Node 20 + capa, fixture) + `verify-seo-output.mjs` | 64 rutas, 31/31 OK; `privacidad/index.html` con SHA-256, el marcador y el link `/es` del footer en las paginas |

El `fetch` esta SIEMPRE mockeado con `vi.stubGlobal` (los tests nunca llaman a Meta). Los tokens de prueba (`EAAB-...`) se afirman ausentes de `last_error`, de los logs del servicio (logger falso) y de los payloads.

### Mutation testing (hecho, honesto)

Harness `mut08.py` en el scratchpad (sin commitear). Sobre el baseline verde, 86 mutantes en total (unit + integracion): 85 muertos y 1 equivalente en resultado (J5).

- **Builders, hash, config, scrub de Sentry y cableado de `instrument.ts` (40 mutantes): 40/40 muertos** — ventana 7/62 dias (borde inclusivo, 8d, 7d), tolerancia al futuro, `Math.round` vs `floor`, `action_source` de cada evento, prefijos de `event_id`, valor del Purchase, email sin minusculas, `+` del telefono, rango E.164 (7, 8, 15, 16 digitos), country/external_id sin tenant, IP/UA sin `includeClientContext`, `fbc`, `ph` con valor nulo, pixel no numerico, fecha invalida, cuentas sin filtro, version sin regex, `act_`, orden de las exclusiones (ES gana a iOS, iOS a origen, origen a ventana), website sin user agent, cableado de `beforeSend`/`beforeBreadcrumb` en `instrument.ts`, claves sensibles.
- **CAPI (integracion):** sin `since`, trial cancelado cuenta, trial sin `isTrial`, pago sin `pricePaid > 0`, pago `zero` cuenta, todos son "el primero", desempate invertido, lookback 7d, `max` por `min`, `attempts <=`, sin re-chequeo de ES al enviar, lote de 1000, retencion 8d, purga que ignora failed / pending / el tipo de evento, purga sin guard de IP/UA, sin `ON DUPLICATE`, valor x100, moneda fija, sin `test_event_code`, entidad perdida con attempts 0, jobs sin chequeo de modulo (CAPI, gasto, purga), gasto en huso UTC: **todos muertos**.
- **Cliente HTTP y gasto:** sin redactar el token, sin recorte a 500, `paging.next` fuera de graph.facebook.com, sin tope de paginas, token fuera del body/URL, sin timeout (POST y GET), upsert sin spend / nombre / moneda, spend negativo, moneda en minuscula, `time_increment`, `level`, `act_`, sin `tenantValues`: **todos muertos**.
- **Mutantes equivalentes / mejoras de codigo que salieron del proceso:**
  - `isNull(piiPurgedAt)` en la purga: redundante con el guard `isNotNull(clientIp) OR isNotNull(userAgent)` (una fila purgada tiene ambos en NULL). Se **elimino** la condicion muerta y se mutó el guard real, que muere con el test "no vuelve a tocar filas ya purgadas".
  - `url.protocol === "https:"` en `isGraphUrl`: redundante porque `origin` incluye el esquema. Se **simplifico** a `origin === GRAPH_ORIGIN`; el mutante `return true` muere con los tests de host ajeno y `http`.
  - Sobrevive y es equivalente en resultado: quitar el guard de config de `runCapiSweep` (J5). Sin config, `config.startAt` revienta dentro de cada tenant y `forEachActiveTenant` lo absorbe: el resultado observable (cero fetch, cero filas) es el mismo; lo que cambia es ruido de logs/Sentry. No hay forma limpia de espiar el logger del modulo.
- **Un incidente del propio harness (documentado para no repetirlo):** una primera corrida con `timeout` mas corto que el lote mato al harness en medio de un mutante y dejo la mutacion aplicada en `capi-service.ts`; los resultados de las dos corridas siguientes eran invalidos (baseline rojo, todo "muerto"). Se detecto al diffear contra el respaldo, se restauro el archivo, se agrego una **verificacion de baseline verde** al harness y se repitio todo. El archivo final es el committeado y pasa los 45 tests.

## Deltas de gates de tenancy

| Gate | Delta |
|------|-------|
| `GYM_OWNED_TABLES` | 100 → 102, +2 (`ad_spend_daily`, `meta_capi_events`) |
| `schemaTables` (tenant-tables.test) | 104 → 106, +2 |
| `gymOwnedChecked` (0192-0195) | 100 → 102, +2 |
| 0196 Test 10 (numero y texto) | 100 → 102, +2 |
| `TENANT_STRICT_MODULES["marketing"]` | `["signup_attributions"]` → `["ad_spend_daily", "meta_capi_events", "signup_attributions"]` (el modulo ya existia en `MODULOS_DECLARADOS`) |
| `TABLES_TO_CLEAN` | + `schema.metaCapiEvents` y `schema.adSpendDaily` (antes de `users`/core) |
| `JOBS_ESPERADOS` (CON-04) | 9 → 10, +1 (`marketing-meta.ts`, orden alfabetico: va despues de `mark-no-shows.ts`); titulo del Test 6 "los 10 jobs" |
| `ENTRADAS_BASELINE` | sin cambios (448): no hay rutas |
| `tenant-lint-allowlist.json` | sin tocar (`lint:tenant` en 0) |

**Baselines resultantes para la integracion con 194/v6.1**: `GYM_OWNED_TABLES` 102 · `schemaTables` 106 · `gymOwnedChecked` 102 · 0196 Test 10: 102 · `ENTRADAS_BASELINE` 448 · `JOBS_ESPERADOS` 10. Sumar los deltas (+2, +2, +2, +2, +1), no copiar los numeros.

Aislamiento de los datos de test del gimnasio 2: `limpiarSegundoGimnasio` (fixture compartido, no tocado) no conoce `ad_spend_daily` (solo FK a `tenants`): mis dos archivos la borran por tenant antes de llamarlo. Si otro plan siembra gasto para el gimnasio 2, tiene que hacer lo mismo o sumar el `DELETE` al fixture.

## Deviations from Plan

### Auto-fixed / agregado

**1. [Rule 2 - Critical] La purga de IP/user agent no puede depender de la config de Meta**
- **Issue:** el plan manda que `startMarketingMetaJob` retorne sin agendar nada si ambas configs son null, y ubica la purga dentro del barrido de CAPI. Pero 195-07 ya guarda IP y user agent de CADA registro desde el deploy, aun con CAPI apagado (que es el estado hasta que Franco cargue el token). Sin barrido no hay purga: la IP quedaria para siempre, rompiendo T-195-30 ("purgados <= 7 dias").
- **Fix:** `runPiiPurge` + un cron horario (`5 * * * *`) que se agenda SIEMPRE; CAPI y gasto siguen siendo no-op sin credenciales (exactamente como pide el plan). El log de arranque lo aclara. Test: la purga corre con Meta sin configurar y no llama a `fetch`.
- **Commit:** `ab6b21797`

**2. [Rule 2 - Critical] El token tambien se filtraria por el breadcrumb HTTP de Sentry**
- **Issue:** el GET de Insights lleva `access_token` en la URL (como documenta Meta) y el breadcrumb de `http` de Sentry captura esa URL. Redactar solo `event.request.data` no alcanzaba.
- **Fix:** modulo puro nuevo `src/sentry-scrub.ts` (no estaba en `files_modified`) con redaccion recursiva por clave y por `clave=valor` / JSON-en-texto en `request.data`, `url`, `query_string`, `extra` y `breadcrumbs`, mas `beforeBreadcrumb` en `instrument.ts`. Se separo de `instrument.ts` porque ese archivo solo inicia Sentry con DSN y no se podia testear. 24 tests + mutation, incluido el cableado.
- **Commit:** `ab6b21797`

**3. [Rule 2 - Critical] Pais fail-closed y re-chequeo al enviar**
- El plan decia "pais ES -> skipped_es". Implemente "cualquier pais distinto de AR" (un pais nuevo no viaja hasta que alguien lo decida) mirando la sede del alumno, la de su alta y la del evento (clase de la prueba, sucursal del pago), y vuelve a chequear al enviar (el alumno pudo mudarse a una sede ES entre el derivado y el envio).

**4. [Rule 2 - Critical] `paging.next` solo si es de graph.facebook.com por https, con tope de paginas**
- Meta devuelve `paging.next` con el token adentro: seguir una URL ajena filtraria el token. Se valida el origen y hay un tope de 50 paginas contra un bucle.

**5. [Rule 1 - Bug evitado] Registro web sin user agent**
- `website` exige `client_user_agent`; un evento invalido rechaza el lote entero. Un registro web sin UA (purgado o nunca guardado) baja a `system_generated` sin URL ni IP.

**6. Otras diferencias menores**
- `purgeClientContext` purga tambien registros **descartados** (iOS, España, sin origen), no solo enviados: es PII que nunca va a viajar. No purga mientras el registro esta `pending` o `failed` (se reintenta), aunque otro evento del mismo alumno ya haya salido.
- No se mandan `fn`/`ln`: `hashedUserData` los soporta (tests), el servicio no los pasa, para que `/privacidad` liste exactamente lo que viaja.
- "Primera suscripcion paga" se resuelve en dos consultas (candidatas desde `since` + historia completa de esos alumnos) en vez de una subconsulta correlacionada: evita la trampa de columnas sin calificar de Drizzle en subselects.
- El derivado solo mira desde `max(START_AT, ahora - 62 dias)`: lo mas viejo no entra en ninguna ventana de Meta.
- `ON DUPLICATE KEY UPDATE x = VALUES(x)` en el upsert del gasto: `VALUES()` esta deprecado desde MySQL 8.0.20 pero funciona (probado en el MySQL local) y Drizzle no expone el alias `AS new`.
- `META_AD_ACCOUNT_IDS` y `META_PIXEL_ID` se validan numericos (viajan en la ruta de la URL) y `META_GRAPH_VERSION` con `^v\d+\.\d+$`.
- `/privacidad`: ver "TEXTO PENDIENTE" (organismos de control, descripcion de la herramienta de diagnostico, `fbc`/`fbp` e importe/moneda).
- `.vue`: el commit paso por eslint (`--fix`), no por prettier (leccion de 195-05).

## Issues Encountered / Lecciones para los planes siguientes

1. **`sinComentarios` de CON-04 y el job**: el Test 7 exige `cron.schedule` + `forEachActiveTenant` en codigo (los comentarios no cuentan). El job nuevo los cumple por separado en CAPI, gasto y purga.
2. **El lint de tenancy cuenta `schema.<tabla>` como acceso**: un `sql\`VALUES(${schema.adSpendDaily.spend})\`` sumaba 3 accesos y un `.values(arrayYaConstruido)` sin `tenantValues` en el mismo sitio sumaba 1. Se resolvio con `sql\`VALUES(spend)\`` y `.values(rows.map((v) => tenantValues(ctx, v)))`.
3. **Unique de bookings** `(member, schedule, fecha)`: en los tests de varias reservas del mismo alumno usar fechas distintas.
4. **`createTestMember` ya deja una fila de `signup_attributions` ('unknown')** (porque 195-07 engancha `register`): los tests la reemplazan con la plataforma que necesitan.
5. **Mutation harness**: nunca correrlo bajo un `timeout` mas corto que el lote; verificar baseline verde y que el archivo quedo restaurado antes de creer los resultados. Prefijos de nombre (`S1`) matchean `S10`: comparar por nombre exacto.
6. **Un solo `fetch` stub, sin tocar Meta**: `vi.stubGlobal("fetch", vi.fn(...))` + `vi.unstubAllGlobals()` en `afterEach`; el cuerpo del POST se parsea del `init.body`.

## Pendientes para Franco

1. **Aprobar `/privacidad`** (ver seccion arriba), completar el marcador de la entidad responsable en España (razon social, NIF, domicilio) y decidir si quedan las menciones a AEPD y AAIP. **No pushear/deployar ese texto sin resolver el marcador** (se ve en la pagina).
2. **No activar CAPI** (no cargar `META_CAPI_START_AT` ni `META_ACCESS_TOKEN`) hasta que la nueva `/privacidad` este en produccion. Orden en la guia 195-14.
3. **Validar con `test_event_code`** antes de activar: el mapeo `website` / `system_generated` / `physical_store` es [ASUMIDO] (research A2) y que un solo token sirva para CAPI e Insights tambien (A1, validar con `GET /me/adaccounts`). Los eventos de prueba tambien se usan para targeting: **staging NUNCA con `META_*`**.
4. **Mecanismo de oposicion**: el texto promete excluir a quien lo pida y hoy no hay un flag automatico. Un proceso manual posible: insertar en `meta_capi_events` las filas `reg-<id>` / `trial-*` / `purchase-*` del alumno con `status = 'skipped_no_origin'` (la unique `(tenant_id, event_id)` impide que el job las vuelva a derivar), o decidir una columna de exclusion en otra fase. Decidir cual antes de publicar el texto.
5. **Credenciales globales**: las variables son del proceso, no del gimnasio. Si algun dia otro gimnasio recibe el modulo `templo-marketing`, sus alumnos irian al mismo Pixel y el gasto se guardaria duplicado por tenant. Hoy solo El Templo lo tiene; si eso cambia hace falta credencial por tenant (otra fase).
6. **La migracion 0273 corre en prod al deployar** (dos tablas nuevas, sin datos; staging y prod comparten host MySQL). El cron de purga arranca solo y empieza a borrar IP/UA de las filas de `signup_attributions` de mas de 7 dias.
7. **Builds de tiendas**: las altas de Android/iOS viejas llegan con `platform = 'unknown'` (195-07) y CAPI las excluye hasta que salga la build nueva.
8. **Plantilla de parametros de los anuncios** (`utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}...`): el costo por alumno se une por nombre de campaña. Ya esta en el plan de la guia 195-14.

## Known Stubs

Ninguno. El marcador de `/privacidad` es un pendiente de contenido declarado, no un stub funcional.

## Threat Flags

Ninguno nuevo fuera del threat model. T-195-30 (hash + IP/UA <= 7 dias, ES/iOS excluidos con tests y mutation), T-195-31 (token redactado en errores, logs, `last_error` y Sentry incluyendo breadcrumbs), T-195-32 (`.env.example` + config null; el cableado a deploy es 195-11), T-195-33 (`META_CAPI_START_AT` obligatoria + marca de texto pendiente), T-195-34 (unique + test de doble corrida), T-195-35 (ventana antes de enviar, lotes de 100, tope 5) mitigados. Superficie agregada y mitigada: `paging.next` de la Graph API solo se sigue si es de `graph.facebook.com` por https.

## Self-Check: PASSED

- Archivos creados existen (migracion, 2 schemas, 6 modulos `marketing/meta`, job, `sentry-scrub.ts`, 4 archivos de test) y los 3 commits (`6fa28653f`, `ab6b21797`, `0f5843517`) estan en `git log`.
- Worktree limpio salvo este SUMMARY; sin `*local195*` ni `.data`/`dist` de la web commiteados; sin borrados inesperados en los commits.
- Acceptance greps: `uq_meta_capi_events_tenant_event (tenant_id, event_id)` = 1, `uq_ad_spend_daily_tenant_campaign_date` = 1, sin `;` en comentarios SQL, vector `973dfe46...` = 1 en el unit, `META_ACCESS_TOKEN` = 1 en `.env.example`, `forEachActiveTenant` en el job (4), `templo-marketing` (5), `"marketing-meta.ts"` en CON-04 = 1, `startMarketingMetaJob` en `index.ts` (2), sin `subscriptions/service` ni `booking-service` en `modules/marketing`, `access_token` en `instrument.ts` = 1, sin logs que impriman el token; `/privacidad` sin las dos frases viejas, con `SHA-256`, `consentimiento` e `iPhone`.
