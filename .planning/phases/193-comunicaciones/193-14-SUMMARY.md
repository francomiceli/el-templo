---
phase: 193-comunicaciones
plan: 14
subsystem: admin
tags:
  [
    communications,
    admin,
    vue,
    quasar,
    avisos,
    tarjetas,
    whatsapp,
    sales-number,
    dry,
  ]

# Dependency graph
requires:
  - phase: 193-04
    provides: "CommunicationsService/communicationsRoutes: listAvisos/createAviso/updateAviso/deleteAviso (kind/placement/sortOrder), getSalesNumbers/setSalesNumbers (D-20)"
  - phase: 193-08
    provides: "ComunicacionesPage.vue (contenedor de tabs), useCommunicationsApi.ts"
  - phase: 193-11
    provides: "AvisoEditorDialog.vue/AvisoPreview.vue (editor + preview reusables, placement popup/tarjeta ya soportado en AvisoPreview)"
provides:
  - "TarjetasTab.vue: pestaña 'Tarjetas de Mi Templo' del admin — 4 tarjetas fijas (kind='system', code card_*) con copy editable + tarjetas libres, métrica única de clics (D-19), orden subir/bajar persistido en sortOrder"
  - "AjustesVentas.vue: bloque de número de WhatsApp de ventas por país (AR/ES), montado colapsable arriba de la tabla de tarjetas"
  - "AvisoEditorDialog.vue extendido con placement ('popup'|'tarjeta') y createSortOrder — reusado por TarjetasTab sin duplicar el formulario"
  - "aviso-format.ts: vigenciaLabel/avisoStatusColor/avisoStatusLabel compartidos entre AvisosTab y TarjetasTab"
