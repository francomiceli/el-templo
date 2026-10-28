---
phase: 199-rediseno-mi-templo
reviewed: 2026-10-16T00:00:00Z
depth: standard
scope: git diff de257ec705..HEAD -- el-templo-admin (worktree /home/franco/projects/et-199-mi-templo)
files_reviewed: 13
files_reviewed_list:
  - el-templo-admin/src/components/comunicaciones/TarjetasTab.vue
  - el-templo-admin/src/components/sponsors/SponsorCardPreview.vue
  - el-templo-admin/src/components/sponsors/SponsorEditorDialog.vue
  - el-templo-admin/src/components/sponsors/SponsorSheetPreview.vue
  - el-templo-admin/src/components/sponsors/SponsorsTab.vue
  - el-templo-admin/src/composables/useBlogImageUpload.ts
  - el-templo-admin/src/composables/useImageUpload.ts
  - el-templo-admin/src/composables/useSponsorsApi.ts
  - el-templo-admin/src/config/hidden-system-avisos.ts
  - el-templo-admin/src/pages/ComunicacionesPage.vue
  - el-templo-admin/src/pages/PartnersPage.vue
  - el-templo-admin/src/utils/contrast.ts
  - el-templo-admin/src/utils/sponsors.ts
findings:
  blocker: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Fase 199: Code Review del ADMIN

**Revisado:** 2026-10-16 · **Profundidad:** standard (cruzado con `el-templo-api/src/modules/sponsors/` y con `SponsorsCarousel.vue` / `utils/sponsors.ts` de la app)

## Resumen

Código en general sólido. Los puntos que pedían verificación salen bien:

- **XSS:** no hay `v-html` en `components/sponsors/`. Todo va con `{{ }}`. `$q.dialog` usa `message` sin `html: true`. Los `name` de `q-icon` pasan por `ICON_REGEX` en el cliente y por `pattern` en el server (ver IN-03 por el ícono del `#append`, que se ve antes de validar).
- **Logos:** el server exige `R2_PUBLIC_URL/sponsors/logos/` (`assertOwnLogoUrl`). El admin solo pone `logoUrl` desde `uploadLogo`. `PUT` solo revalida el logo si viene en el body.
- **Contraste:** `contrast.ts` del admin es idéntico al del API (misma fórmula, mismo regex, mismo umbral).
- **Largos:** `SPONSOR_LIMITS` (name 60, category 60, benefit 12, detail 80, conditions 600, redeemCode 40) coincide con `sponsorBodyProperties`. Los regex de ícono, código y fecha también coinciden.
- **Límite por país:** el server responde **400** (`BadRequestError`), no 409, con "Ya hay N patrocinadores activos en X. Desactivá uno antes de activar otro.". `extractError` lo muestra tal cual en el toggle (`SponsorsTab.toggleActive`) y en el editor (`serverError` + notify). Es correcto, no hace falta manejo especial de 409.
- **Tipos:** `vue-tsc --noEmit` da 21 errores, igual que la línea base. Ninguno está en archivos de esta fase.
- **Algoritmo de ajuste del beneficio:** `sponsorBenefitFontPx` y `fitBenefitFontPx` son idénticos a los de la app (umbrales 8/10, tamaños 30/26/22, piso 16, bucle de 1 px). `monogram` también.

Hay 0 BLOCKERs, 4 WARNINGs (uno de ellos de coherencia con la app) y 8 INFO.

## Warnings

### WR-01: Reordenar dentro de un país puede alterar el orden relativo en el otro país

**Archivo:** `el-templo-admin/src/components/sponsors/SponsorsTab.vue:263-295` (`planReorder` + `move`)
**Issue:** `sortOrder` es global (D7: "alcanza el orden global"), pero la lista que se reordena es el subconjunto del país visible. `planReorder` reparte entre esas marcas los `sortOrder` que ya tenían, ordenados. Si hay marcas AR+ES intercaladas con marcas de un solo país, el reparto salta por encima de marcas del otro país.

