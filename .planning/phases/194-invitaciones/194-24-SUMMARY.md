---
phase: 194-invitaciones
plan: 24
subsystem: admin
tags: [invitations, assisted-channel, admin, ficha, alta-prueba, d-16, d-24, d-17, sc-5]
requires:
  - phase: 194-12
    provides: POST /admin/members/:userId/invitations, .../void, inviterId en /trial
  - phase: 194-19
    provides: overview con invitations, invitedBy y discount.bySide
  - phase: 194-23
    provides: tipos y composable del admin con el contrato de previews
provides:
  - "Accion Crear invitacion en la ficha (recepcion y gestion) con InvitationCreateDialog"
  - "Pestana Invitaciones: Lo invito, Invito a (estado derivado, x/N, vencimiento, suma descuento, Anular con motivo) y descuento actual"
  - "Lo invita en Nuevo en Prueba (con aviso de invitation / invitationError) e Invitado por en el alta paga"
  - "useMembersApi: createAssistedInvitation, voidInvitation, parseInvitationFailure + tipos de invitaciones"
affects: [194-26, 194-27]
key-files:
  created:
    - el-templo-admin/src/components/InvitationCreateDialog.vue
    - el-templo-admin/src/components/InvitedByBlock.vue
    - el-templo-admin/src/utils/invitation-meta.ts
  modified:
    - el-templo-admin/src/components/MemberReferralsTab.vue
    - el-templo-admin/src/components/ReferrerSelect.vue
    - el-templo-admin/src/components/TrialMemberFormDialog.vue
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/types/member.ts
key-decisions:
  - "Los estados (Invitado/Entrenando/Vencido/Socio activo/Inactivo) y la etapa del lead los deriva el servidor: el cliente solo los rotula (invitation-meta.ts) y el N de accesos sale de classesBudget, nunca hardcodeado"
  - "El boton Crear invitacion se muestra a owner/admin/gestion/admin_sede/recepcion cuando el alumno NO es socio vigente (status != activo); la UI solo oculta, el servidor decide y el dialogo muestra su motivo (T-194-78)"
  - "El campo Lo invita de Nuevo en Prueba solo aparece para los roles del canal asistido (el coach dispararia 403 con inviterId)"
  - "Anular usa el userId del INVITADO de la invitacion (la ruta valida la pertenencia), no el de la ficha que se mira"
requirements-completed: [D-16, D-24, D-17, D-18, SC-2, SC-5, D-27]
completed: 2026-10-07
---

# Phase 194 Plan 24: admin, canal asistido y ficha Summary

**Recepcion y gestion crean invitaciones desde la ficha (con el motivo en espanol si el servidor rechaza), la pestana Referidos pasa a Invitaciones con el overview extendido y la anulacion con motivo, y las dos altas reflejan el modelo nuevo: "Lo invita" con accesos en Nuevo en Prueba e "Invitado por" como vinculo de descuento en el alta paga.**

## Commits

- `b04d3659c` feat(194-24): crear invitacion desde la ficha y pestana Invitaciones
- `bd785e611` feat(194-24): Lo invita en Nuevo en Prueba e Invitado por en el alta paga

## Que cambio

- **Tipos/composable** (`types/member.ts`, `useMembersApi.ts`): `InvitationActivation`, `InvitationFailure`, `CreateAssistedInvitationInput`, `InviteeView`, `InvitationsOverview`, `InvitedByView`, `CreateTrialMemberResponse` (+ `inviterId?` en `CreateTrialMemberInput`); `MemberReferralsResponse` suma `invitations`, `invitedBy` y `discount.bySide`. `createAssistedInvitation`, `voidInvitation` y `parseInvitationFailure(err)` (conserva `reason` + `message` del `{ error, message, reason }`).
- **InvitationCreateDialog**: "Lo invita" (`ReferrerSelect`), sede fisica (solo no virtuales; preselecciona la del alumno), telefono precargado y obligatorio (6-30), DNI opcional. Exito: "Invitacion activada: N accesos hasta <fecha>". Rechazo (cupo, elegibilidad, telefono): banner + notify con el `message` del servidor y el dialogo queda abierto.
- **AlumnoDetailPage**: boton "Crear invitacion" en el header, pestana renombrada a "Invitaciones" (el `name` interno `referidos` queda), `:key` para recargar la pestana tras crear, y bloque "Lo invito" en "Datos de Lead".
- **MemberReferralsTab**: "Lo invito" (`InvitedByBlock`: etapa, x/N, vencimiento, sedes, canal; si no hay invitacion, el vinculo heredado; si no hay nada, asignacion retroactiva "Quien lo invito?" aclarando que es vinculo de descuento sin accesos ni cupo), "Invito a" (chip de estado, x/N, vencimiento, badge "suma descuento", "Anular" con motivo 3-64), descuento por invitaciones N% (M invitados activos), lado invitado y cupo del mes. Partner intacto.
- **TrialMemberFormDialog**: "Lo invita (opcional)"; con invitador envia `inviterId`; 201 con `invitation` -> "Lead creado con N accesos de invitacion hasta <fecha>"; con `invitationError` -> warning "Lead creado, pero la invitacion no se activo: <motivo>"; 409/404 previos a crear -> error con el motivo y el form abierto.
- **MemberFormDialog**: "Invitado por (opcional)" con hint de vinculo de descuento sin accesos.
- **ReferrerSelect**: defaults "Invitado por" / "...al socio que lo invito".

