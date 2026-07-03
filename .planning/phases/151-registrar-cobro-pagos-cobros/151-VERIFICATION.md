---
phase: 151-registrar-cobro-pagos-cobros
verified: 2026-07-03T18:15:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "El registro del cobro se organiza como pantallas/pasos separados, funcionando bien en desktop y mobile (COBRO-02) — CR-01 (Sede caída para alta de socio existente) y WR-01 (dead-ends alumno nuevo + misc/renew) cerrados en el código."
    - "All existing PoS behavior is preserved (151-03-PLAN.md must_have) — Sede selector restaurado para TODA alta."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Recorrido visual completo del wizard de 4 pasos Cobros en desktop y mobile (header de progreso, transiciones, layout de dos columnas, diálogo de abandono)"
    expected: "Los pasos fluyen visualmente según 151-UI-SPEC.md — transiciones slide, panel resumen sticky, colapso responsive en mobile, sin layout shift"
    why_human: "Calidad visual/de interacción (animaciones, breakpoints responsive, pulido percibido) no se puede verificar leyendo código estático"
  - test: "Alta de socio existente de una sede DISTINTA a la del operador — confirmar en pantalla que el selector de Sede aparece, es editable, y que CobroResumen muestra la sede elegida antes de Confirmar"
    expected: "El selector de Sede aparece en el paso 2 antes de la grilla de planes para CUALQUIER alta (socio existente o alumno nuevo); CobroResumen muestra la fila 'Sede' con el nombre correcto"
    why_human: "Confirmación visual del fix de código ya verificado estáticamente (CR-01 cerrado); un pase visual da confianza adicional sobre el dato que se persiste"
  - test: "Alumno nuevo + intento de 'Cobro suelto' / 'Renovar plan vigente' (verificar que las opciones aparecen deshabilitadas con el hint 'Solo para socios existentes' y que sólo 'Asignar plan nuevo' es clickeable)"
    expected: "Las opciones renew/misc se muestran atenuadas/deshabilitadas con el hint; no hay forma de llegar a un Confirmar permanentemente bloqueado sin explicación"
    why_human: "Confirmación visual del fix (WR-01 cerrado); el estado deshabilitado+hint es una señal de UI que amerita un vistazo humano"
---

# Phase 151: Registrar cobro (Pagos → Cobros) Verification Report

**Phase Goal:** El registro de cobro se renombra a "Cobros" y se rediseña en pasos separados (una cosa por paso), con fecha/hora en el listado y asociación obligatoria de cuenta bancaria para transferencia/tarjeta. End state: "Pagos" es "Cobros" en toda la superficie; el flujo de carga ya no es una sucesión de expansiones anidadas sino pantallas/pasos separados que funcionan bien en desktop y mobile; el listado muestra fecha+hora con "Continuar" arriba; y un cobro bancario no se puede finalizar sin una cuenta asociada.

