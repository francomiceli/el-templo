---
phase: 151-registrar-cobro-pagos-cobros
reviewed: 2026-07-03T17:48:10Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - el-templo-admin/src/pages/CobrosPage.vue
  - el-templo-admin/src/components/caja/CobroResumen.vue
  - el-templo-admin/src/router/index.ts
findings:
  critical: 0
  warning: 1
  info: 9
  total: 10
status: issues_found
---

# Phase 151: Code Review Report — Re-review post gap-closure 151-05

**Reviewed:** 2026-07-03T17:48:10Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Re-review tras el plan de cierre 151-05 (commits `6a295363`, `706dba6a`). Los **6 hallazgos que 151-05 declaró cerrados están efectivamente cerrados** (verificados línea por línea contra el diff y trazando los flujos): CR-01, WR-01 (con un residual, ver WR-06), WR-02, WR-03, WR-04 y WR-05. La verificación de WR-05 incluyó trazar loop-safety del nuevo fallback `landingForRole()` para los 5 roles contra los `allowedRoles` de cada destino de aterrizaje — sin loops posibles (coach-training→`/sessions` pasa `allowedRoles`+`trainingOnly`; owner/admin→`/alumnos` incluido en `allowedRoles`; coach/gestion/recepcion→`/cobros` vía `PAGOS_ROLES`).

Queda **1 warning nuevo**: el fix de WR-01 cerró el camino hacia adelante (opciones deshabilitadas + gating), pero el estado "paso 2 vacío/confuso" sigue siendo alcanzable por navegación hacia atrás — un `mode` previo (`renew`/`misc`) sobrevive al entrar en contexto de alumno nuevo y queda resaltado-activo-pero-deshabilitado con su cuerpo huérfano. Además, 2 info nuevos (degradación silenciosa de la Sede si `loadBranches()` falla; asimetría de `onUsarExistente` respecto de la convención de idempotency key). Los IN-01..IN-07 previos siguen abiertos y aceptados (se llevan adelante sin re-litigar); la distinción Validado-vs-Pendiente sigue diferida por diseño (necesita `validationStatus` en el endpoint de listado — documentado en 151-05-SUMMARY.md Known Stubs).

## Resolución de hallazgos previos

### CR-01: Selector de Sede caído para alta de socio existente — RESUELTO

**Verificado:** `CobrosPage.vue:326-344` — un único `q-select` con `v-model="sucursalId"` ahora vive en el bloque alta del paso 2 (`v-else-if="mode === 'alta'"`), alcanzable para TODA alta (socio existente y alumno nuevo). El duplicado del mini-form de alumno nuevo fue eliminado (líneas 200-238 ya no contienen Sede). La sede resuelta se muestra además en `CobroResumen` vía la nueva prop `sede` (`resumenSede`, líneas 885-888; `CobroResumen.vue:27-32`), sólo en modo alta (renew/misc derivan branch server-side → fila oculta, correcto). `canConfirm` sigue exigiendo `sucursalId != null` (línea 985). Cerrado.

### WR-01: Dead-ends alumno nuevo + misc/renew — RESUELTO (con residual, ver WR-06)

**Verificado:** `isNewStudentContext` (línea 821) + `isAssociationDisabled` (líneas 826-828) deshabilitan `renew`/`misc` con hint "Solo para socios existentes" (template 272, 284-289); `onSelectAssociation` tiene guard de entrada (línea 834); `canContinueStep` caso 2 misc ahora exige `selectedMember != null` (líneas 1026-1030). Los dos dead-ends del hallazgo original (avance hacia adelante) son inalcanzables. Residual por navegación hacia atrás → WR-06.

### WR-02: `onUsarExistente` no cargaba autocompletar — RESUELTO

**Verificado:** `CobrosPage.vue:1210` — `void loadAutocompletar(m.id)` tras adoptar el socio del dedup, espejando `onMemberSelected`. El race con el pre-fill de renovación está cubierto: si el coach elige `renew` antes de que resuelva, `loadAutocompletar` re-chequea `mode === 'renew'` al resolver (línea 1388) y setea `amount`. Cerrado (asimetría menor de idempotency key → IN-09).

