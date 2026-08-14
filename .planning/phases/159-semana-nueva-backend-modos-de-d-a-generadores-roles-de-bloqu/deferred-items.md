# Deferred items — Phase 159

Items descubiertos durante la ejecucion que estan FUERA del alcance de la
tarea que los encontro (scope boundary del executor). No se tocan aca.

## 159-06

- **`el-templo-api/src/modules/sessions/pipeline/utils/stretching-selection.ts`
  — acceso a `exercises` sin `tenant-safe`/`tenantWhere` (lint:tenant
  `unlistedViolations`).** Pre-existente: el archivo lo creo el plan 159-02
  (commit `024a62dd`), antes de que 159-06 empezara. `pnpm exec tsx
  src/db/scripts/lint-tenant.ts` lo reporta como discrepancia tanto antes
  como despues de los cambios de 159-06 (verificado: 159-06 solo agrego su
  PROPIA exencion `tenant-safe` en `scheduling/service.ts:246` y el conteo de
  `unlistedViolations` bajo de 2 a 1, quedando exactamente este). Corresponde
  resolverlo en el plan que toco ese archivo (159-02) o en un plan de
  limpieza de tenancy, no en 159-06.
