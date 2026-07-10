---
phase: 157-n-cleo-transaccional-de-referidos
plan: 05
subsystem: referrals-ui
tags: [referrals, register, alta-admin, quasar, q-select, promo-badge, vue3]
requires:
  - phase: 157-03
    provides: "POST /register acepta body.ref; POST /admin/members acepta body.referredBy (resolución/validación server-side)"
provides:
  - "RegisterPage lee ?ref=CODE, lo envía en register() y muestra badge de confirmación optimista (REF-02, UI-SPEC S1)"
  - "MemberFormDialog picker '¿Quién lo trajo? (opcional)' search-as-you-type en paso 2, create-only, envía referredBy (REF-03, UI-SPEC S2)"
  - "referredBy?: number | null en CreateMemberInput (el-templo-admin/src/types/member.ts)"
affects: [158-referidos-superficies, referrals]
tech-stack:
  added: []
  patterns:
    [
      optimistic-badge-reuse-promo-badge,
      debounced-member-search-qselect,
      optional-attribution-never-blocks,
    ]
key-files:
  created: []
  modified:
    - el-templo-app/src/pages/RegisterPage.vue
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/types/member.ts
key-decisions:
  - "Badge de referido reusa .promo-badge 1:1 con modifier __subtext nuevo (misma familia visual, sin patrón nuevo)"
  - "referrer se resetea junto al form en cada apertura del alta (create) para no arrastrar atribución entre altas"
  - "referredBy tipado como number | null en CreateMemberInput; se envía null cuando el campo queda vacío"
patterns-established:
  - "Atribución opcional en UI: canal separado del promo, sin validación cliente, el server resuelve (optimista + silent-ignore)"
requirements-completed: [REF-02, REF-03]
duration: ~15min
completed: 2026-07-10
---

# Phase 157 Plan 05: Superficies UI de atribución de referidos Summary

**RegisterPage captura ?ref con badge optimista reusando .promo-badge, y el alta admin suma el picker debounced "¿Quién lo trajo? (opcional)" que envía referredBy — ambos opcionales, ninguno bloquea su flujo**

## Performance

- **Duration:** ~15 min (código) + checkpoint humano
- **Started:** 2026-07-10
- **Completed:** 2026-07-10
- **Tasks:** 3/3 (2 auto + 1 checkpoint human-verify aprobado)
- **Files modified:** 4

## Accomplishments

- **S1 (app):** `refCode` computed clonado de `promoCode` (lee `route.query.ref`, string-or-null); `ref: refCode.value ?? undefined` agregado al payload de `authStore.register()` como canal separado de `promoCode` (pueden coexistir). Badge condicional en el mismo slot que `.promo-badge`, reusando markup+estilos 1:1: icono `group_add`, eyebrow "CÓDIGO DE REFERIDO", código prominente, subtext "Te invitó un miembro del Templo". Optimista (el cliente no valida). Toast de éxito permanece genérico "Cuenta creada exitosamente" (D-01: no promete descuento). Con `?promo` y `?ref` juntos, los badges se apilan (promo arriba, referral abajo).
- **S2 (admin):** `q-select` `dense outlined clearable use-input input-debounce="300"` al final del paso 2 "Datos Personales" (después de "Contacto de Emergencia"), SOLO en el flujo CREATE (D-14). `onReferrerSearch` mirrorea el `onMemberSearch` de `SlotDetailDialog`: <2 chars limpia resultados; si no `membersApi.searchMembers(val, 10)` → `{ id, displayLabel: "Nombre Apellido (DNI)" }`. Slot `no-option` "No se encontró ningún socio". Al submit se envía `referrer.value?.id ?? null` como `referredBy`; el server valida (nunca confía el body, T-157-19). Errores server-side surfean por el toast negativo existente de `onSubmit` (extractError). Sin regla de validación que pueda bloquear el alta (T-157-18).
- **Checkpoint visual aprobado** por el operador ("approved", 2026-07-10; verificará también en staging).

## Task Commits

Each task was committed atomically:

1. **Task 1: RegisterPage captura ?ref + badge de confirmación** - `759bbcc6` (feat)
2. **Task 2: MemberFormDialog "¿Quién lo trajo?" search q-select** - `d69b17e2` (feat)
3. **Task 3: Verificación visual (checkpoint human-verify)** - aprobado por el operador, sin ajustes

## Files Created/Modified

- `el-templo-app/src/pages/RegisterPage.vue` - refCode computed, ref en payload, badge de referido reusando .promo-badge (+ modifier `__subtext`)
- `el-templo-app/src/stores/useAuthStore.ts` - `ref?: string` agregado al tipo del payload de `register()`
- `el-templo-admin/src/components/MemberFormDialog.vue` - picker "¿Quién lo trajo? (opcional)" create-only + onReferrerSearch + referredBy en el create + reset al abrir el alta
- `el-templo-admin/src/types/member.ts` - `referredBy?: number | null` en `CreateMemberInput`

## Decisions Made

- **`.promo-badge__subtext` nuevo modifier** (Montserrat 0.75rem/400, `rgba($cream,0.6)`): el badge de referido tiene 3 líneas (eyebrow/código/subtext) vs las 2 del promo; se agregó dentro de la misma familia `.promo-badge` sin tocar los estilos existentes — no cuenta como patrón visual nuevo.
- **Reset de `referrer` al abrir el alta** en el watcher de `modelValue` (rama create): evita arrastrar la atribución de un alta anterior.
- **`referredBy: null` cuando el campo queda vacío** (en vez de omitirlo): el schema del server (plan 03) lo acepta opcional; null explícito mantiene el payload homogéneo con los demás opcionales del create.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ref` agregado al tipo del payload de `authStore.register()`**

- **Found during:** Task 1
- **Issue:** El tipo inline del parámetro de `register()` en `useAuthStore.ts` no incluía `ref` — pasar `ref` desde RegisterPage rompía el typecheck del build.
- **Fix:** `ref?: string` agregado al tipo (el store ya postea el objeto entero a `/auth/register`, sin cambio de lógica).
- **Files modified:** el-templo-app/src/stores/useAuthStore.ts
- **Verification:** `pnpm exec quasar build` exit 0
- **Committed in:** 759bbcc6 (Task 1 commit)

**2. [Rule 3 - Blocking] `referredBy` agregado a `CreateMemberInput`**

- **Found during:** Task 2
- **Issue:** El plan 03 agregó `referredBy` al schema del API pero el tipo frontend `CreateMemberInput` (el-templo-admin/src/types/member.ts) no lo tenía — enviar `referredBy` rompía el typecheck.
- **Fix:** `referredBy?: number | null` agregado al interface con comentario de que el server valida.
- **Files modified:** el-templo-admin/src/types/member.ts
- **Verification:** `pnpm exec quasar build` exit 0
- **Committed in:** d69b17e2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking, ambos wiring de tipos frontend hacia el contrato backend del plan 03)
**Impact on plan:** Cambios mínimos necesarios para compilar; sin scope creep.

## Issues Encountered

None — ambos builds verdes al primer intento tras el wiring de tipos.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El feature de referidos tiene entrada de datos real por ambos canales (link self-service + alta asistida); el backend de los planes 01-04 queda ejercitable end-to-end.
- Fase 158 (pantalla "Mis referidos", notificaciones, panel admin) puede construir sobre estas superficies sin tocarlas.
- UAT en staging pendiente por el operador (aprobó el checkpoint local y lo re-verificará en staging).

---

_Phase: 157-n-cleo-transaccional-de-referidos_
_Completed: 2026-07-10_

## Self-Check: PASSED
