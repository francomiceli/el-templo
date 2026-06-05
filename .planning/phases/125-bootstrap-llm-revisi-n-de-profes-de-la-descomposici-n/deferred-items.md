# Deferred items — Phase 125

## Pre-existing vue-tsc errors (out of scope for plan 125-03)

`el-templo-admin` has a pre-existing non-clean `vue-tsc --noEmit` baseline. Files with
pre-existing errors (all UNMODIFIED in the working tree, none touched by 125-03):

- `src/utils/pdf/session-pdf-builder.ts` — `@types/pdfmake` typing mismatch (`vfs`, `Margins`).
- `src/boot/__tests__/axios-refresh-lock.test.ts`
- `src/components/ProgramWizardDialog.vue`
- `src/components/reports/TrialSessionsReport.vue`
- `src/components/scheduling/SesionesDePruebaDialog.vue`
- `src/components/sessions/EditableBlockCard.vue`
- `src/pages/AlumnoDetailPage.vue`
- `src/pages/DeudasPage.vue`
- `src/pages/HorariosPage.vue`
- `src/pages/SessionEditPage.vue`

None of these are introduced by 125-03 (changeset = `ProposalReviewPage.vue`,
`useProposalsApi.ts`, `proposal.ts`, `routes.ts`, `AdminLayout.vue`). Not fixed here per
the executor SCOPE BOUNDARY (only auto-fix issues caused by the current task).

The 125-03 acceptance gate is therefore evaluated as: zero errors attributable to the
new/modified proposal-review files (verified via `vue-tsc --noEmit | grep -i proposal` → none).
