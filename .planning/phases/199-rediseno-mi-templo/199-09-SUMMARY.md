---
phase: 199-rediseno-mi-templo
plan: 09
subsystem: admin-sponsors
tags: [sponsors, admin, editor, preview, wcag, logo-upload]
requires: [199-08]
provides:
  - SponsorCardPreview (réplica de la card del carrusel, 82 % + asomo a escala .94)
  - SponsorSheetPreview (réplica de la hoja de detalle, con estado "sin plan")
  - SponsorEditorDialog (alta/edición con contraste en vivo, logo, PUT parcial, precarga desde partner)
  - CreateSponsorInput (tipo de alta con sortOrder opcional)
affects: [199-10]
key-files:
  created:
    - el-templo-admin/src/components/sponsors/SponsorCardPreview.vue
    - el-templo-admin/src/components/sponsors/SponsorSheetPreview.vue
    - el-templo-admin/src/components/sponsors/SponsorEditorDialog.vue
  modified:
    - el-templo-admin/src/composables/useSponsorsApi.ts
key-decisions:
  - "El alta omite sortOrder (CreateSponsorInput): el API deja la marca al final (max + 1)"
  - "canSave exige diff no vacío al editar; handleSave conserva igual la guarda de diff vacío por si se llama directo"
  - "El 400 del server se muestra en notify Y en un banner inline del editor (L17)"
requirements-completed: [D-19, D-22, D-23, D-26]
completed: 2026-10-15
---

# Phase 199 Plan 09: Editor de patrocinadores Summary

Editor del admin con formulario completo de D-19, chip de contraste WCAG en vivo que bloquea el guardado por debajo de 4.5:1, subida de logo a R2 (degrada ante 503), PUT parcial y vista previa en vivo de la card del carrusel y de la hoja de detalle con el look de la app.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `bcceea746` feat(199-09): admin — vistas previas de la card del carrusel y de la hoja de detalle de patrocinadores
- Task 2: `27d6c0f9e` feat(199-09): admin — editor de patrocinadores con contraste en vivo y vista previa de card y hoja

## Resultados de verificación

- Task 1: `vue-tsc --noEmit` = 21 errores totales (línea base), 0 en `components/sponsors/`. `nowrap` presente en la card; `v-html` = 0; `opacity: 0.13` = 1; `scale(0.94)` = 1; `color: rgba(` = 0 en ambas previews. PASS.
- Task 2: `vue-tsc` = 21 totales, 0 en `components/sponsors/` ni `useSponsorsApi`. `pnpm lint`: 0 errores (8 warnings preexistentes de CobrosPage / session-pdf-builder). Greps: `contrastRatio(` 1, `canSave` 3, `diffSponsorForm(` 1, `uploadLogo(` 1, Card/Sheet preview 4 líneas, `prefill` 13, `v-html` 0, `console.` 0. PASS.
- No se hizo recorrido visual en navegador (el admin no tiene runner y no se levantó dev server): queda para el UAT (plan 21).

## Deviations from Plan

1. **[Menor] Dos commits (uno por task)** en vez de uno solo al final de Task 2, para mantener atomicidad por task.
2. **[Rule 3 - bloqueo] `useSponsorsApi.ts` modificado (no estaba en `files_modified`).** `create` tipaba `SponsorFormInput` con `sortOrder` obligatorio, lo que impedía cumplir L18 (omitir `sortOrder` en el alta) sin un cast falso. Se agregó `CreateSponsorInput = Omit<SponsorFormInput,'sortOrder'> & { sortOrder?: number }` y `create` lo recibe. Retrocompatible.
3. **[Menor] Sin diff, el botón Guardar queda deshabilitado en edición** (por la definición de `canSave` del plan); la rama "cerrar sin request" de `handleSave` queda como defensa. Distinto de `NovedadEditorDialog`, que habilita el botón.
4. **[Menor] Banner inline de error del server** además del `notify` (L17), para que el mensaje 400 (límite de activas, contraste) no desaparezca a los 5 s.
5. **[Menor] Pequeña duplicación entre las dos previews**: el fallback de colores (`#3d3732`/`#f2ede5`) y la computación de textos placeholder se repiten en Card y Sheet. No se extrajo a un util para no tocar `utils/sponsors.ts` ni crear un archivo fuera del plan; candidato a extraer en el plan 10 si crece.
6. **[Menor] Hint extra en Beneficio**: "Si se corta en la vista previa, acortalo". El límite del API es 16 caracteres pero a Montserrat 800 / 30 px en una card de ~282 px entran ~11-12; el beneficio es `nowrap` y se corta por `overflow: hidden`. Ver duda abierta.
7. **[Menor] UI-SPEC vs plan**: sin diferencias de valores; la preview de la hoja se dibuja sobre un fondo `#e9e3da` (el body del sketch) en lugar de un overlay oscuro, para que quede legible en el diálogo.
8. **Hook de lint-staged:** el hook de husky hizo su backup interno con `git stash` en ambos commits (automático, no manual). Prettier reformateó los archivos al commitear. Worktree limpio al terminar.

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- **Largo del beneficio**: el API admite hasta 16 caracteres pero una card al 82 % de 360 px solo muestra ~11-12 a 30 px. Beneficios largos se cortan en la app. Opciones: bajar el límite a 12 en API + `SPONSOR_LIMITS`, o dejar que la preview avise (hoy solo hay el hint). Decisión de Franco.
- El error-list bajo el form muestra todos los errores de validación desde el primer render del alta (formulario vacío); es informativo pero ruidoso. Se puede esconder hasta el primer cambio si en el UAT molesta.
- `SponsorPrefill` se exporta desde el `.vue` (`export interface` en `<script setup>`); el plan 10 puede importarlo como tipo o construir el objeto estructuralmente.
- El editor no valida tamaño de archivo del logo en el cliente (el límite real lo impone R2/el API); si hace falta, tope de 2 MB en `onLogoSelected`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-28 (sin `v-html`, solo `{{ }}`), T-199-29 (`accept` de imágenes; el server valida extensión/prefijo) y T-199-30 (`canSave` bloquea < 4.5; el server revalida y su 400 se muestra) cubiertos.

## Self-Check: PASSED

- Archivos existen: `SponsorCardPreview.vue`, `SponsorSheetPreview.vue`, `SponsorEditorDialog.vue`; `useSponsorsApi.ts` modificado.
- Commits `bcceea746` y `27d6c0f9e` presentes; `git status --porcelain` vacío en el worktree.
