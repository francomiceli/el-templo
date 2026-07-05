---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - el-templo-admin/src/components/AssignPlanDialog.vue
  - el-templo-admin/src/components/PlanFormDialog.vue
  - el-templo-admin/src/composables/usePricingSettingsApi.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/pages/CobrosPage.vue
  - el-templo-admin/src/pages/ConfiguracionPreciosPage.vue
  - el-templo-admin/src/pages/PlanesPage.vue
  - el-templo-admin/src/pages/ProgramasPage.vue
  - el-templo-admin/src/types/subscription.ts
  - el-templo-api/src/db/migrations/0168_seed_pricing_zero_price.sql
  - el-templo-api/src/db/migrations/0169_plan_programs.sql
  - el-templo-api/src/db/schema/index.ts
  - el-templo-api/src/db/schema/plan-programs.ts
  - el-templo-api/src/modules/programs/enrollment-service.ts
  - el-templo-api/src/modules/settings/keys.ts
  - el-templo-api/src/modules/settings/routes.ts
  - el-templo-api/src/modules/settings/service.ts
  - el-templo-api/src/modules/subscriptions/schemas.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/test/settings/zero-price-setting.test.ts
  - el-templo-api/test/subscriptions/plan-programs-access.test.ts
  - el-templo-api/test/subscriptions/plans-crud.test.ts
  - el-templo-api/test/subscriptions/zero-price-gate.test.ts
findings:
  critical: 1
  warning: 6
  info: 2
  total: 9
status: resolved
resolution:
  fixed: [CR-01, WR-01, WR-02, WR-03, WR-04, WR-05]
  deferred: [WR-06]
  not_fixed: [IN-01, IN-02]
  resolved_at: 2026-07-04
  note: >-
    Fase de fix (/gsd:code-review --fix). CR-01 + WR-01..WR-05 corregidos y
    commiteados atómicamente (fix(156): ...). WR-06 diferido (bug pre-existente
    fuera de scope). Info (IN-01/IN-02) no en scope de esta corrida.
---

# Phase 156: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Fase 156 (Planes de pago vs Rutinas de entrenamiento): gate server-side del precio Zero en `resolvePriceType`, join table `plan_programs` con resolución all→lista→nada en enrollment, superficie de rutinas gateada por `TEMPLO_TRAINING_ROUTINES`, setting `pricing.zero_price_enabled` staff-read / owner-write, y renombres de labels sin tocar rutas.

Lo verificado como correcto contra los invariantes lockeados:

- El gate Zero cubre `assignPlan` (incl. boarding pass, con reassert de `pricePaid`), `changePlanNow`, `renewSubscription` (re-normaliza el tipo heredado con recálculo de precio) y `getPricingPreview` — con tests que lockean ON/OFF/default-OFF/renovación/boarding.
- Migración 0168 idempotente (`WHERE NOT EXISTS`), sin `;` en comentarios; 0169 aditiva pura, nombres de columna alineados con el Drizzle schema, FKs RESTRICT (no hay hard-deletes de plans/programs en el código, así que RESTRICT no rompe ningún flujo).
- `programIds` validados server-side dentro de la misma transacción que el write del plan (400 sin persistir, testeado en POST y PUT).
- Setting: GET staff-only (member 403 testeado — lección 154 WR-01), PUT owner-only (coach 403 testeado).
- Teardown protege programas cubiertos por la LISTA de otra sub activa (testeado).
- Sin `any`, sin `console.*`, labels renombrados sin tocar paths/ids.

**Pero el gate Zero tiene un bypass real:** el branch de boarding pass de `changePlanAfterCurrent` quedó sin rutear por `resolvePriceType` (CR-01) — exactamente el estado que la fase promete imposible ("un white-label sin Zero nunca persiste `zero`"), y que el docstring de `resolvePriceType` afirma cubierto. Además hay huecos de borde en la resolución de listas en renovación/activación programada y varios foot-guns de UI en `PlanFormDialog`.

## Critical Issues

### CR-01: `changePlanAfterCurrent` con boarding pass bypasea el gate Zero

**✅ RESUELTO** — commit `55b890c5`. El branch de boarding pass de `changePlanAfterCurrent` ahora rutea por `resolvePriceType("zero")` + `getBasePrice`, simétrico a `assignPlan`. Test agregado a `zero-price-gate.test.ts` (OFF + changePlan `after_current` + boardingPass → persiste `'regular'` + `priceRegular`). Cubierto por test; confirmar en CI.

**File:** `el-templo-api/src/modules/subscriptions/service.ts:3385-3396`
**Issue:** El branch de boarding pass en `changePlanAfterCurrent` sigue hardcodeando el precio Zero sin pasar por `resolvePriceType`:

