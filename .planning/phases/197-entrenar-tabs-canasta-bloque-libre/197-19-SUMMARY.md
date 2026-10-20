---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 19
subsystem: app-training
tags: [entrenar, tabs, vidriera, d-02, d-05, d-06]
requires: ["197-18"]
provides:
  - pages/EntrenarView.vue (Entrenar con 4 tabs: Semana, Libre, Desafíos, Conquer)
  - components/EntrenarTabs.vue (tabs "puertas" accesibles, exporta TabKey, tabId, paneId)
  - components/ComingSoonPane.vue (Próximamente)
  - components/EntrenarVidriera.vue + data/vidriera-sample.ts (sin plan, D-06)
affects: [197-20]
key-files:
  created:
    - el-templo-app/src/modules/training/components/EntrenarTabs.vue
    - el-templo-app/src/modules/training/components/ComingSoonPane.vue
    - el-templo-app/src/modules/training/pages/EntrenarView.vue
    - el-templo-app/src/modules/training/components/EntrenarVidriera.vue
    - el-templo-app/src/modules/training/data/vidriera-sample.ts
  modified:
    - el-templo-app/src/modules/training/pages/TrainingIndex.vue
  deleted:
    - el-templo-app/src/modules/training/pages/WeeklyView.vue
    - el-templo-app/src/modules/training/components/WeekCarousel.vue
    - el-templo-app/src/modules/training/components/DayCard.vue
requirements: [D-01, D-02, D-05, D-06, D-17, D-18]
---

# Fase 197 Plan 19: Entrenar en 4 tabs y vidriera sin plan — Summary

La pantalla Entrenar nueva queda montada de punta a punta: tabs "puertas", panes de Semana (`useTrainingWeek` + `SemanaTab`), Libre (`LibreTab`) y Próximamente, apertura por `?tab=`, y la vidriera desenfocada para quien no tiene plan. El carrusel viejo (`WeeklyView`, `WeekCarousel`, `DayCard`) ya no existe.

## Commits

- `66b07f859` feat(197-19): Entrenar en 4 tabs (D-02, D-05)
- `859ed2995` feat(197-19): vidriera sin plan (D-06) y fin del carrusel de dias

## Qué se hizo

1. **`EntrenarTabs`**: `role="tablist"`/`tab`, `aria-selected`, `aria-controls`, tabindex móvil; flechas izquierda/derecha (más Home/End) mueven la selección y el foco. Grilla de 4 (gap 6), alto 44, elegida `#2c2318` con crema y `pd-line` (left/right 10), sin sombra; punto `$pd-soon-dot` con texto "pronto" oculto para lectores en Desafíos y Conquer. Contenedor sticky. Con `interactive=false` no emite nada y pone `inert`.
2. **`ComingSoonPane`**: ícono 40 px en círculo de 88 px, kicker "Próximamente", `<h2>` 28 px y texto 13 px (máx. 280) con los copys del sketch.
3. **`EntrenarView`**: tab inicial = `route.query.tab` si es `libre`/`desafios`/`conquer`, si no Semana (T-197-45); `watch` de `route.query.tab`. Panes con `v-if` (nunca `v-show`), cada uno `role="tabpanel"` con `id` = `aria-controls` de su tab. Semana: `loading` -> `TemploLoader`, `error` -> banner "Reintentar", si no `SemanaTab` con `gender` del perfil; `start`/`redo` -> `goalPlan-session` o `day-player`, `summary` -> `session-summary`, `go-libre` -> tab Libre. `onUnmounted` llama `week.cleanup()`.
4. **`vidriera-sample.ts`**: `buildVidrieraWeek(monday, today = monday)` con 5 días de sesión (S_PULL, S_MU, S_FRI, S_MU, S_FRI del sketch, con `zones`/`groups`), sábado ROM y domingo sin plani. Sin API.
5. **`EntrenarVidriera`**: fondo = tabs + `SemanaTab` (ambos `interactive=false`) en un contenedor `aria-hidden` + `inert` + `pointer-events: none` + `blur(6px)`; encima, `PremiumDialogCard` dark sin kicker ni ícono, "Activá Tu Plan", texto y CTA de WhatsApp (degradé `$pd-wa-a -> $pd-wa-b`, mismo mensaje que antes). Entrada animada solo bajo `prefers-reduced-motion: no-preference`.
6. **`TrainingIndex`**: loader + `FirstVisitTipBanner` + `canEnterTraining` intactos; el bloque "Activá Tu Plan" pasó a `<EntrenarVidriera v-else-if>` y `WeeklyView` a `<EntrenarView v-else>`. Se sacó el CSS y el `openWhatsApp` que quedaron sin uso.
7. **Borrados**: `grep` en todo `el-templo-app/src` antes de borrar: solo quedaban comentarios. `BlockCard.vue` se queda (lo usa `SessionSummary`).

