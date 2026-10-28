---
phase: 200-anatomia-funcional
plan: 12
subsystem: admin
tags: [anatomia, admin, hoja-inferior, roles, escritorio]
requires: ["200-11"]
provides:
  - "AnatomySheet.vue: hoja seamless desde abajo (52vh / entera) con handle de arrastre"
  - "ZonaPanel.vue: contenido de una zona (con aviso de grupo) o de un músculo profundo"
  - "MusculoRoles.vue: roles como frase con (i) y chips de ruta nombre + código chico"
  - "AnatomiaPage completa: celular B2 (hoja) y escritorio (cuerpo izquierda, panel derecha)"
affects: [200-13]
tech-stack:
  added: []
  patterns:
    - "Estado de la hoja en route.query (zona, vista, musculo, ruta), validado contra el store"
    - "Cerrar la hoja usa router.replace (no apila historial); abrir usa router.push (back cierra)"
key-files:
  created:
    - el-templo-admin/src/components/anatomy/AnatomySheet.vue
    - el-templo-admin/src/components/anatomy/ZonaPanel.vue
    - el-templo-admin/src/components/anatomy/MusculoRoles.vue
  modified:
    - el-templo-admin/src/pages/AnatomiaPage.vue
key-decisions:
  - "Sin buscador (D7): el equivalente accesible del cuerpo es una lista de zonas invisible hasta recibir foco por teclado"
  - "Zona o músculo inexistente en la URL no abre nada (T-200-33); ?ruta=<slug> solo queda en la URL para el plan 13"
  - "El chip de 'se ve de frente/espalda' solo sale si el músculo tiene un lado y su región se ve de los dos (igual que el sketch)"
requirements-completed: [D6, D7, D8, D9, D10, R3, SC3]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 12: Navegación B2 de Admin › Anatomía Summary

**Tocar una zona abre una hoja desde abajo (media pantalla, arrastrable a entera o cerrar) con los músculos de la zona y sus roles como frase con (i); en escritorio el mismo contenido va en una card a la derecha del cuerpo.**

## Task Commits

1. **Task 1: AnatomySheet.vue** - `e032fb077` (feat)
2. **Task 2: ZonaPanel.vue y MusculoRoles.vue** - `2664c39db` (feat)
3. **Task 3: AnatomiaPage.vue completa** - `782aabf27` (feat)

## Verificacion

- Task 1 `<automated>` (el guard del worktree rechazó el compuesto, se corrió en partes con el mismo contenido): los 9 tokens (`seamless`, `position="bottom"`, `pointerdown`, `pointerup`, `setPointerCapture`, `update:full`, `aria-label="Cerrar"`, `prefers-reduced-motion`, `52vh`) presentes; sin `console.`/`any`/`v-html`/`addEventListener`: **OK**.
- Task 2 `<automated>`: `open-ruta`, `Esta zona es un grupo`, `Zona del dibujo`, `No está en el dibujo`, `Tocá la (i)` en ZonaPanel; `aria-expanded`, `frase`, `definicion`, `ejemplo`, `toUpperCase()`, `exacta`, `Todavía no hay rutas cargadas`, `open-ruta` en MusculoRoles; higiene limpia: **OK**.
- Task 3 `<automated>`: `AnatomySheet`, `ZonaPanel`, `$q.screen`, `query`, `musculo`, `No están en el dibujo`, `open-ruta`, `:selected` presentes; ninguna mención de glosario (ni en comentarios); higiene limpia: **OK**.
- Greps extra: sin `color: rgba(` ni `onUnmounted` en los archivos tocados.
- `prettier --write` (binario del checkout principal) sobre los archivos tocados antes de cada commit.
- No se corrió typecheck, build ni tests (sin `node_modules` en el worktree; CI no typechequea el admin).
- `git status --porcelain` vacío.

## Para el orquestador: archivos front-end tocados (correr `vue-tsc`)

- `el-templo-admin/src/components/anatomy/AnatomySheet.vue` (nuevo)
- `el-templo-admin/src/components/anatomy/ZonaPanel.vue` (nuevo)
- `el-templo-admin/src/components/anatomy/MusculoRoles.vue` (nuevo)
- `el-templo-admin/src/pages/AnatomiaPage.vue` (reescrita sobre la base del plan 11)

Puntos a mirar en vue-tsc: `v-model` + `v-model:full` sobre `AnatomySheet` (props `modelValue`/`full`, emits `update:modelValue`/`update:full`); `@pointerdown`/`@pointerup` con `PointerEvent` y `e.currentTarget instanceof Element` en `AnatomySheet`; `delete resto.zona` sobre `LocationQuery` en la página; `:aria-expanded` con boolean en `MusculoRoles`; `useQuasar` importado de `quasar`.

## Deviations from Plan

Ninguna que cambie el alcance. Notas de implementación:

