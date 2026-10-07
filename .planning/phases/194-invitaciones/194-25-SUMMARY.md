---
phase: 194-invitaciones
plan: 25
subsystem: admin
tags: [invitations, admin, plans, settings, d-10b, d-10c, d-23, sc-3]
requires:
  - phase: 194-05
    provides: flag allows_invitation_discount en planes y plan Invitación por país
  - phase: 194-07
    provides: GET/PUT /api/admin/settings/invitations
provides:
  - "Toggle 'Admite descuento por invitación' en el formulario de planes (precargado en ON en alta) y marca 'Invitación ✓' en la lista"
  - "Plan Invitación (paquete + is_trial) fuera de AssignPlanDialog y del alta de Cobros"
  - "Tarjeta 'Invitaciones' en Configuración ▸ Reglas de precio con tope en dinero por país"
  - "useInvitationSettingsApi + tipos InvitationSettings/InvitationSettingsPatch"
affects: [194-26]
key-files:
  created:
    - el-templo-admin/src/components/settings/InvitationSettingsCard.vue
    - el-templo-admin/src/composables/useInvitationSettingsApi.ts
  modified:
    - el-templo-admin/src/types/subscription.ts
    - el-templo-admin/src/types/settings.ts
    - el-templo-admin/src/components/PlanFormDialog.vue
    - el-templo-admin/src/pages/PlanesPage.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/pages/ConfiguracionPreciosPage.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts
key-decisions:
  - "El plan Invitación se filtra en el ORIGEN (al cargar planes) y no en cada lista: así tampoco aparece en el toggle/selector de paquetes ni en el tab 'Paquete de clases' de Cobros"
  - "El flag nunca se manda en true para especial/paquete/is_trial (espejo del piso del servidor); en edición no se re-prende solo al volver a una categoría válida"
  - "La página Reglas de precio se abre a gestion/admin/owner: gestión debe poder cargar el tope (D-10c) y la página era owner-only"
requirements-completed: [D-10b, D-23, D-10c, D-09, D-13, D-15, D-02, D-27, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 25: admin, flag por plan y configuración de invitaciones Summary

**Gestión decide plan por plan si admite descuento por invitación (alta con la casilla en ON para las categorías que hoy lo admiten), carga desde Configuración los parámetros del programa y el tope en dinero por país (arranca vacío = sin tope, se puede borrar), y el plan Invitación deja de ofrecerse en las pantallas de asignación del admin.**

## Commits

- `472a46103` feat(194-25): flag de descuento por invitación en planes y plan Invitación fuera de los selectores
- `e747d7403` feat(194-25): tarjeta de Invitaciones en Configuración con tope en dinero por país

## Qué cambió

- **Tipos** (`types/subscription.ts`): `allowsInvitationDiscount` en `PlanListItem` y opcional en `CreatePlanInput`/`UpdatePlanInput`; helpers `planCategoryAllowsInvitationDiscount(category, isTrial)` (espejo del piso D-23) e `isInvitationPlan(plan)` (is_trial + paquete).
- **PlanFormDialog**: toggle con hint. En alta: precargado en ON salvo categoría especial/paquete o `isTrial` (hint "Activado por defecto: ..."); al cambiar a una categoría o prueba excluida baja a OFF y se deshabilita con tooltip; al volver a una válida en alta se re-prende. En edición muestra el valor guardado y nunca se re-prende solo. El payload manda siempre el flag explícito (el servidor crea en false si falta) y jamás true en categorías excluidas.
- **PlanesPage**: badge "Invitación ✓" en la columna de categoría cuando el flag está activo.
- **AssignPlanDialog / CobrosPage**: `getPlans(...).filter(!isInvitationPlan)` al cargar. `AssignPlanDialog` lleva el comentario `// Fase 194: el plan Invitación solo se asigna ...`.
- **InvitationSettingsCard** (nuevo): 6 inputs numéricos con los rangos del servidor (cupo 1-10, días hábiles 1-30, reinvitación 0-365, inactividad 0-36 meses, compra tardía 0-180, % invitado 0-50), 2 inputs de tope (AR "ARS" / ES "EUR", placeholder "Sin tope", `clearable`; vaciar manda `null` y borra la fila), filas de solo lectura "% por invitado activo: N% (configuración AURA)" y "Tope de descuento acumulable: N%" (valores del servidor, no hardcodeados), nota de que los accesos se editan en el plan Invitación de cada país. Guardar solo envía lo que cambió, se deshabilita sin cambios y notifica el error del servidor. Edición para gestion/admin/owner; el resto la ve en solo lectura.
- **useInvitationSettingsApi** (nuevo): `getSettings`, `updateSettings`, `loading`, `error`, `cleanup()`, `createLogger`.
- **ConfiguracionPreciosPage / routes / nav**: monta la tarjeta; la ruta y el ítem de menú pasan de `['owner']` a `['gestion','admin','owner']`, y las tarjetas de recargo por tarjeta y Precio Zero quedan con `v-if="isOwner"` (su PUT es owner-only en el servidor; solo se cargan si es owner).

## Verificación

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes y ajenos: `env.d.ts`, `CobrosPage` `showPaymentMethods`/`hasAlumnoContext`, `session-pdf-builder`). `timeout 900 pnpm build`: OK.
- Criterios: `allowsInvitationDiscount` en PlanFormDialog >= 2, `Activado por defecto` presente, `Fase 194: el plan Invitación` = 1 línea en AssignPlanDialog, `settings/invitations` y `cleanup` en el composable, `InvitationSettingsCard` montada, `console.` = 0 en los dos archivos nuevos.
- Chequeo canónico de copy "referid" sobre los archivos nuevos, `types/settings.ts` y `PlanFormDialog`: sin salidas.
- Grep de consumidores: no hay literales de `PlanListItem` en el admin, el campo nuevo es solo de lectura/escritura en el formulario.
- El admin no tiene tests de frontend ni `vue-tsc` (D-27): los contratos HTTP están cubiertos por `plans-and-flag.test.ts` (194-05) y `settings.test.ts` (194-07).