```typescript
} else if (input.boardingPass) {
  ...
  pricePaid = targetPlan.priceZero;
  priceTypeApplied = "zero";
```

Con la regla Zero OFF, un cambio de plan programado ("Cuando termine el plan actual") con boarding pass persiste `priceTypeApplied='zero'` + `pricePaid=priceZero` — el estado que el invariante D-04 de la fase declara imposible y que el docstring de `resolvePriceType` (línea ~4416: "covers assign/change/renew/preview/PoS and the boarding pass — routed through this method — at the single point of truth") afirma cubierto. El path es alcanzable desde la UI: AssignPlanDialog en modo change ofrece el toggle de boarding pass (no está gateado por `isKeepMode` en `after_current`) y `changePlanSchema` acepta `boardingPass` (schemas.ts:367). El fix simétrico ya existe en `assignPlan` (service.ts:1186-1187) pero no se replicó acá; la suite `zero-price-gate.test.ts` solo cubre el boarding pass vía assign, por eso no lo atrapó.
**Fix:**

```typescript
} else if (input.boardingPass) {
  if (member.boardingPassUsed) {
    throw new ConflictError("El boarding pass ya fue utilizado");
  }
  priceTypeApplied = await this.resolvePriceType("zero");
  pricePaid = this.getBasePrice(targetPlan, priceTypeApplied);
  boardingPassUsed = true;
  ...

```

Y agregar el caso a `zero-price-gate.test.ts` (OFF + changePlan `startMode='after_current'` + boardingPass → persiste `'regular'` + `priceRegular`).

## Warnings

### WR-01: En renovación y activación programada, el guard `shouldEnroll` saltea la inscripción por LISTA

**✅ RESUELTO** — commit `2b846458`. Separada la protección del linked de la ejecución del resto: `renewSubscription` y `activateScheduledSub` llaman siempre a `enrollFromPlan`, anulando solo el linked (`null`) cuando hay inscripción en curso (preserva `currentWeek`); la lista dedupea. Test agregado a `plan-programs-access.test.ts` (renovación con linked in-flight re-otorga la lista sin resetear el progreso).

**File:** `el-templo-api/src/modules/subscriptions/service.ts:3855-3888` (renewSubscription) y `4307-4341` (activateScheduledSub)

**Issue:** El guard legacy pone `shouldEnroll=false` cuando el plan tiene `linkedProgramId` con una inscripción activa en curso (para no resetear `currentWeek`), y en ese caso **no llama a `enrollFromPlan` en absoluto** — con lo cual el branch de la lista (`programIds`) tampoco corre. El comentario agregado en esta fase dice "list/bundle grants dedupe inside enrollFromPlan so re-enrolling is a safe no-op", pero el no-op nunca tiene chance de ejecutarse: si un plan tiene linked + lista y el socio renueva (o se activa la sub programada) con la inscripción del linked en curso, los programas de la lista que hayan sido agregados al plan, o cuyas inscripciones se hayan cancelado/completado, no se otorgan. El mismo hueco pre-existía para `grantsAllPrograms`, pero esta fase extendió el guard a listas y documentó una garantía que el código no cumple.
**Fix:** Separar la protección del linked de la ejecución del resto — llamar siempre a `enrollFromPlan`, anulando solo el linked cuando hay inscripción en curso:

```typescript
await this.requireEnrollmentService().enrollFromPlan(
  userId,
  {
    id: plan.id,
    linkedProgramId: shouldEnroll ? plan.linkedProgramId : null,
    grantsAllPrograms: plan.grantsAllPrograms,
    programIds: renewPlanProgramIds,
  },
  subId,

  tx,
);
```

(El branch de linked dentro de `enrollFromPlan` es cancel-then-insert; con `null` se saltea y la lista dedupea sola.)

### WR-02: El invariante de plan online se satisface con una lista que no otorga nada (Foundation / goalPlanType NULL)

**✅ RESUELTO** — commit `5805141b`. `assertProgramsExist` ahora agrega `isNotNull(goalPlanType)` al where → valida contra el mismo universo que otorga `enrollFromPlan`; una lista solo-Foundation se rechaza con 400 explícito. Tests de `plans-crud.test.ts` ajustados (helper crea programas otorgables) + caso nuevo de lista solo-Foundation rechazada. Nota: el fix del frontend (exponer `goalPlanType` y filtrar el multi-select por eso en vez del nombre) NO se incluyó — el guard server-side es la defensa efectiva; el filtro por nombre en el admin queda como mejora menor.

