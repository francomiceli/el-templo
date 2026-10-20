---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 14
subsystem: app-training
tags: [canasta, store, composable, bloque-libre]
requires: ["197-13"]
provides:
  - types/free-blocks.ts (FreeBlockItem, FreeBlocksPage, FreeBlockDetail, FreeBlockCompleteRequest/Response, FREE_BLOCK_AURA_MIN_SECONDS)
  - useFreeBlocksStore (Pinia setup)
  - useFreeBlockCompletion
affects: [197-15, 197-16, 197-17, 197-18, 197-19]
key-files:
  created:
    - el-templo-app/src/modules/training/types/free-blocks.ts
    - el-templo-app/src/modules/training/stores/freeBlocksStore.ts
    - el-templo-app/src/modules/training/composables/useFreeBlockCompletion.ts
requirements: [D-04, D-09, D-12, D-14]
---

# Fase 197 Plan 14: Capa de datos de la canasta — Summary

Tipos espejo del API, store Pinia de la lista (paginada de a 20, filtro de grupo, descarte de respuestas superadas con `requestSeq`) y composable del cierre del bloque libre. Sin UI.

## Commits

- `7641a3a31` feat(197-14): tipos y store de la canasta
- `b0dec5eda` feat(197-14): cierre del bloque libre en el app

## Verificación (estática)

Ambos `<verify>` del plan sin faltantes; higiene limpia (sin `console.`, `any`, `onUnmounted`, `??` mezclado). `node --experimental-strip-types --check` rc=0 en los 3 archivos. Sin typecheck/tests locales.

## Desvíos/decisiones

- `FreeBlockCompleteRequest` incluye `level?: Level` (el API lo acepta en el body para `resolveMember`); el composable lo completa con `useUserStore().selectedLevel` si no viene.
- `loadMore` y `loadFirstPage` comparten `requestSeq`: cambiar de grupo durante un "ver más" también descarta ese "ver más". `loadMore` no hace nada si ya hay una carga en curso o no hay más.
- `fetchBlock` no escribe `error` ni loguea en 404 (devuelve `null`); otros errores sí.
- `reset()` también incrementa `requestSeq` para invalidar pedidos en vuelo.
- `complete()` ignora una segunda llamada mientras `isSubmitting` (doble tap).
- Errores 4xx del cierre se loguean `warn` (como `useSessionCompletion`), el resto `error`.
- `FreeBlockItem extends Block` con `zones`/`groups` obligatorios (en `Block` son opcionales; estrechar en `extends` es válido).

## Bugs encontrados

Ninguno.

## Para el orquestador

- CI de frontends no typechequea: conviene `vue-tsc` local en el checkout con node_modules (en particular el estrechamiento `zones`/`groups` y `Level` en `level` del request).

## Self-Check: PASSED
