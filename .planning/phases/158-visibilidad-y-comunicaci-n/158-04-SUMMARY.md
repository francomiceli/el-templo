---
phase: 158-visibilidad-y-comunicaci-n
plan: 04
subsystem: referrals
tags: [referrals, admin, ficha, vue, quasar, VIS-03]
requires:
  - GET /admin/members/:userId/referrals (fase 158-01, guard ADMIN_ROLES)
  - ReferralOverview / ReferralLinkView (contrato de respuesta, 158-01)
provides:
  - getReferrals(userId) en useMembersApi — consume la ruta admin de referidos
  - MemberReferralsTab.vue — seccion "Referidos" de la ficha (Lo trajo / Trajo a)
  - tab "Referidos" en AlumnoDetailPage
affects:
  - cierra VIS-03 (superficie admin de visibilidad de referidos)
tech-stack:
  added: []
  patterns:
    - composable method clonando getNotes (loading/error + extractError + re-throw)
    - tab component con onMounted->load, spinner q-spinner-dots, toast negativo del modulo
    - estado por vinculo SIEMPRE server-derived (chip mapea state del backend, nunca users.status)
key-files:
  created:
    - el-templo-admin/src/components/MemberReferralsTab.vue
  modified:
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
decisions:
  - "chips: pending->info (Olive), active->positive (Warm green), suspended->warning (Dark gold) + caption 'se reactiva si vuelve' — misma semantica que S1"
  - "link de nombre = terracotta ($primary), navega a /alumnos/:userId (router.push, patron del admin)"
  - "tab propio 'Referidos' tras 'Perfil' (opcion preferida por el plan/UI-SPEC, no fold en Perfil)"
  - "guard de rol se mantiene en el backend (ADMIN_ROLES); el front solo consume, no reimplementa authz (T-158-09 accept)"
metrics:
  duration: ~15min
  completed: 2026-07-11
---

# Phase 158 Plan 04: Seccion "Referidos" en la ficha del admin Summary

La ficha del alumno del admin gana una seccion "Referidos" (tab propio) que muestra quien lo trajo (link a esa ficha) y a quienes trajo, cada vinculo con su chip de estado derivado del server — la misma semantica que ve la app. Consume `GET /admin/members/:id/referrals` del plan 01 sin recalcular estado en el cliente.

## What Was Built

- **`MemberReferralsResponse` + `MemberReferralLink`** (`useMembersApi.ts`): tipos TS que espejan `ReferralOverview` / `ReferralLinkView` del backend (158-01). La ficha usa solo `referred` + `referredBy` (`referralCode`/`discount` se ignoran en esta superficie, por contrato UI-SPEC S3).
- **`getReferrals(userId)`** (`useMembersApi.ts`): clon exacto de `getNotes` — `api.get<MemberReferralsResponse>('/admin/members/' + userId + '/referrals')`, con `loading`/`error` + `extractError` + re-throw. Expuesto en el return del composable junto a `getNotes`.
- **`MemberReferralsTab.vue`** (NEW): prop `userId`, `onMounted` -> `getReferrals`. Spinner `q-spinner-dots color=primary` centrado en loading (molde `MemberSubscriptionTab`). Dos subsecciones renderizadas solo si tienen >=1 vinculo: "Lo trajo" (`referredBy`, nombre como link terracotta que hace `router.push('/alumnos/:id')`) y "Trajo a" (`referred[]`). Cada fila lleva un `q-chip` con el estado derivado mapeado a color (`info`/`positive`/`warning`); las filas `suspended` muestran caption "se reactiva si vuelve". Sin ningun vinculo: linea `text-caption` "Este alumno no tiene referidos." En error: toast negativo via el mensaje de `extractError` del modulo, sin UI de error inline.
- **Tab "Referidos"** en `AlumnoDetailPage.vue`: `q-tab name="referidos"` tras "Perfil" + `q-tab-panel` que renderiza `<MemberReferralsTab :user-id="userId" />` (el `userId` computado del route param, el mismo que consumen los demas paneles), con el import junto a los otros `*Tab`.

## Task Commits

| Task | Name                                  | Commit     | Files                                          |
| ---- | ------------------------------------- | ---------- | ---------------------------------------------- |
| 1    | getReferrals + MemberReferralsTab.vue | `7f6cc711` | useMembersApi.ts, MemberReferralsTab.vue (new) |
| 2    | tab "Referidos" en AlumnoDetailPage   | `b5eba8af` | AlumnoDetailPage.vue                           |

## Verification

- `npx vue-tsc --noEmit -p tsconfig.json` en `el-templo-admin`: **cero errores nuevos** introducidos por este plan. Confirmado por stash: la base limpia ya tiene 23 errores pre-existentes (`session-pdf-builder.ts` pdfmake typings + `AlumnoDetailPage.vue:1256/1273` arg-count); con mis cambios el conteo sigue en 23 y no aparece ningun error en `MemberReferralsTab.vue` ni en la superficie nueva.
- Acceptance criteria de ambas tareas verificados por grep: `getReferrals` presente + expuesto en el return; ruta `admin/members/${userId}/referrals` cubierta; prop `userId` declarada; tres colores de chip (`info`/`positive`/`warning`) presentes; empty note "Este alumno no tiene referidos." presente; `router.push` a la ficha presente; `name="referidos"` en q-tab y q-tab-panel; `MemberReferralsTab` importado y usado con `:user-id`.

## Deviations from Plan

Ninguna — el plan se ejecuto tal cual. El chip de estado consume el `state` que ya viene derivado del server (`deriveCoveredUntil`, D-28), sin recalcular en el cliente (mitiga T-158-10).

## Notes for Downstream / Operacional

- **Guard de rol:** per la nota del executor de 158-01 y el threat-model (T-158-09), el guard del endpoint admin es `ADMIN_ROLES` (admin/owner). Esta ficha **no** amplia permisos por su cuenta: el front solo consume y la autorizacion vive en el backend. Si en el futuro gestion (`gestion`) debiera ver esta seccion, el cambio es en el guard per-route del plan 01, no en este componente.
- **Pre-existentes fuera de scope (no tocados):** 23 errores de vue-tsc ya presentes en la base (`session-pdf-builder.ts` pdfmake y `AlumnoDetailPage.vue:1256/1273`). Fuera del scope de este plan; documentados aca para el verifier.
- **Puesta en marcha (post-deploy, D-36/D-37):** sin tareas de codigo en este plan. Tras las 4 planes en staging/master con deploy verde: smoke de la enum 0177, `backfill-referral-codes.ts --apply` en prod (OK de Franco para SSH) y anuncio unico via `queueAdHocNotification` categoria `anuncios` (copy UI-SPEC S4).

## Self-Check: PASSED

- `el-templo-admin/src/components/MemberReferralsTab.vue` — FOUND.
- Commits `7f6cc711`, `b5eba8af` en git log — FOUND.
- `getReferrals` en useMembersApi.ts + expuesto en el return — FOUND.
- Tab `name="referidos"` + `MemberReferralsTab` en AlumnoDetailPage.vue — FOUND.
