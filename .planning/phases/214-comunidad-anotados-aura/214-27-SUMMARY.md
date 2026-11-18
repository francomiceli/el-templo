---
phase: 214-comunidad-anotados-aura
plan: 27
subsystem: app-perfil
tags: [app, perfil, foto, visibilidad, aura, D-06, D-16, D-69]
requires: ["214-26"]
provides:
  - "ProfilePage: foto como botón, sección Comunidad (foto, interruptor optimista, Tu Aura) y aterrizaje #comunidad (Pantallas 4a y 4b)"
affects: ["214-32"]
key-files:
  modified:
    - el-templo-app/src/pages/ProfilePage.vue
metrics:
  tasks: 1
  completed: 2026-11-18
---

# Phase 214 Plan 27: Perfil con foto y sección Comunidad Summary

La foto de la cabecera de Perfil es un `<button>` con `MemberAvatar` 64 (insignia de cámara sin foto, de revisión con pendiente) que abre `ProfilePhotoSheet`. Entre "Tu cuenta" y "Ajustes" hay una sección `id="comunidad"` con tres filas: Foto de perfil (valor y caption por estado, con "Motivo: {etiqueta}. Podés subir otra." si fue rechazada con motivo), Aparecer en las listas (`q-toggle` optimista con `setCommunityVisible` + `setVisibility`, vuelta atrás y notify negative si falla) y Tu Aura (abre `AuraDetailSheet`, solo con `auraEarned` distinto de null).

## Commits

- `252169c11` feat(214-27): Perfil con foto y sección Comunidad (D-06, D-16)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base; ninguno en `ProfilePage`.
- Greps del plan: `id="comunidad"`, "Aparecer en las listas de la clase", "No pudimos guardar el cambio. Probá de nuevo.", `AURA_AMOUNTS_UI.profilePhoto`, `setVisibility`, `AuraDetailSheet`.
- Sin harness de componentes: la revisión visual queda para el UAT (plan 32).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- La sección y cada fila se dibujan solo si el campo existe en `/me` (`photo`, `communityVisible`, `auraEarned`): con una API vieja no se ofrece lo que no se puede leer ni guardar.
- El interruptor ignora cambios mientras hay un guardado en vuelo (el valor sigue atado al store, así que vuelve solo); antes de reintentar se revierte al valor previo.
- Insignia de la cabecera igual que en Mi Templo: `review` si hay `pendingUrl` (aunque haya una aprobada), `camera` si no hay ninguna foto. El `aria-label` repite el de `MiTemploHeader` (duplicado a propósito para no tocar ese archivo; candidato a util compartida).
- El resalte de `#comunidad` es un contorno fijo `$pd-terra-ink` durante 2 s (sin animación, así que cumple con movimiento reducido); el scroll usa `behavior: auto` con `prefers-reduced-motion`. El aterrizaje corre al montar y, si el perfil llega después, apenas aparece la sección.
- Se retiró el círculo de iniciales propio de la cabecera y el computed `initials`: ahora las iniciales las dibuja `MemberAvatar` (nombre de pila + inicial del apellido).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-27-01: si el PUT falla, el interruptor vuelve al valor previo y se avisa.

## Self-Check: PASSED