Escenario concreto:

| Marca | sortOrder | Países |
| ----- | --------- | ------ |
| A     | 1         | AR+ES  |
| B     | 2         | AR     |
| C     | 3         | ES     |
| D     | 4         | AR+ES  |

- Orden en ES antes: A, C, D.
- En la pestaña AR se sube D sobre B. La lista AR queda A, D, B y los valores [1, 2, 4] se reparten: A=1, D=2, B=4.
- Orden en ES después: A, D, C. D saltó sobre C sin que nadie lo pidiera, y el feed del socio de España cambia.

Una marca que está en los dos países siempre arrastra al otro país.

**Fix:** reordenar sobre la lista global y renumerar de forma estable.

1. Tomar `sponsors` ordenado globalmente.
2. Sacar la marca movida.
3. Reinsertarla justo antes (o después) de su vecino del país visible, dentro de la lista global.
4. Renumerar 0..n-1 y enviar solo las filas cuyo valor cambia.

Así no cambia el orden relativo de ninguna marca que no se movió, ni en AR ni en ES. Alternativa: documentar que el orden es global y mostrar la lista global con un filtro visual. Hoy la UI sugiere orden por país y no lo es.

---

### WR-02: Un diálogo de subida de logo en curso se puede cancelar y el resultado pisa otro formulario

**Archivo:** `el-templo-admin/src/components/sponsors/SponsorEditorDialog.vue:278,449-465`
**Issue:** "Cancelar" solo se deshabilita con `saving`, no con `uploadingLogo`. Secuencia:

1. El usuario elige un logo grande.
2. Aprieta Cancelar.
3. Abre "Editar" de otra marca. `resetForm()` corre sobre el mismo `form` reactivo.
4. Termina la subida anterior y `form.logoUrl = await uploadLogo(file)` escribe el logo de la marca A en el formulario de la marca B.

`canSave` ya bloquea mientras sube, pero el usuario no lo nota si guarda sin mirar. Queda un logo equivocado en una marca. El objeto subido a R2 también queda huérfano.

**Fix:** deshabilitar Cancelar con `saving || uploadingLogo`. Como defensa, guardar un token de sesión del formulario:

```ts
const session = formSession; // se incrementa en resetForm()
const url = await uploadLogo(file);
if (session !== formSession) return;
form.logoUrl = url;
```

---

### WR-03: El editor se abre aunque el usuario no sea de El Templo (estado "forbidden")

**Archivos:** `el-templo-admin/src/components/sponsors/SponsorsTab.vue:15-22,176-182,421-429` y `el-templo-admin/src/pages/PartnersPage.vue:140-150,334-350`
**Issue:** `canManageSponsors` solo mira el rol (`owner`/`admin`). Un admin de otro gimnasio (Kaia, tenant != 1) ve:

- la pestaña "Patrocinadores";
- el botón `add_card` en cada fila de partners.

El API lo frena con 403 (`isTemploPlatformAdmin`) y la pestaña muestra "Solo disponible para el equipo de El Templo". Pero `<SponsorEditorDialog>` está **fuera** del `<template v-else>`. Con `forbidden === true`, `createSponsorFromPartner` o el watch de `prefill` igual abren el editor precargado. El usuario completa el formulario, y la subida de logo y el guardado fallan con 403 y mensajes sueltos.

**Fix:**

1. En `SponsorsTab`, no abrir el editor si `forbidden.value`. Ejemplo: `if (!prefill || forbidden.value) { emit('prefill-consumed'); return; }` y `v-if="!forbidden"` en el diálogo. Ojo: el watch es `immediate` y corre antes de que `load()` termine. Conviene esperar al primer `load` antes de abrir, o gatear en la página.
2. Idealmente exponer el tenant en el store de auth y ocultar tab y botón cuando no es El Templo, en vez de depender del 403.