**Verified:** 2026-07-03T18:15:00Z
**Status:** human_needed
**Re-verification:** Sí — después del cierre de gaps (plan 151-05, commits `6a295363`, `706dba6a`)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                       | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Pagos" se renombra "Cobros" en nav, página y textos (COBRO-01)                                                                             | ✓ VERIFIED | Re-chequeado sin regresión: `routes.ts` `path: 'cobros'` + redirect `/pagos → /cobros`; nav `templo-config.ts` label `'Cobros'`; página `CobrosPage.vue`. Sin cambios desde la verificación previa.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | Registro de cobro organizado en pasos separados, funcionando bien desktop+mobile (COBRO-02)                                                 | ✓ VERIFIED | CR-01 y WR-01 (los dos motivos de FAILED en la ronda previa) confirmados cerrados leyendo el código actual: selector de Sede único (`grep -c 'v-model="sucursalId"'` = 1) dentro del bloque `mode === 'alta'` del paso 2 (línea 330), alcanzable para socio existente Y alumno nuevo; `isAssociationDisabled`/`isNewStudentContext` (líneas 821-828) deshabilitan renew/misc para alumno nuevo con hint; `onSelectAssociation` (línea 834) early-return si deshabilitada; `canContinueStep` caso 2 misc exige `selectedMember.value != null` (línea 1027). Ver residual no bloqueante WR-06 en Anti-Patterns. |
| 3   | Listado muestra fecha+hora, CTA "Continuar" arriba (COBRO-03)                                                                               | ✓ VERIFIED | Re-chequeado sin regresión: `groupedLoads`, `formatTime(ticket.createdAt)`, CTA "Registrar cobro" arriba de la portada. Sin cambios desde la verificación previa.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | Transferencia/tarjeta exige cuenta bancaria existente; sin cuentas ofrece alta rápida inline; no permite finalizar sin asociarla (COBRO-04) | ✓ VERIFIED | Backend sin cambios desde 151-04 (`git diff 80ffeb39..HEAD` sobre los 4 archivos backend = vacío); guard `validateBankAccountForCharge` y wiring frontend (`needsBankAccount`, `canConfirm`/`canContinueStep` gating, `CuentaBancariaFormDialog`) intactos.                                                                                                                                                                                                                                                                                                                                                   |
| 5   | All existing PoS behavior is preserved (151-03-PLAN.md must_have)                                                                           | ✓ VERIFIED | CR-01 cerrado: Sede selector restaurado y reachable para toda alta (idéntico al comportamiento pre-151 de `PagosPage.vue`), con la sede resuelta ahora también surfaceada read-only en `CobroResumen` (mejora sobre el comportamiento pre-151, que no la mostraba en un resumen). `resumenSede` computed (línea 885) null para renew/misc (branch server-derived), non-null para alta.                                                                                                                                                                                                                        |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                               | Expected                                                          | Status     | Details                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `el-templo-admin/src/pages/CobrosPage.vue`             | Sede q-select en step-2 alta + guards de dead-end + hygiene fixes | ✓ VERIFIED | Único `v-model="sucursalId"` en línea 330, dentro de `v-else-if="mode === 'alta'"`; `isNewStudentContext`/`isAssociationDisabled` líneas 821-828; `onUsarExistente` llama `loadAutocompletar` (línea 1210); `selectPlan` limpia `currentIdempotencyKey` (línea 1288); badge condicional `voidedAt` (líneas 63-64). |
| `el-templo-admin/src/components/caja/CobroResumen.vue` | prop `sede` opcional + fila read-only                             | ✓ VERIFIED | Prop `sede?: string                                                                                                                                                                                                                                                                                                | null`(default`null`), fila "Sede" con `v-if="sede"` después de Socio (líneas 27-32). |
| `el-templo-admin/src/router/index.ts`                  | fallback role-denied vía `landingForRole` (sin `/pagos`)          | ✓ VERIFIED | `defaultPages` eliminado (`grep -c defaultPages` = 0), `'/pagos'` eliminado (`grep -c "'/pagos'"` = 0), `return landingForRole()` en la rama role-denied (línea 59).                                                                                                                                               |
| `el-templo-api/*` (4 archivos backend de COBRO-04)     | sin cambios desde 151-04                                          | ✓ VERIFIED | `git diff 80ffeb39..HEAD` sobre `coach-load-routes.ts`, `subscriptions/service.ts`, `subscriptions/types.ts`, `cash-register-service.ts` = vacío. Comportamiento COBRO-04 intacto.                                                                                                                                 |

### Key Link Verification