- `AnatomySheet` suma la prop opcional `resetKey` (no está en el plan): al cambiar de zona o músculo con la hoja ya abierta, el scroll interno vuelve arriba. Se commiteó junto con la Task 3 porque la usa la página.
- La página conserva el último contenido (`ultima`) mientras la hoja se desliza al cerrar, para que no quede una card vacía durante la animación.
- Lista de zonas accesible (botones, uno por región visible) invisible hasta que algo recibe foco por teclado: pedida por las lecciones del plan 11 ("equivalente accesible del SVG"), sin buscador y sin link al glosario.
- Interpretación de "chips de precisión y vista (solo si `zona.vista` ≠ región `both`)": el chip "se ve de frente/espalda" sale cuando el músculo tiene un solo lado y su región se ve de los dos (trapecio, deltoides…), igual que el sketch (`m.zona.includes('@')`). En regiones de un solo lado sería redundante.
- Con la hoja abierta en el celular se agrega `padding-bottom: 52vh` a la página para que el cuerpo pueda scrollear por encima de la hoja.
- Cerrar la hoja usa `router.replace` (limpia `zona`, `vista`, `musculo`; conserva `ruta`); abrir o cambiar de zona usa `router.push` y descarta `ruta`.

## Estados extremos revisados a mano en el código

- Zona con 1 músculo (biceps, chest, tibialis): sin aviso de grupo (`esGrupo` es `> 1`); si el músculo se llama igual que la zona no se repite el h3 (`mostrarNombre` compara sin tildes), pero igual salen los chips de precisión.
- Zona con varios músculos (upper-back, deltoids, trapezius…): aviso "Esta zona es un grupo" con los nombres en minúscula y un bloque por músculo.
- Músculo sin rutas en un rol: esa fila no aparece. Sin rutas en ningún rol: "Todavía no hay rutas cargadas para este músculo." Un código de ruta que no existe en el store no genera un chip muerto.
- Nombre largo de ruta ("Espinales y planchas laterales"): el chip hace wrap (`white-space: normal`, `overflow-wrap: anywhere`, radio 18px), nunca corta ni desborda.
- Código igual al nombre (comparación en mayúsculas): no se repite el código chico.
- Músculo profundo: kicker "No está en el dibujo", sin chips de precisión (su `precision` es null); chips debajo del cuerpo, ocultos con la hoja abierta en el celular.
- Store en error: mensaje + "Reintentar"; cargando: spinner; sin vista tras el intento: "Todavía no hay contenido…".
- URL con `?zona=` o `?musculo=` inexistentes: no abre nada (T-200-33); `?musculo=` de un músculo con zona tampoco abre (solo profundos).
- 360/390/412 px: columna `max-width: 480px` con padding 16px, chips con wrap, `min-width: 0` en grilla y panel; sin anchos fijos.
- Escritorio (`>= md`): figura `both` sticky a la izquierda, card a la derecha; sin zona elegida dice "Tocá una zona del cuerpo o un músculo de los que no se ven."
- Escape cierra la hoja (q-dialog); el back del navegador cierra porque el estado vive en la query.
- Rol con definición ausente en el glosario: la frase cae al id del rol y la (i) abre una definición vacía (no debería pasar, el API siempre trae los 5).

**No verificado en pantalla** (sin build ni navegador en el worktree): el alto real de la hoja a 52vh frente al cuerpo de 300px, el scroll de `scrollIntoView` bajo el header fijo de Quasar (se usó `block: 'nearest'`) y el gesto de arrastre en un celular real. Queda para el UAT.

## Notas para el plan 13

- El chip de ruta emite `open-ruta` con el `slug`; la página hace `router.push({ query: { ...route.query, ruta: slug } })`. El plan 13 debe leer `route.query.ruta`, validarla contra `anatomyStore.rutaPorSlug` y montar la ficha a pantalla completa con "← <zona>" (el nombre de la zona/músculo sale de `zonaSel`/`musculoSel` de la página o del store).
- Con `ruta` abierta, la hoja sigue montada detrás si hay `zona`/`musculo` en la query (la ficha debe taparla, z-index mayor que el q-dialog seamless) y cerrar la ficha debería hacer `router.back()` o `replace` quitando solo `ruta`.
- `onSelectZone` y `onSelectMusculo` descartan `ruta` de la query.
- Deploy: el plan toca código de producción del admin (el `paths-filter` del admin dispara).

## Known Stubs

Ninguno. `?ruta=` solo queda en la URL por diseño del plan; la ficha llega en el 13.

## Threat Flags

Ninguno fuera del threat model. T-200-32 (solo `{{ }}`, grep de `v-html` vacío) y T-200-33 (zona y músculo validados contra el store, nunca interpolados como HTML) mitigados.

## Self-Check: PASSED

Archivos creados presentes y commits `e032fb077`, `2664c39db` y `782aabf27` en `feat/200-anatomia`.