### WR-03: Badge "Pendiente" hardcodeado en filas anuladas — RESUELTO

**Verificado:** `CobrosPage.vue:63-64` — `voidedAt != null` → badge `Anulado` (negative), else `Pendiente`. `voidedAt: string | null` existe en el tipo `TransactionListItem` del admin (transaction.ts:103). La distinción Validado-vs-Pendiente queda diferida por diseño (backend, Known Stubs) — NO se re-reporta.

### WR-04: Idempotency key no regenerada al cambiar de plan — RESUELTO

**Verificado:** `CobrosPage.vue:1283-1289` — `selectPlan` limpia `currentIdempotencyKey`, cerrando el retry-tras-éxito-perdido contra el plan viejo. Consistente con `resetChargeFields`, `onSelectAssociation` y `onSucursalChange`.

### WR-05: Mapa duplicado de landing apuntando a `/pagos` — RESUELTO

**Verificado:** `router/index.ts:54-60` — el mapa `defaultPages` fue reemplazado por `return landingForRole()` (única fuente de verdad, DRY). Loop-safety trazada para los 5 valores de `AdminRole`: coach con training → `/sessions` (`allowedRoles: ['coach','owner']` + `trainingOnly` con `canAccessTraining` true → pasa); owner/admin → `/alumnos` (`allowedRoles` los incluye, routes.ts:78); coach sin training / gestion / recepcion → `/cobros` (`PAGOS_ROLES` = los 5 roles, templo-config.ts:45). Cambio de comportamiento benigno: un coach-training rebotado ahora aterriza en `/sessions` en vez de `/pagos→/cobros` — es su landing correcta por D-14.

## Warnings

### WR-06: Un `mode` previo (`renew`/`misc`) sobrevive al contexto de alumno nuevo — el "paso 2 vacío" de WR-01 sigue alcanzable por navegación hacia atrás

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1172-1177` (`onNuevoAlumno`), `295-322` (cuerpo renew del paso 2), `426-444` (cuerpo misc), `271-272` (`:active` vs `:disable`)
**Issue:** Nada resetea `mode` cuando el contexto pasa a alumno nuevo. Camino reproducible: elegir socio existente → paso 2 → tocar "Renovar plan vigente" (o "Cobro suelto") → Volver al paso 1 → limpiar el socio con la X del `q-select` (`onMemberSelected(null)` limpia autocompletar/campos pero NO `mode`) → tocar "Nuevo alumno" → completar datos válidos → Continuar. En el paso 2 la opción `renew`/`misc` queda **deshabilitada pero resaltada como activa** (`:active="mode === opt.value"` con `active-class="bg-primary text-white"` convive con `:disable`), y debajo:

- `mode === 'renew'`: cuerpo vacío (autocompletar es `null` → las tres ramas del template son falsy) — exactamente el "silent empty state" que WR-01 punto 2 describía; Continuar deshabilitado sin explicación.
- `mode === 'misc'`: el form Concepto/Motivo se renderiza y es editable bajo una opción deshabilitada-resaltada, con Continuar deshabilitado por el nuevo check de `selectedMember` — el coach puede tipear un concepto que nunca va a poder confirmar.

No es un dead-end duro (puede tocar "Asignar plan nuevo"), pero es el mismo síntoma que motivó WR-01: estado confuso alcanzable sin señal de por qué no se puede continuar, agravado por el contradictorio activo+deshabilitado.
**Fix:** Limpiar el mode huérfano al entrar en contexto de alumno nuevo:

```ts
function onNuevoAlumno() {
  selectedMember.value = null;
  resetChargeFields();
  showNewStudentForm.value = true;
  dedupMatch.value = null;
  // Un alumno nuevo invalida renew/misc: si el mode previo quedó huérfano, resetearlo.
  if (mode.value !== null && isAssociationDisabled(mode.value))
    mode.value = null;
}
```

(o un `watch(isNewStudentContext)` equivalente). Con `mode = null` el paso 2 vuelve al estado neutro "elegí una asociación".

## Info

### IN-08: Si `loadBranches()` falla, el alta persiste un `branchId` que el operador nunca vio (degradación silenciosa del fix CR-01)

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1149-1160` (`loadBranches` catch), `885-888` (`resumenSede`), `329-344` (Sede select)
**Issue:** Si `getBranches()` falla (el catch sólo loguea), `branchOptions` queda `[]` pero `sucursalId` conserva `authStore.user?.branchId`. El alta sigue siendo completable (`canConfirm` sólo exige `sucursalId != null`, y `loadAltaPlans` funciona con ese id): el `q-select` de Sede no puede resolver el nombre (muestra el valor crudo con `map-options` sin opciones), `resumenSede` devuelve `null` y la fila Sede se **oculta** en el resumen — se persiste un `branchId` que el operador nunca vio ni pudo cambiar, el escenario que CR-01 quería eliminar. Mitigado: `onSelectAssociation('alta')` reintenta `loadBranches()` si la lista está vacía; requiere que branches falle mientras plans funciona (baja probabilidad).
**Fix:** En modo alta, si `branchOptions.length === 0`, bloquear Continuar del paso 2 (o mostrar estado de error con botón Reintentar) en vez de permitir avanzar con una sede invisible.