**File:** `el-templo-api/src/modules/subscriptions/service.ts:273-296` (assertProgramsExist), `234-252` (assertPlanInvariants); `el-templo-admin/src/components/PlanFormDialog.vue:412-419, 490`
**Issue:** `assertProgramsExist` valida existencia + `isActive` pero NO `goalPlanType IS NOT NULL`, mientras que `enrollFromPlan` filtra silenciosamente los programas con `goalPlanType` NULL (Foundation, por diseño anti-piratería 104 R7). Consecuencia: un plan **online** creado por API con `programIds=[foundationId]` (o cualquier programa no otorgable) pasa `assertPlanInvariants` vía `hasProgramList=true`, pero el socio que lo compra queda inscripto en **cero** programas — el propósito del invariante ("planes online deben dar acceso a algo") queda derrotado sin ningún error. Los propios tests refuerzan la grieta: `plans-crud.test.ts:22-35` crea los programas de sus listas con `goalPlanType: null` y el test "a non-empty programIds list satisfies the online-plan invariant" lockea como válido exactamente este escenario. En el frontend la exclusión de Foundation del multi-select es por comparación exacta de nombre (`'Foundation — Cuerpo Completo'`, con em-dash) porque el tipo `Program` del admin no expone `goalPlanType` — un rename del programa rompe el filtro silenciosamente.
**Fix:** Agregar `isNotNull(schema.programs.goalPlanType)` al where de `assertProgramsExist` (rechazo 400 explícito: "no otorgable por lista"), o al menos computar `hasProgramList` solo sobre programas otorgables. En el admin, exponer `goalPlanType` en el payload de programas y filtrar por eso en `multiProgramOptions` en lugar del nombre.

### WR-03: `PlanFormDialog.onSubmit` traga los errores del server sin feedback al usuario

**✅ RESUELTO** — commit `3ce82485`. El catch ahora usa `extractError` + `isExpectedClientError` y muestra `$q.notify` con el mensaje del server, mismo patrón que AssignPlanDialog.

**File:** `el-templo-admin/src/components/PlanFormDialog.vue:640-645`
**Issue:** El catch de `onSubmit` solo hace `log.error` — no hay `$q.notify` ni banner. El dialog queda abierto sin ninguna señal de qué pasó. Es pre-existente, pero esta fase agregó dos rechazos 400 nuevos que ahora lo hacen probable en uso normal: `programIds` inválidos/inactivos (T-156-04) y el invariante online reforzado con `hasProgramList` (p. ej. apagar `grantsAllPrograms` en un plan online con lista vacía). El admin clickea Guardar y "no pasa nada". Contrasta con AssignPlanDialog, que sí notifica con el mensaje del server (`extractError` + `isExpectedClientError`).
**Fix:** Replicar el patrón de AssignPlanDialog:

```typescript
} catch (err: unknown) {
  const message = extractError(err, 'Error guardando el plan');
  if (isExpectedClientError(err)) log.warn('Plan save rejected', { error: message });
  else log.error('Error saving plan', { error: message });
  $q.notify({ type: 'negative', message, timeout: 5000 });
}
```

### WR-04: En planes presenciales, prender "Da acceso a TODOS los programas" borra la lista persistida sin otorgar nada

**✅ RESUELTO** — commit `6442f746`. Introducido `effectiveGrantsAll` (coacciona la categoría en un único lugar): el payload envía la lista sin cambios en presencial (nunca `[]`), y el watcher solo limpia `programIds`/`linkedProgramId` en planes NO presenciales. Apagar el toggle recupera la lista intacta.

**File:** `el-templo-admin/src/components/PlanFormDialog.vue:205, 509-518, 619-623`
**Issue:** El toggle `grantsAllPrograms` es visible para TODAS las categorías, pero el payload lo coacciona a `false` para presencial (`planCategory !== 'presencial' ? form.grantsAllPrograms : false`, línea 619-620). Al prenderlo en un plan presencial: (a) el watcher limpia `linkedProgramId` y `programIds` localmente; (b) el payload viaja con `grantsAllPrograms:false` y `programIds:[]` → el server **borra la lista persistida** (delete+insert de la reconciliación); (c) `linkedProgramId` viaja `undefined` → el vinculado NO se limpia server-side. Resultado: el admin cree que el plan da acceso a todo, pero el plan queda con el linked original intacto, la lista borrada y `grantsAllPrograms=false`. Pérdida silenciosa de la lista + estado engañoso. Antes de esta fase el toggle presencial era inocuo (no había lista que borrar); ahora es destructivo.
**Fix:** Ocultar el toggle para `planCategory==='presencial'` (`v-if="form.planCategory !== 'presencial'"`), que es coherente con la coacción del payload; o usar la coacción también al armar `programIds` (`programIds: effectiveGrantsAll ? [] : form.value.programIds` donde `effectiveGrantsAll` ya considera la categoría).

