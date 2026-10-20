---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 18
subsystem: app-training
tags: [libre, canasta, ui, d-04, d-12]
requires: ["197-17"]
provides:
  - components/libre/LibreTab.vue (tab Libre, container con useFreeBlocksStore)
  - components/libre/FreeBlockCard.vue (card de bloque de la canasta)
  - components/libre/ZoneChips.vue (chips de zona accesibles)
affects: [197-19]
key-files:
  created:
    - el-templo-app/src/modules/training/components/libre/LibreTab.vue
    - el-templo-app/src/modules/training/components/libre/FreeBlockCard.vue
    - el-templo-app/src/modules/training/components/libre/ZoneChips.vue
requirements: [D-04, D-07, D-09, D-10, D-12, D-18]
---

# Fase 197 Plan 18: Tab Libre — Summary

La tab Libre quedó lista para montarse en 197-19: título 28 px, aviso de AURA, sugerencia salvia, figura tocable, chips de zona, contador y lista de cards que abren el player libre.

## Commits

- `66654ff09` feat(197-18): chips de zona y card de bloque de la canasta
- `f8b41ed38` feat(197-18): tab Libre (D-04)

## Verificación (estática)

Los dos `<verify>` del plan imprimen `OK`. Higiene limpia: sin `console.`, `any`, `color: rgba(`, `onUnmounted`, `v-html`/`v-show`, sin `??` mezclado con `||`/`&&`, sin hex en los `<style>`, ninguna línea > 100 columnas. Parseo de los tres `<script setup>` con `node --experimental-strip-types --check` sin errores. Sin typecheck/tests locales.

## Desvíos/decisiones

- **`white` en vez de `#fff`** en los tres componentes: el gate de hex del `<verify>` (`#[0-9a-fA-F]{3,6}`) también matchea `#fff`. Mismo color.
- **Toggle en un solo lugar**: `ZoneChips` emite `null` al tocar el grupo ya elegido; `LibreTab.toggleGroup` hace lo mismo para la figura y los botones de la sugerencia. "Todo" emite `null`.
- **Reintentar repite el pedido correcto**: `failedRequest` (`first` | `more`). Si falla la primera página tras cambiar de grupo, la lista vieja del store (del grupo anterior) no se muestra; si falla "Ver más", la lista queda y el reintento llama a `loadMore`.
- **Aviso de AURA y sugerencia solo con `store.loaded`**: antes de la primera respuesta `auraAvailableToday` vale `true` por defecto y `weekWorkedZones` está vacío (sugeriría los 6 grupos); mostrarlos sería ruido.
- **Contador vacío mientras carga** (`aria-live="polite"` siempre montado): el `total` viejo no corresponde al grupo nuevo.
- **Recarga por nivel**: `watch(activeLevel)` ignora `prev === null` (hidratación) y valores iguales. El store manda `level` solo si hay `selectedLevel`; sin override el API usa el nivel del perfil.
- **`FreeBlockCard`** usa `<article>` + `<h3>` y `q-icon` (`replay` 14 px). Navega con `router.push({ name: 'free-block-player', params: { blockId } })`.
- Chips de zona con `margin: -4px -16px; padding: 4px 16px` para que el overflow horizontal no recorte el hitbox de 44 px (chip visual 36 px).
- Halo de la figura (adorno) como en `SemanaTab`, 300×190 como el sketch.
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- `vue-tsc` en un checkout con node_modules: `ZONE_GROUPS[store.group]` (readonly ZoneSlug[]) a `lit: readonly string[]`; `userStore.profile?.gender ?? null`.
- 197-19 debe procesar `query.tab === 'libre'` (ya lo anotó 197-17) y montar `LibreTab` visible (la figura se mide con `getBBox`: `v-if`, nunca `v-show`).
- La tab reusa el estado del store entre visitas: si ya cargó (`loaded`) no vuelve a pedir al montar. Si 197-19 quiere refrescar `auraAvailableToday`/`workedToday` al volver del player, hay que llamar `loadFirstPage()` desde la pantalla (el cupo de AURA ya se actualiza por `applyCompletion`).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los tres archivos existen y los commits están en `feat/197-entrenar`.
