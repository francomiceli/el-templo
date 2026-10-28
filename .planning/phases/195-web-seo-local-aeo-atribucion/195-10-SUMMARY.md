---
phase: 195-web-seo-local-aeo-atribucion
plan: "10"
subsystem: api + admin
tags: [reports, attribution, funnel, meta-spend, search-console, ia, tenancy]
requires: ["195-09"]
provides:
  - "GET /api/admin/reports/attribution: embudo registro -> prueba -> pago -> facturacion por canal, campana y sede, gasto de Meta, costo por alumno pago, IA y gasto sin altas"
  - "GET /api/admin/reports/attribution/search-console: ultimo periodo de search_console_stats por pagina de sede, con top 5 consultas"
  - "AttributionReportService, codifiedSede (puro), MoneyBag (marketing/report-service.ts)"
  - "Admin: Reportes > 'Origen de altas' (owner/admin)"
affects: [195-11, 195-14]
tech-stack:
  added: []
  patterns:
    - "Prueba y pago por usuario con subconsultas EXISTS escritas como SQL literal (columnas externas como signup_attributions.user_id) para esquivar el gotcha (b) de Drizzle"
    - "Expresiones de columna como literal dentro del statement para que el lint de tenancy no cuente accesos sueltos: cada statement que toca una tabla gym-owned lleva su tenantWhere"
    - "Owner = filtra por ?country=, resto = cerrado a su pais (patron de finance), NO scope.country ?? query.country"
key-files:
  created:
    - el-templo-api/src/modules/marketing/report-service.ts
    - el-templo-api/src/modules/marketing/report-routes.ts
    - el-templo-api/src/modules/marketing/report-schemas.ts
    - el-templo-api/test/reports/attribution-report.test.ts
    - el-templo-admin/src/components/reports/OrigenAltasReport.vue
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-admin/src/types/report.ts
    - el-templo-admin/src/composables/useReportsApi.ts
    - el-templo-admin/src/pages/ReportesPage.vue
decisions:
  - "El gasto de Meta vive a nivel campana: solo baja a la fila de una sede si el nombre de la campana contiene, como palabra entera, el web_slug de EXACTAMENTE una sede PUBLICADA (publish_on_web = 1) y la fila es del canal meta_ads y de esa sede. Cero o varias coincidencias = no se adivina"
  - "totals.gasto sale directo de ad_spend_daily (platform meta) del rango, por moneda, sin depender de las altas"
  - "Con filtro de sede, el gasto y gastoSinAtribuir se limitan a las campanas que codifican esa sede (el gasto de una campana multi-sede no es de ninguna sede)"
  - "Con filtro de pais, el gasto entra solo en la moneda del pais (AR -> ARS, ES -> EUR): ad_spend_daily no guarda pais"
  - "IA: el sitio sale de referrer_host y, si falta, de utm_source (ChatGPT manda ambos y el referrer gana)"
metrics:
  tasks: 2
  commits: 3
  completed: 2026-10-07
---

# Phase 195 Plan 10: Reporte de origen de altas Summary

Franco ve en Admin > Reportes > "Origen de altas" de donde salen los alumnos que pagan y cuanto cuesta cada uno: embudo por canal, campana y sede (agrupable en el cliente), facturacion y gasto siempre por moneda, costo por alumno pago a nivel campana, desglose del trafico de IA por sitio, gasto sin altas y el panel de Google Search Console. Solo owner y admin.

## Commits

| Hash | Mensaje |
|------|---------|
| `10d2cb9dd` | feat(195-10): reporte de origen de altas (API) |
| `9e865ca4d` | test(195-10): mutation testing del reporte de origen de altas |
| `fbfa3d2c6` | feat(195-10): tab Origen de altas (admin) |

## Tests y resultados

Todo en foreground, un archivo por vez, con la config aislada `eltemplo_t195_*` (temporales borrados, nada sin commitear).

| Verificacion | Resultado |
|--------------|-----------|
| `test/reports/attribution-report.test.ts` | 33/33 |
| `test/tenancy/iso-01-manifiesto.test.ts` | 13/13 (450 entradas) |
| `npx tsc --noEmit` (api) | verde |
| `pnpm lint:tenant` | DISCREPANCIAS: 0 |
| `pnpm typecheck:tests` | DISCREPANCIAS: 15 (igual que la base; ninguna en archivos de este plan) |
| Admin `pnpm lint` | 0 errores (8 warnings preexistentes: `env.d.ts`, `CobrosPage`, `pdf/*`) |
| Admin `pnpm build` | OK |

