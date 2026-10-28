---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 13
subsystem: admin
tags: [quasar, vue3, partners, admin-ui, reportes, liquidacion]

# Dependency graph
requires:
  - phase: 179-10
    provides: "listConversions/listBenefitsWithoutConversion/settlePendingCommissions + rutas GET /conversions, GET /benefits-without-conversion, POST /:id/settle"
  - phase: 179-11
    provides: "Página /partners con nav propio, tab CRUD, composable usePartnersApi.ts base"
  - phase: 179-12
    provides: "PartnerQrDialog.vue y botón QR por fila (no tocados por este plan)"
provides:
  - "usePartnersApi.listConversions/listBenefitsWithoutConversion/settleCommissions + tipos espejo del backend"
  - "PartnerConversionsTable.vue: tabla self-contained de conversiones con filtros (partner/estado/fecha)"
  - "Sección 'Beneficios sin conversión' en PartnersPage.vue (D-08 reescrita)"
  - "PartnerSettleDialog.vue: confirmación de liquidación batch (D-16) con manejo de 403"
  - "Página /partners con sus 3 tabs completos: Partners, Conversiones, Liquidación"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PartnerConversionsTable.vue es self-contained: trae su propia lista de partners (para el filtro) además de sus filas — no depende de props de PartnersPage.vue, mismo criterio de independencia que TrialSessionsReport.vue."
    - "El tab Liquidación NO llama a un endpoint propio de listado: reusa `partners`/`loadPartners()` ya cargados por el tab CRUD (PartnerListItem ya trae comisionesPendientes/montoPendiente agregados server-side desde 179-11) — computed `partnersWithPendingCommissions` filtra client-side sobre esos mismos datos."
    - "PartnerSettleDialog.vue distingue el 403 (axios.isAxiosError + status===403) del resto de errores para mostrar el mensaje fijo 'No tenés permisos para liquidar comisiones' en vez de extractError genérico — mitigación T-179-52."
    - "Tras liquidar, PartnersPage.vue recarga `loadPartners()` (fuente de verdad = server) en vez de mutar `comisionesPendientes` localmente — evita desincronía si otro admin liquidó en paralelo."
key-files:
  created:
    - el-templo-admin/src/components/partners/PartnerConversionsTable.vue
    - el-templo-admin/src/components/partners/PartnerSettleDialog.vue
  modified:
    - el-templo-admin/src/composables/usePartnersApi.ts
    - el-templo-admin/src/pages/PartnersPage.vue

key-decisions:
  - "Se omitió la columna 'última liquidación' del tab Liquidación (mencionada en la prosa del plan, no en sus acceptance_criteria/must_haves). Ningún endpoint del backend expone un settledAt agregado por partner: PartnerListItem no lo trae y ConversionRow tampoco. Agregarlo hubiera requerido tocar el backend (fuera de los `files_modified` de este plan, que es 100% admin) o inventar un dato con una query aproximada poco confiable. Se prefirió no fabricar el dato antes que mostrar un placeholder vacío permanente — deviation documentada abajo en vez de un stub silencioso."
  - "El filtro de partner del tab Conversiones vive DENTRO de PartnerConversionsTable.vue (fetch propio de listPartners) en vez de recibir la lista como prop desde PartnersPage.vue: mantiene el componente reusable/independiente, al costo de una llamada GET extra al montar el tab — aceptable, mismo patrón que otros reportes self-contained del admin."
  - "whatsappUrl() se duplicó localmente en PartnersPage.vue (copiado de TrialSessionsReport.vue) en vez de extraerlo a un util compartido: no existe hoy un módulo de utils para eso, y crear uno nuevo es una decisión de refactor mayor fuera del alcance de un plan de 3 tasks — mismo criterio que format-price.ts está duplicado admin/app (D-07 de la fase, 'sin pnpm workspace')."

requirements-completed: [D-08, D-13, D-16, D-20]

