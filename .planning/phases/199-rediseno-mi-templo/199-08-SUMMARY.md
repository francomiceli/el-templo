---
phase: 199-rediseno-mi-templo
plan: 08
subsystem: admin-sponsors
tags: [sponsors, admin, wcag, image-upload, composables]
requires: [199-02, 199-03]
provides:
  - useSponsorsApi (list/create/update/remove/getSettings/updateSettings/uploadLogo + isForbidden)
  - tipos AdminSponsor / SponsorFormInput / UpdateSponsorInput espejo del API
  - utils/contrast.ts (espejo exacto del API) y utils/sponsors.ts (helpers de formulario)
  - useImageUpload genérico (blog delega)
affects: [199-09, 199-10]
key-files:
  created:
    - el-templo-admin/src/composables/useSponsorsApi.ts
    - el-templo-admin/src/composables/useImageUpload.ts
    - el-templo-admin/src/utils/contrast.ts
    - el-templo-admin/src/utils/sponsors.ts
  modified:
    - el-templo-admin/src/composables/useBlogImageUpload.ts
key-decisions:
  - "Los tipos del cliente calcan SponsorAdminItem de el-templo-api/src/modules/sponsors/schemas.ts (L15)"
  - "contrast.ts es copia funcional del API: mismos umbrales, fórmula y excepción ante hex inválido (L16)"
  - "normalizeSponsorForm es la única fuente de la forma a enviar (alta y base del diff)"
requirements-completed: [D-19, D-24, D-25, D-26]
completed: 2026-10-15
---

# Phase 199 Plan 08: Base admin de patrocinadores Summary

Cliente HTTP tipado de las 7 rutas de `/admin/sponsors`, contraste WCAG idéntico al del API, helpers puros del formulario (validación, diff parcial, monograma) y subida de imagen a R2 genérica que ahora comparten blog y patrocinadores.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 2 (composables): `184c84971` feat(199-08): admin — cliente tipado de patrocinadores y subida de imagen genérica
- Task 1 (utils): `34414ea70` feat(199-08): admin — contraste WCAG (espejo del API) y helpers del formulario de patrocinadores

## Resultados de verificación

- `npx vue-tsc --noEmit`: 21 errores totales (línea base), 0 en `useSponsorsApi|useImageUpload|useBlogImageUpload|utils/contrast|utils/sponsors`. PASS.
- `pnpm lint`: 0 errores (8 warnings preexistentes en CobrosPage / session-pdf-builder, no tocados). PASS.
- Greps de aceptación: `console.` = 0 en los 4 archivos nuevos; `useImageUpload(` en blog = 1; `axios.put` en blog = 0; `'/admin/sponsors/logo-upload-url'` = 1; `MIN_TEXT_CONTRAST = 4.5` = 1; `0.04045` = 1; 5 funciones exportadas de `utils/sponsors.ts` presentes.
- Paridad con el API: se cargaron `contrast.ts` del admin y del API con `node --experimental-strip-types` y `contrastRatio` dio resultados idénticos (`===`) en 5 pares (incluidos los bordes 4.47 / 4.54). La verificación se hizo con archivos copiados al scratchpad, sin tocar el repo.
- No se corrió vitest (el admin no tiene runner; la API no se tocó).

## Deviations from Plan

1. **[Menor] Orden de commits.** Se commiteó primero Task 2 (composables) y luego Task 1 (utils) porque `utils/sponsors.ts` importa los tipos de `useSponsorsApi.ts` y no tipa sin ellos. Mismos 5 archivos, 2 commits atómicos en vez de 1 (el plan pedía un solo commit al final de Task 2).
2. **[Menor] Conteo de `/admin/sponsors`.** El criterio pedía `grep -c "/admin/sponsors" useSponsorsApi.ts >= 5`; da 3 líneas porque las rutas se arman con la constante `SPONSORS_BASE` (DRY) y no repitiendo el literal. Las 7 rutas están cubiertas.
3. **[Menor] `formatRatio` trunca en vez de redondear** a 2 decimales. Un ratio 4.496 (que el server rechaza) con `toFixed` se vería "4.50:1", lo que confunde. El server muestra `toFixed(2)` en su mensaje; solo es presentación.
4. **[Rule 2 - validación] `validateSponsorForm` suma chequeos del schema** que el plan no listaba: patrón de `redeemCode` (`^[A-Za-z0-9_-]{1,40}$`), patrón de `icon`, `logoUrl` con `https://`, largo de `conditions`, fecha real de calendario (el server también la valida, L17). Solo feedback temprano; el server revalida.
5. **[Menor] `normalizeSponsorForm` exportado** (no estaba en el plan): trim de obligatorios, opcionales vacíos a `null` y países ordenados. Lo usa `diffSponsorForm` y debe usarlo el editor (plan 09) antes de `create`, porque el API rechaza `""` en `redeemCode`/`icon`/fechas por sus patrones.
6. **[Menor] `useSponsorsApi` expone también `uploadingLogo`** (el `uploading` del composable genérico) para el estado de carga del selector de logo. `isForbidden` está exportado además de devuelto por el composable.
7. **Hook de lint-staged:** el hook de husky hizo su backup interno con `git stash` en ambos commits (automático, no manual). Worktree limpio al terminar.

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- `SponsorFormInput.sortOrder` va siempre en el alta con default 0 (`emptySponsorForm`). El API, si no recibe `sortOrder`, asigna `max+1` (al final de la lista). El editor del plan 09 debería omitirlo en el alta para conservar ese comportamiento, o el plan 10 resolver el orden con otra UI.
- `diffSponsorForm` envía `redeemCode` aunque el tipo sea `carnet` si cambió (el API lo conserva en la fila; por decisión de 199-02).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-26 (el server revalida contraste; el helper es solo feedback) y T-199-27 (`isForbidden` para el estado "solo El Templo" ante 403) cubiertos.

## Self-Check: PASSED

- Archivos existen: `useSponsorsApi.ts`, `useImageUpload.ts`, `contrast.ts`, `sponsors.ts`; `useBlogImageUpload.ts` modificado.
- Commits `184c84971` y `34414ea70` presentes; `git status --porcelain` vacío en el worktree.
