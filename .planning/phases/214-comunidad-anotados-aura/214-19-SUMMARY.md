---
phase: 214-comunidad-anotados-aura
plan: 19
subsystem: app-data-layer
tags: [app, store, aura, community, formatters, D-02, D-12, D-13, D-25, D-40, D-57, D-58, D-64, D-69]
requires: ["214-18"]
provides:
  - "UserProfile con auraEarned, photoUrl, photo, communityVisible, communityNoticeSeen (opcionales)"
  - "useUserStore: setAuraEarned, setPhotoState, setCommunityVisible, setCommunityNoticeSeen, refreshProfile, getter auraVisible"
  - "AURA_AMOUNTS_UI (profilePhoto = 5)"
  - "formatTenure, formatAura, formatMovementDate, formatMovementDateLong, movementAriaLabel, prefersReducedMotion"
  - "useAuraApi, useCommunityApi, AttendanceRecord con auraAwarded y auraTotal"
affects: ["214-20", "214-21", "214-22", "214-23", "214-24", "214-25", "214-26", "214-27", "214-28"]
key-files:
  created:
    - el-templo-app/src/types/community.ts
    - el-templo-app/src/constants/aura-amounts.ts
    - el-templo-app/src/utils/tenure.ts
    - el-templo-app/src/utils/aura-format.ts
    - el-templo-app/src/utils/reduced-motion.ts
    - el-templo-app/src/utils/__tests__/tenure.test.ts
    - el-templo-app/src/utils/__tests__/aura-format.test.ts
    - el-templo-app/src/composables/useAuraApi.ts
    - el-templo-app/src/composables/useCommunityApi.ts
  modified:
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/composables/useAttendanceApi.ts
decisions:
  - "Una sola llamada a /auth/me en el store: se extrajo fetchProfile() privada, usada por retryProfileLoad y refreshProfile"
  - "formatAura agrupa miles a mano (regex) y no con Intl es-AR, porque el CLDR de es no agrupa 4 cifras"
  - "refreshProfile es best-effort: si falla loguea warn y conserva el perfil anterior"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 19: capa de datos de la app Summary

Contratos de datos de la app para las pantallas de los planes 20 a 28: tipos de `/me`, acciones del store, constante de montos, formateadores puros con tests y clientes HTTP tipados.

## Commits

- `9225b2fa9` feat(214-19): tipos de /me y acciones del store para la comunidad y el Aura
- `32df4ae78` test(214-19): antigüedad y formato de Aura (rojo)
- `7389fa69e` feat(214-19): formateadores de antigüedad y de Aura
- `522ac5460` feat(214-19): clientes de Aura, comunidad y check-in

## Verificación

- vue-tsc (app): 21 errores antes y 21 después de cada tarea (línea de base 21, cero nuevos; ninguno en los archivos tocados).
- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos (`boot/axios.ts`, `useSessionPlayer.ts`).
- `tenure.test.ts` 9 de 9 y `aura-format.test.ts` 13 de 13 en verde (el commit del test es anterior al de la implementación).

## Deviations from Plan

- **[Rule 3]** `retryProfileLoad` era la única llamada a `/auth/me` pero tiene guarda ("no-op con perfil fresco"). Para que `refreshProfile` reuse la llamada sin duplicarla se extrajo `fetchProfile()` (pedido con tope `NETWORK_WAIT_MS`, `setProfile`, `profileStale = false`); `retryProfileLoad` la usa y conserva su guarda y su comportamiento.
- El test rojo se commiteó sin correrlo (el módulo no existía, falla por import); la ejecución real fue la del verde.

## Decisiones propias

- `formatAura` no usa `Intl.NumberFormat('es-AR')`: el CLDR de `es` no agrupa números de 4 cifras ("1240") y el UI-SPEC pide "1.240". Agrupa con regex.
- `movementAriaLabel` pasa la fecha a minúscula ("Hoy" -> "hoy"), como pide el comportamiento del plan.
- `formatMovementDateLong` suma " de AAAA" si el año no es el actual (el UI-SPEC no lo define; es coherente con la fecha corta).
- `formatTenure` cuenta con componentes UTC de `memberSince` y `now` (la firma no lleva zona); una fecha ilegible devuelve `null` y una futura "Tu primer mes". Un alta un 31 contado contra un mes más corto no completa el mes hasta pasar ese día (conservador).
- `refreshProfile` es best-effort (warn y conserva el perfil), igual que `retryProfileLoad`.
- Días/meses abreviados con tablas propias, no `Intl` (variantes con punto en algunos iOS, igual que `tz.ts`).

## Notas para los planes siguientes

- Las acciones del store solo actúan si ya hay perfil. `setPhotoState` mantiene `photoUrl = photo.url`.
- `auraVisible` es false con perfil nulo, `auraEarned` nulo o ausente: la ficha solo se dibuja con número.
- La app no debe llamar `getMovements` si `auraEarned` es `null` (404 del guard).
- Para fechas de movimientos usar `profile.branchTimezone ?? DEFAULT_BRANCH_TZ`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-19-01: el store guarda solo `/me` propio y las listas de anotados no se persisten. T-214-19-02: la única constante de monto es `AURA_AMOUNTS_UI.profilePhoto`, con espejo documentado.

## Self-Check: PASSED