# Metrics
duration: ~50min
completed: 2026-08-23
---

# Phase 179 Plan 13: Tabs Conversiones y Liquidación del admin de Partners Summary

**Los 2 tabs restantes de `/partners` — conversiones (con el reporte de beneficios de partner sin conversión de D-08) y liquidación batch por partner (D-16, con confirmación informada y manejo explícito del gate de rol) — cierran la superficie operativa del módulo para que la sede haga seguimiento manual y saldos con cada comercio.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3/3
- **Files modified:** 4 (2 nuevos, 2 modificados), 1251 líneas totales entre los 4

## Accomplishments

- `usePartnersApi.ts`: `listConversions`, `listBenefitsWithoutConversion`, `settleCommissions` contra las 3 rutas de 179-10, mismo patrón loading/error/re-throw del resto del composable; tipos `ConversionRow`/`BenefitWithoutConversionRow`/`SettleCommissionsResult` espejo exacto del backend (fechas como `string` ISO, no `Date`, porque viajan serializadas en el JSON).
- `PartnerConversionsTable.vue`: tabla self-contained con filtros por partner (select propio, fetch propio de `listPartners`), estado del vínculo y rango de fechas; columnas Socio/Partner/Fecha de vínculo/Estado (chip)/Beneficio (tipo+estado)/Comisión (monto+moneda+estado o "Sin comisión"); estado vacío en español.
- `PartnersPage.vue` tab "Conversiones": monta `PartnerConversionsTable` + sección "Beneficios sin conversión" (D-08 reescrita) con su propia `q-table` (Socio/Teléfono con link wa.me/Partner/Motivo legible/Fecha) y texto explicativo de una línea; los 2 motivos (`semana_sin_conversion` → "Usó la semana y no compró", `beneficio_vencido_sin_uso` → "Beneficio vencido sin usar") se traducen siempre a texto legible.
- `PartnerSettleDialog.vue`: muestra cantidad+total+moneda de las comisiones pendientes del partner, copy explícito de que "Liquidar" no mueve plata (D-16/A4), botones Cancelar/Liquidar con `loading`; al confirmar llama `settleCommissions`, notifica con el conteo y total reales devueltos por el server, emite `settled` y cierra; el 403 (`FINANCE_VOID_ROLES`, T-179-52) se distingue del resto de errores con el mensaje "No tenés permisos para liquidar comisiones" en vez del genérico de `extractError`.
- `PartnersPage.vue` tab "Liquidación": tabla de partners con comisiones pendientes derivada client-side de los mismos `PartnerListItem` ya cargados por el tab CRUD (sin endpoint aparte — `comisionesPendientes`/`montoPendiente` ya vienen agregados desde 179-11), botón "Liquidar" por fila; tras liquidar recarga `loadPartners()` desde el server (no muta estado local).
- Página `/partners` queda con sus 3 tabs completos (Partners/Conversiones/Liquidación), sin paneles vacíos.
- `vue-tsc --noEmit` (offline, 20 errores pre-existentes en archivos ajenos al plan, 0 en los 4 archivos tocados), `lint` (0 errores/warnings en los 4 archivos) y `build` del admin en verde.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`), con hooks (sin `--no-verify`):

1. **Task 1: Funciones de reportes y liquidación en el composable** - `fa662dcf` (feat)
2. **Task 2: Tab Conversiones con la tabla de vínculos y el reporte de beneficios sin conversión** - `749ba95f` (feat)
3. **Task 3: Tab Liquidación + PartnerSettleDialog** - `d75b8786` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador/usuario, no este ejecutor — este SUMMARY no se commitea desde acá._

## Files Created/Modified

- `el-templo-admin/src/composables/usePartnersApi.ts` - `listConversions`/`listBenefitsWithoutConversion`/`settleCommissions` + tipos espejo (+141 líneas)
- `el-templo-admin/src/components/partners/PartnerConversionsTable.vue` (nuevo) - tabla de conversiones con filtros
- `el-templo-admin/src/pages/PartnersPage.vue` - tabs "Conversiones" y "Liquidación", secciones de beneficios sin conversión y liquidación
- `el-templo-admin/src/components/partners/PartnerSettleDialog.vue` (nuevo) - confirmación de liquidación batch

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: la columna "última liquidación" mencionada en la prosa del plan (Task 3) no se implementó porque ningún endpoint expone esa fecha agregada por partner — ver Deviations.

## Deviations from Plan

### Auto-fixed Issues

Ninguna — no se encontraron bugs, blockers ni funcionalidad crítica faltante que ameritara Rule 1/2/3 durante la ejecución.

### Otras desviaciones documentadas (alcance, no bugs)

**1. Columna "última liquidación" del tab Liquidación omitida.**

- **Dónde:** Task 3, tabla del tab "Liquidación".
- **Qué pedía el plan:** "tabla de partners con comisiones pendientes (partner, cantidad de comisiones, total, moneda, **última liquidación**)".
- **Por qué se omitió:** ningún endpoint del backend (179-10) expone una fecha de última liquidación agregada por partner. `PartnerListItem` (`listPartners`) no la trae, y `ConversionRow` (`listConversions`) tampoco incluye `settledAt` por comisión. Los `files_modified` de este plan son exclusivamente admin — agregar el campo hubiera requerido tocar `el-templo-api/src/modules/referral-partners/service.ts` (fuera de alcance) o aproximar el dato con datos que no lo sostienen de forma confiable.
- **Decisión:** no fabricar el dato. La columna no se agregó (en vez de agregarla con un placeholder "—" permanente, que sería un stub silencioso). El resto de la tabla (partner, cantidad pendiente, total, moneda vía `formatPrice`, botón Liquidar) cubre el requisito funcional de D-16 completo — el `must_haves`/`acceptance_criteria` del plan no exige esa columna explícitamente, solo la prosa de la acción la menciona.
- **Impacto:** ninguno sobre D-16 (liquidación batch funcional, confirmación informada, idempotente). Si se necesita en el futuro, requiere un plan que toque el backend (agregar `MAX(settledAt)` agrupado por partner a `queryPartners` o un endpoint dedicado).
- **Archivos:** `el-templo-admin/src/pages/PartnersPage.vue` (columna no agregada).

## Issues Encountered

Ninguno más allá de lo documentado en Deviations.

## User Setup Required

None — no requiere configuración de servicios externos.

## Next Phase Readiness

- La superficie operativa completa del módulo de partners en el admin queda cerrada: CRUD (179-11) + QR (179-12) + conversiones/beneficios sin conversión/liquidación (este plan). D-08, D-13, D-16, D-20 completos del lado admin.
- Pendiente fuera de este plan (fases posteriores de la 179): campo manual de código en `RegisterPage.vue` (app), checkpoint humano de carga de URLs de tienda reales (179-17).
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-admin/src/composables/usePartnersApi.ts` (modificado, listConversions/listBenefitsWithoutConversion/settleCommissions presentes)
- FOUND: `el-templo-admin/src/components/partners/PartnerConversionsTable.vue` (nuevo)
- FOUND: `el-templo-admin/src/pages/PartnersPage.vue` (modificado, tabs "conversiones" y "liquidacion" presentes)
- FOUND: `el-templo-admin/src/components/partners/PartnerSettleDialog.vue` (nuevo)
- FOUND: commit `fa662dcf` (Task 1)
- FOUND: commit `749ba95f` (Task 2)
- FOUND: commit `d75b8786` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `vue-tsc --noEmit` (offline): 20 errores pre-existentes fuera de scope, 0 en los 4 archivos de este plan
- `lint`: 0 errores/warnings en los 4 archivos de este plan
- `build`: verde
- `grep -c "q-tab " el-templo-admin/src/pages/PartnersPage.vue` = 3, `grep -c "<q-tab-panel " ...` = 3
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