affects: [193-15, 193-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AvisoEditorDialog.vue generaliza con withDefaults(placement='popup') en vez de bifurcar en dos componentes: el bloque de Frecuencia se oculta entero con v-if placement==='popup', y el alta de una tarjeta manda sortOrder vía prop createSortOrder calculada por el llamador (TarjetasTab)"
    - "Reordenamiento subir/bajar = swap de sortOrder entre la fila y su vecina en el arreglo ya ordenado por el server (2 updateAviso en paralelo), no se adaptó useDragReorder.ts (contrato pensado para un endpoint de paso a paso que este dominio no tiene)"
    - "aviso-format.ts consolida formato de vigencia/estado usado por 2+ tablas de avisos, reusando formatDate (util canónico existente) en vez del parser DD/MM/YYYY ad-hoc que tenía AvisosTab"

key-files:
  created:
    - el-templo-admin/src/components/comunicaciones/TarjetasTab.vue
    - el-templo-admin/src/components/comunicaciones/AjustesVentas.vue
    - el-templo-admin/src/utils/aviso-format.ts
  modified:
    - el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue
    - el-templo-admin/src/components/comunicaciones/AvisosTab.vue
    - el-templo-admin/src/composables/useCommunicationsApi.ts
    - el-templo-admin/src/pages/ComunicacionesPage.vue

key-decisions:
  - "Ubicación del bloque 'Ajustes' (discreción del CONTEXT.md): bloque colapsable (q-expansion-item, default-opened) DENTRO del panel 'tarjetas' de ComunicacionesPage.vue, arriba de la tabla — NO una pestaña propia. Motivo: el número de ventas es la config que más se relaciona con las tarjetas card_upsell/card_program (ambas destino whatsapp_sales), y el CONTEXT ofrecía exactamente esta opción como una de las dos válidas."
  - "El reordenamiento (subir/bajar) se habilitó para TODAS las tarjetas (sistema y libres), no solo las libres — GET /me/tarjetas (prompt-service.ts) ordena por sortOrder,id sin distinguir kind, y sortOrder está en SYSTEM_ALLOWED_BASE (editable server-side para los 4 code card_*). D-15b describe el comportamiento de fábrica ('las libres van después de las fijas' con el seed sortOrder 1..4), no una restricción de que las fijas no puedan moverse — restringir el control solo a libres hubiera sido una regla inventada, no una que exige el server."
  - "AvisoEditorDialog.vue NO se duplicó: se generalizó con un prop placement (default 'popup', backward-compatible con AvisosTab.vue que no lo pasa) y createSortOrder. La Frecuencia se oculta completa para tarjeta en vez de deshabilitarla — el service ya la fuerza a every_open/null de todos modos (D-15b), mostrarla habilitada solo confundiría."
  - "'Ver socios' (D-18) NO se agregó a TarjetasTab — el plan (task action + acceptance_criteria) solo pide la columna de clics para tarjetas, a diferencia de AvisosTab que sí la tiene. El backend ya soporta /clickers para cualquier aviso si un plan futuro lo pide."

patterns-established:
  - "aviso-format.ts: punto único de formato de vigencia/estado para cualquier tabla de avisos futura (ej. si un plan agrega otra vista de avisos)."

requirements-completed: [COM-03, COM-01]

# Metrics
duration: ~70min
completed: 2026-09-02
---

# Phase 193 Plan 14: Tarjetas de Mi Templo + Ajustes (número de ventas) Summary

**TarjetasTab.vue reusa el editor de avisos (placement='tarjeta') para las 4 tarjetas fijas del carrusel premium más las libres del staff, con orden subir/bajar persistido en `sortOrder` (el mismo campo que ya ordena `GET /me/tarjetas`) y métrica única de clics; AjustesVentas.vue cierra D-20 con el número de WhatsApp de ventas por país, validado igual que el server.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2/2
- **Files modified:** 7 (3 nuevos + 4 modificados)

## Accomplishments

- `TarjetasTab.vue`: `q-table` de avisos `placement === 'tarjeta'` con columnas Título/Tipo (chip Sistema con tooltip de por qué su visibilidad no se edita acá /Propia)/Estado/Vigencia/Alcance resumido/Clics/Orden/Acciones. Borrar deshabilitado con tooltip para `kind: 'system'`. Subir/bajar persiste `sortOrder` con 2 `updateAviso` en paralelo (swap con la fila vecina).
- `AvisoEditorDialog.vue`: prop `placement` (default `'popup'`, backward-compatible) y `createSortOrder`; con `placement="tarjeta"` oculta el bloque de Frecuencia entero, pasa el `placement` real a `AvisoPreview` (antes hardcodeado a `'popup'`), y el alta manda `sortOrder: createSortOrder` + `frequencyType: 'every_open'` fijo.
- `AjustesVentas.vue`: dos `q-input` (AR/ES) con validación cliente `^[0-9]{8,15}$` (mismo patrón que `sales-number.ts`), placeholder = hardcode actual (SOLO texto de ayuda, nunca precargado como valor), banner explicando cuándo lo usa la app y el fallback al número histórico de la sede. Montado colapsable (`default-opened`) arriba de la tabla de tarjetas.
- `aviso-format.ts` (nuevo): `vigenciaLabel`/`avisoStatusColor`/`avisoStatusLabel` compartidos — `AvisosTab.vue` se migró a este util en vez de sus 4 funciones locales duplicadas (DRY, CLAUDE.md), reusando además `formatDate` (util canónico) en vez del parser DD/MM/YYYY ad-hoc que tenía.
- Verificación: `pnpm lint` (0 errores, mismos 8 warnings preexistentes ajenos) tras cada task; `pnpm build` (`quasar build`) exitoso al final del plan, sin `dist/` en el commit.

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Pestaña Tarjetas** - `d9b1d33f` (feat)
2. **Task 2: Bloque Ajustes con el número de ventas por país** - `690c4529` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-admin/src/components/comunicaciones/TarjetasTab.vue` - pestaña de tarjetas (4 fijas + libres, orden, clics)
- `el-templo-admin/src/components/comunicaciones/AjustesVentas.vue` - número de WhatsApp de ventas por país
- `el-templo-admin/src/utils/aviso-format.ts` - formato de vigencia/estado compartido
- `el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue` - `placement`/`createSortOrder` (reuso para tarjetas)
- `el-templo-admin/src/components/comunicaciones/AvisosTab.vue` - migrado a `aviso-format.ts` (deviation DRY)
- `el-templo-admin/src/composables/useCommunicationsApi.ts` - fix de tipo en `setSalesNumbers` (deviation Rule 1)
- `el-templo-admin/src/pages/ComunicacionesPage.vue` - pestaña `tarjetas` + bloque `AjustesVentas`

## Decisions Made

Ver `key-decisions` en el frontmatter: (1) ubicación de "Ajustes" dentro del panel "tarjetas" (discreción del CONTEXT, ambas opciones eran válidas); (2) reordenamiento habilitado para TODAS las tarjetas (sistema + libres), no solo libres, porque así lo trata el server (`sortOrder` en `SYSTEM_ALLOWED_BASE`, `GET /me/tarjetas` ordena mezclado); (3) `AvisoEditorDialog.vue` generalizado con un prop en vez de duplicado; (4) "ver socios" NO se agregó a tarjetas (fuera del alcance literal del plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug real, bloqueante] `useCommunicationsApi.setSalesNumbers()` tipaba el input con `SalesNumbers` (AR/ES obligatorios y nullable), incompatible con el JSON Schema del server**

- **Found during:** Task 2, al escribir `AjustesVentas.vue` y descubrir que TypeScript exigía pasar `ES: null` para guardar solo `AR` (porque `SalesNumbers.ES` era una key obligatoria, solo el VALOR podía ser `null`).
- **Issue:** `el-templo-api/src/modules/communications/schemas.ts` (`updateSalesNumberSchema`) declara `AR`/`ES` como `{ type: "string", pattern: "^[0-9]{8,15}$" }` — SIN `null` en el `type` (a diferencia de la respuesta de lectura, que sí acepta `["string","null"]`). Si `AjustesVentas.vue` hubiera llamado `setSalesNumbers({ AR: '5491122334455', ES: null })` para guardar solo Argentina (forzado por el tipo `SalesNumbers` que exige ambas keys), Fastify hubiera rechazado la request con 400 por violar el schema — imposible guardar un solo país sin este fix. El bug era 100% del lado del composable (nunca usado hasta este plan, `git grep` confirmó cero call sites previos): un caso de "el tipo de LECTURA se reusó por error como tipo de ESCRITURA".
- **Fix:** Nuevo tipo `UpdateSalesNumbersInput` (`{ AR?: string; ES?: string }`, espejo exacto de `UpdateSalesNumberBody` del server) como parámetro de `setSalesNumbers`; `SalesNumbers` queda solo para la respuesta de `getSalesNumbers` (que sí es nullable).
- **Files modified:** `el-templo-admin/src/composables/useCommunicationsApi.ts`
- **Verification:** `pnpm build` (type-check) 0 errores; `AjustesVentas.vue` guarda un solo país sin mandar el otro como `null`.
- **Committed in:** `690c4529` (Task 2 commit — el fix se hizo antes de commitear, no generó un commit extra)

### DRY (no bug, mejora de mantenibilidad — CLAUDE.md "flag repetition aggressively")

**2. [Rule 2 - funcionalidad/mantenibilidad] Extracción de `aviso-format.ts` y migración de `AvisosTab.vue`**

- **Found during:** Task 1, al escribir las columnas Vigencia/Estado de `TarjetasTab.vue` — copiar literalmente las 4 funciones (`statusColor`, `statusLabel`, `formatDateDdMmYyyy`, `vigenciaLabel`) que ya vivían inline en `AvisosTab.vue` hubiera creado una segunda fuente de verdad para lo mismo, exactamente lo que CLAUDE.md pide evitar agresivamente.
- **Fix:** Nuevo `el-templo-admin/src/utils/aviso-format.ts` con las 3 funciones compartidas (`vigenciaLabel`/`avisoStatusColor`/`avisoStatusLabel`), reusando además `formatDate` (util canónico ya existente en `src/utils/format-date.ts`) en vez de reimplementar el parseo DD/MM/YYYY. `AvisosTab.vue` se migró a importar de ahí (archivo fuera del `<files>` literal de la Task 1, extendido siguiendo el precedente de la fase — plan 08 consolidó `whatsappUrl` de la misma manera).
- **Impacto visual:** el formato de fecha de `AvisosTab.vue` cambió de `DD/MM/YYYY` (parser ad-hoc) a `formatDate` (`es-AR`, ej. "2 sep 2026") — cosmético, sin cambio de dato ni de comportamiento.
- **Files modified:** `el-templo-admin/src/utils/aviso-format.ts` (nuevo), `el-templo-admin/src/components/comunicaciones/AvisosTab.vue`
- **Verification:** `pnpm lint` 0 errores; `pnpm build` 0 errores; grep confirma cero definiciones locales duplicadas de esas 3 funciones fuera de `aviso-format.ts`.
- **Committed in:** `d9b1d33f` (Task 1 commit)

---

**Total deviations:** 1 auto-fijada (Rule 1, bug real que hubiera bloqueado el guardado de un solo país) + 1 mejora DRY documentada (Rule 2, sin impacto de datos, cambio cosmético de formato de fecha en una tabla ajena al plan).
**Impact on plan:** Sin impacto negativo. El fix de Rule 1 era estrictamente necesario para que Task 2 funcionara end-to-end (guardar AR sin ES, o viceversa, es el caso de uso más común: un tenant nace con un solo país). La extracción DRY reduce la superficie de mantenimiento para el plan 16 (Avisos en TV) si necesita una tabla similar.

## Issues Encountered

Ninguno bloqueante. `q-table` con columnas custom vía `#body-cell-*` (mismo patrón que `AvisosTab.vue`) resultó directo de reusar sin fricción.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Para el plan 15 (carrusel del servidor en la app, reemplaza el hardcode de `MiTemplo.vue`):**

- `GET /me/tarjetas` (`prompt-service.ts`, ya implementado en el plan 04) devuelve las tarjetas `placement='tarjeta'` con `status='active'`, filtradas por vigencia y alcance del socio, **ordenadas por `sortOrder, id`** — el orden que arma el staff en `TarjetasTab.vue` de este plan es EXACTAMENTE el orden que debe recorrer el carrusel. No hace falta reordenar nada del lado de la app.
- Cada tarjeta trae: `title`, `body`, `buttonText`, destino resuelto (sección de la app o el link de WhatsApp de ventas ya armado con el número correcto por país, `resolveSalesNumberForUser`), y su `id` (para reportar el evento `clicked` vía `POST /me/avisos/:id/event`, D-19: las tarjetas solo miden clics — el plan 15 debe reportar el evento SOLO en el click del botón, nunca "shown"/"dismissed" para `placement='tarjeta'`, aunque el endpoint de eventos acepte los 3 tipos igual para popups).
- Las 4 fijas siempre están en la respuesta salvo que el admin las pause (`status: 'paused'`/`'draft'`) — las reglas de visibilidad adicionales por segmento (`showUpsellBadge`, `showProgramCta` de hoy) siguen siendo responsabilidad de la app/CONTEXT (D-15a: "sus reglas de visibilidad siguen en código"), el plan 15 necesita decidir cómo combinar ambas (¿el server ya filtra por segmento vía `scopeSegments`, o la app sigue aplicando la regla legacy de `showUpsellBadge`/`showProgramCta` ADEMÁS del filtro server-side?). Esto no se resolvió en este plan — es una decisión pendiente para el plan 15, no bloqueante para éste.
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 2 commits nuevos sobre `94010dd4` (HEAD de la 13).

---

## Self-Check: PASSED

- `el-templo-admin/src/components/comunicaciones/TarjetasTab.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/AjustesVentas.vue` — FOUND
- `el-templo-admin/src/utils/aviso-format.ts` — FOUND
- `el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue` — FOUND (con `placement`/`createSortOrder`)
- `el-templo-admin/src/pages/ComunicacionesPage.vue` — FOUND (con `name="tarjetas"` y `<AjustesVentas`)
- `el-templo-admin/src/composables/useCommunicationsApi.ts` — FOUND (con `UpdateSalesNumbersInput`)
- Commit `d9b1d33f` — FOUND
- Commit `690c4529` — FOUND
- `.planning/phases/193-comunicaciones/193-14-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
