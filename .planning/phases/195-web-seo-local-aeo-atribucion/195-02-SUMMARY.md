---
phase: 195-web-seo-local-aeo-atribucion
plan: "02"
subsystem: api
tags: [seo, public-endpoint, opening-hours, templo-marketing, tenancy]
requires: ["195-01"]
provides:
  - "GET /api/web/site-data (anonimo, solo lectura): marca, WhatsApp de ventas AR/ES, sedes publicadas con horarios"
  - "mergeIntervals / computeOpeningHours / slugify puros (reusables por el sync GBP de 195-09)"
  - "WebPublicService.getPublishedBranchesWithHours (reusable por 195-09)"
affects: [195-03, 195-09]
tech-stack:
  added: []
  patterns:
    - "Endpoint publico de marketing dentro de temploMarketingModule, tenant = DEFAULT_PUBLIC_TENANT_ID"
    - "Seleccion explicita de columnas + schema de respuesta completo como doble barrera anti-PII"
key-files:
  created:
    - el-templo-api/src/modules/web-public/types.ts
    - el-templo-api/src/modules/web-public/opening-hours.ts
    - el-templo-api/src/modules/web-public/brand.ts
    - el-templo-api/src/modules/web-public/service.ts
    - el-templo-api/src/modules/web-public/schemas.ts
    - el-templo-api/src/modules/web-public/routes.ts
    - el-templo-api/src/modules/web-public/index.ts
    - el-templo-api/test/unit/web-public-opening-hours.test.ts
    - el-templo-api/test/web-public/site-data.test.ts
  modified:
    - el-templo-api/src/modules-boot.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/migrations/0190-0191-tenants.test.ts
decisions:
  - "Una actividad se publica como especial si CUALQUIERA de sus filas (mismo nombre) lo es"
  - "mapsUrl sin maps_url cae a busqueda de Google Maps con street+locality (o publicName si no hay direccion) y query_place_id si hay place id"
  - "index.ts del modulo (como blog) para que modules-boot importe de la carpeta"
metrics:
  tasks: 2
  commits: 2
  completed: 2026-10-07
---

# Phase 195 Plan 02: Endpoint publico /api/web/site-data Summary

`GET /api/web/site-data` entrega, sin auth ni PII, la marca (`web.brand_name`, default unico en `brand.ts`), el WhatsApp de ventas AR/ES y solo las sedes del tenant 1 con `publish_on_web=1`, activas y con slug, cada una con direccion, geo, place id, actividades, grilla regular y franjas de apertura fusionadas.

## Commits

| Hash | Mensaje |
|------|---------|
| `092179810` | feat(195-02): funciones puras de horarios publicados y tipos del contrato site-data |
| `1508aadb0` | feat(195-02): endpoint publico /api/web/site-data |

## Contrato final (consumido por 195-03, sin cambios respecto del plan)

`WebSiteData { generatedAt, brand:{name}, countries:{AR:{salesWhatsapp}, ES:{salesWhatsapp}}, sedes: WebSede[] }`. `WebSede` con `id, code, slug, publicName, kind, country, timezone, address{street,locality,region,postalCode,country}, geo|null, placeId, mapsUrl, phone, photoUrl, activities[{name,slug,isSpecial}], openingHours[{dayOfWeek,opens,closes}], schedule[{dayOfWeek,startTime,endTime,activity}]`. Tipos en `src/modules/web-public/types.ts`.

Detalles de comportamiento que 195-03 debe saber:
- `openingHours` y `schedule` solo incluyen clases regulares (`activities.is_special = 0`). Una sede con SOLO clases especiales sale con `openingHours: []` y `schedule: []` (ver evidencia abajo, caso MORENO).
- `geo` es `null` si falta lat o lng. `dayOfWeek` viene de la DB (1 a 6 hoy; el tipo admite 7).
- `salesWhatsapp` es `null` si falta o si el valor guardado no cumple `^[0-9]{8,15}$`.
- `Cache-Control: public, max-age=300`, rate limit 60/min por IP (global sin `trustProxy`, limitacion aceptada T-195-07).

## Evidencia del filtro D-30 (DB local `eltemplo`)

