---
phase: 214-comunidad-anotados-aura
plan: 21
subsystem: app-profile-photo-ui
tags: [app, foto-perfil, hoja, normas, avatar, tokens, D-30, D-31, D-33, D-50, D-63, D-69]
requires: ["214-20"]
provides:
  - "Tokens $pd-aura-deep, $pd-gold-bright, $pd-aura-ivory-a, $pd-aura-spark y mixin pd-aura-frame"
  - "MemberAvatar (size 52|56|64|120|160, url, firstName, lastInitial, ring gold|white, badge review|camera, evento image-error)"
  - "PhotoRulesDialog (v-model, accept, cancel)"
  - "ProfilePhotoSheet (v-model): Pantalla 4c del UI-SPEC"
affects: ["214-23", "214-27"]
key-files:
  created:
    - el-templo-app/src/components/MemberAvatar.vue
    - el-templo-app/src/components/PhotoRulesDialog.vue
    - el-templo-app/src/components/ProfilePhotoSheet.vue
  modified:
    - el-templo-app/src/css/_premium-card.scss
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 21: hoja de la foto de perfil, normas y MemberAvatar Summary

La hoja clara "Foto de perfil" (estado, sacar o elegir, vista previa recortada, subir, quitar) con las normas obligatorias antes de cada subida (D-50), el componente `MemberAvatar` que reusarán el encabezado, la hoja de anotados y Perfil, y los tokens de color de Aura de la fase.

## Commits

- `549fc0364` feat(214-21): tokens de Aura y componente MemberAvatar
- `a8c9f3339` feat(214-21): hoja de la foto de perfil y normas (D-50)

## Verificación

- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 21 errores, igual a la línea de base, ninguno en los tres componentes.
- Greps del plan: textos exactos de las normas, "Así se va a ver", `AURA_AMOUNTS_UI.profilePhoto`, `cleanup()`, `prefersReducedMotion`; sin `CameraSource.Prompt`, sin `console.*`, sin `onUnmounted`, sin `any`, sin "pesad".
- No hay tests nuevos: el plan no los pide y la app no tiene harness de componentes.

## Deviations from Plan

None - plan ejecutado como estaba escrito.

## Decisiones propias

- "Elegir otra" vuelve a la vista principal y reabre las normas con la última fuente usada (cada subida pasa por las normas, D-50); si se cancelan las normas, queda en la vista principal.
- Cerrar de cualquier forma las normas (Cancelar, Esc, tocar afuera) emite `cancel`; solo "Acepto, elegir foto" emite `accept`. En web el `click()` del `<input type="file">` se llama dentro del mismo gesto del botón, sin `await` antes.
- La hoja principal lleva un link "Cerrar" (texto genérico de borrador del UI-SPEC) para cerrarla sin tocar afuera; es `persistent` solo mientras se sube o se quita.
- Si hay foto aprobada y una pendiente, el avatar muestra la aprobada con la insignia de revisión; si solo hay pendiente, muestra la pendiente con la insignia.
- Aro blanco de `MemberAvatar`: el UI-SPEC no da valores; se usó `0 0 0 2px rgba(255,255,255,.55), 0 0 0 4px #fff`, a revisar al armar el encabezado (plan 23).
- Los errores de subida y de elección se muestran con notify negative (como dice el UI-SPEC), no en línea.
- No se enganchó el botón "atrás" de Android a la hoja (el plan no lo pide); `useBackButtonClose` existe si se quiere sumar.
- El supuesto de "Motivo: {etiqueta}." (D-69) se usa tal cual y ya está en `214-DECISIONES-AUTONOMAS.md` §5.

## Notas para los planes siguientes

- Plan 23 (encabezado): `MemberAvatar` NO es botón, hay que envolverlo en un `<button>` con el `aria-label` de la tabla de estados; escucha `image-error` para volver a pedir `/me` una vez. `ring="gold"` solo cuando se ve la ficha de Aura. `:badge="photo.pendingUrl ? 'review' : null"`, y `camera` solo en Perfil.
- Plan 27 (Perfil): abrir `ProfilePhotoSheet` con `v-model`; la hoja ya limpia su estado al cerrarse.
- `MemberAvatar` importa `src/css/premium-card` y usa `$pd-gold-tint` para el aro dorado interno (`#f6efdc`, el mismo del UI-SPEC).
- `pd-aura-frame` es un mixin de fondo degradé decorativo: usarlo en borde (padding-box/border-box o pseudo-elemento), nunca detrás de texto.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-21-01: la fuente solo se abre desde `onRulesAccepted`. T-214-21-02: la hoja muestra `pendingUrl` solo del propio perfil. T-214-21-03: botón `loading` y hoja `persistent` durante la subida y el borrado.

## Self-Check: PASSED