---

### WR-04: La preview de la card no puede mostrar la pastilla bloqueada que ve un socio sin plan, y el CSS del beneficio difiere de la app

**Archivos:** `el-templo-admin/src/components/sponsors/SponsorCardPreview.vue:39-42,84-86,239-246,234-238` vs `el-templo-app/src/modules/progression/components/SponsorsCarousel.vue:73-76,583-592,576-581` y `utils/sponsors.ts:743-751`
**Issue:** La preview debe coincidir con la card de la app (L15/L16/L49). Diferencias que verifiqué:

1. **Pastilla de canje.** La app usa `sponsorRedeemPill(s, canRedeem)`. Para `redeemType: 'code'` sin plan muestra `lock` + "Socios con plan". La preview siempre muestra `sell` + código (o "CÓDIGO"). El toggle "Ver sin plan" del editor solo afecta la **hoja** (`SponsorSheetPreview`), no la card. El admin no puede ver cómo queda la card para un socio sin plan, que es lo que ve la mayoría.
2. **Beneficio por debajo del piso.** En la app `.sp-benefit` tiene `overflow: hidden; text-overflow: ellipsis` y `.sp-deal__text` tiene `max-width: 100%`. En la preview `.spc-benefit` y `.spc-deal__text` no los tienen. Con 12 glifos anchos que no entran ni a 16 px, la app corta con elipsis y la preview desborda la card, que tiene `overflow: hidden`, así que se recorta sin elipsis. Es justo el caso que la preview debería advertir.

**Fix:** reusar el helper de la app. Hoy `sponsorRedeemPill` solo vive en la app, así que copiarlo a `utils/sponsors.ts` del admin con la nota "espejo" que ya usan los otros helpers. Pasar `locked` a la card (`:locked="previewLocked"`) y agregar a `.spc-benefit` `overflow: hidden; text-overflow: ellipsis;` y a `.spc-deal__text` `max-width: 100%`. Mismo `transform-origin: left center` para la card fantasma (INFO-05).

## Info

### IN-01: Validaciones mostradas antes de que el usuario toque el formulario

**Archivo:** `SponsorEditorDialog.vue:254-256,469`
Al abrir un alta vacía, la lista roja ya muestra 4 "no puede estar vacío" y el contraste. Es ruido para un formulario recién abierto. **Fix:** mostrar la lista solo tras el primer cambio (`dirty`) o tras un intento de guardar. El botón Guardar ya queda deshabilitado.

### IN-02: Largo contado en unidades UTF-16 en el cliente y en code points en el server

**Archivos:** `utils/sponsors.ts:440`, `SponsorEditorDialog.vue:45-83` (`:maxlength`)
Ajv cuenta `maxLength` en code points. `String.length` y el atributo `maxlength` cuentan unidades UTF-16. Un beneficio con emoji (7 x "🔥" = 14 unidades) se rechaza en el cliente aunque el server lo aceptaría. `sponsorBenefitFontPx` ya usa `Array.from`, así que la UI es inconsistente. **Fix:** `Array.from(value).length` en `validateSponsorForm`. Si se quiere, un `:rules` en vez de `:maxlength` para el beneficio.

### IN-03: El ícono sin validar se pasa a `q-icon` en el `#append`

**Archivo:** `SponsorEditorDialog.vue:186-188`
`<q-icon :name="form.icon">` recibe lo tipeado antes de que corra `ICON_REGEX`. Quasar interpreta prefijos como `img:https://...` o `svguse:...`, así que un valor pegado puede disparar una request de imagen desde el admin. Es auto-inflingido (solo lo ve quien lo escribe), pero cuesta poco: **Fix:** renderizar el ícono solo si `ICON_REGEX.test(form.icon)`. Exportar el regex desde `utils/sponsors.ts`.

### IN-04: Código de canje forzado a mayúsculas sin avisar

