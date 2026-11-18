---
phase: 214-comunidad-anotados-aura
plan: 18
subsystem: aura
tags: [aura, movements, privacy, D-12, D-13, D-14, D-16, D-17, D-37, D-38, D-57, D-58, D-69]
requires: ["214-17"]
provides:
  - "GET /api/members/aura/movements (detalle privado de la Aura propia, de a 20, cursor `before`)"
  - "auraMovementLabel(sourceType, referenceType, referenceId) en aura/movement-labels.ts"
  - "auraMemberRoutes montado en temploGamificationModule bajo /api/members/aura"
affects: ["214-19"]
key-files:
  created:
    - el-templo-api/src/modules/aura/movement-labels.ts
    - el-templo-api/src/modules/aura/member-schemas.ts
    - el-templo-api/src/modules/aura/member-routes.ts
    - el-templo-api/test/unit/aura-movement-labels.test.ts
    - el-templo-api/test/aura/member-aura-movements.test.ts
  modified:
    - el-templo-api/src/modules/aura/module.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/mod-01-guard.test.ts
decisions:
  - "Una sola ruta que trae tambien `earned` (encabezado del detalle); sin /summary aparte"
  - "La lista usa earnedRowsFilter() + amount <> 0: la suma de movimientos es la Aura ganada por construccion"
  - "Fuente desconocida cae en 'Movimiento de Aura'; referencia 0 o ausente en hito/racha cae en el texto sin numero"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 18: detalle privado de Aura Summary

`GET /api/members/aura/movements`: devuelve al usuario autenticado `{ earned, movements[], nextBefore }`. Cada movimiento trae solo `id`, `amount`, `label`, `createdAt` (sin `description` ni referencias crudas). Orden por `id` descendente con cursor `before` (keyset, sin OFFSET), `limit` por defecto 20 y maximo 50. Excluye filas de monto 0 y canjes (misma condicion `earnedRowsFilter()` que la Aura ganada); las reversas salen en negativo. La ruta no recibe ningun id de usuario (el `userId` sale del JWT) y no tiene condicion por rol (D-15 revocada). Montada desde `temploGamificationModule`, asi que con el modulo apagado responde el 404 del guard.

## Commits

- `10646c453` test(214-18): textos de movimientos de Aura (rojo)
- `ef201cd38` feat(214-18): textos de movimientos de Aura
- `1c12fbba2` feat(214-18): detalle privado de movimientos de Aura (D-13)
- `2ec430f30` test(214-18): detalle privado de Aura y módulo apagado

## Verificacion

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0. `tenant-lint-allowlist.json` sin cambios.
- `pnpm typecheck:tests`: 0 errores en los archivos tocados (la deuda de base es ajena).
- `ENTRADAS_BASELINE` 588 -> 589 (conteo real verificado con `tsx` sobre `TENANT_MANIFEST`: 589). Se corrigio ademas el titulo del `it` del baseline, que seguia diciendo "587" desde el plan 16/17: ahora "589".
- Unitario `aura-movement-labels.test.ts` (7 `it`, 17+ `expect`): 7 de 7 en verde con `vitest.config.unit.ts`; el commit rojo es anterior al verde.
- Integracion: `member-aura-movements.test.ts` (11 `it`) y 2 `it` nuevos en `mod-01-guard.test.ts` escritos, no corridos (quedan para CI: `test/setup.ts` se cuelga en local).

## Deviations from Plan

- **[Rule 1 - supuesto del plan]** El plan pedia que `?userId=<A>` diera 400. Fastify usa `removeAdditional` (leccion plan 16): descarta el campo y responde 200. El test afirma lo que importa para D-37: la respuesta es el detalle del propio token y no hay ningun id de A.
- **[Rule 1]** El `it` del baseline decia "587 entradas" (desactualizado). Se actualizo a 589 junto con la constante.
- Tests extra respecto del minimo: cursor `before` de otro usuario, limit 0 / 3 / 50, socio sin movimientos, y gimnasio 2 con el modulo prendido (aislamiento por tenant). Caso de MOD-01 con contraste (flag prendido -> 200).

## Decisiones propias

- Hito con `referenceId` no positivo o nulo y racha igual: se usan los textos sin numero ("Antigüedad en El Templo", "Racha").
- Tabla de textos fijos como `Map` y no como objeto, para que una fuente llamada `constructor` o `toString` no devuelva una funcion.
- `manual_adjustment` con `reference_type = attendance_reversal` es "Asistencia anulada" aunque el monto no sea -5; cualquier otro `manual_adjustment` que llegue a la lista es "Ajuste de Aura" (los canjes ya los saco el filtro).
- Docblock de `module.ts` reescrito: ya no dice "AURA no expone rutas propias". El comentario del manifiesto se actualizo igual.

## Notas para los planes siguientes

- Respuesta para la app/admin: `{ earned: number, movements: [{ id, amount, label, createdAt }], nextBefore: number | null }`. "Ver mas" = repetir con `?before=<nextBefore>` mientras `nextBefore` no sea null. `earned` viene en cada pagina (mismo numero). El numero del encabezado de Mi Templo sigue saliendo de `/me` (`auraEarned`).
- Con el modulo `templo-gamification` apagado la ruta devuelve el 404 del guard: la app no debe llamarla si `/me` trae `auraEarned: null`.
- Sin iconos por movimiento (Decision abierta 7 del UI-SPEC): el servidor no manda tipo.
- Si CI falla `member-aura-movements.test.ts`: mirar primero la siembra por `INSERT` directo con `tenantValues`, el flag de `templo-gamification` del gimnasio 2 y que `cleanAllTestData` limpie `aura_transactions` entre casos.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Mitigaciones T-214-18-01..05 aplicadas: sin parametro de usuario, `tenantWhere`, campos minimos, `limit` maximo 50 con keyset, misma condicion que la Aura ganada.

## Self-Check: PASSED

Los 4 commits y los 5 archivos nuevos existen.
