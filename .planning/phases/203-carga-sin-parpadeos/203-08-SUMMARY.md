---
phase: 203-carga-sin-parpadeos
plan: 08
subsystem: app-planes-page
status: complete
completed: 2026-10-28
requirements: [SC-1, D-01, D-04, D-07, D-08, D-17]
commits: [08892bbe3, a526003d7]
key-files:
  created:
    - el-templo-app/src/modules/plan/utils/planes-view.ts
    - el-templo-app/src/modules/plan/utils/__tests__/planes-view.test.ts
  modified:
    - el-templo-app/src/modules/plan/pages/PlanesPage.vue
---

# Phase 203 Plan 08: Planes aparece completa de una vez (SUMMARY)

Planes pide resumen, planes y catálogo de objetivos en el mismo tick (más `ensureMemberState()` para my-progress, que comparte la promesa del boot), arranca con los flags sin resolver y muestra un esqueleto por sección en su lugar; un pedido caído nunca se dibuja como "No hay planes disponibles".

## Qué quedó

- `utils/planes-view.ts`: `resolvePlanesView(input)` pura (sin stores, red ni reloj). `page` 'skeleton' mientras falte una fuente y no venza el tope; después `tuPlan` (skeleton / show / error), `objetivos` (skeleton / show / hide), `regulares` (skeleton / content / empty / error) y `enrollment` (known / unknown). Las fallas cuentan como resueltas (salen al instante); el tope es solo para lo que tarda; sin perfil Tu plan queda en esqueleto también con el tope vencido (D-08).
- `PlanesPage.vue`:
  - `onMounted`: `deadline.start()` UNA vez y `Promise.allSettled([loadSummary(), loadPlans(), loadCatalog(), userStore.ensureMemberState()])`, sin `await` antes. `onBeforeUnmount` llama `deadline.cleanup()`.
  - La cadena en fila planes -> catálogo -> my-progress desapareció: tres funciones independientes. `getMyProgress` ya no se usa; `enrolledProgramId` es un `computed` sobre `userStore.myProgress`.
  - Flags `summarySettled`, `plansSettled`, `catalogSettled` arrancan en `false`; desaparecieron `catalogLoading`, `summaryLoading` y los dos `TemploLoader` (más el estilo `.planes-loading`).
  - `today` es un `computed<string | null>` reactivo al perfil (`null` sin perfil); `timeline` solo se calcula con resumen y `today`.
  - Esqueletos con `CardSkeleton`: Tu plan (`dark`, 200 px), Por objetivos (título + 120 px), regulares (título + 2 x 96 px). Se ven los tres a la vez en `view.page === 'skeleton'` porque en ese estado las tres secciones valen 'skeleton' (mismo resultado visual que tres bloques apilados, sin duplicar el markup).
  - "No hay planes disponibles" solo bajo `view.regulares === 'empty'`; planes caídos: "No pudimos cargar los planes." con Reintentar.
  - Cards de Por objetivos: "Ya estás inscripto" / "Más info" solo con `view.enrollment === 'known'`.
  - `loadSummary(retry = false)`: `markSeen()` / `clearPlanUpdateUnseen()` y los `isNew` de la visita sin cambios.

## Commits

- `08892bbe3` feat(203-08): resolvePlanesView, vista pura de Planes (D-04, D-07, D-08)
- `a526003d7` fix(203-08): Planes aparece completa, en paralelo y sin 'No hay planes' antes de tiempo (D-04)

## Tests escritos, pendientes de correr (D-17)

No se corrió vitest ni `vue-tsc`. Sí prettier y eslint (`-c ./eslint.config.js`) sobre los 3 archivos: sin hallazgos. Los greps de `<verify>` y los criterios de aceptación dan OK (el `grep -nE ': any'` solo matchea `overflow-wrap: anywhere`).

1. `el-templo-app/src/modules/plan/utils/__tests__/planes-view.test.ts` (24 casos): esqueleto inicial, todo resuelto, vacío 2xx, error != vacío (con y sin tope, con resumen pendiente), reintento de planes, catálogo vacío / fallido, resumen fallido / en reintento, sin perfil (con y sin tope), tope con catálogo / resumen / planes pendientes, my-progress pendiente / OK / falla con y sin inscripción conocida.

Los tests solo leen lo que devuelve `resolvePlanesView` (verificado contra el código escrito). La página no tiene suite de componentes.

## Deviations from Plan

