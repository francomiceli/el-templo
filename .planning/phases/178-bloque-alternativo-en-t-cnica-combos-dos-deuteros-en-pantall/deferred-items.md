# Deferred Items — Fase 178

## 178-02: vue-tsc baseline preexistente (fuera de alcance)

Al ejecutar `npx vue-tsc --noEmit` como parte de la verificación del plan 178-02
se encontraron errores de tipos **preexistentes, no relacionados con este plan**
(ninguno referencia `roleLabels.ts`, `session.ts` ni `blockColors.ts`):

- **el-templo-admin:** 20 errores (`AssignPlanDialog.vue`, `ProgramWizardDialog.vue`,
  `BandejaPendientesTab.vue`, `PorSocioTab.vue`, `ClassRatingsPanel.vue`,
  `TrialSessionsReport.vue`, `SesionesDePruebaDialog.vue`, `EditableBlockCard.vue`,
  `ExerciseFlowNode.vue`, `VariantFlowNode.vue`, `HorariosPage.vue`,
  `SessionEditPage.vue`, `session-pdf-builder.ts`, `axios-refresh-lock.test.ts`).
- **el-templo-app:** 20 errores (`axios-refresh-lock.test.ts`, `boot/auth.ts`,
  `boot/axios.ts`, `boot/sentry.ts`, `boot/staging-marker.ts`, `MainLayout.vue`,
  `OnboardingQuestion.vue`, `ChangePasswordPage.vue`, `IndexPage.vue`,
  `ProfilePage.vue`, `router/index.ts`, `router/routes.ts`, `logger.ts`).

Consistente con `reference_ci_no_typecheck_frontends.md`: CI no typechequea
`el-templo-app` ni `el-templo-admin`, así que esta deuda nunca bloqueó un pipeline
y se acumuló sin que nadie la viera. **No se tocó ninguno de estos archivos** —
scope boundary del plan 178-02 (labels + `BlockRole`).

**Lo que SÍ era responsabilidad de este plan y se corrigió (Rule 1/3, no
listado en `<files>` del plan pero causado directamente por extender
`BlockRole`):** `el-templo-app/src/modules/training/utils/blockColors.ts` tiene
3 diccionarios `Record<BlockRole, string>` exhaustivos (`getBlockColorClass`,
`getBlockAccentColor`, `getBlockCSSColor`) que dejaron de compilar al agregar
`COMBOS_II_ALT`/`TECNICA_II_ALT` a la unión — se completaron reusando el mismo
color/clase que su rol `*_II` hermano (mismo patrón "sin CSS nuevo" de la fase
160). Verificado: después de este fix, `vue-tsc` del app pasó de 23 a 20
errores y ninguno de los 20 restantes menciona `BlockRole`, `blockColors` ni
los roles nuevos.