Query pedida (horarios activos, `deleted_from IS NULL`, por actividad):

| name | is_special | special_line | horarios |
|------|-----------|--------------|----------|
| Maquinas | 0 | NULL | 1 |
| ROM | 0 | NULL | 2 |
| Sesion Grupal | 0 | NULL | 195 |
| Yoga para calisténicos | 1 | Yoga | 2 |
| Yoga regenerativo | 1 | Yoga | 2 |

Por sede publicada (activos, actividad activa): ALEM 43 regulares, CONST 35, JUJUY 40, MOGOTES 40, MORENO 0 regulares y 4 especiales. **Atencion:** en esta DB local MORENO solo tiene Yoga (especial), asi que con el filtro D-30 saldria con `openingHours: []`. Si en produccion Moreno tampoco tiene clases regulares cargadas, la web (195-03) tiene que tolerar sedes sin horarios de apertura (no emitir `openingHoursSpecification` vacio) o hay que decidir con Franco si Yoga cuenta como apertura. No lo cambie: D-30 es explicito.

## Tests

Todos en foreground, un archivo a la vez, con la config aislada `eltemplo_t195_*` (archivos temporales borrados al terminar, nada sin commitear).

| Archivo | Resultado |
|---------|-----------|
| `test/unit/web-public-opening-hours.test.ts` (unit) | 21/21 |
| `test/web-public/site-data.test.ts` | 14/14 |
| `test/tenancy/iso-01-manifiesto.test.ts` | 13/13 |
| `test/migrations/0190-0191-tenants.test.ts` | 12/12 |
| `npx tsc --noEmit` | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| `pnpm typecheck:tests` | DISCREPANCIAS: 15 (igual que la base, ninguna en archivos de este plan) |

### Mutation testing (hecho, honesto)

- **opening-hours (7 mutantes):** `<` a `<=` en el hueco, `Math.max` a `end`, sin sort, sin descartar `fin <= inicio`, sin orden de dias, slug sin trim, slug sin diacriticos. Todos mueren. (Mi primer intento de M4 y M7 no aplico por error de shell/escape, lo rehice a mano y mueren.)
- **service/routes/brand (20 mutantes):** sin `publishOnWeb`, sin `tenantWhere` de branches/schedules/activities/brand, sin `isActive` de sede/horario/actividad, sin `isNotNull(webSlug)`, sin `deletedFrom`, schedule con especiales, mapsUrl sin place id, geo sin `Number`, publicName sin fallback, cache-control, rate limit 61, brand sin trim, slug de actividad, orden de la query, OR del flag especial. Todos mueren.
- **Tres sobrevivieron al primer intento y obligaron a mejorar el test:** `tenantWhere(schedules)` (el cruce con activities lo tapaba: agregue un horario del gimnasio 2 sobre actividad y sede del tenant 1), `tenantWhere` de `getWebBrandName` (agregue la marca de otro gimnasio), y el orden de la query (agregue inserciones desordenadas). El OR de `isSpecial` era un mutante equivalente hasta que sembre dos actividades con el mismo nombre (una especial, una regular).
- **Doble barrera anti-PII:** agregando `gbpLocationId` al select y quitando el schema de respuesta, el test "no filtra datos personales" falla. Con la fuga en el service pero el schema presente, el test pasa: el schema de respuesta efectivamente descarta lo no declarado.
- No detectable en aislamiento: quitar `"web.%"` de `KNOWN_KEY_PATTERNS` solo rompe el test de 0190 si queda una fila `web.brand_name` en la DB en ese momento (el test de site-data la limpia). Es un gate latente a proposito.

## Deltas de gates de tenancy