### IN-09: `onUsarExistente` no limpia `currentIdempotencyKey` ni `amount` al cambiar el target de socio

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1197-1211`
**Issue:** La convención de la página es "cambio deliberado de target → nueva key" (`resetChargeFields`, `onSelectAssociation`, `onSucursalChange`, `selectPlan`). `onUsarExistente` cambia el target (alumno-nuevo → socio existente) pero sólo llama `resetAltaFields()`, que no toca la key ni `amount` — a diferencia de `onMemberSelected`, que pasa por `resetChargeFields`. Trazando los caminos alcanzables hoy no hay exposición real (para re-confirmar un alta hay que re-elegir plan → `selectPlan` limpia la key; renew/misc están deshabilitados en el contexto donde aparece el banner de dedup), pero la invariante depende de limpiezas aguas abajo en lugar del punto del cambio — frágil ante refactors.
**Fix:** Llamar `resetChargeFields()` (además de `resetAltaFields()`) en `onUsarExistente`, con re-set del pre-fill vía el `loadAutocompletar` que ya se dispara.

### Carried forward — IN-01..IN-07 (aceptados en la ronda previa, siguen abiertos, NO bloquean)

- **IN-01** — Código muerto en `CobrosPage.vue`: `showPaymentMethods` (967-975) y `hasAlumnoContext` (1221-1223) siguen computados y sin referencias en el template; `onConfirm` sigue llamando `resetForm()` + `resetToPortada()` (doble reset, 1478-1479).
- **IN-02** — Mensaje de rechazo de cuenta banco menciona "efectivo" para cualquier medio no bancario (`coach-load-routes.ts`). Fuera del scope de archivos de esta ronda.
- **IN-03** — Validación renew usa `subscriptions.currency` vs cargo en `plan.currency`. Fuera del scope de esta ronda.
- **IN-04** — Falta test de rechazo transfer-sin-cuenta en el path settle. Fuera del scope de esta ronda.
- **IN-05** — Helper de test muerto `countMemberTx` con `sql` sin importar. Fuera del scope de esta ronda.
- **IN-06** — `cashRegisterIdOverride` confiado sin re-validación en el service. Fuera del scope de esta ronda.
- **IN-07** — Input Monto acepta decimales que la API rechaza con error genérico (`CobrosPage.vue:467-480`, sin cambios en 151-05).

### Diferido por diseño (NO re-reportado)

- Badge **Validado-vs-Pendiente** en el historial: requiere exponer `validationStatus` en el endpoint de listado (backend). Documentado en 151-05-SUMMARY.md Known Stubs. La fila anulada ya se distingue (WR-03 cerrado).

---

_Reviewed: 2026-07-03T17:48:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
