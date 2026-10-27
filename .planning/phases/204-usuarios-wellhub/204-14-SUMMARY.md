---
phase: 204-usuarios-wellhub
plan: 14
subsystem: admin
tags: [wellhub, admin, vue, ficha, app-access, conversion]
requires: ["204-13", "204-09", "204-12"]
provides:
  - "useWellhubApi (getCard, sendAppAccess, mergeInto, getReport, cleanup)"
  - "types/wellhub.ts (WellhubCard, WellhubAppAccessResult, WellhubMergeResult, WellhubReport...)"
  - "components/members/WellhubCard.vue (reload(): Promise<WellhubCard | null>; emits associate, appAccessSent, merge)"
key-files:
  created:
    - el-templo-admin/src/composables/useWellhubApi.ts
    - el-templo-admin/src/types/wellhub.ts
    - el-templo-admin/src/components/members/WellhubCard.vue
  modified:
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 204 Plan 14: Card Wellhub y conversion en la ficha Summary

La ficha muestra arriba de las pestañas la card "Wellhub" (ID, vinculado desde, visitas, sedes, proxima reserva y ultimas reservas), con "Asociar al templo" (reusa `AssignPlanDialog`), "Enviar acceso a la app" (con aviso de reseteo si ya entro) y "Unir con alumno existente" (solo emite, el dialogo es del plan 15).

## Commits
- `56bca9cbf` feat(204-14): composable, tipos y card Wellhub de la ficha
- `3fabc270a` feat(204-14): card Wellhub, Asociar al templo y acceso a la app en la ficha

## Que se hizo
- `types/wellhub.ts`: tipos que espejan los schemas del API (card, acceso, merge, reporte plan 11, `WellhubReportParams`). Leidos del servicio/schemas del API, no solo del plan.
- `useWellhubApi.ts`: molde de `useInvitationReportApi` (refs `loading`/`error`, `extractError`, `log.warn` + rethrow, `cleanup()` sin `onUnmounted`). `getCard` desenvuelve `{ wellhub }`.
- `WellhubCard.vue`: no renderiza si no hay card. `reload()` (expuesto) devuelve la card fresca. El confirm de acceso usa `appAccessConfirmMessage` (computed sobre `hasLoggedIn`) con los dos textos exactos del plan; OK en `negative` + "Seguir" solo si ya entro. Un contador `loadSeq` descarta respuestas viejas (cambio de alumno o recargas solapadas) y `watch(userId)` recarga.
- `AlumnoDetailPage.vue`:
  - `<WellhubCard v-if="memberProfile.isWellhub">` sobre `<q-tabs>`; segunda instancia de `AssignPlanDialog` (`showAssignFromWellhub && !financeBlind`).
  - `onWellhubAssigned`: recarga ficha (`onSubscriptionChanged`), luego `await wellhubCardRef.reload()` y lee `hasLoggedIn` de ESE resultado (aclaracion del orquestador). Si `!hasLoggedIn` pregunta "¿Enviarle el acceso a la app?" y llama `sendAppAccess`.
  - `?asociar=1`: tras la primer carga (`loadAll`), si aplica (`showWellhubLabel` y `!financeBlind`) abre el CTA; el param se limpia siempre que venga.
  - `showWellhubMerge` declarado y seteado por `onWellhubMergeRequested` para el plan 15.
  - Programas e Invitaciones (tab y panel) ocultas con `status === 'wellhub'` (`isWellhubVisitor`).

## Deviations from Plan
1. **[Interpretacion] `reload()` devuelve `Promise<WellhubCard | null>`**, no `Promise<WellhubCard>`: la persona puede no tener vinculo, o la carga puede fallar (notifica y devuelve `null`). La pagina trata `null` como "no sugerir nada" (el boton explicito de la card sigue ahi).
2. **[Rule 2] Prop opcional `canSendAppAccess` (default `true`) en `WellhubCard`**: el API exige rol de ciclo de vida para `app-access` (403 al resto), asi que la pagina pasa `isLifecycleRole` para no ofrecer un boton que siempre falla a recepcion; la sugerencia post-asignacion tambien se gatea por `isLifecycleRole`.
3. **[Extra] `subscriptionReloadKey` en `MemberSubscriptionTab`**: se incrementa al asignar el plan desde la card, para que la pestaña Suscripcion (si estaba abierta) se remonte y no muestre "Sin plan" viejo.
4. **[Extra] Watch de `isWellhubVisitor`**: si la pestaña activa era `programas`/`referidos` y la ficha pasa a ser de un visitante (navegacion entre alumnos), vuelve a `perfil`.
5. **[Extra] Mapa de estados de reserva** incluye `qr_escaneado` ("Presente") y `lista_espera` ("En espera"), valores reales del enum `booking_status`; los 4 pedidos por el plan estan tal cual.
6. Visibilidad de "Enviar acceso a la app": `canConvert || !hasLoggedIn` (literal del plan). Un socio activo que ya entro NO ve el boton; un visitante/ex-alumno (`canConvert`) lo ve siempre, aunque ya haya entrado, y ahi el confirm avisa del reseteo.
7. `types/wellhub.ts` suma `WellhubReportParams` y `WellhubRecentBookingItem`/`WellhubBookingItem` (la proxima reserva no trae `status`).

Bugs no anticipados: ninguno.

## Verificacion (solo greps y lectura, sin tests/typecheck/lint)
- Greps `<verify>` de ambas tareas dan OK; `WellhubCard.vue` tiene 290 lineas.
- Verificados por lectura: `formatDate(dateStr: string)` en `utils/format-date.ts`; `extractError`; `WELLHUB_COLOR`/`WELLHUB_LABEL` en `utils/wellhub-label.ts`; props/emits de `AssignPlanDialog` (`modelValue`, `userId`, `memberBranchId`, `memberBranchName`, `boardingPassUsed`, `memberBranchIsVirtual`, `member`, `branches`; emits `assigned`, `member-edited`); `MemberProfile` hereda `isWellhub`/`showWellhubLabel`; `api` exportado por `boot/axios`.
- Sin `any`, sin `console.*`.

## Dudas para Franco
- El `AssignPlanDialog` del CTA recibe `memberProfile` (ref viva), no un snapshot como el post-conversion. Si el admin edita la sede desde el banner de sede virtual, el perfil se recarga (`@member-edited="loadMemberProfile"`). No probado en un navegador.
- Sin tests ni vue-tsc: riesgo principal es el tipo `InstanceType<typeof WellhubCard>` para `wellhubCardRef` y el destructuring de `route.query` en `openAssociateFromQuery`.
- `router.replace({ query })` para limpiar `?asociar` no preserva `#hash` (la ficha no usa hash).
- Si `reload()` falla tras asignar, no se sugiere el acceso a la app (solo queda el boton de la card).
- Visitante de otra sede con `admin_sede`: sigue el callejon sin salida ya anotado en 204-13.
- El "Sin plan" de Suscripcion para visitantes depende del estado vacio existente; no se toco.
- Color de los chips de estado de reserva (secondary/positive/negative/warning/grey) sin probar visualmente.

## Known Stubs
`showWellhubMerge` se setea pero todavia no abre nada hasta el plan 15 (intencional, planificado).

## Self-Check: PASSED
- Archivos creados y commits `56bca9cbf`, `3fabc270a` verificados en `git log`.
