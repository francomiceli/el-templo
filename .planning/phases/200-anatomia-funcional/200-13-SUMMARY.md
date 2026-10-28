---
phase: 200-anatomia-funcional
plan: 13
subsystem: admin
tags: [anatomia, admin, ficha, evidencia, glosario]
requires: ["200-12"]
provides:
  - "MarcaEvidencia.vue: chip de marca ([n], L1-L5, C, M, R, H, N) con q-tooltip y aria-label desde vista.citas / vista.leyenda"
  - "GlosarioRoles.vue: q-expansion-item '¿Qué significa cada rol?' (roles, contracciones, precisión) desde vista.glosario"
  - "RutaFicha.vue: ficha completa de ruta (encabezado, resumen, chips de sección, figura por rol, 7 secciones D11, estado 'en preparación', pendientes)"
  - "AnatomiaPage: ?ruta=<slug> abre la ficha (maximized en celular, position right en escritorio)"
affects: [200-14]
tech-stack:
  added: []
  patterns:
    - "resolver<T>(Seccion<T>) separa contenido de Pendiente en un par {datos, pend}: el template no depende de narrowing"
    - "Layout de la ficha por container query (640 px) y no por breakpoint de pantalla"
key-files:
  created:
    - el-templo-admin/src/components/anatomy/MarcaEvidencia.vue
    - el-templo-admin/src/components/anatomy/GlosarioRoles.vue
    - el-templo-admin/src/components/anatomy/RutaFicha.vue
  modified:
    - el-templo-admin/src/pages/AnatomiaPage.vue
key-decisions:
  - "Volver de la ficha: router.back() si se abrió con push desde la página (flag en memoria), si no router.replace sin ?ruta"
  - "Dos q-dialog (v-if/v-else por esMovil) en vez de uno con props dinámicas: mantiene maximized y position=right literales y evita mezclar props incompatibles"
  - "Banderas: se resuelven los banderaIds de la ruta contra el catálogo global; las propias de la ruta (banderasRuta) van primero"
requirements-completed: [D5, D9, D11, R3, R5, SC3]
duration: ~40min
completed: 2026-10-21
---

# Phase 200 Plan 13: Ficha de ruta del Admin › Anatomía Summary

**Tocar una ruta en la hoja abre su ficha a pantalla completa (panel derecho en escritorio) con "Borrador · sin validar", figura pintada por rol, glosario propio y cada afirmación con su marca de evidencia y tooltip.**

## Task Commits

1. **Task 1: MarcaEvidencia.vue y GlosarioRoles.vue** - `6efdf8e3c` (feat)
2. **Task 2: RutaFicha.vue** - `389be1d6e` (feat)
3. **Task 3: montaje en AnatomiaPage** - `1af0a3615` (feat)

## Verificacion

- Task 1 `<automated>` (corrido en partes por el guard): tokens `q-tooltip`, `tabindex="0"`, `aria-label`, `citas`, `leyenda` en MarcaEvidencia; `¿Qué significa cada rol?`, `q-expansion-item`, `contracciones`, `precision`, `Definiciones estándar de anatomía` en GlosarioRoles; higiene limpia: **OK**.
- Task 2 `<automated>`: 925 líneas (>=200), los 19 tokens presentes (`Borrador · sin validar`, secciones, `No están en el dibujo`, `Ficha en preparación`, `Pendiente`, `esPendiente`, `umbral a validar`, `volverA`, `scrollIntoView`...); sin `console.`/`any`/`v-html`/`color: rgba(`/`onUnmounted`: **OK**.
- Task 3 `<automated>`: `RutaFicha`, `maximized`, `position="right"`, `rutaPorSlug`, `volverA` presentes; el comentario "plan 200-13" ya no existe; higiene limpia: **OK**.
- Chequeo de tipos parcial con el `tsc` del API sobre un snippet del helper `resolver<T>` contra `types/anatomy.ts` (inferencia de `string[] | Pendiente`, `readonly FaseFicha[] | Pendiente`, `Afirmacion | Pendiente`): sin errores.
- `prettier --write` (binario del checkout principal) sobre los archivos tocados antes de cada commit.
- No se corrió vue-tsc, build ni tests (sin `node_modules` en el worktree; CI no typechequea el admin).

## Para el orquestador: archivos front-end del admin tocados en 200-11..13 (correr `vue-tsc` desde el checkout principal)

- `el-templo-admin/src/types/anatomy.ts`
- `el-templo-admin/src/stores/useAnatomyStore.ts`
- `el-templo-admin/src/config/templo-config.ts`
- `el-templo-admin/src/router/routes.ts`
- `el-templo-admin/src/css/_anatomia.scss`
- `el-templo-admin/src/components/anatomy/AnatomyFigure.vue`
- `el-templo-admin/src/components/anatomy/AnatomySheet.vue`
- `el-templo-admin/src/components/anatomy/ZonaPanel.vue`
- `el-templo-admin/src/components/anatomy/MusculoRoles.vue`
- `el-templo-admin/src/components/anatomy/MarcaEvidencia.vue` (nuevo en 13)
- `el-templo-admin/src/components/anatomy/GlosarioRoles.vue` (nuevo en 13)
- `el-templo-admin/src/components/anatomy/RutaFicha.vue` (nuevo en 13)
- `el-templo-admin/src/pages/AnatomiaPage.vue`

Puntos a mirar en vue-tsc (plan 13):