- `ENTRADAS_BASELINE` (ISO-01): **447 -> 448, +1** (`GET /api/web/site-data`, `templo-module` / `templo-marketing`).
- `KNOWN_KEY_PATTERNS` (0190): **+ `"web.%"`** con referencia `web-public/brand.ts (fase 195)`.
- `GYM_OWNED_TABLES` 99, `schemaTables` 103, `gymOwnedChecked` 99, 0196 Test 10 99, `JOBS_ESPERADOS` 9: sin cambios (no hay tabla ni job).
- `tenant-lint-allowlist.json`: sin tocar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Delete de test sin filtro de tenant tropezo con el sentinel**
- **Found during:** primera corrida del test de integracion
- **Issue:** el `DELETE FROM schedules` del cleanup de mi test no llevaba `tenantWhere` y el sentinel de tenancy lo rechazo (ademas el error del `finally` tapaba las aserciones).
- **Fix:** cleanup por cada contexto de tenant con `tenantWhere`.
- **Files modified:** `el-templo-api/test/web-public/site-data.test.ts`
- **Commit:** `1508aadb0`

**2. [Rule 2 - Critical] Casos de aislamiento extra pedidos por el threat model (T-195-06)**
- Agregue el test de filas cruzadas entre gimnasios (las FK simples de `schedules` NO las impiden, solo `tenantWhere` las frena) y el de marca de otro gimnasio.

**Otras diferencias menores:**
- El plan listaba 12 archivos; agregue `index.ts` en el modulo (patron de `blog`) para que `modules-boot.ts` importe de la carpeta.
- Test de rate limit (429 en el pedido 61 con IP propia via `remoteAddress`): no estaba en el plan, cubre T-195-07.
- Para cumplir los greps de aceptacion reescribi dos comentarios (sin el literal `coachUserId` en `service.ts` y sin el nombre de la marca en el comentario de `brand.ts`).
- `opening-hours.ts` quedo reformateado por Prettier en el segundo commit (una linea).

## Issues Encountered / Lecciones para los planes siguientes

1. **Config aislada reutilizable sin reprovisionar:** despues de una corrida completa (con `globalSetup`, ~3 min), alcanza con una copia de la config sin la linea `globalSetup` para iterar en 5 s por corrida (la DB `eltemplo_t195_1` persiste). Mutation testing con un script que reemplaza cadenas, corre un archivo y restaura es viable (20 mutantes en minutos).
2. **El sentinel de tenancy tambien aplica a los tests:** todo `DELETE`/`UPDATE`/`SELECT` de tabla gym-owned en un test necesita `tenantWhere` (o `tenantValues`). Un error en un `finally` tapa las aserciones del `try`: verificar siempre que el cleanup no falle antes de creer en el verde.
3. **`schedules` no tiene FK compuesta de tenant:** un horario puede apuntar a sede o actividad de otro tenant a nivel de DB, solo el filtro de aplicacion lo evita. Cualquier lectura que una `schedules` con `activities`/`branches` debe llevar `tenantWhere` en cada tabla.
4. **`cleanAllTestData` borra schedules, activities y users globalmente** pero NO branches: un test que siembre sedes propias (`W195*`) debe borrarlas por `code` + `tenantWhere` en `afterAll`.
5. **Sedes de la DB de test** (PARK, ALBERTI ya publicadas por la 0271): no asumir lista exacta en `sedes`, buscar por `code`.
6. **Datos locales:** en la DB `eltemplo` MORENO solo tiene Yoga (especial). 195-03 debe tolerar `openingHours: []`.
7. **CRLF/Prettier:** lint-staged no reformateo `opening-hours.ts` en el primer commit; correr `npx prettier --check` sobre lo tocado antes de commitear.

## Known Stubs

Ninguno. `placeId`, `phone`, `postalCode`, `mapsUrl`, `photoUrl` salen `null` (o el fallback de busqueda de Maps) hasta que lleguen los datos de Franco (195-14), como ya documento 195-01.

## Threat Flags

Ninguno nuevo. El endpoint anonimo es el previsto por el plan (T-195-05 a T-195-09 mitigados y cubiertos por tests con mutation).

## Self-Check: PASSED

- Los 9 archivos creados y los 4 modificados existen; commits `092179810` y `1508aadb0` presentes en `git log`.
- Acceptance greps: `webPublicRoutes` 2, `prefix: "/api/web"` 1, entrada de manifiesto 1, `ENTRADAS_BASELINE = 448` 1, `coachUserId` en service 0, literal de la marca en `src/` 1, `rateLimit` 1, `public, max-age=300` 1, sin `any`.
- Worktree limpio salvo este SUMMARY; sin archivos temporales `*local195*`.
