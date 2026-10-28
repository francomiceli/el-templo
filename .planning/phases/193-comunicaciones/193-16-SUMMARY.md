---
phase: 193-comunicaciones
plan: 16
subsystem: admin
tags: [communications, admin, vue, quasar, tv, avisos, module-gate]

# Dependency graph
requires:
  - phase: 193-07
    provides: "TvAvisosService/tvAvisosRoutes: 5 rutas bajo /api/communications/tv, gateadas por moduleScope(app, 'templo-training', ...) (D-23), shape { id, title, body, mode, isActive, scopeBranchIds }"
  - phase: 193-08
    provides: "ComunicacionesPage.vue (contenedor de tabs + VALID_TABS), useCommunicationsApi.ts (punto único de composable admin → Comunicaciones)"
  - phase: 193-11
    provides: "Patrón editor + preview inline (AvisoEditorDialog.vue/AvisoPreview.vue) — TvAvisoEditorDialog/TvAvisoPreview copian el PATRÓN, no el código (entidad distinta, D-24)"
  - phase: 193-13
    provides: "Contrato exacto de los 3 `mode` (manual/flex_inicio/flex_final) y estilos reales de la placa (TvScreenPage.vue pantallaAviso/avisoTitulo/avisoCuerpo + paleta --trans-*)"
provides:
  - "TvAvisosTab.vue: cuarta pestaña 'Avisos en TV' de Comunicaciones — CRUD completo con degradación limpia cuando el módulo templo-training está apagado (D-23)"
  - "TvAvisoEditorDialog.vue + TvAvisoPreview.vue: editor con los 3 modos explicados en español + vista previa fiel de la placa (D-16)"
  - "useCommunicationsApi.ts extendido con listTvAvisos/createTvAviso/updateTvAviso/deleteTvAviso"