## Verificacion

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes ajenos). `timeout 900 pnpm build`: OK. `dist/` no versionado.
- Chequeo canonico de copy "referid" sobre `MemberReferralsTab`, `ReferrerSelect`, `InvitationCreateDialog`, `InvitedByBlock`, `invitation-meta`, `TrialMemberFormDialog`, `MemberFormDialog`, `AlumnoDetailPage`, `useMembersApi`, `types/member`: sin salidas.
- `grep -c 'label="Referidos"'` AlumnoDetailPage = 0; `Invitaciones` = 4; `console.` en los componentes nuevos = 0; `createAssistedInvitation` en el dialogo = 1.
- El admin no tiene tests de frontend ni `vue-tsc` (D-27): la cobertura de los contratos HTTP es la de 194-12 (`assisted.test.ts`) y 194-19 (`member-overview.test.ts`).

## Allowlist de copy

Vacia. Quedan identificadores internos legitimos fuera de los criterios (`name="referidos"` del tab, `MemberReferralsTab`, `ReferrerSelect`, rutas `/referrals` de la API) y copy "referid" en archivos que NO son de este plan (`AnaliticasPage.vue` "Referidos A/B", `config/destinations.ts`, `config/system-audiences.ts`, `config/rule-triggers.ts`): los toma el plan que corresponda (26/28), no se tocaron.

## Deviations from Plan

**1. [Extra, SC-5] Bloque "Lo invito" tambien en "Datos de Lead".** Los alumnos en `prueba` (el estado de TODO invitado) no tienen pestanas: sin esto la etapa/x-N/sedes solo seria visible para socios ya convertidos. Componente compartido `InvitedByBlock.vue` + carga en `AlumnoDetailPage` solo para gestion (el endpoint responde 403 al resto; recepcion no ve la etapa, igual que no ve la pestana).

**2. [Extra, DRY] `utils/invitation-meta.ts`** (label/color de estado y etapa, `accessesLabel`) en vez de repetir los mapeos en la pestana y el bloque.

**3. [Interpretacion] La pestana ya no lista `referred`.** El overview de 194-19 ya mezcla los vinculos heredados en `invitations.invitees` (`source: legacy_link`, sin Anular y con caption "Vinculo anterior, sin accesos"); listar ambos duplicaria personas.

**4. [Interpretacion] "Crear invitacion" se oculta solo con `status === 'activo'`.** El resto (freemium, prueba, inactivo) lo resuelve el servidor (D-11/D-12) y el dialogo muestra el motivo; el plan pedia exactamente esa tolerancia.

**5. [Menor] Cupo del mes y "por haber sido invitado: N%" como captions** en "Invito a": datos del overview que ayudan a recepcion/gestion a responder al socio; sin logica nueva.

## Known Stubs

None.

## Threat Flags

None. T-194-78 aceptada (los roles solo ocultan botones/campos; el servidor aplica INVITATION_ASSISTED_ROLES y MEMBER_LIFECYCLE_ROLES). T-194-79 mitigada: la lista de invitados usa el overview (nombre + inicial, sin telefono/DNI) y el dialogo solo manda el telefono/DNI que el staff digita.

## Lecciones

- Los alumnos invitados quedan en `prueba`, y la ficha de `prueba` oculta TODAS las pestanas: todo dato nuevo del lead va en la tarjeta "Datos de Lead", no en una pestana.
- `invitationId` es `null` en los vinculos heredados: no tienen Anular. La ruta de anulacion usa el `userId` del INVITADO (el `userId` de `InviteeView`), no el de la ficha del invitador.
- `parseInvitationFailure` distingue errores de reglas (`{ reason, message }`) de los 4xx genericos; `extractError` solo conserva el `message`.
- Quasar `$q.dialog({ prompt: { isValid } })` deshabilita el OK hasta que el motivo cumple el largo del servidor (3-64).
- Sin `vue-tsc`, un cambio de tipos no rompe lint ni build: revisar a mano los consumidores (`createTrialMember` ahora devuelve `CreateTrialMemberResponse`, compatible con `MemberProfile`).

## Self-Check: PASSED

- Commits `b04d3659c`, `bd785e611`: FOUND
- Archivos nuevos presentes (`InvitationCreateDialog.vue`, `InvitedByBlock.vue`, `invitation-meta.ts`)
- Worktree limpio salvo este SUMMARY