### WR-05: Con la regla Zero OFF, AssignPlanDialog sigue ofreciendo el boarding pass — que se consume cobrando precio regular completo

**✅ RESUELTO** — commit `a9cb472b`. El bloque del boarding pass se gatea con `v-if="zeroPriceEnabled"`, simétrico a la opción Zero del selector (D-05).

**File:** `el-templo-admin/src/components/AssignPlanDialog.vue:235-245, 1636`
**Issue:** La opción "Zero" del selector se gatea por `zeroPriceEnabled` (D-05), pero el toggle "Usar Boarding Pass" no. Con la regla OFF: el toggle sigue visible, `executeConfirm` manda `priceTypeApplied:'zero'` + `boardingPass:true`, el server (correctamente, por diseño D-04) normaliza a `'regular'` + `priceRegular`… y **marca `boardingPassUsed=true`**. El regalo one-shot del socio se quema a cambio de nada — pagó precio regular completo. El server hace lo que el invariante manda; el hueco es que la UI ofrece una acción que en ese estado solo puede perjudicar al socio, sin ningún aviso.
**Fix:** Gatear el bloque del boarding pass con `v-if="zeroPriceEnabled"` (simétrico a la opción Zero del selector), o deshabilitarlo con una leyenda "Requiere la regla de Precio Zero prendida".

### WR-06 (pre-existente, detectado al trazar el gate): `changePlanNow` ignora `input.boardingPass` — precio Zero sin consumir el pass

**⏸️ DIFERIDO (pre-existente)** — NO corregido en esta fase. Es código pre-existente fuera del diff de 156 (asimetría heredada de `changePlanNow`), y su fix requiere una decisión de negocio del owner (consumir el pass vs rechazar `boardingPass:true` en change-now) que excede el scope de esta corrida de correcciones. Se documenta acá para retomarlo como bug pre-existente independiente.

**File:** `el-templo-api/src/modules/subscriptions/service.ts:2928-2953`
**Issue:** `changePlanNow` no tiene branch de boarding pass: no valida `boardingPassUsed` ni lo marca. La UI en modo change "Ahora, reiniciando" con el toggle de boarding activado manda `priceTypeApplied:'zero'` + `boardingPass:true`; el server (regla ON) cobra `priceZero − prorrateo` vía el else de línea 2948-2952 y el pass del socio queda **sin consumir** — puede reutilizarse indefinidamente vía cambios de plan. Es código pre-existente (fuera del diff de 156), pero asimétrico con `assignPlan` y `changePlanAfterCurrent`, y quedó expuesto al auditar todos los paths del gate.
**Fix:** O bien agregar a `changePlanNow` el mismo branch de boarding que CR-01 propone para `changePlanAfterCurrent` (validar + marcar `boardingPassUsed`), o bien rechazar `boardingPass:true` en change-now con 400 y ocultar el toggle en ese modo en la UI. Decidir con el owner cuál es la semántica deseada.

## Info

### IN-01: `getBasePriceFor` / `getBasePrice` del admin no degradan `zero` con la regla OFF (asimetría con `credit_card`)

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1270-1275`; `el-templo-admin/src/components/AssignPlanDialog.vue:1467-1481`
**Issue:** Ambos helpers degradan `credit_card`→regular cuando `cardSurchargeEnabled` está OFF, pero devuelven `priceZero` para `zero` sin consultar `zeroPriceEnabled`. Hoy es inalcanzable (el toggle/opción Zero se oculta con la regla OFF), pero es defensa-en-profundidad inconsistente: cualquier refactor que deje llegar `zero` con la regla OFF mostraría un precio que el server no va a cobrar.
**Fix:** En el case `zero`, devolver `priceZero` solo si `zeroPriceEnabled`; si no, `priceRegular` (espejo del case `credit_card`).

### IN-02: `programIds` sin límite de tamaño en los schemas

**File:** `el-templo-api/src/modules/subscriptions/schemas.ts:182, 224`
**Issue:** `programIds: { type: "array", items: { type: "integer" } }` no tiene `maxItems` ni `minimum` en los items. El write es Dueño-only y `assertProgramsExist` dedupea y rechaza ids inválidos, así que el riesgo es bajo, pero un array enorme genera un `inArray` gigante innecesario.
**Fix:** Agregar `maxItems: 100` (o el techo razonable) y `items: { type: "integer", minimum: 1 }`.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