## Hand-offs honrados

(a) `v-if` por pane. (b) `?tab=libre` abre Libre, si no Semana. (c) Al activar Libre, si el store ya había cargado se llama `loadFirstPage()`; volver del player libre remonta la página y cae en el mismo `watch` (inmediato). Si todavía no cargó, la primera carga la hace `LibreTab` (sin pedido duplicado). (d) `loading` evita el parpadeo de "Sin plani": `week.load()` se dispara en el `setup`, así el primer render ya está en `true`. (e) `cleanup()` en `onUnmounted`. (f) Vidriera estática, inerte y con "Reducir movimiento".

## Verificación (estática)

Los dos `<verify>` imprimen `OK`. Higiene: sin `console.`, `any`, `color: rgba(`; ninguna línea > 100 columnas; los cinco scripts parsean con `node --experimental-strip-types --check`. Sin typecheck/tests/lint locales (sin `node_modules`).

## Desvíos/decisiones

- **`EntrenarView` es un `div`, no un `q-page`**: `TrainingIndex` ya es el `q-page` (con `max-width: none` y fondo transparente). `WeeklyView` anidaba otro `q-page` con altura fija; ahora la página scrollea normal y el `q-footer` ya suma su padding.
- **Tabs pegajosas debajo del header fijo**: con `top: 0` quedarían tapadas por el `q-header` (vista `lHh`, header fijo). `EntrenarView` mide `.q-header` (`offsetHeight`, 0 si no hay, como en desktop) al montar y en `resize`, y lo publica como `--entrenar-tabs-top`. Sin esto la "tab pegajosa" no sería visible al scrollear.
- **`TabKey`, `tabId`, `paneId` se exportan desde un `<script>` normal de `EntrenarTabs.vue`** (junto al `<script setup>`), para que los `id`/`aria-controls` no se repitan como strings en `EntrenarView`.
- **`buildVidrieraWeek` recibe un 2º parámetro opcional `today`** (por defecto el lunes): hace falta para marcar "hoy" y los días hechos de la semana de ejemplo; el contrato de 1 argumento sigue valiendo. Si hoy es domingo, la vidriera elige el viernes como día visible.
- **`redo` y `start` van al mismo handler**: la confirmación de "Hacerla igual" ya la hace `SemanaHero`.
- **`BlockChoiceCard.vue` queda sin uso y NO se tocó** (D11: tiene cambios sin commitear de Franco en el checkout principal). Pendiente de borrar con su OK.
- Comentarios viejos que nombran `WeeklyView`/`DayCard` (p. ej. `useUserStore.ts`, `SessionSummary.vue`, `SessionSummaryPage.vue`, `BlockChoiceCard.vue`) quedaron sin tocar: fuera de alcance.
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno en código existente.

## Para el orquestador

- Con `noUncheckedIndexedAccess` apagado el app compila `list[4]`/`TABS[target]`; el CI no typechequea el app: conviene un `vue-tsc` local antes del push.
- Revisar en la app real: sticky de las tabs (offset del header en Android/iOS con safe area) y la vidriera con el blur en un teléfono viejo.
- `BlockChoiceCard.vue` pendiente (ver arriba).

## Known Stubs

Ninguno. La plani de la vidriera es contenido de ejemplo intencional (D-06), no un stub de datos reales.

## Self-Check: PASSED

Los 5 archivos nuevos existen, los 3 borrados no existen y los commits `66b07f859` y `859ed2995` están en `feat/197-entrenar`.
