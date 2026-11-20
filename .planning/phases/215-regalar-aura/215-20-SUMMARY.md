---
phase: 215-regalar-aura
plan: 20
subsystem: app-give-aura-sheet
tags: [app, hoja, dar-aura, regalo]
requires: ["215-19"]
provides:
  - "Hoja GiveAuraSheet (Pantalla 2 del UI-SPEC) y mixins pd-sheet-light y pd-sheet-grabber"
affects: [215-21, 215-24]
tech-stack:
  added: []
  patterns:
    [
      marco de hoja clara como mixin,
      lista de candidatos solo en el estado del componente,
      recarga silenciosa tras un 409 conservando la lista anterior,
    ]
key-files:
  created:
    - el-templo-app/src/components/GiveAuraSheet.vue
  modified:
    - el-templo-app/src/css/_premium-card.scss
key-decisions:
  - "Los textos salen todos de gift-view.ts y de GIFT_REASONS: la hoja solo agrega los fijos del UI-SPEC que no estaban ahí (DAR AURA, titulo, Por que, estados)"
  - "Mientras se envia, la hoja es persistent y el boton atras de Android no la cierra"
requirements-completed:
  [SC-1, SC-2, SC-5, D-02, D-05, D-07, D-09, D-14, D-16, D-22]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 20: hoja "Dar Aura" Summary

La hoja para dar Aura a un compañero de la clase (sketch 034 A): caras arriba, cuatro motivos abajo y el botón del pie que confirma, todo en una sola pantalla.

## Tareas

| Tarea | Commit      | Asunto                                     |
| ----- | ----------- | ------------------------------------------ |
| 1     | `3f3db25f2` | style(215-20): mixin de hoja clara         |
| 2     | `5fdd2040e` | feat(215-20): hoja Dar Aura (sketch 034 A) |

## Qué quedó

- `_premium-card.scss`: `pd-sheet-light` (100 %, máx. 480, alto máx. 85vh, fondo claro, radio 20 arriba, sombra, columna) y `pd-sheet-grabber` (40x4). Las hojas de la 214 no se tocaron.
- `GiveAuraSheet.vue`: props `modelValue` y `gift: PendingGift | null`; emite `update:modelValue`, `given` y `stale`.
  - Al abrir pide los candidatos y reinicia elección y estado; al terminar de cerrarse (`@hide`) descarta todo. `requestSeq` descarta respuestas tardías, `useBackButtonClose` engancha Android y `cleanup()` del cliente corre al desmontar.
  - Grilla de 4 columnas con `MemberAvatar` 56. Elegida: tinte, aro interior, aro de la cara y tilde de 20. Apagada por tope semanal: `aria-disabled`, imagen con opacidad .45 y gris, nombre sólido, `aria-label` de `blockedAriaLabel` y nota única debajo (`role="note"`). Tocar la elegida la deselecciona; al elegir se hace `scrollIntoView({ block: 'nearest' })` (suave solo sin movimiento reducido).
  - Motivos: cuatro botones con `aria-pressed`, 44 de alto, ícono de tilde al elegirse. Ayuda con `sheetHelp`.
  - Pie con `sheetFooterLabel`; el botón es la confirmación. Enviando: hoja `persistent`, caras y motivos deshabilitados, texto "Dando Aura…" con círculo giratorio.
  - Respuestas: 201 cierra, avisa positivo y emite `given` y `stale`; los errores se aplican tal cual con `giveErrorOutcome` (aviso, cerrar, recargar candidatos en silencio, borrar elección, `stale`).
  - Estados: cargando (8 esqueletos, motivos deshabilitados), error con "Reintentar", vencido/ya dado con "Cerrar" y sin candidatos con "Cerrar".

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos ajenos).
- `vue-tsc` app: 20 errores (base 20); ninguno en los archivos tocados.
- El bloque de estilos se compiló con `sass` (sin errores). Los greps de verificación dan OK.
- API y admin no tocados. Sin migración, bump, instalaciones ni push. Prettier sobre las rutas tocadas.

## Desvíos respecto del plan

Ninguno de fondo. El plan decía `:loading` en el botón del pie; con `loading` Quasar oculta el texto del botón, así que se dibuja un círculo giratorio al lado del texto "Dando Aura…" y los toques se ignoran mientras envía (anotado en decisiones).

## Decisiones propias

Cinco filas en `215-DECISIONES-AUTONOMAS.md`: errores al pedir candidatos (ya dado, vencido, 404), borrado de la elección si queda apagada o desaparece, texto del botón enviando, y hoja abierta sin clase.

## Pendiente para el UAT del plan 24

Ver la hoja a 360, 390 y 412 px con una cara elegida y una apagada, con una clase grande (scroll hasta "¿Por qué?"), y el pie con el área segura en iOS. Nada se vio renderizado.

## Lecciones para los planes siguientes

- El plan 21 monta `<GiveAuraSheet v-model="open" :gift="store.pending[0] ?? null" @stale="store.load()" />`; `given` no hace falta escucharlo para refrescar (ya sale `stale`).
- Con `q-btn loading` el texto se oculta: para mostrar texto y progreso a la vez, usar `q-spinner` en el slot y no pasar `loading`.
- Para compilar el `<style>` de un componente sin correr la app: extraer el bloque a un `.scss` en el scratchpad y correr `node_modules/.bin/sass --load-path=src/css`.

## Self-Check: PASSED

Commit `3f3db25f2` y los archivos `GiveAuraSheet.vue` y `_premium-card.scss` verificados.