## Allowlist de copy

Vacía.

## Deviations from Plan

**1. [Rule 2 - Faltante crítico] Página y menú "Reglas de precio" abiertos a gestion/admin.** `/configuracion/precios` y su ítem de menú eran `['owner']`: con eso gestión (que según D-10c carga el tope) no podía llegar a la tarjeta. Se abrió a `gestion/admin/owner` (`router/routes.ts`, `config/templo-config.ts`, fuera de `files_modified`) y se escondió para no-owner el contenido que siempre fue del propietario (recargo por tarjeta y Precio Zero, `v-if="isOwner"`). La API no cambia: el PUT de esas reglas sigue siendo owner-only.

**2. [Interpretación] El plan Invitación se filtra al cargar, no solo en `AssignPlanDialog`.** El plan pedía excluirlo en las opciones de `AssignPlanDialog`. Se filtra en el origen de los dos selectores de asignación del admin (`AssignPlanDialog.loadPlans` y `CobrosPage.loadAltaPlans`): el alta de Cobros lo mostraba en el tab "Paquete de clases" (`planGroupOf` agrupa todo `paquete`). Filtrando en el origen tampoco aparece en el toggle de modo paquete.

**3. [Observación] "Vender otro pase" no lo mostraba.** Ese flujo usa el filtro `especial` y el plan Invitación es `paquete`; la afirmación de 194-05 sobre "Vender otro pase" no aplicaba. El lugar real era el alta de Cobros.

## Limitaciones conocidas

- **La cantidad de accesos NO se puede editar hoy desde Planes.** La nota de la tarjeta (texto pedido por el plan) dice que se edita en el plan Invitación, pero el plan Invitación es `paquete`: el enum de entrada de `PUT /api/admin/subscriptions/plans/:id` no acepta `paquete` en `planCategory` (lo envía el formulario) y el formulario esconde "Clases por semana" en categorías no presenciales/especiales. Hoy cambiar `classes_per_week` requiere un cambio de API/formulario o SQL. Fuera de alcance (no se tocó la API); queda para decidir si se cubre en 194-27/28 o se acepta.
- Si el GET de parámetros falla, la tarjeta no muestra el formulario (solo la notificación de error); un reintento es recargar la página.

## Known Stubs

None.

## Threat Flags

None. T-194-80 mitigada (reglas de rango espejo en el cliente, autoridad del servidor); T-194-81 mitigada (plan Invitación fuera de las dos pantallas de asignación, además del 400 de 194-06). La apertura de la ruta a gestion/admin no agrega superficie: la API ya autoriza el PUT de invitaciones a esos roles y mantiene owner-only el de recargo/Precio Zero.

## Lecciones

- La ruta y el menú de "Reglas de precio" estaban gateados a `owner`: cualquier configuración que gestión deba tocar necesita revisar el gate de la página, no solo el del endpoint.
- En el admin, el alta de Cobros (`CobrosPage.loadAltaPlans`) es un segundo selector de asignación aparte de `AssignPlanDialog`: un filtro de planes tiene que ir en ambos (o en el origen).
- `paquete` no es creable ni editable por la API de planes (enum de entrada): un plan que sea paquete no se puede editar con `PlanFormDialog`.
- Un `q-tooltip` sobre un `q-toggle` deshabilitado no dispara: va sobre el contenedor.

## Self-Check: PASSED

- Commits `472a46103`, `e747d7403`: FOUND
- Archivos nuevos presentes (`InvitationSettingsCard.vue`, `useInvitationSettingsApi.ts`)
- Worktree limpio salvo este SUMMARY