1. **[Rule 1] Reintento de planes con `plansRetrying` en lugar de `plansSettled = false`.** El plan pedía volver `plansSettled` a false al tocar Reintentar. Pero `allIn` pasa a false y, antes de los 6 s, `resolvePlanesView` devolvería `page: 'skeleton'`: un toque en Reintentar dentro de los primeros 6 s dejaría la página ENTERA en esqueleto (incluida Tu plan ya cargada), lo contrario de lo que pide el plan ("solo los regulares vuelven al esqueleto"). Se copió el patrón de `summaryRetrying`: nuevo campo `plansRetrying` en `PlanesViewInput`, `plansSettled` se queda en true, `regulares` = 'skeleton' durante el pedido. Cubierto con un test.
2. **Empty condicionado a `view.objetivos === 'hide'`.** El plan decía "No hay planes disponibles SOLO si 'empty'". Se agregó además que Por objetivos esté oculto: antes solo aparecía si no había planes NI objetivos; sin la condición, con objetivos y 0 regulares aparecería un texto nuevo; y con el catálogo todavía pendiente (tope vencido) afirmaría "no hay planes" para después empujarlo con los objetivos. Sigue cumpliendo que el texto solo vive bajo `view.regulares === 'empty'`.
3. **`plansFailed` se pasa como `plansFailed && plans.length === 0`** (igual que el resumen): una falla con datos previos no pasa a error. Hoy no ocurre (planes no se recargan sin Reintentar), es defensa.
4. **No hay rama `view.page === 'skeleton'` en el template** (ver arriba): equivalente visual, sin markup duplicado.
5. **Etiqueta de los esqueletos:** todos usan `label="Cargando planes"` (cada `CardSkeleton` es un `role="status"`, por lo que un lector de pantalla puede anunciarlo varias veces). Conservador; se puede afinar.
6. **Foot de las cards de objetivos:** con `enrollment === 'unknown'` el `div.pc__foot` queda vacío (solo su margen de 6 px): al resolverse my-progress la card crece unos 44 px. Solo ocurre si my-progress falla o tarda más que el tope; se prefirió no tocar los estilos del foot (afecta a las cards de regulares).

Riesgos del plan 07 aplicados: este plan NO usa el flag "tuvo contenido" (`record()`/`resolveSlot` no se llaman acá; el que lo use debe llamarlo solo tras 2xx). `deadline.start()` está únicamente en `onMounted`, nunca dentro de un `watch`. `CardSkeleton`: ver riesgos.

## Riesgos antes del plan 09

- **Esqueleto en cada visita:** `summarySettled`/`plansSettled`/`catalogSettled` son locales a la página y arrancan en false; cada vez que el socio entra a Planes ve el esqueleto hasta que llegan los tres pedidos (no hay caché del resumen). Es lo pedido (D-04), pero con buena red es un parpadeo breve de esqueleto en lugar de contenido. Mirarlo en el UAT C-1 / C-12..C-16.
- **`CardSkeleton` no verificado visualmente:** su alto depende de que `.card-skeleton__block` (scoped, 0,2,0) gane sobre el `height: 50px` de `q-skeleton--type-rect`. Primer uso real: mirar los 200/120/96 px en el navegador. Lo mismo para el título esqueleto (`.planes-title-sk`, 16 px sobre `q-skeleton--type-text`, también por especificidad); los altos 200/120/96 y 16 son los del plan, no medidos contra las cards reales (el plan dice medir contra `.tp-card`/`.pc`, pero no tienen alto fijo).
- **Sin perfil, Tu plan en esqueleto indefinido:** si `/auth/me` nunca llega, Tu plan queda en esqueleto (D-08 > D-07); las demás secciones salen al vencer el tope. Depende de `retryProfileLoad` del boot para recuperarse.
- **Tope y boot:** `useLoadDeadline` arranca al montar la página, no al abrir la app.
- **Sin node_modules propios:** commits con prettier/eslint corridos a mano; `vue-tsc` pendiente (los tipos de `view`, `today` y `userStore.myProgress?.programId` se verificaron leyendo las firmas, no compilando).
- `ensureMemberState()` sin opciones puede traer una carga de `refresh` (my-progress + programas) si el estado tiene más de 15 s; es un pedido compartido, no uno propio de la página.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-203-21 mitigado: con resumen fallido o pendiente no se afirma plan (error con Reintentar / esqueleto); sin perfil no hay "hoy".

## Self-Check: PASSED

- `planes-view.ts`, `planes-view.test.ts` y `PlanesPage.vue` existen; greps de `<verify>` de ambas tareas OK.
- Commits `08892bbe3` y `a526003d7` presentes en `feat/203-carga-sin-parpadeos`.