affects: [193-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detección de 'módulo apagado' client-side: CUALQUIER 404 del GET de listado (que normalmente nunca da 404, es un listado sin id) se trata como el guard de moduleScope (T-176-04: 404 indistinguible de 'ruta inexistente' a propósito), mostrando un estado vacío explicativo en vez de un error rojo — no hay forma de distinguir el 404 del guard de un 404 real desde el cliente, y no la necesita: en este endpoint un 404 real es imposible."
    - "TvAvisoEditorDialog.vue/TvAvisoPreview.vue construidos desde cero copiando el PATRÓN (estructura de diálogo, validación espejo del server, preview inline) de AvisoEditorDialog.vue/AvisoPreview.vue (plan 11), NO el código — tv_avisos es una entidad sin destino/alcance-país-segmento/vigencia/frecuencia (D-24), reusar los componentes de avisos de app hubiera significado deshabilitar la mitad de los campos."
    - "TvAvisoPreview.vue es una réplica de COLOR PLANO de la placa real (sin la foto/gradiente de fondo de TvScreenPage.vue .transFoto) — mismos colores/fuentes exactos (--trans-bronce/--trans-crema/--cream, Cinzel) copiados de TvScreenPage.vue, a escala de card, sin importar render.ts ni assets del TV."

key-files:
  created:
    - el-templo-admin/src/components/comunicaciones/TvAvisosTab.vue
    - el-templo-admin/src/components/comunicaciones/TvAvisoEditorDialog.vue
    - el-templo-admin/src/components/comunicaciones/TvAvisoPreview.vue
  modified:
    - el-templo-admin/src/composables/useCommunicationsApi.ts
    - el-templo-admin/src/pages/ComunicacionesPage.vue

key-decisions:
  - "TvAvisoEditorDialog.vue NO recibe `branches` como prop de TvAvisosTab.vue — cada componente carga sus propias sedes vía useMembersApi().getBranches(), exactamente como AvisoEditorDialog.vue (plan 11) hace independientemente de AvisosTab.vue. Mantiene el componente autocontenido (mismo criterio ya establecido en la fase) a costa de un GET /branches extra al abrir el diálogo — dataset trivial, sin impacto real."
  - "El banner de ayuda (D-25/D-26, lección L4 acumulada) explica en la propia pestaña por qué el profe a veces no ve el botón AVISO: 'el botón solo aparece cuando hay un aviso Manual activo para la sede'. Mismo texto que ya usa el propio TvControlPage.vue en su comentario interno (avisoActivo === null → botón oculto)."

requirements-completed: [COM-04]

# Metrics
duration: ~55min
completed: 2026-09-02
---

# Phase 193 Plan 16: Cuarta pestaña "Avisos en TV" del admin Summary

**`TvAvisosTab.vue` completa las 4 pestañas de Comunicaciones con el CRUD de `tv_avisos` (título, cuerpo, modo, sedes, activo/inactivo), degradación limpia cuando el módulo `templo-training` está apagado para el tenant (D-23), y un editor con vista previa fiel de la placa Cinzel/oro sobre velo (D-16).**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2/2
- **Files modified:** 5 (3 nuevos + 2 modificados)

## Accomplishments

- `useCommunicationsApi.ts`: 4 funciones nuevas (`listTvAvisos`/`createTvAviso`/`updateTvAviso`/`deleteTvAviso`) tipadas contra `/communications/tv/admin/tv-avisos` (plan 07), con los tipos `TvAvisoRow`/`TvAvisoMode`/`CreateTvAvisoInput`/`UpdateTvAvisoInput` — mismo shape exacto que devuelve el server (`{ id, title, body, mode, isActive, scopeBranchIds }`).
- `TvAvisosTab.vue`: lista con columnas Título/Modo (etiquetas en español)/Sedes ("Todas" cuando `scopeBranchIds` es `null`/vacío)/Activo (`q-toggle` que persiste inline con `updateTvAviso`, sin abrir el editor). Banner de ayuda contextual sobre el botón AVISO del control (lección L4). Un 404 de `listTvAvisos` (el guard de `moduleScope`, D-23) se detecta con `axios.isAxiosError(err) && err.response?.status === 404` y muestra un estado vacío explicativo ("El módulo de TV no está habilitado para este gimnasio") en vez de un `$q.notify` de error.
- `TvAvisoEditorDialog.vue`: Título (maxlength 120, counter), Cuerpo (textarea autogrow, maxlength 400, counter), Modo (`q-select` con las 3 opciones + ayuda contextual por modo explicando exactamente el comportamiento en el TV), Sedes (`q-select multiple`, vacío = todas), Activo (`q-toggle`). Sin selector de fechas ni de imagen (D-24). Validación cliente espejo del server (`assertTitleAndBody` de `tv-avisos-service.ts`); cualquier 400 del server (ej. sede ajena) se muestra con `notify`.
- `TvAvisoPreview.vue`: vista previa de la placa con los colores/fuentes reales copiados de `TvScreenPage.vue` (`--trans-bronce` para el título, `--trans-crema` para el cuerpo, `Cinzel`, sombras de texto), velo crema (`--cream`) para `flex_inicio` y charcoal (`--trans-noche`) para `manual`/`flex_final` — mismo criterio que `avisoVeloFor` en `render.ts` (plan 13). Se actualiza en vivo mientras se escribe (props reactivas). Interpolación `{{ }}`, sin `v-html`.
- `ComunicacionesPage.vue`: `q-tab name="tv" label="Avisos en TV"` + su panel montando `TvAvisosTab`, agregado a `VALID_TABS`.
- Verificación: `pnpm lint` (0 errores, 8 warnings preexistentes ajenos) tras cada task; `grep -n "v-html" TvAvisoPreview.vue` sin resultados; `pnpm build` (`quasar build`) exitoso al final del plan, sin `dist/` en el commit (gitignored); `ComunicacionesPage.vue` tiene exactamente 4 `<q-tab name=`.

## Task Commits

Cada task se commiteó atómicamente en `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Composable + pestaña con la lista** - `0d92121c` (feat)
2. **Task 2: Editor con modo, sedes y vista previa de la placa** - `0094dd3a` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-admin/src/composables/useCommunicationsApi.ts` - 4 funciones CRUD de avisos de TV + tipos
- `el-templo-admin/src/components/comunicaciones/TvAvisosTab.vue` - cuarta pestaña con lista, toggle Activo, degradación por módulo apagado
- `el-templo-admin/src/components/comunicaciones/TvAvisoEditorDialog.vue` - editor (título/cuerpo/modo/sedes/activo)
- `el-templo-admin/src/components/comunicaciones/TvAvisoPreview.vue` - vista previa de la placa
- `el-templo-admin/src/pages/ComunicacionesPage.vue` - `q-tab`/`q-tab-panel` "tv" + `VALID_TABS`

## Decisions Made

Ver `key-decisions` en el frontmatter: (1) `TvAvisoEditorDialog.vue` carga sus propias sedes en vez de recibirlas por prop, igual que `AvisoEditorDialog.vue`; (2) el banner de ayuda de la pestaña explica textualmente la condición del botón AVISO (D-25/D-26).

## Deviations from Plan

Ninguna — el plan se ejecutó tal cual estaba escrito. No hizo falta tocar la API (el contrato del plan 07 alcanzó exactamente para el CRUD, sin campos faltantes ni tipos inconsistentes) ni ningún archivo fuera de `files_modified`.

## Known Stubs

Ninguno. La pestaña queda completamente funcional: lista, crear, editar, activar/desactivar, borrar y previsualizar, sin datos mockeados ni placeholders de "próximamente".

## Threat Flags

Ninguno nuevo. Las 4 rutas consumidas (`/communications/tv/admin/tv-avisos*`) ya existían y estaban cubiertas por el threat register del plan 07 (T-193-58/59/60); este plan solo agrega el cliente que las consume, sin nueva superficie server-side.

## Issues Encountered

Ninguno bloqueante. `pnpm build` tardó dentro de lo esperado (single run, foreground, sin exceder el timeout de 600000ms).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Las 4 pestañas de Comunicaciones (COM-01..COM-04) quedan completas en el admin: Push, Avisos en la app, Tarjetas de Mi Templo, Avisos en TV.
- Deuda anotada heredada (no bloqueante, documentada en 193-07/193-13): `tvControlRoutes` (`/api/admin/tv/*`, el control existente del profe) sigue SIN `moduleScope` — un tenant con `templo-training` apagado pierde SOLO la pestaña de Avisos en TV (esta), no el control de clase en vivo.
- `TvAvisoPreview.vue` es una aproximación de color plano de la placa real (sin la foto/textura de fondo de `TvScreenPage.vue .transFoto`) — fiel en tipografía/color/velo, no en el detalle fotográfico. Suficiente para el propósito de D-16 (vista previa simple inline).
- Nada bloquea el plan 17 (UAT humano + bump de versión, según el CONTEXT.md del milestone): worktree limpio, `feat/193-comunicaciones` con 2 commits nuevos sobre `e63c161e` (HEAD de la 15).

---

## Self-Check: PASSED

- `el-templo-admin/src/components/comunicaciones/TvAvisosTab.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/TvAvisoEditorDialog.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/TvAvisoPreview.vue` — FOUND
- `el-templo-admin/src/pages/ComunicacionesPage.vue` — FOUND (con `name="tv"` y `<TvAvisosTab`)
- Commit `0d92121c` — FOUND
- Commit `0094dd3a` — FOUND
- `.planning/phases/193-comunicaciones/193-16-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