Cobertura del test: embudo por (canal, campana normalizada, sede) con prueba y pago por usuario; facturacion por moneda (usuario con pagos en ARS y EUR, dos pagos del mismo usuario); pago de tier zero, suscripcion gratis, prueba cancelada y reserva que no es de prueba no cuentan; rango inclusivo en ambos bordes (00:00:00 y 23:59:59) y excluye un segundo antes/despues; gasto de campana multi-sede sin duplicar entre sedes; campana que codifica la sede (fila Meta de esa sede si, otro canal u otra sede no); campana con gasto y sin alumnos pagos (sin costo); `totals.gasto` con dias extremos, EUR, otra plataforma y fuera de rango; gasto sin altas; IA por referrer y por `utm_source`; filtros de sede y pais; owner vs admin de pais; 403 al pedir una sede de otro pais; validacion de fechas (400); gestion y coach 403, sin token 401; aislamiento con un segundo gimnasio (los numeros del 1 no cambian, el admin del 2 ve solo lo suyo, el slug publicado de otro gimnasio no codifica); Search Console (sin datos, ultimo periodo, top 5 por pagina, limite, impresiones en cero); `codifiedSede` y `MoneyBag` puros.

### Mutation testing (honesto)

50 mutantes sobre servicio y rutas, baseline verde antes y archivo restaurado (`git diff --quiet`) despues. Dos mutantes de bordes de gasto (`gt`/`lt` sin importar) daban "muertos" por `ReferenceError` en vez de por una asercion: se rehicieron con SQL crudo y mueren por las aserciones.

- Primera pasada: 5 sobrevivientes. Mejoraron el test: fila de otro canal / otra sede con la campana que codifica una sede (M20, M21), campana con gasto sin alumnos pagos (M22), gasto en los dos dias extremos del rango, sede con slug pero NO publicada (M27), orden de IA por cantidad y no alfabetico (M25), top 5 de consultas con una fila sin consulta (M40), orden de monedas con EUR llegando primero (M34, via test unitario de `MoneyBag`).
- Equivalentes documentados (no se pueden matar con un test de comportamiento):
  - recorte por sede del gasto dentro de `buildCampaigns`: redundante con el de `spendByCampaign` (se elimino el codigo redundante en vez de dejarlo);
  - `like` de paginas de sede dentro de la subconsulta de consultas: el filtro por `pageOrder` en JS deja el mismo resultado (solo evita traer filas de mas);
  - `min(period_start)` vs `max(period_start)`: un periodo tiene un unico `period_start`;
  - `tenant_id` explicito en las subconsultas EXISTS y el `tenantWhere` de `branches` en el JOIN: redundantes con la FK de usuario (un usuario es de un solo gimnasio) y el id unico de la sede; quedan como defensa en profundidad.
- Mutantes de aislamiento (sin `tenantWhere` en `ad_spend_daily`, en `publishedSedes`) mueren con el test del gimnasio 2.

## Deltas de gates de tenancy

| Gate | Delta |
|------|-------|
| `ENTRADAS_BASELINE` (ISO-01) | 448 -> 450, +2 (`GET /api/admin/reports/attribution`, `GET /api/admin/reports/attribution/search-console`, ambas `tenant-scoped`); titulo del `it` actualizado |
| `GYM_OWNED_TABLES` / `schemaTables` / `gymOwnedChecked` / 0196 T10 | sin cambios (103 / 107 / 103 / 103): no hay tablas nuevas |
| `JOBS_ESPERADOS` | sin cambios (11) |
| ISO-03 | las rutas quedan fuera de sus prefijos (el aislamiento se testea en el propio archivo) |
| `tenant-lint-allowlist.json` | sin tocar |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pais del owner: el plan decia `request.scope.country ?? query.country`**
- **Found during:** Task 1, test "owner sin filtro ve los dos paises" (daba 8 altas en vez de 9: faltaba Espana).
- **Issue:** el owner tiene `users.country = 'AR'`, asi que `scope.country` nunca es null y el filtro `?country=` del owner se ignoraba (y el owner sin filtro quedaba cerrado a Argentina).
- **Fix:** patron de `finance/routes.ts`: owner -> `query.country` (o sin filtro); resto -> `scope.country`, ignorando el query. Cubierto por tests (owner con/sin pais, admin AR pidiendo ES, admin ES pidiendo AR).
- **Commit:** `10d2cb9dd`

**2. [Rule 1 - Bug] `bookings.status` no existe: la columna fisica es `booking_status`**
- **Found during:** Task 1 (500 en la primera corrida). El `mysqlEnum("booking_status", ...)` define el nombre fisico; la subconsulta EXISTS escrita a mano usaba `status`.
- **Commit:** `10d2cb9dd`

**3. [Rule 1 - Bug] Regex de acentos con caracteres combinantes literales**
- Prettier dejo los `̀-ͯ` como caracteres literales en el regex de `normalizeText`. Se cambio por `\p{M}` con flag `u`, que prettier no toca.
- **Commit:** `10d2cb9dd`

### Diferencias con el texto del plan (datos de prueba del plan inconsistentes)

