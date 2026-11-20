---
phase: 215-regalar-aura
plan: 16
subsystem: app-aura-gifts-data
tags: [app, regalo, store, textos, fail-open]
requires: ["215-15"]
provides:
  - "Tipos, cliente HTTP, store fail-open y textos puros del regalo de Aura en la app"
affects: [215-20, 215-21]
tech-stack:
  added: []
  patterns:
    [
      textos en funciones puras con test,
      store fail-open con contador generation,
    ]
key-files:
  created:
    - el-templo-app/src/types/aura-gifts.ts
    - el-templo-app/src/constants/gift-reasons.ts
    - el-templo-app/src/composables/useAuraGiftsApi.ts
    - el-templo-app/src/stores/useAuraGiftsStore.ts
    - el-templo-app/src/utils/gift-view.ts
    - el-templo-app/src/utils/__tests__/gift-view.test.ts
  modified:
    - el-templo-app/src/constants/aura-amounts.ts
key-decisions:
  - "La app llama 'hoy' a la fecha de hoy en la sede y 'ayer' a cualquier otra que mande el servidor"
requirements-completed: [SC-1, SC-2, D-02, D-05, D-07, D-12, D-14, D-16, D-22]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 16: datos y textos del regalo en la app Summary

La app ya tiene la capa de datos del regalo: tipos espejo del contrato de la API, cliente HTTP, store fail-open y utilidades puras con test (30 `it` en verde). Las pantallas son los planes 20 y 21.

## Tareas

| Tarea | Commit      | Asunto                                             |
| ----- | ----------- | -------------------------------------------------- |
| 1 RED | `947d07ace` | test(215-16): vista del regalo (rojo)              |
| 1     | `9b94e2ada` | feat(215-16): textos y vista del regalo            |
| 2     | `5e964cb7b` | feat(215-16): cliente y store del regalo en la app |

## Qué quedó

- `gift-view.ts`: `giftCardState`, `giftCardHelp`, `giftCardAriaLabel`, `givenTodayText`, `sheetSubtitle`, `candidateName`, `sheetFooterLabel`, `sheetHelp`, `weeklyCapNote`, `blockedAriaLabel`, `giveSuccessMessage` y `giveErrorOutcome` (devuelve siempre el objeto completo: `message`, `type`, `close`, `reloadCandidates`, `clearSelection`, `reloadPending`). Todas reciben `todayLocal` por parámetro. Ningún texto nombra privacidad (hay un test que lo recorre).
- `gift-reasons.ts`: `GIFT_REASONS`, `GiftReasonCode`, `giftReasonLabel` (espejo de la API).
- `types/aura-gifts.ts`: contratos de pending, candidates y give, más `GiftErrorCode`.
- `useAuraGiftsApi.ts`: `getPending`, `getCandidates(attendanceId)`, `give(body)`, `cleanup()`. Los errores se propagan.
- `useAuraGiftsStore.ts`: `pending`, `givenToday`, `loaded`, `loadFailed`, `localDate`, `cardState`, `load()`, `reset()`. No consulta con `auraVisible` en false (y vacía el estado); contador `generation`; ante una falla conserva el dato del mismo día y descarta el de otro; nunca lanza. No guarda candidatos.
- `AURA_AMOUNTS_UI.giftMember = 1`.

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos, ninguno en archivos tocados).
- `vue-tsc`: 20 errores (base 20), ninguno en archivos del plan.
- Test `gift-view.test.ts`: 30 de 30 en verde. API, admin y dependencias no tocados. Sin migración, bump ni push.

## Desvíos respecto del plan

- `giftCardState(pending, givenToday)` no recibe `todayLocal` (el plan lo mencionaba solo en la prosa de la tarea 2): la regla la decide el servidor y un parámetro sin uso rompe el lint.
- "Ayer" no se calcula con aritmética de fechas: se compara solo contra "hoy" y todo lo demás que mande el servidor se llama "ayer" (la ventana la decide la API). Se sacó una función `previousDay` que quedó sin uso.
- `types/aura-gifts.ts` se commiteó en la tarea 1 (lo importa la utilidad) y no en la 2.

## Decisiones propias

- Anotadas en `215-DECISIONES-AUTONOMAS.md`: texto de "ayer" y fila "Le diste Aura" con el primer regalo de la lista. La cola de la nota plural ("Vas a poder darles de nuevo el lunes.") completa el "…" del UI-SPEC.
- La hora se muestra sin cero a la izquierda ("8:30"), como la card de Reservas, y acepta "18:00:00".

## Lecciones para los planes siguientes

- El plan 20 debe llamar `useAuraGiftsStore().load()` al entrar a Mi Templo y el plan 21 enganchar `reset()` en el logout y volver a pedir `pending` tras dar.
- `giveErrorOutcome` recibe `{ status, code }`: la pantalla los saca con `axios.isAxiosError(err)` de `err.response?.status` y `err.response?.data?.code`.
- La fila de la card debe usar `store.cardState` (ya es `null` sin dato o con el módulo apagado) y `giftCardHelp(store.pending, todayLocal)` con el día de la sede.

## Self-Check: PASSED

Commits `947d07ace`, `9b94e2ada` y `5e964cb7b` y los seis archivos creados verificados.
