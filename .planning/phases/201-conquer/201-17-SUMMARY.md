---
phase: 201-conquer
plan: 17
subsystem: app
tags: [conquer, app, entrenar, bloqueado, inicio, niveles]
requires: ["201-16"]
provides:
  - "components/ConquerTab.vue: raíz de la tab (cargando / error con Reintentar / Bloqueado-pedido / Inicio)"
  - "components/ConquerBlocked.vue: portada + Modo premium + Quiero desbloquearlo -> Ya le avisamos al equipo"
  - "components/ConquerHome.vue: Inicio con dos puntos de extensión comentados para 201-18/19/20"
  - "pages/ConquerLevelsPage.vue y ruta conquer-niveles (training/conquer/niveles)"
  - "EntrenarView y EntrenarVidriera cargan ConquerTab con defineAsyncComponent"
affects: [201-18, 201-19, 201-20]
tech-stack:
  added: []
  patterns: ["cada pantalla de Conquer es su propia raíz CqSky (la Tab no envuelve)", "chunk aparte por defineAsyncComponent"]
key-files:
  created:
    - el-templo-app/src/modules/conquer/components/ConquerTab.vue
    - el-templo-app/src/modules/conquer/components/ConquerBlocked.vue
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/conquer/pages/ConquerLevelsPage.vue
  modified:
    - el-templo-app/src/modules/training/routes.ts
    - el-templo-app/src/modules/training/pages/EntrenarView.vue
    - el-templo-app/src/modules/training/components/EntrenarVidriera.vue
decisions:
  - "ConquerTab NO es un CqSky que envuelve: cada estado (cargando/error, Bloqueado, Inicio) es su propia raíz CqSky. Anidar dos CqSky duplicaría el padding y el overflow."
  - "Bloqueado: CqSky con padding 0 y gap 0 (portada flush); 'Modo premium' va en un bloque blanco encima del pie plain (CqCloudButton plain), porque el slot de CqCloudButton cae debajo del botón."
  - "La celda del plan muestra estado (Hecha / Te toca / Pendiente) + label del API: home.plan no trae el día de la semana, así que no hay 'Lun/Mar' como en el prototipo."
---

# Phase 201 Plan 17: Tab Conquer — Bloqueado, Inicio y El camino Summary

La tab Conquer de Entrenar (y de la vidriera sin plan, D-17) ya muestra la pantalla real según el estado del alumno: Bloqueado con el pedido de desbloqueo, Inicio con los datos de `GET /state` y El camino de niveles. Reemplaza los dos `ComingSoonPane kind="conquer"`.

## Commits

- `feat(201-17): tab Conquer con Bloqueado y pedido de desbloqueo (D-12, D-17)`
- `feat(201-17): Inicio de Conquer y el camino de niveles (§7.1)`
- `docs(201-17): summary del plan 17` (este archivo)

## Qué quedó

