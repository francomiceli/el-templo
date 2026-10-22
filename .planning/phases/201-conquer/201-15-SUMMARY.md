---
phase: 201-conquer
plan: 15
subsystem: app
tags: [conquer, entrenar, tabs, comunicaciones, destinos]
requires: ["201-14"]
provides:
  - "ENTRENAR_TABS_ENABLED = true y ENTRENAR_DESAFIOS_ENABLED = false (featureFlags.ts)"
  - "modules/training/utils/entrenarTabs.ts: TabKey, TabFlags, ENTRENAR_TAB_FLAGS, visibleTabKeys, queryTabKeys, tabFromQuery"
  - "Entrenar con dos tabs (Semana, Conquer) y ?tab=conquer; la vidriera sin plan con tabs interactivas"
  - "Destino de Comunicaciones key conquer -> /training?tab=conquer en API, admin y app"
affects: [201-16, 201-17, 201-18, 201-19, 201-20]
tech-stack:
  added: []
  patterns: ["util puro con flags inyectados y constante ENTRENAR_TAB_FLAGS con los reales", "lista blanca de ?tab= (T-201-53)"]
key-files:
  created:
    - el-templo-app/src/modules/training/utils/entrenarTabs.ts
    - el-templo-app/src/modules/training/utils/__tests__/entrenarTabs.test.ts
  modified:
    - el-templo-app/src/config/featureFlags.ts
    - el-templo-app/src/modules/training/components/EntrenarTabs.vue
    - el-templo-app/src/modules/training/pages/EntrenarView.vue
    - el-templo-app/src/modules/training/components/EntrenarVidriera.vue
    - el-templo-api/src/modules/communications/destinations.ts
    - el-templo-api/test/communications/destinations.test.ts
    - el-templo-api/test/communications/destinations-sync.test.ts
    - el-templo-admin/src/config/destinations.ts
    - el-templo-app/src/config/destinations.ts
decisions:
  - "TabKey vive en entrenarTabs.ts y EntrenarTabs.vue lo re-exporta (export type) para no romper imports."
  - "ENTRENAR_TAB_FLAGS (los flags reales) se exporta del util: EntrenarTabs, EntrenarView y la vidriera comparten una sola fuente."
  - "Conquer deja de llevar el punto ocre de pronto; solo Desafios lo conserva (hoy oculto)."
---

# Phase 201 Plan 15: Puerta de entrada a Conquer en Entrenar y destino del pop-up Summary

Entrenar vuelve a tener tabs, solo Semana y Conquer (D-10): `?tab=conquer` abre Conquer, cualquier otro valor abre Semana, y quien no tiene plan puede abrir la tab Conquer sin desenfoque (D-17). Comunicaciones suma el destino `conquer` -> `/training?tab=conquer` igual en las tres apps (D-11, solo la plomería). El pane de Conquer sigue siendo `ComingSoonPane`: 201-17 lo reemplaza.

## Commits

- `1d6c65696` feat(201-15): tabs de Entrenar con Semana y Conquer, también desde la vidriera (D-10, D-17)
- `c674cea59` feat(201-15): destino 'Conquer' para los pop-ups de Comunicaciones (D-11)
- `docs(201-15): summary del plan 15` (este archivo)

## Qué quedó

- `featureFlags.ts`: `ENTRENAR_TABS_ENABLED = true`, `ENTRENAR_DESAFIOS_ENABLED = false` (comentarios con la decisión).
- `entrenarTabs.ts` (puro, el test lo importa sin Vue): `visibleTabKeys` (semana, libre?, desafios?, conquer; sin tabs `['semana']`), `queryTabKeys` (visibles menos semana), `tabFromQuery(raw, allowed)` (array -> primer elemento; no permitido -> `'semana'`).
- `EntrenarTabs.vue`: `TABS` sale de `visibleTabKeys(ENTRENAR_TAB_FLAGS)`; Conquer sin punto "pronto"; fallback de la grilla en 2 columnas.
- `EntrenarView.vue`: `QUERY_TABS = queryTabKeys(ENTRENAR_TAB_FLAGS)`, `tabFromRoute` envuelve al util; el pane Conquer sigue con `ComingSoonPane kind="conquer"`.
- `EntrenarVidriera.vue` (D-17): las tabs salen del fondo `inert`, interactivas, con `activeTab` inicial desde `?tab=`. Con `semana` se ve igual que antes (fondo desenfocado + tarjeta "Activá Tu Plan") dentro de un `.vidriera__stage`; con `conquer` se renderiza (v-if, nunca v-show) un `<section role="tabpanel">` con `ComingSoonPane`, sin blur ni tarjeta. `.vidriera` pasó a flex columna (tabs de alto natural + escenario `flex: 1`).
- Destinos: tupla `{ key: 'conquer', label: 'Conquer', route: '/training?tab=conquer' }` al final de `APP_SECTIONS` y `'conquer'` al final de `AppSectionKey` en las 3 copias (comentario ARRIBA de la tupla); `appSectionForRoute('/training?tab=conquer')` -> `'conquer'`. Sin migración.

