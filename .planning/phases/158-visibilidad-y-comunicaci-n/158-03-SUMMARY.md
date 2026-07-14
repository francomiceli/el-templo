---
phase: 158-visibilidad-y-comunicaci-n
plan: 03
subsystem: referrals
tags: [referrals, member-app, ui, share, vue, quasar]
requires:
  - "GET /members/referrals (fase 158-01): ReferralOverview { referralCode, discount, referred[], referredBy }"
  - "@capacitor/share v8.0.1 (ya en package.json)"
  - "copyToClipboard (quasar util)"
provides:
  - "MisReferidosPage.vue — pantalla Mis referidos del socio (VIS-01 frontend)"
  - "ruta /mis-referidos (hija protegida de MainLayout)"
  - "item de entrada 'Mis referidos' en ProfilePage"
affects:
  - "cierra VIS-01 junto con 158-01 (backend). 158-04 espeja el mismo contrato en la ficha admin"
tech-stack:
  added: []
  patterns:
    - "share nativo por dynamic import de @capacitor/share con fallback copyToClipboard (molde bar-challenge/Resultado.vue)"
    - "fetch con api/createLogger/extractError/TemploLoader (molde ProfilePage)"
    - "todos los numeros del descuento leidos de la respuesta, cero hardcode"
key-files:
  created:
    - el-templo-app/src/pages/MisReferidosPage.vue
  modified:
    - el-templo-app/src/router/routes.ts
    - el-templo-app/src/pages/ProfilePage.vue
decisions:
  - "shareUrl = https://app.eltemplo.org/register?ref={referralCode} (solo el codigo publico, sin token/id — T-158-07)"
  - "shape consumido = referred/referredBy (contrato real de referrals/types.ts), no broughtByMe/broughtMeIn de la UI-SPEC aspiracional"
  - "estilos de card replicados 1:1 de ProfilePage (.info-card/.section-title) en el scoped style, sin patron visual nuevo"
metrics:
  duration: ~10min
  completed: 2026-07-11
---

# Phase 158 Plan 03: Pantalla "Mis referidos" (app del socio) Summary

`MisReferidosPage.vue` consume `GET /members/referrals` y muestra, top-to-bottom, el codigo con boton Compartir (share nativo + fallback copiar) siempre visible, el descuento vigente con desglose pedagogico leido del server, y la lista simetrica de vinculos con chips de estado derivado; entrada desde ProfilePage via una ruta protegida nueva.

## What Was Built

- **`MisReferidosPage.vue`** (NEW): pantalla completa segun UI-SPEC S1.
  - **Bloque 1 (siempre visible, aun con cero vinculos):** card con icono `card_giftcard` terracotta, eyebrow "TU CÓDIGO", el `referralCode` prominente (700 / 24px / `letter-spacing 0.1em`) y `q-btn` primary "Compartir mi código". El handler hace dynamic import de `@capacitor/share` con `Share.share({ title: "Sumate a El Templo", text, url: shareUrl })`; en el catch, fallback con `copyToClipboard(shareUrl)` de quasar + `$q.notify` warning con el copy exacto. `shareUrl = "https://app.eltemplo.org/register?ref=" + referralCode` (solo el codigo publico).
  - **Bloque 2 (descuento):** si `discount.percent > 0`, headline "Estás pagando {percent}% menos" (24px/700 terracotta) + linea de desglose "{activeCount} vínculos activos × {perLinkPercent}% = {percent}% (tope {capPercent}%)" — todos los numeros de la respuesta, nada hardcodeado. Si `percent === 0`, headline "Todavía no tenés descuento activo".
  - **Bloque 3 (vinculos simetricos):** secciones "Trajiste a" (`referred[]`) y "Te trajo" (`referredBy`), cada una renderizada solo si tiene >=1 vinculo; cada fila = `fullName` + `q-chip` con estado derivado y color mapeado (`pending`→info, `active`→positive, `suspended`→warning); las filas Suspendido muestran caption 12px "se reactiva si vuelve".
  - **Estados de pagina:** Loading = `TemploLoader` centrado; Loaded cero vinculos = Bloques 1-2 arriba + estado vacio ("Todavía no trajiste a nadie" + body de UI-SPEC) en lugar del Bloque 3; Load error = `$q.notify` negative + boton inline "Reintentar" que re-fetchea. El codigo + Compartir nunca se esconde detras del estado vacio.
