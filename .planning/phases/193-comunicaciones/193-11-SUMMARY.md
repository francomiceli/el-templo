---
phase: 193-comunicaciones
plan: 11
subsystem: admin
tags: [communications, admin, vue, quasar, avisos, preview, whatsapp]

# Dependency graph
requires:
  - phase: 193-04
    provides: "CommunicationsService/communicationsRoutes (listAvisos con métricas D-17, createAviso/updateAviso/deleteAviso con allowedFieldsForSystemAviso, listAvisoClickers)"
  - phase: 193-08
    provides: "ComunicacionesPage.vue (contenedor de tabs), DestinoSelector.vue, useCommunicationsApi.ts, whatsapp.ts (util admin)"
provides:
  - "AvisosTab.vue: lista de avisos pop-up con métricas de socios únicos (D-17) y advertencia fija del orden de prioridad (D-06)"
  - "AvisoEditorDialog.vue: alta/edición completa (texto, destino, alcance, vigencia, frecuencia, estado) con reglas por code de sistema espejadas del service"
  - "AvisoPreview.vue: vista previa de solo lectura reusable por placement (popup/tarjeta), con los colores/tamaños reales de la app"
  - "VerSociosDialog.vue: quiénes tocaron el botón, con link a WhatsApp"
affects: [193-14, 193-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "allowedFieldsForCode en el frontend espeja allowedFieldsForSystemAviso (service.ts) campo por campo — el PUT parcial de un aviso de sistema solo manda los campos que esa fila realmente puede aceptar, nunca los deshabilitados aunque el usuario no los haya tocado"
    - "AvisoPreview.vue recibe { placement, title, body, buttonText, destinationLabel } de solo lectura — reusable tal cual por el editor de tarjetas del plan 14 (placement='tarjeta') sin cambios"

key-files:
  created:
    - el-templo-admin/src/components/comunicaciones/AvisosTab.vue
    - el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue
    - el-templo-admin/src/components/comunicaciones/AvisoPreview.vue
    - el-templo-admin/src/components/comunicaciones/VerSociosDialog.vue
  modified:
    - el-templo-admin/src/pages/ComunicacionesPage.vue

key-decisions:
  - "Alcance (scope) y vigencia (startsOn/endsOn) se deshabilitan para TODOS los avisos de sistema, sin importar el code — SYSTEM_ALLOWED_PLAN_EXPIRY/SYSTEM_ALLOWED_WITH_FREQUENCY/SYSTEM_ALLOWED_BASE en el service.ts NUNCA incluyen scopeBranchIds/scopeCountries/scopeSegments/startsOn/endsOn. El texto literal del plan solo mencionaba explícitamente 'frecuencia y alcance' deshabilitados para plan_expiry, pero la instrucción 'no inventar reglas nuevas: son las mismas que valida el service' manda: se generalizó la regla de alcance/vigencia a los 3 codes de sistema que puede tener esta pestaña (plan_expiry, rating_prompt, improvement_prompt), todos placement=popup según SYSTEM_AVISOS (plan 03)."
  - "AvisoPreview.vue se montó DENTRO de AvisoEditorDialog.vue (Task 3) tal como pide la acceptance criteria del plan, aunque AvisoEditorDialog.vue no está en <files> de la Task 3 — mismo patrón ya usado en la fase (L3 de las lecciones acumuladas: extender un archivo fuera del listado literal cuando el propio plan lo exige)."
  - "El editor solo crea/edita avisos placement='popup' (fijo, sin selector) porque esta pestaña filtra listAvisos('popup') — las tarjetas (placement='tarjeta') son territorio del plan 14, que puede reusar AvisoEditorDialog/AvisoPreview cambiando ese único valor fijo."

patterns-established:
  - "AvisoPreview.vue: preview de solo lectura por placement, colores copiados literalmente de RatingPromptDialog.vue/ImprovementCtaCard.vue con comentario al archivo origen — reusable por cualquier plan que necesite previsualizar copy de aviso."

requirements-completed: [COM-02]

# Metrics
duration: ~65min
completed: 2026-09-02
---

# Phase 193 Plan 11: Pestaña "Avisos en la app" del admin Summary

**AvisosTab con métricas de socios únicos y advertencia fija de prioridad de pop-ups (D-06), AvisoEditorDialog con alcance/vigencia/frecuencia y las mismas reglas de campos editables que el service para avisos de sistema, vista previa inline con el estilo real de la app, y "ver socios" con link directo a WhatsApp.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 3/3
- **Files modified:** 5 (4 nuevos + 1 modificado)

## Accomplishments

- `AvisosTab.vue`: `q-table` de avisos `placement === 'popup'` con columnas Título/Tipo/Estado/Vigencia/Frecuencia + las 3 métricas de socios únicos (D-17: Alcanzados/Cerraron/Tocaron el botón), `q-banner` fijo con el texto exacto del orden de prioridad (D-06), Borrar deshabilitado con tooltip para avisos de sistema.
- `AvisoEditorDialog.vue`: título/mensaje/botón/destino (D-12, sin imagen), alcance por sede/país (owner-only)/segmento con hint "vacío = todos" (D-13), vigencia desde/hasta + estado con validación cliente (D-14), frecuencia una vez/cada N días/cada apertura (D-11). `allowedFieldsForCode` espeja `allowedFieldsForSystemAviso` del service campo por campo: `plan_expiry` deshabilita frecuencia/estado/alcance/vigencia; `rating_prompt`/`improvement_prompt` deshabilitan solo alcance/vigencia (frecuencia y estado SÍ editables, D-08/D-09). El PUT solo manda los campos que la fila puede aceptar. Errores 400 del server se muestran vía `extractError` + `$q.notify`.
- `AvisoPreview.vue`: preview de solo lectura con las dos variantes (`popup`/`tarjeta`), colores/tamaños copiados literalmente de `RatingPromptDialog.vue` (charcoal/terracotta/cream, `$brand-terracotta` real) y `ImprovementCtaCard.vue` (borde dorado degradado, fondo oscuro), interpolación `{{ }}` sin `v-html`. Montada dentro de `AvisoEditorDialog.vue` con `placement="popup"` fijo (esta pestaña) y `destinationLabel` derivado del destino elegido.
- `VerSociosDialog.vue`: `q-table` de `listAvisoClickers` (Nombre/Teléfono/Última vez), botón de teléfono abre `whatsappUrl` con `window.open` sincrónico (sin `await` antes, D-18), estado vacío "Todavía nadie tocó el botón".
- `ComunicacionesPage.vue`: nueva pestaña `avisos` enchufada (`q-tab` + `q-tab-panel` + `VALID_TABS`).
- Verificación: `pnpm lint` (0 errores) tras cada task; `pnpm build` (`quasar build`) exitoso al final del plan, sin `dist/` en el commit; `grep -rn "v-html"` en `src/components/comunicaciones/` sin resultados.

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Lista de avisos con métricas y advertencia de prioridad** - `6e538251` (feat)
2. **Task 2: Editor de avisos (alcance, vigencia, frecuencia, reglas de sistema)** - `4a759d76` (feat)
3. **Task 3: Vista previa inline + ver socios** - `eceb8868` (feat) + `aed7ed13` (fix, autocorrección — ver Deviations)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-admin/src/components/comunicaciones/AvisosTab.vue` - lista de avisos pop-up con métricas y banner de prioridad
- `el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue` - alta/edición con reglas de sistema espejadas del service
- `el-templo-admin/src/components/comunicaciones/AvisoPreview.vue` - preview de solo lectura (popup/tarjeta)
- `el-templo-admin/src/components/comunicaciones/VerSociosDialog.vue` - quiénes tocaron el botón + link WhatsApp
- `el-templo-admin/src/pages/ComunicacionesPage.vue` - pestaña "avisos" enchufada

## Decisions Made

Ver `key-decisions` en el frontmatter: (1) alcance/vigencia deshabilitados para los 3 codes de sistema de esta pestaña, no solo `plan_expiry`, siguiendo la fuente de verdad del service; (2) `AvisoEditorDialog.vue` extendido en la Task 3 para montar `AvisoPreview` aunque no estaba en su `<files>` literal; (3) el editor fija `placement: 'popup'` sin selector, dejando `placement: 'tarjeta'` al plan 14.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de mi propio código, autocorregido] Comentario de `AvisoPreview.vue` citaba literalmente "v-html", generando un falso positivo en la verificación del plan**

- **Found during:** Task 3, al correr `grep -rn "v-html" el-templo-admin/src/components/comunicaciones/` (paso de `<verification>` del plan) inmediatamente después de escribir el archivo.
- **Issue:** El comentario de cabecera de `AvisoPreview.vue` documentaba "PROHIBIDO \`v-html\` acá" citando la cadena literal — el propio grep de verificación (que busca uso REAL de la directiva) matcheaba esa línea de comentario, dando un falso "SÍ hay v-html" pese a que el componente nunca la usa (interpola con `{{ }}`).
- **Fix:** Reformulado el comentario sin la cadena literal ("la directiva de HTML crudo de Vue" en vez de "\`v-html\`"). El comportamiento del componente no cambió, solo el texto del comentario.
- **Files modified:** `el-templo-admin/src/components/comunicaciones/AvisoPreview.vue`
- **Verification:** `grep -rn "v-html" el-templo-admin/src/components/comunicaciones/` → sin resultados; `pnpm lint` 0 errores.
- **Committed in:** `aed7ed13` (commit separado, no amend, siguiendo la regla dura de no usar `--amend`)

**2. [Alcance, no bug — generalización de una regla ya vigente en el server] Alcance y vigencia deshabilitados para TODOS los avisos de sistema, no solo `plan_expiry`**

- **Found during:** Task 2, al leer `allowedFieldsForSystemAviso` en `service.ts` para construir `allowedFieldsForCode` en el editor.
- **Detalle:** El texto del plan solo menciona explícitamente "para `plan_expiry`, frecuencia y alcance quedan deshabilitados"; no dice nada de `rating_prompt`/`improvement_prompt` respecto a alcance/vigencia. Pero ninguno de los 3 sets del service (`SYSTEM_ALLOWED_PLAN_EXPIRY`/`SYSTEM_ALLOWED_WITH_FREQUENCY`/`SYSTEM_ALLOWED_BASE`) incluye `scopeBranchIds`/`scopeCountries`/`scopeSegments`/`startsOn`/`endsOn` — el server rechazaría con 400 un PUT que los toque, para CUALQUIER `code` de sistema. Siguiendo la instrucción explícita del prompt ("no inventar reglas nuevas: son las mismas que valida el service, y si la API devuelve 400 el diálogo muestra el mensaje del server"), se deshabilitaron alcance y vigencia para los 3 codes de sistema que puede tener esta pestaña (`plan_expiry`, `rating_prompt`, `improvement_prompt` — los únicos con `placement: 'popup'` en `SYSTEM_AVISOS`, plan 03).
- **Files modified:** ninguno adicional — decisión de diseño tomada durante la Task 2, sin código a revertir.
- **Verification:** Manual, contra `service.ts` (Read directo del archivo, líneas 128-171).

---

**Total deviations:** 1 auto-fijada (Rule 1, corrección de un falso positivo en mi propio comentario, sin impacto funcional) + 1 decisión de diseño documentada (generalización de una regla del service que el texto del plan no explicitaba para todos los codes).
**Impact on plan:** Sin impacto negativo. Ambas hacen que el editor refleje EXACTAMENTE lo que el server acepta — sin la generalización de alcance/vigencia, un admin podría intentar cambiar el alcance de `rating_prompt` desde la UI y recibir un 400 inesperado del server para un campo que el editor mostraba como habilitado.

## Issues Encountered

Ninguno bloqueante. Al ser el plan 11 el primero en construir sobre `AvisoEditorDialog.vue`/`VerSociosDialog.vue` que la Task 1 ya importaba (aún no existentes en ese momento), se verificó explícitamente que el `eslint.config.js` del admin no resuelve imports de módulos (sin regla `import/no-unresolved`, sin `parserOptions.project` en el parser de TypeScript) — el `pnpm lint` de la Task 1 pasó en 0 errores pese a que esos dos archivos no existían todavía, y el gate real de resolución de imports (`pnpm build`, corrido una sola vez al final) confirmó que los 3 componentes quedaron correctamente enlazados.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `AvisoEditorDialog.vue` y `AvisoPreview.vue` quedan listos para que el plan 14 (Tarjetas + Ajustes) los reuse cambiando `placement` a `'tarjeta'` y quitando el bloque de Frecuencia (D-15b: las tarjetas se ven en cada apertura, `every_open` fijo — el service ya fuerza esto server-side aunque el input mande otra cosa). `AvisoPreview.vue` YA tiene la variante `tarjeta` implementada (estilo `ImprovementCtaCard.vue`), sin trabajo adicional.
- El plan 16 (Avisos en TV) es una entidad completamente aparte (`tv_avisos`, sin destino/alcance/vigencia/frecuencia, D-24) — no reusa `AvisoEditorDialog.vue` ni `AvisoPreview.vue` directamente, pero puede tomar el patrón de "editor + preview inline" y el componente `VerSociosDialog.vue` no aplica (los avisos de TV no tienen métricas de clic por socio).
- `useCommunicationsApi()` ya expone `getSalesNumbers`/`setSalesNumbers` sin UI — sigue pendiente para el bloque "Ajustes" del plan 14, según lo dejó documentado el plan 08.
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 22 commits nuevos sobre `origin/master` `7c273a15` (18 de los planes 01-10 + 4 de este).

---

## Self-Check: PASSED

- `el-templo-admin/src/components/comunicaciones/AvisosTab.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/AvisoEditorDialog.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/AvisoPreview.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/VerSociosDialog.vue` — FOUND
- `el-templo-admin/src/pages/ComunicacionesPage.vue` — FOUND (con `name="avisos"` y `<AvisosTab`)
- Commit `6e538251` — FOUND
- Commit `4a759d76` — FOUND
- Commit `eceb8868` — FOUND
- Commit `aed7ed13` — FOUND
- `.planning/phases/193-comunicaciones/193-11-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