- El bloque `<behavior>` del plan lista totales "registros 3, pagaron 1" y "branchId=<sede B> -> solo la fila directo". Con los datos que el mismo plan siembra no se cumplen (la sede B tambien tiene la fila `promo-octubre`; los totales dan mas altas). El test afirma los valores que se derivan de los datos sembrados (los puntos que el plan si fija con precision se cumplen tal cual: `promo-octubre` registros 2 / pagaron 2 / gasto 6000 / costo 3000 con desglose A 1/1 y B 1/1, fila de la sede A de `sede-a-195-octubre` con gasto 1500 y costo 1500, `totals.gasto` = ARS 8200 antes de sumar los casos extra).
- La IA incluye `utm_source` como respaldo del sitio (el plan solo hablaba de `referrerHost`): una alta de IA sin referrer pero con `utm_source=perplexity.ai` se contaba con sitio vacio.
- La validacion `dateFrom > dateTo` es 400 (el plan no la mencionaba).
- Se agrego la opcion "Detalle" (canal + campana + sede) al selector de agrupacion del admin.

### Decisiones propias (marcadas para Franco)

- **Campana "codifica la sede":** coincidencia de palabra entera (separada por cualquier caracter no alfanumerico, sin acentos ni mayusculas), no `contains` crudo, para que un slug corto no matchee dentro de otra palabra. Si el nombre contiene dos slugs (p. ej. `alberti` y `alberti-norte`), no se asigna a ninguna sede.
- **Pais y gasto:** `ad_spend_daily` no guarda pais; con filtro de pais se muestra el gasto en la moneda del pais (AR -> ARS, ES -> EUR). Si la cuenta publicitaria argentina factura en USD, el admin de pais no la veria (el owner sin filtro si). Ajustar `COUNTRY_CURRENCY` si pasa.
- **Search Console no se filtra por pais ni sede:** es de todo el sitio; solo owner/admin.

## Contrato para los planes siguientes

- **195-11 (deploy):** sin variables nuevas. La API de reportes funciona sin credenciales de Meta/Google (gasto y Search Console vacios con textos de estado vacio en el admin).
- **195-14 (guia):** el costo por alumno depende de que las campanas de Meta tengan `utm_campaign={{campaign.name}}` (ya en la guia). Para que el gasto baje a una sede, el nombre de la campana tiene que incluir el slug de la sede (p. ej. `juan-b-justo-octubre`).

## Known Stubs

Ninguno. Los estados vacios del admin ("Todavia no hay datos de Search Console", "Sin gasto de Meta") son comportamiento esperado hasta que Franco conecte las cuentas.

## Threat Flags

Ninguno nuevo. T-195-41 (solo `ADMIN_ROLES`, tests 401/403), T-195-42 (tenantWhere en todas las tablas + test con un segundo gimnasio), T-195-43 (`requireBranchAccess` + `enforceBranchScope` + pais forzado, tests de 403 y de pais), T-195-44 (monedas siempre separadas, tests con EUR) mitigados y cubiertos.

## Pendientes para Franco

1. **Retencion de `search_console_stats`** (pendiente de 195-09): el reporte lee solo el ultimo periodo; sigue sin purga de periodos viejos. Decidir una retencion (p. ej. 12 meses).
2. **UAT en el admin con datos reales**: sin credenciales de Meta/Google las secciones de gasto y Search Console muestran el estado vacio; el embudo y la IA ya funcionan con las altas que se vayan guardando desde el deploy de 195-07. Revisar el aspecto de la tab (no hay vue-tsc ni test de componentes: se verifico con `pnpm lint` + `pnpm build`).
3. **Moneda de la cuenta publicitaria de Argentina**: si es USD, ver la decision de pais y gasto de arriba.
4. **`vue-tsc` no esta instalado**: los tipos del admin de este plan no se chequearon con TypeScript (solo lint + build).

## Lecciones para los planes siguientes

- **Columna fisica de los `mysqlEnum`**: en SQL escrito a mano, `bookings` usa `booking_status` (no `status`); revisar el primer argumento del enum antes de escribir SQL literal.
- **Lint de tenancy por statement**: cada statement que nombre una tabla gym-owned (incluidas aliases `const t = schema.x`) tiene que contener `tenantWhere(` en su propio texto. Evitar aliases y variables compartidas con la tabla adentro; para fragmentos `sql` reutilizados, escribir la columna como literal (`signup_attributions.utm_campaign`) en vez de `${schema.x.col}`.
- **Owner y pais**: `request.scope.country` NO es null para el owner (su `users.country` es AR). Para "owner elige / el resto cerrado" usar `scope.isOwner` (patron de `finance/routes.ts`).
- **Prettier y regex con escapes unicode**: usar `\p{M}`/flag `u` (prettier convierte `̀-ͯ` en caracteres literales).
- **Mutantes que dan `ReferenceError`**: un mutante que referencia un import inexistente "muere" por la razon equivocada; mutar con `sql` crudo o con simbolos ya importados.
- **Harness de mutacion** en el scratchpad `mut10/mut.py` (50 mutantes, sin commitear).

## Self-Check: PASSED

- Archivos creados existen (servicio, rutas, schemas, test, componente) y los 3 commits estan en `git log`.
- Worktree limpio salvo este SUMMARY; configs temporales de vitest borradas; `dist` del admin ignorado.