- `RutaFicha`: `resolver<T>(s: Seccion<T>)` con `T = readonly FaseFicha[]`, `string[]`, `Afirmacion`; `:ref="(el) => setSec(...)"` con `el: unknown`; `PATRON_LEGIBLE: Record<Patron, string>`; `MarcaEvidencia :marcas` recibe `readonly Marca[]` y `Marca[]`.
- `MarcaEvidencia`: type guard `esLetraLeyenda(m): m is LetraLeyenda` y `leyenda[m]`; `c.id === m` entre `number | 'L1'..'L5'` y `Marca`.
- `GlosarioRoles`: `glosario.precision` usa `clave/titulo/definicion` de `GlosarioEntrada`.
- `AnatomiaPage`: `q-dialog` con `@update:model-value="onFichaModel"` y `:model-value` booleano; `delete resto.ruta` sobre `LocationQuery`; `watch` con tupla `[ruta, vistaCargada]`.

## Deviations from Plan

Ninguna que cambie el alcance. Notas:

- Dos `q-dialog` (celular `maximized` con `slide-left`/`slide-right`; escritorio `position="right"`) con el mismo contenido, en lugar de uno con props dinámicas. Son ~10 líneas repetidas; se evitó un componente envoltorio por no ser necesario.
- La ruta sin ficha (`fichaProfe === null`) no muestra la sección "Ejercicios" ni el glosario de secciones: solo encabezado (sin tipo/brazo, que viven en la ficha), figura, leyenda, glosario, "No están en el dibujo", aviso de grupo, card "Músculos por rol" (con la marca de cada relación) y card "Ficha en preparación". Es lo que pide el plan; la lista real de ejercicios de esas 28 rutas queda sin mostrar y se puede sumar si Franco la quiere en el UAT.
- `figcol` sticky a `top: 100px` (alto del "← zona" 44 px + chips de sección). La altura de la figura se decide por ancho de pantalla (`< 672 px` → 230, si no 360) y el layout por container query (640 px); ambos coinciden para el diálogo maximizado y para el panel de 720 px.
- Hitbox: back de 44 px; los chips de sección miden 36 px de alto (son una barra de scroll horizontal con separación; el sketch usa ~29 px). Marcas de evidencia `sup` chicas por diseño del sketch, accesibles con foco y `aria-label`.
- Colores propios de la ficha (rojo de bandera `#b34a4a`, fondos de borrador/código) declarados como variables SCSS locales del componente, copiados de `base.css` del sketch, sin tocar `_anatomia.scss`.

## Estados extremos revisados a mano en el código

- FL y PS (fichas completas); cualquier otra ruta (`fichaProfe: null`): "Ficha en preparación" con músculos por rol.
- Sección `Pendiente` (cualquiera de las 9 incluido `escalones`): caja `.rficha__nota` "Pendiente: ... · kinesiólogo humano (⚑H) | Nacho (⚑N) | sin fuente en la investigación"; `fichaProfe.pendientes` al final bajo "Falta validar" (y chip de navegación solo si hay).
- Ruta sin ejercicios en el catálogo: "Sin ejercicios en el catálogo."; más de 20: lista en una columna con scroll (320 px).
- Nombre largo en el h1: `overflow-wrap: anywhere`. Código igual al nombre: no se repite el chip de código. `brazo: null`: sin chip. 1 ejercicio: "1 ejercicio".
- Tabla articular de 6 filas a 360 px: bloques apilados (thead oculto, "Contracción: C" como prefijo).
- Zonas repetidas con vistas distintas (FL `trapezius` back motor + both antagonista): clave `trapezius@back` y `trapezius`, la específica gana en la figura.
- Banderas: catálogo global resuelto por `banderaIds`; sin `notaInterna` (el tipo no la tiene). Agrupadas por nivel con los tres títulos pedidos; "umbral a validar (⚑H)" si `umbralH`.
- `?ruta=` inexistente: no abre y se limpia con `router.replace`; con la vista aún sin cargar no se toca la URL hasta que cargue.
- Volver: `router.back()` si se abrió con push desde la página, si no `replace` sin `ruta`; el back del navegador cierra porque el estado vive en la query. Escape y click en el fondo (escritorio) llaman al mismo cierre.

**No verificado en pantalla** (sin build ni navegador): scroll de `scrollIntoView` con los dos elementos sticky, apilado de los dos diálogos (el de la ficha se monta después de la hoja seamless, así queda arriba), alto del panel derecho (`100vh`) y el comportamiento de `container-type: inline-size` en el contenedor con scroll. Queda para el UAT.

## Known Stubs

Ninguno. Las 28 rutas con "Ficha en preparación" son el estado real del contenido (planes 17-22).

## Threat Flags

Ninguno fuera del threat model. T-200-34 (solo `{{ }}`, grep de `v-html` vacío; marcas estructuradas), T-200-35 (chip "Borrador · sin validar" con tooltip en toda ficha, incluida la de "en preparación"; "umbral a validar (⚑H)" en banderas), T-200-36 (`BanderaProfe` no tiene `notaInterna`; el componente no tiene dónde mostrarla) mitigados.

Deploy: el plan toca código de producción del admin (el `paths-filter` del admin dispara).

## Self-Check: PASSED

Archivos creados presentes y commits `6efdf8e3c`, `389be1d6e` y `1af0a3615` en `feat/200-anatomia`.
