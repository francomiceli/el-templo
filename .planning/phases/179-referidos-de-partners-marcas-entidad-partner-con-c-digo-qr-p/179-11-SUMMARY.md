---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 11
subsystem: admin
tags: [quasar, vue3, rbac, partners, admin-ui]

# Dependency graph
requires:
  - phase: 179-03
    provides: "4 rutas admin CRUD de referral_partners bajo /api/admin/referral-partners (GET /, GET /:id, POST /, PATCH /:id), gateadas por MEMBER_LIFECYCLE_ROLES"
provides:
  - "Página /partners en el admin con nav propio (grupo Planes) y RBAC (PARTNERS_ROLES = gestion/admin/owner)"
  - "Tab 'Partners' con el CRUD funcional: listado con agregados de vínculos/comisiones, alta y edición"
  - "Composable usePartnersApi.ts tipado, cliente HTTP del módulo (base para 179-12/179-13)"
  - "Componente PartnerFormDialog.vue: código inmutable en edición + moneda derivada de la sede (texto informativo, nunca campo)"
affects: [179-12, 179-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "usePartnersApi.ts calcado de useImprovementProposalsApi.ts: loading/error refs, extractError, re-throw siempre, cleanup() no-op"
    - "PartnersPage.vue calcado de PlanesPage.vue (tabs+tabla) + ReportesPage.vue (filtro país owner-only + sucursal, client-side sobre country por fila ya que el endpoint no soporta filtro de país server-side)"
    - 'PartnerFormDialog.vue calcado de PromoFormDialog.vue: campo de código con :disable="isEdit", el 409 de código duplicado se muestra con el mensaje textual que devuelve la API (ya distingue los 3 espacios de nombres colisionados — D-03) en vez de un mensaje genérico'
    - "vue-tsc no está instalado como devDependency del admin (solo aparece como peerDependency opcional de vite-plugin-checker en el lockfile) — se verificó vía `pnpm dlx --package vue-tsc@2.2.12 --package typescript@5.9.3 -- vue-tsc --noEmit -p tsconfig.json` (offline, usando el pnpm store cacheado) en vez de instalarlo como devDependency del proyecto"

key-files:
  created:
    - el-templo-admin/src/composables/usePartnersApi.ts
    - el-templo-admin/src/pages/PartnersPage.vue
    - el-templo-admin/src/components/partners/PartnerFormDialog.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts

key-decisions:
  - "Filtro de país (owner-only) implementado CLIENT-SIDE sobre `PartnerListItem.country` en vez de mandarlo como query param: el endpoint listPartners (179-03) solo acepta `branchId`/`isActive` en su schema — el service tiene un `filters.country` interno pero admin-routes.ts nunca lo expone. El filtro de sede sí es server-side (branchId real). Mantiene la UX calcada de ReportesPage sin requerir tocar el módulo API de este plan."
  - "El monto de comisión y el valor de beneficio se ocultan en el formulario según el tipo elegido (discount_percent/free_pass, fixed/none) y se fuerzan a 0 en el submit cuando no aplican — evita que el usuario mande basura en un campo que el backend rechazaría (D-05/D-19: free_pass siempre 0; D-11: sin comisión siempre 0)."
  - 'Componentes de los tabs de conversiones/liquidación (179-13) quedan fuera de este plan por diseño: un solo `q-tab`/`q-tab-panel` ("Partners"), sin placeholders vacíos — el plan lo pide explícitamente para no violar el chequeo ''ningún tab sin panel''.'

requirements-completed: [D-13, D-20]

# Metrics
duration: ~55min
completed: 2026-08-23
---

# Phase 179 Plan 11: Página /partners del admin con CRUD Summary

**Página `/partners` con nav propio (RBAC gestion/admin/owner), tab único "Partners" con listado+alta+edición de comercios partner, composable HTTP tipado y formulario que respeta la inmutabilidad del código y la moneda derivada de la sede (D-13).**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3
- **Files modified:** 5 (3 nuevos, 2 modificados)

## Accomplishments

- `usePartnersApi.ts`: `listPartners`/`getPartner`/`createPartner`/`updatePartner` contra `/admin/referral-partners`, loading/error refs, `extractError` + re-throw siempre (patrón `useImprovementProposalsApi`), tipos espejo del backend (`PartnerListItem`, `CreatePartnerInput`, `UpdatePartnerInput` — este último sin `code`, deliberadamente), `cleanup()` exportado
- `PartnersPage.vue`: header "Partners", filtro país (owner-only, client-side) + sucursal (server-side, calcado de `ReportesPage.vue`), un solo `q-tab`/`q-tab-panel` "Partners" (los tabs de conversiones/liquidación llegan en 179-13), `q-table` con columnas Nombre/Código/Sede/Beneficio (texto legible)/Comisión (monto+moneda o "Sin comisión")/Vínculos (qualified/total)/Comisiones pendientes (cantidad+monto)/Estado/Acciones, botón "Nuevo partner"
- `PartnerFormDialog.vue`: calcado de `PromoFormDialog.vue` — Nombre, Código (`:disable="isEdit"`, hint), Sede (`q-select` de sucursales), Tipo de beneficio, Valor del beneficio (solo visible si `discount_percent`, regla 1-100), Tipo de comisión, Monto de comisión (solo visible si `fixed`, regla ≥0), Contacto (nombre/teléfono), Notas, toggle Activo en edición; la moneda se muestra como texto derivado de la sede elegida, nunca un campo; el 409 de código duplicado (D-03: partner/socio/promo) se muestra con el mensaje textual exacto que devuelve la API
- `PARTNERS_ROLES` (`gestion`/`admin`/`owner`) en `templo-config.ts`, espejo documentado de `MEMBER_LIFECYCLE_ROLES` del API; ítem de nav "Partners" (ícono `handshake`) en el grupo Planes; ruta `/partners` con `meta.allowedRoles: PARTNERS_ROLES` en `routes.ts`
- `vue-tsc --noEmit`, `lint` y `build` del admin en verde (0 errores nuevos; los warnings/errores preexistentes de otros archivos del repo no se tocaron — fuera de scope)

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: usePartnersApi.ts — cliente HTTP del módulo** - `96d2e0c8` (feat)
2. **Task 2: PartnersPage.vue con tabs y tabla + PartnerFormDialog.vue** - `974dd73a` (feat)
3. **Task 3: Ruta, RBAC y navegación** - `b3cf5d67` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-admin/src/composables/usePartnersApi.ts` - cliente HTTP tipado del CRUD de partners
- `el-templo-admin/src/pages/PartnersPage.vue` - página con tabs, filtros y tabla; tab "Partners" existente (los tabs "Conversiones" y "Liquidación" se agregan en 179-13 sobre esta misma página)
- `el-templo-admin/src/components/partners/PartnerFormDialog.vue` - formulario de alta/edición
- `el-templo-admin/src/router/routes.ts` - ruta `/partners` con `meta.allowedRoles: PARTNERS_ROLES`
- `el-templo-admin/src/config/templo-config.ts` - `PARTNERS_ROLES` + ítem de nav "Partners" en el grupo Planes

## Componentes y nombres para 179-12/179-13

- Página: `PartnersPage.vue` (ruta `/partners`)
- Tab existente: `name="partners"` label "Partners" — 179-13 agrega `conversiones` y `liquidacion` como hermanos dentro del mismo `q-tabs`/`q-tab-panels`
- Composable: `usePartnersApi()` (`src/composables/usePartnersApi.ts`) — 179-12/179-13 extienden con las funciones que necesiten (QR, liquidar), sin duplicar `listPartners`/`getPartner`/`createPartner`/`updatePartner`
- Formulario: `PartnerFormDialog.vue` (`src/components/partners/`) — 179-12 (botón de QR) probablemente vive en un componente hermano (`PartnerQrDialog.vue`, per el pattern map de la fase), no dentro de este diálogo

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para 179-13 (tab de liquidación): el nav/router de este plan solo cubre `PARTNERS_ROLES` (CRUD); la liquidación de comisiones (D-16) necesita su propio gate más estricto del lado del servidor (`FINANCE_VOID_ROLES`, per el pattern map) — el botón "Liquidar" en el tab nuevo deberá ocultarse client-side según el rol real, no reusar `PARTNERS_ROLES` sin más.

## Deviations from Plan

### Auto-fixed Issues

Ninguna — el plan se ejecutó según lo escrito, sin bugs ni funcionalidad faltante que ameritara Rule 1/2/3.

### Otras desviaciones documentadas (no bugs, ajustes de entorno)

**1. `vue-tsc` no es una dependencia instalada del proyecto.** El comando de verificación del plan (`pnpm --dir el-templo-admin exec vue-tsc --noEmit -p tsconfig.json`) falla con `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` porque `vue-tsc` no está en `devDependencies` de `el-templo-admin/package.json` — solo aparece en `pnpm-lock.yaml` como `peerDependenciesMeta` opcional de `vite-plugin-checker`, nunca resuelto a un binario real. Verificado que este estado es preexistente en el worktree completo (no algo que este plan rompió) y consistente con el checkout principal (`el-templo/el-templo-admin` tampoco lo tiene instalado).

- **Decisión:** no se agregó `vue-tsc` como `devDependency` del proyecto (evita tocar `package.json`/`pnpm-lock.yaml` sin permiso explícito del usuario — regla dura de memoria "nunca instalar dependencias sin preguntar"). Se corrió la verificación vía `pnpm dlx --package vue-tsc@2.2.12 --package typescript@5.9.3 -- vue-tsc --noEmit -p tsconfig.json`, que resuelve el binario desde el pnpm store ya cacheado localmente (sin descargar nada nuevo de la red en este caso) y no modifica ningún archivo del repo.
- **Resultado:** el typecheck corrió limpio sobre los 5 archivos de este plan (0 errores en `usePartnersApi.ts`, `PartnersPage.vue`, `PartnerFormDialog.vue`, `routes.ts`, `templo-config.ts`). Sí encontró ~20 errores preexistentes en archivos NO tocados por este plan (`AssignPlanDialog.vue`, `HorariosPage.vue`, `session-pdf-builder.ts`, tests de `axios-refresh-lock`, etc.) — fuera de scope, no se tocaron (regla de scope boundary del executor).
- **Recomendación para el usuario:** si `vue-tsc` va a seguir siendo obligatorio en cada plan de admin, conviene agregarlo como `devDependency` real (`pnpm add -D vue-tsc@^2.2.12 --dir el-templo-admin`, pineado a la versión compatible con `typescript@5.9.3` del proyecto — `vue-tsc@latest` resuelve `typescript@7.x` y rompe con `ERR_PACKAGE_PATH_NOT_EXPORTED`) para que los próximos ejecutores no repitan este research.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations (entorno de `vue-tsc`, no un bug de código).

## User Setup Required

None — no requiere configuración de servicios externos.

## Next Phase Readiness

- 179-12 (QR de partners) y 179-13 (tabs de conversiones/liquidación) pueden asumir: la página existe, el tab "Partners" está en su lugar final, el composable expone el CRUD completo y tipado, y el RBAC de nav+router está resuelto.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-admin/src/composables/usePartnersApi.ts`
- FOUND: `el-templo-admin/src/pages/PartnersPage.vue`
- FOUND: `el-templo-admin/src/components/partners/PartnerFormDialog.vue`
- FOUND: `el-templo-admin/src/router/routes.ts` (modificado, ruta `/partners` presente)
- FOUND: `el-templo-admin/src/config/templo-config.ts` (modificado, `PARTNERS_ROLES` presente)
- FOUND: commit `96d2e0c8` (Task 1)
- FOUND: commit `974dd73a` (Task 2)
- FOUND: commit `b3cf5d67` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `vue-tsc --noEmit`, `lint` y `build` del admin en verde
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
