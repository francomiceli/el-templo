---
phase: 214-comunidad-anotados-aura
plan: 23
subsystem: app-mi-templo-header
tags: [app, encabezado, aura, foto, sello, D-25, D-26, D-27, D-61, D-66, D-69]
requires: ["214-22"]
provides:
  - "MiTemploHeader: encabezado único de Mi Templo (Pantalla 1 del UI-SPEC), montado en celular y en escritorio"
  - "AuraChip: ficha L1 de Aura (botón, emite open)"
  - "VeteranSeal: nivel de 1 año o más en roseta crema sin dorado, con prefers-reduced-motion"
affects: ["214-24", "214-27"]
key-files:
  created:
    - el-templo-app/src/components/AuraChip.vue
    - el-templo-app/src/components/MiTemploHeader.vue
  modified:
    - el-templo-app/src/components/VeteranSeal.vue
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/css/app.scss
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 23: encabezado único de Mi Templo Summary

Un solo `MiTemploHeader` en `.mobile-greeting` (celular) y en el `q-header` de escritorio, con foto (aprobada, pendiente con insignia o círculo punteado), nombre con sello, antigüedad (`formatTenure`) y la ficha clara de Aura (`AuraChip`); sin "Hola", fecha, contador ni selector de nivel.

## Commits

- `1520539f7` feat(214-23): ficha de Aura y sello de antigüedad sin dorado (D-61, D-66)
- `3941b66b3` feat(214-23): encabezado único de Mi Templo (D-25 a D-27)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base. Ninguno en los archivos tocados y ninguno nuevo; desapareció el TS2339 `displayName` de `MainLayout.vue` (el fallback se fue con el "Hola").
- Greps del plan: "Ver el detalle", `prefers-reduced-motion`, `pd-aura-deep`, `MiTemploHeader`, `AuraDetailSheet`, `ProfilePhotoSheet`, "Subí tu foto de perfil"; sin `formatGreetingDate` ni `header-greeting__date` en `MainLayout.vue`.
- Sin tests nuevos (el plan no los pide, la app no tiene harness de componentes). Revisión visual a 360/390/412 queda para el UAT (plan 32).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Funcionalidad crítica] Marcador azul de staging**
- **Found during:** Task 2
- **Issue:** `css/app.scss` pintaba de azul `.header-greeting` en `body.staging-env` para distinguir staging; al desaparecer esa clase, el encabezado quedaba terracota también en staging.
- **Fix:** el selector pasa a `.mth` (raíz del nuevo componente). Además prettier quitó una línea en blanco doble del archivo.
- **Files modified:** `el-templo-app/src/css/app.scss` (no figuraba en `files_modified`).
- **Commit:** `3941b66b3`

## Decisiones propias

- Sello de 1 año o más: la roseta pasa a degradé `#fbf8f3 → #f2ede5` con trazo `#d9cfc1`; el logo terracota (`$pd-terra-ink`) se pinta con el mismo `logo.webp` como máscara CSS (el filtro blanco de bronce y plata no sirve para dar un color). Se quitó el `brightness(0.92)` de la roseta solo para el oro.
- Se eliminó por completo el polvillo dorado (template y CSS de las 7 motas), no solo se ocultó: era código muerto.
- `VeteranSeal` ahora respeta `prefers-reduced-motion: reduce` (sin escala al pasar el cursor, sin "pop" al tocar). El plan 23 lo pedía porque antes no lo hacía.
- La clase del nivel (`veteran-seal--gold`, etc.) se agrega a la raíz del sello para poder apuntar al oro.
- El glifo del nivel se mantiene como está: el plan 24 lo toca.
- Nombre: `firstName ?? "Atleta"` (el UI-SPEC no menciona `displayName`, que el layout usaba antes).
- Contenedores del layout: `.mobile-greeting` queda tal cual; en escritorio el contenedor pasa a `.mi-templo-header-wrap` (ancho máximo 630, radio `0 0 12px 12px`), y el degradé lo pone el propio `.mth`, que hereda el radio. El padding superior de 16 en escritorio se aplica con `:deep(.mth)`.
- El import de `HeaderLevelDropdown` se quitó de `MainLayout.vue` (quedó sin uso); el plan 24 lo reimporta donde lo ubique. Los estilos `.header-greeting__*` del layout también se borraron; `HeaderLevelDropdown.vue` sigue referenciando esas clases en su propio archivo y queda sin tocar hasta el plan 24.
- `AuraChip` tiene `min-height: 44px`; el botón de la foto mide 52. El aro (4 px afuera) no cuenta como área tocable.
- La nueva recarga de `/me` por imagen rota se limita a una por vida del componente (T-214-23-01).

## Notas para los planes siguientes

- Plan 24: el selector de nivel ya no está en el encabezado y `HeaderLevelDropdown.vue` no se importa en ningún lado; depende de clases `header-greeting__*` que ya no existen en el layout (su propio estilo cubre solo parte).
- Plan 27: `AuraChip` (`value`, evento `open`) y el patrón `MemberAvatar` + `ProfilePhotoSheet` + `AuraDetailSheet` con `v-model` están ya compuestos en `MiTemploHeader.vue`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-23-01 mitigado (una sola recarga por error de imagen). T-214-23-02 aceptado (el encabezado solo lo ve su dueño).

## Self-Check: PASSED