## Gates corridos

- Pre-flight `node_modules`: OK.
- App: `pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`). `vue-tsc` filtrado por `modules/training|config/featureFlags|modules/conquer|config/destinations`: vacío.
- Admin: `pnpm lint` 0 errores (8 warnings preexistentes en `env.d.ts`, `CobrosPage.vue`, `session-pdf-builder.ts`); `vue-tsc` filtrado por `config/destinations|comunicaciones`: vacío.
- API: `npx tsc --noEmit` OK; `pnpm lint:tenant` `DISCREPANCIAS: 0`; `pnpm typecheck:tests | grep test/communications/destinations`: vacío.
- Regex del sync test (`key/label/route` contiguos) emulada con `node` sobre los dos espejos: 10 tuplas cada uno, la última es la de Conquer; la API importa directo (10).
- Higiene (`console.*`, `any`, Google Fonts) sobre todo lo tocado: sin hallazgos.
- Vitest NO se corrió (regla de la fase); los tests nuevos y los ajustes de conteo corren en CI.

## Mutantes razonados

Los de la tarea 1 se corrieron sobre una copia del util en el scratchpad (sin el import de `featureFlags`, que no resuelve fuera de Vite) con un script `node` que replica los `expect`; producción quedó intacta.

1. `visibleTabKeys` ignora el flag de Desafíos (`keys.push('desafios')` incondicional): el script da `false` en el caso `['semana','conquer']`; en CI falla `entrenarTabs.test.ts:7` (`toEqual(['semana','conquer'])`) y `:14`.
2. `tabFromQuery` acepta cualquier string no vacío: el script da `false` en `'desafios'` -> `'semana'`; en CI falla `entrenarTabs.test.ts:69-70` y el `it.each` de `:78-81` (`'CONQUER'`, `'semana'`... con `''`/`42`/`{}`).
3. (Razonado, API) quitar la tupla `conquer` del espejo de la app: falla `destinations-sync.test.ts:72` (`toHaveLength(10)`) y `:80` (igualdad con la API).
4. (Razonado, API) quitar el `case "/training?tab=conquer"` de `appSectionForRoute`: falla `destinations.test.ts:96` (`toBe("conquer")`). Cambiar la ruta de la API a otra: falla `destinations.test.ts` (`toBe("/training?tab=conquer")` de `resolveDestinationRoute` y `fallbackRouteFor`) y el sync de ambos espejos.

## Desvíos del plan

- **[Rule 3 - bloqueante]** `test/communications/destinations-sync.test.ts` (no estaba en `files_modified`) fija "exactamente 9 secciones" en tres `it`: con el destino nuevo rompía en CI. Se actualizó a 10 con comentario fechado.
- **[Rule 2]** Se agregó un test del destino `conquer` (ruta, fallback, `validateDestination` ok) y uno de `appSectionForRoute`; el plan solo pedía subir el conteo.
- Ambigüedad nueva: `ENTRENAR_TAB_FLAGS` se exporta desde `entrenarTabs.ts` (importa `featureFlags`) en vez de repetir el objeto de flags en tres componentes. El test de CI lo importa sin problema (alias `src` de vitest).
- Los dos espejos (`admin`/`app` `destinations.ts`) NO se pasaron por prettier: están a ancho 80 de origen y prettier del paquete los reformaba en líneas ajenas; se imitó el estilo del archivo.

## Trampas para los planes siguientes

- 201-17: el pane Conquer vive en DOS lugares con `ComingSoonPane kind="conquer"`: `EntrenarView.vue` (rama `v-else`) y `EntrenarVidriera.vue` (`<section v-else>`, para quien no tiene plan, D-17). Reemplazar ambos por la tab real; en la vidriera el contenedor es `.vidriera__pane` (flex, scroll vertical propio, sin blur).
- El `id`/`aria-labelledby` de los panes salen de `paneId('conquer')`/`tabId('conquer')` (exportados por `EntrenarTabs.vue`).
- `TabKey` se importa de `../utils/entrenarTabs` (o del `.vue`, que lo re-exporta).
- Si se prende Libre o Desafíos más adelante basta con el flag: la lista de tabs y la lista blanca de `?tab=` salen de `ENTRENAR_TAB_FLAGS`.
- `SemanaTab` en la vidriera ya no está bajo un `EntrenarTabs` inert; sigue dentro de `.vidriera__bg` (`inert` + blur) con `v-if`, así que `getBBox` de la figura mide con el contenedor visible.
- Un build viejo abre `/training` y cae en Semana al tocar el pop-up de Conquer (no rompe).
- D-11 NO queda completo: falta el boceto del pop-up y crear el aviso "una vez a todos" (paso humano posterior).

## Known Stubs

`ComingSoonPane kind="conquer"` en Entrenar y en la vidriera: intencional, lo reemplaza 201-17.

## Self-Check: PASSED

Archivos creados existen (`entrenarTabs.ts`, `entrenarTabs.test.ts`); commits `1d6c65696` y `c674cea59` en `git log`.