**Archivo:** `SponsorEditorDialog.vue:396-398`
`onRedeemCodeInput` hace `toUpperCase()`, pero el server y el schema aceptan minúsculas. Si el código de la marca distingue mayúsculas ("Templo20"), el socio recibe uno que no funciona. Al editar una marca existente con minúsculas, el código solo se transforma si el usuario lo toca. **Fix:** no transformar, o avisar en el hint ("se guarda en mayúsculas").

### IN-05: Detalles menores de la preview frente a la app

**Archivo:** `SponsorCardPreview.vue:165-167`
La card fantasma usa `transform: scale(0.94)` con el origen por defecto (centro). En la app es `transform-origin: left center` y la activa va a scale 1. En la preview la card fantasma queda corrida unos px respecto de la app. Además la app pone `referrerpolicy="no-referrer"` en la imagen y la preview no. Cosmético.

### IN-06: Estado muerto y exports redundantes en `useSponsorsApi`

**Archivo:** `composables/useSponsorsApi.ts:90-91,153-166,209`
`getSettings` no se usa en ningún lado. `error` se escribe pero nadie lo lee. `isForbidden` se exporta como función suelta y además dentro del objeto retornado. **Fix:** borrar `getSettings` y `error` (o usarlos), y dejar un solo punto de exposición de `isForbidden`.

### IN-07: Datos del estado "activa" que confunden al operador

**Archivo:** `SponsorsTab.vue:112-117,243-249` (`activeCount`, columna "Activo")
Una marca con `isActive` true y `endsOn` pasado figura "Activo" y cuenta contra el límite por país, pero el socio no la ve. El server hace lo mismo a propósito ("Activas = is_active sin mirar vigencia"), pero la tabla no lo dice. Además la columna "Canjes" son **intentos** de canje (D-25), no canjes confirmados. **Fix:** chip "Vencida"/"Programada" según `startsOn`/`endsOn` y renombrar la columna a "Intentos de canje" (o ajustar el tooltip).

### IN-08: DRY y detalles de subida

**Archivos:** `SponsorCardPreview.vue:54-82`, `SponsorSheetPreview.vue:326-358`, `utils/sponsors.ts:310`, `useImageUpload.ts:30-33`, `SponsorEditorDialog.vue:64,182`, `SponsorsTab.vue:204-206`

- Los `FALLBACK_BG/FG`, el `colors` computed y los `shown*` están duplicados entre las dos previews, y `'#3d3732'/'#f2ede5'` también están literales en `emptySponsorForm`. Extraer a `utils/sponsors.ts` (`SPONSOR_FALLBACK_COLORS`, `previewTexts(props)`).
- `countryLabel` en `SponsorsTab` repite `SPONSOR_COUNTRY_OPTIONS`.
- Números literales: `:maxlength="40"` del ícono (existe `ICON_REGEX` con 40) y el hint "Hasta 12 caracteres" hardcodeado en vez de `SPONSOR_LIMITS.benefit`.
- `useImageUpload` sube con `Content-Type: file.type || 'image/jpeg'`, pero el server firma el `ContentType` según la extensión del archivo (`BlogImageService.getContentType`). Si el navegador no reconoce el tipo (p. ej. `.avif` en algunos navegadores), `file.type` es `''`, se manda `image/jpeg` y R2 responde `SignatureDoesNotMatch`. Es código heredado del blog, pero ahora se comparte con un formato nuevo (`avif`). **Fix:** que el API devuelva el `contentType` firmado y el cliente lo use, o derivarlo de la extensión igual que el server.
- La chip de marca en la tabla (`SponsorsTab`) usa `object-fit: contain` y la card de la app usa `cover`: el logo se ve distinto.
- Sin validación de tamaño ni de tipo del archivo antes de subir (el `accept` se puede saltear). Un archivo `.gif` llega al API y vuelve un 400 de Fastify en inglés (`body/filename must match pattern ...`) que se muestra tal cual.

---

_Reviewed: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