- **ConquerTab**: `loadState()` al montar, `store.cleanup()` al desmontar. `store.view`: `inicio` -> `ConquerHome`; `bloqueado`/`pedido` -> `ConquerBlocked`; si no, `CqSky` con loader dorado o, si `store.error`, el mensaje + `CqCloudButton` "Reintentar" (`:loading`).
- **ConquerBlocked**: portada `/conquer/portada.jpg` con el `alt` del prototipo, "Modo premium" y `CqCloudButton plain` "Quiero desbloquearlo" (`:loading="store.requesting"`, T-201-77). Si `status = pedido` el botón se reemplaza por un pie con "Ya le avisamos al equipo". Si `requestUnlock()` da `false` y hay `store.error`, `$q.notify` negativo.
- **ConquerHome**: `CqSun` ("CONQUER", "Semana N" = `blockWeek`, nombre del nivel y `CqLevelIcon` 44); el camino de niveles es un `router-link` a `conquer-niveles` (los 3 íconos, el actual más grande, "El camino de Milón"); "Tu semana" con `home.plan` (Hecha / Te toca / Pendiente; "Semana completa" si `weekComplete`); "Última marca" con `home.lastByDay` (E1 con `unitText`, sub `label · d/m`); aviso de control: `day0Pending` -> "Tu control del día 0 está pendiente", `due` -> "Toca tu control físico" (solo texto). Puntos de extensión: `<!-- 201-19/20: accesos ... -->` (después del aviso) y `<!-- 201-18: CTA principal -->` (al final, tras un `cq-grow`).
- **ConquerLevelsPage**: `CqPageHeader` (vuelta a `/training?tab=conquer`), leyenda de Milón, 3 niveles de `LEVEL_INFO` con ícono y "Tu nivel" en el del alumno, y "Volver al inicio" (`CqCloudButton`). Si se entra directo (recarga) pide `loadState()` una vez.
- Ruta `training/conquer/niveles` (`conquer-niveles`, `requiresAuth`) en `modules/training/routes.ts`.
- `EntrenarView.vue` y `EntrenarVidriera.vue`: `const ConquerTab = defineAsyncComponent(() => import('src/modules/conquer/components/ConquerTab.vue'))`. En la vidriera se quitó el import de `ComingSoonPane` (ya no se usa); en Entrenar sigue vivo para Desafíos.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `pnpm lint` (app): 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`), tras cada tarea.
- `vue-tsc` (binario de et-195-seo) filtrado por `src/modules/conquer|modules/training/(pages/EntrenarView|components/EntrenarVidriera|routes)`: vacío tras cada tarea.
- Los dos `verify` del plan (greps de contenido, `defineAsyncComponent`, sin `kind="conquer"`, sin `console.`/`any`/`color: rgba`/Google Fonts): OK.
- `prettier --check` sobre rutas explícitas: OK (`ConquerLevelsPage.vue` se reformateó con `--write`).
- `sass` del app compiló el `<style>` de los 4 componentes (extraídos al scratchpad) sin errores.
- Vitest NO se corrió (regla de la fase). Este plan no agrega lógica pura nueva, así que no hay tests nuevos.

## Mutantes razonados

Plan sin tests nuevos (solo vistas y wiring): no hay `expect` que cite. Cobertura existente de lo que consume: `resolveConquerView` está en `conquerView.test.ts` (201-16) y `unitText` en `format.test.ts`; las pantallas se validan en el UAT (201-24).

## Desvíos del plan

Ninguno de fondo. Ambigüedades nuevas (opción más simple):

- **Día de la semana en la celda.** El prototipo muestra "Lun/Mar"; `home.plan` solo trae `dayKey` + `label` (Plancha, Front...). La celda muestra el estado (Hecha / Te toca / Pendiente) arriba y el `label` abajo. "Te toca" en vez de "Hoy" porque D-16 puede ser un día anterior de la semana.
- **Marcas unilaterales.** `HomeLastByDay.e1` no trae si el ejercicio es unilateral, así que `unitText(..., false)` nunca escribe "por lado" en Inicio (el prototipo lo mostraba para Dominada arquera). Arreglarlo es un campo `unilateral` en el schema de `home` del API.
- **Grilla de la semana.** `repeat(auto-fit, minmax(76px, 1fr))`: cabe 4 por fila a 390 px; Toro con 5 días baja el quinto a un segundo renglón (los labels largos como "Dominadas" no se desbordan). Mirar en el UAT si se prefiere 3+2 o una fila con letra menor.
- **Bloqueado a pantalla completa.** Sin espaciador entre portada y pie: si la pantalla es más alta que la portada, el cielo estrellado queda debajo del pie blanco (el prototipo es `min-height: 0` igual).
- `cq-enter` no se aplicó a las raíces: sus reglas son `.cq-root .cq-enter` (descendiente), y `CqSky` ya ES `.cq-root`. Si 201-18+ quiere entrada animada, aplicarla a un hijo directo o ajustar la regla del scss.

## Trampas / notas para los planes siguientes

- Cada estado de la Tab es su propia raíz `CqSky`; las pantallas nuevas (Hoy, Progreso, Evolución) van como rutas o como estados de la Tab con su propio `CqSky`, nunca dentro de otro.
- `ConquerTab` desmonta -> `store.cleanup()` (aborta lo que esté en vuelo y apaga `loading`). `ConquerLevelsPage` hace lo mismo; el `state` del store se conserva entre pantallas, así que volver a Inicio muestra datos al instante y recarga por encima.
- Para pisar el padding de `CqSky` desde un padre usar `.mi-clase.cq-sky` (mayor especificidad que el scoped de `CqSky`), como en `ConquerBlocked`.
- El aviso de control en Inicio es un `div.cq-toast` con punto de sol (no clickeable). 201-20 lo convierte en el botón hacia el control físico; `mustPromptDay0` (primera vez) todavía no se usa: es el flujo del día 0 de 201-20.
- Los puntos de extensión de `ConquerHome` son comentarios `<!-- 201-18: CTA principal -->` y `<!-- 201-19/20: accesos ... -->`: el CTA va como `CqCloudButton` (pie de nubes) en el lugar del primero.
- `ConquerLevelsPage` y `EntrenarVidriera` usan `calc(var(--app-vh) - 50px - var(--mobile-tabs-height))` como alto mínimo; mirar en el UAT en escritorio (`>= 768px`) por si hay que ajustar.

## Known Stubs

Ninguno. `ConquerHome` ya no es el mínimo de la Task 1; los accesos y el CTA son puntos de extensión documentados para 201-18/19/20, no datos falsos.

## Self-Check: PASSED

Los 4 archivos nuevos existen y los commits `feat(201-17)` (tab/Bloqueado y Inicio/niveles) están en `git log`.