| From                                     | To                                              | Via                                              | Status | Details                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| CobrosPage.vue step-2 alta Sede q-select | assignPlan branchId (`CoachAltaInput.branchId`) | `v-model="sucursalId"` alcanzable para toda alta | WIRED  | Confirmado: único selector, sin `v-if` restrictivo por origen del socio (línea 325 `v-else-if="mode === 'alta'"` engloba ambos casos). |
| CobrosPage.vue `resumenSede`             | CobroResumen `sede` prop                        | pasado a las 3 monturas                          | WIRED  | `grep -c ':sede="resumenSede"'` = 3 (líneas 131, 581, 612).                                                                            |
| CobrosPage.vue association q-item loop   | `onSelectAssociation` / `isAssociationDisabled` | `:disable` + early-return                        | WIRED  | Confirmado en template (líneas 272, 285-289) y función (línea 834).                                                                    |
| `onUsarExistente`                        | `loadAutocompletar`                             | llamada directa tras adoptar el socio dedup      | WIRED  | Línea 1210, mirror de `onMemberSelected`.                                                                                              |
| router `beforeEach` role-denied branch   | `landingForRole()`                              | fuente única, `defaultPages` eliminado           | WIRED  | Línea 59 de `router/index.ts`.                                                                                                         |

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable                  | Source                                   | Produces Real Data                    | Status                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resumenSede` → CobroResumen | `branchOptions.find(...).name` | `loadBranches()` (GET branches endpoint) | Sí (mientras `loadBranches` no falle) | ⚠️ Ver IN-08 (info, aceptado): si `loadBranches()` falla, `branchOptions` queda vacío y `resumenSede` devuelve `null` (fila oculta), pero `sucursalId` conserva el default silenciosamente. Baja probabilidad, no bloqueante — documentado y aceptado en 151-REVIEW.md. |

### Behavioral Spot-Checks

| Behavior                                                                                | Command                                                                                                        | Result            | Status |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ------ |
| Único selector de Sede (`sucursalId`) en el archivo                                     | `grep -c 'v-model="sucursalId"' CobrosPage.vue`                                                                | `1`               | ✓ PASS |
| Selector de Sede reachable para socio existente Y alumno nuevo (no dentro de mini-form) | lectura de código: bloque envolvente `v-else-if="mode === 'alta'"` (línea 325) engloba el selector (línea 330) | confirmado        | ✓ PASS |
| `resumenSede` pasado a las 3 monturas de CobroResumen                                   | `grep -c ':sede="resumenSede"' CobrosPage.vue`                                                                 | `3`               | ✓ PASS |
| Guard de alumno nuevo bloquea renew/misc                                                | lectura de código: `isAssociationDisabled`, `onSelectAssociation`, `canContinueStep` caso 2                    | confirmado        | ✓ PASS |
| `defaultPages`/`'/pagos'` eliminados de router                                          | `grep -c defaultPages router/index.ts`; `grep -c "'/pagos'" router/index.ts`                                   | `0` / `0`         | ✓ PASS |
| Sin hex hardcodeado en los 3 archivos tocados                                           | `grep -c "#[0-9a-fA-F]\{6\}"` sobre los 3 archivos                                                             | `0` / `0` / `0`   | ✓ PASS |
| Typecheck admin (scoped a los archivos de la fase)                                      | `cd el-templo-admin && npx vue-tsc --noEmit 2>&1 \| grep -iE "CobrosPage\|CobroResumen\|router/index"`         | sin coincidencias | ✓ PASS |
| Backend COBRO-04 sin regresión desde 151-04                                             | `git diff 80ffeb39..HEAD -- <4 archivos backend>`                                                              | sin diferencias   | ✓ PASS |

### Probe Execution

No hay probes declarados en las PLAN/SUMMARY de esta fase, ni scripts convencionales `scripts/*/tests/probe-*.sh`. No aplica — fase de feature, no de migración/tooling.

### Requirements Coverage

| Requirement | Source Plan            | Description                                                              | Status    | Evidence                                                                                                            |
| ----------- | ---------------------- | ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| COBRO-01    | 151-03, 151-05         | Rename Pagos→Cobros (nav/página/textos)                                  | SATISFIED | Confirmado sin regresión; router fallback ahora vía `landingForRole` (WR-05 cerrado).                               |
| COBRO-02    | 151-02, 151-03, 151-05 | Pasos separados en vez de acordeones anidados, funcionando bien          | SATISFIED | CR-01 y WR-01 cerrados en código; residual WR-06 (back-nav, no bloqueante) documentado, no impide "funcionar bien". |
| COBRO-03    | 151-03                 | Fecha+hora en listado, CTA arriba                                        | SATISFIED | Confirmado sin regresión; badge "Anulado" ahora honesto (WR-03 cerrado).                                            |
| COBRO-04    | 151-01, 151-02, 151-04 | Cuenta bancaria obligatoria en transferencia/tarjeta, alta rápida inline | SATISFIED | Backend intacto (sin cambios desde 151-04); wiring completo confirmado en la ronda previa, no tocado por 151-05.    |

Sin requerimientos huérfanos: los 4 IDs de REQUIREMENTS.md (COBRO-01..04) están mapeados a la Fase 151 y cubiertos por al menos un plan (incluyendo el plan de cierre 151-05).

### Anti-Patterns Found

| File                                       | Line                             | Pattern                                                                                                                                                                                                                                                                                                     | Severity   | Impact                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-admin/src/pages/CobrosPage.vue` | 1172-1177 (`onNuevoAlumno`)      | WR-06 (nuevo, del code review): un `mode` previo (`renew`/`misc`) sobrevive al pasar a contexto de alumno nuevo vía back-nav; queda resaltado-activo-pero-deshabilitado con cuerpo huérfano/vacío (paso 2 confuso). Confirmado por este verificador: `onNuevoAlumno` y `resetChargeFields` no tocan `mode`. | ⚠️ Warning | No es un dead-end duro — el usuario puede tocar "Asignar plan nuevo" (única opción habilitada) para continuar; requiere una secuencia específica de navegación hacia atrás para reproducirse. No bloquea "funcionando bien" de forma unívoca, pero es una UX confusa residual. |
| `el-templo-admin/src/pages/CobrosPage.vue` | 1149-1160 (`loadBranches` catch) | IN-08 (nuevo, info): si `loadBranches()` falla, `sucursalId` conserva el default sin que el operador lo vea (degradación silenciosa parcial del fix CR-01). Baja probabilidad (requiere que branches falle mientras plans funciona); mitigado por reintento en `onSelectAssociation('alta')`.               | ℹ️ Info    | Riesgo residual aceptado, documentado en 151-REVIEW.md.                                                                                                                                                                                                                        |
| `el-templo-admin/src/pages/CobrosPage.vue` | 1197-1211 (`onUsarExistente`)    | IN-09 (nuevo, info): no limpia `currentIdempotencyKey`/`amount` al adoptar socio vía dedup (asimetría vs. `onMemberSelected`). Sin exposición real hoy (no hay camino alcanzable), depende de limpiezas aguas abajo.                                                                                        | ℹ️ Info    | Frágil ante refactors futuros, no bloqueante hoy.                                                                                                                                                                                                                              |
| —                                          | —                                | IN-01..IN-07 (llevados de la ronda previa, aceptados, no bloqueantes)                                                                                                                                                                                                                                       | ℹ️ Info    | Ver 151-REVIEW.md para detalle; ninguno re-litigado en esta ronda.                                                                                                                                                                                                             |

Sin marcadores `TBD`/`FIXME`/`XXX` sin resolver en los archivos modificados por esta fase (`CobrosPage.vue`, `CobroResumen.vue`, `router/index.ts`).

### Human Verification Required

### 1. Recorrido visual completo del wizard de 4 pasos Cobros

**Test:** Recorrer portada → Socio → ¿Qué se cobra? → ¿Cómo se paga? → Resumen en desktop y mobile.
**Expected:** Header de progreso, transiciones slide, layout de dos columnas en desktop con resumen sticky, header de resumen colapsado en mobile — todo según 151-UI-SPEC.md.
**Why human:** El pulido visual/de interacción (suavidad de animaciones, breakpoints responsive, layout shift) no se puede juzgar leyendo código estático.

### 2. Alta de socio existente de sede distinta a la del operador — confirmación visual del fix CR-01

**Test:** Como coach/gestión multi-sede, iniciar un alta para un socio EXISTENTE de una sede distinta a la del operador; confirmar que el selector de Sede aparece en el paso 2, es editable, y que el resumen muestra la sede elegida antes de Confirmar.
**Expected:** El selector aparece y es editable para CUALQUIER alta; `CobroResumen` muestra la fila "Sede" con el nombre correcto.
**Why human:** El fix ya está verificado estáticamente en el código (CR-01 cerrado); un pase visual confirma que no hay ningún problema de renderizado/reactividad no capturado por la lectura de código.

### 3. Alumno nuevo + "Cobro suelto"/"Renovar plan vigente" — confirmación visual del fix WR-01

**Test:** Iniciar "Nuevo alumno" en el paso 1, y en el paso 2 verificar que "Renovar plan vigente" y "Cobro suelto" aparecen deshabilitados con el hint "Solo para socios existentes", y que sólo "Asignar plan nuevo" es clickeable.
**Expected:** Las opciones se muestran atenuadas/deshabilitadas con el hint; ningún camino hacia adelante llega a un Confirmar bloqueado sin explicación.
**Why human:** El fix ya está verificado estáticamente (WR-01 cerrado); confirmación visual da certeza adicional sobre el estado deshabilitado y el hint.

### Gaps Summary

Los dos gaps bloqueantes de la ronda anterior (CR-01: Sede caída para alta de socio existente; y el fail combinado de "PoS behavior preserved") están **cerrados y verificados independientemente en el código actual**: el selector de Sede único vive ahora en el bloque `mode === 'alta'` del paso 2, alcanzable para socio existente Y alumno nuevo, con la sede resuelta surfaceada read-only en `CobroResumen`. El warning WR-01 (dead-ends alumno nuevo + misc/renew) también está cerrado: las opciones renew/misc se deshabilitan con hint para un alumno nuevo, `onSelectAssociation` tiene guard de entrada, y `canContinueStep` exige `selectedMember` para misc.

Las 4 correcciones de higiene adicionales (WR-02 dedup autocompletar, WR-03 badge honesto de anulado, WR-04 idempotency key en cambio de plan, WR-05 router fallback vía `landingForRole`) también están confirmadas en el código.

Un warning nuevo y no bloqueante (WR-06) quedó documentado por el code review y confirmado por este verificador: un `mode` previo puede sobrevivir a un cambio de contexto a alumno nuevo por navegación hacia atrás, dejando una opción resaltada-pero-deshabilitada con cuerpo vacío — pero el usuario siempre tiene un camino habilitado hacia adelante ("Asignar plan nuevo"), por lo que no constituye un dead-end duro ni bloquea la afirmación "funciona bien" de COBRO-02. Se recomienda trackearlo como fast-follow de bajo costo (el fix propuesto en 151-REVIEW.md es un one-liner en `onNuevoAlumno`).

Con los 5/5 truths verificados en código, el estado pasa a `human_needed`: quedan 3 ítems de verificación humana (2 de ellos son confirmaciones visuales de fixes ya verificados estáticamente, no gaps nuevos) más el recorrido visual general del wizard, que es inherente y no se puede resolver por grep/lectura de código.

---

_Verified: 2026-07-03T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