- **`routes.ts`** (MOD): ruta hija protegida `{ path: 'mis-referidos', name: 'mis-referidos', component: () => import('pages/MisReferidosPage.vue') }` junto a `/change-password`.
- **`ProfilePage.vue`** (MOD): item `settings-card__item--clickable` "Mis referidos" (icono `card_giftcard`) en el settings-card de "Ajustes", `@click="$router.push('/mis-referidos')"`, reusando el divider existente.

## Task Commits

| Task | Name                                  | Commit     | Files                                               |
| ---- | ------------------------------------- | ---------- | --------------------------------------------------- |
| 1    | MisReferidosPage.vue (pantalla S1)    | `cb4a891b` | el-templo-app/src/pages/MisReferidosPage.vue (new)  |
| 2    | Ruta /mis-referidos + item en Profile | `2df67fa0` | el-templo-app/src/router/routes.ts, ProfilePage.vue |

## Verification

- `npx eslint` limpio (exit 0) sobre `MisReferidosPage.vue`, `routes.ts` y `ProfilePage.vue`; pre-commit lint-staged (eslint --fix + prettier) verde en ambos commits.
- No hay script de typecheck dedicado en el app (CI corre lint). `vue-tsc -p tsconfig.json` arroja solo errores preexistentes en archivos no relacionados (import.meta.env, `$router` en ProfilePage/ChangePassword, ATHLOS, etc. — ese tsconfig no incluye los tipos de cliente de vite); **ninguno menciona los archivos de este plan**.
- Greps de aceptacion: `members/referrals` (1), `app.eltemplo.org/register?ref=` (1), `@capacitor/share` dynamic (1), `copyToClipboard` (2), campos de desglose `perLinkPercent|capPercent|activeCount` (6), colores de chip info/positive/warning (12), cero lineas de instalacion de dependencias (0), `mis-referidos` en routes (2) y en ProfilePage (3).

## Deviations from Plan

**1. [Aclaracion de contrato] Shape consumido = `referred`/`referredBy`, no `broughtByMe`/`broughtMeIn`**

- **Encontrado durante:** Task 1 (lectura del contrato).
- **Motivo:** la UI-SPEC menciona `broughtByMe`/`broughtMeIn` de forma aspiracional, pero el contrato real que expone 158-01 (`referrals/types.ts` → `ReferralOverview`) usa `referred: ReferralLinkView[]` y `referredBy: ReferralLinkView | null`. El bloque `<interfaces>` del propio PLAN ya coincide con el contrato real. Se consumen esos nombres.
- **Archivos:** `el-templo-app/src/pages/MisReferidosPage.vue`.
- **Commit:** `cb4a891b`.

No es una desviacion de codigo (Rule 1-3), solo la resolucion de una discrepancia de nombres entre dos documentos de diseno a favor del contrato server real.

Fuera de eso, el plan se ejecuto tal cual.

## Threat Surface

- **T-158-07 (Information Disclosure):** mitigado — `shareUrl` solo lleva `?ref={referralCode}` (codigo publico, el mismo param que RegisterPage ya lee), sin token ni id de usuario.
- **T-158-08 (Tampering):** mitigado — el `%` y el desglose (`activeCount`/`perLinkPercent`/`capPercent`) se leen de la respuesta; el cliente no hace matematica de descuento ni hardcodea 10/40.
- **T-158-SC (Supply chain):** mitigado — `@capacitor/share` y `copyToClipboard` (quasar) ya instalados; el plan NO instala ni actualiza dependencias.

Sin superficie de seguridad nueva fuera del threat model.

## Self-Check: PASSED

- Archivo creado verificado en disco: `el-templo-app/src/pages/MisReferidosPage.vue` — FOUND.
- Archivos modificados presentes: `routes.ts`, `ProfilePage.vue` — FOUND.
- Commits verificados en git log: `cb4a891b`, `2df67fa0` — FOUND.
