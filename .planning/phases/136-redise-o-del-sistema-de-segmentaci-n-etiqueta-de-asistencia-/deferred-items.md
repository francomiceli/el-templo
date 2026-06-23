# Deferred Items — Phase 136

## From plan 136-05 (out-of-scope pre-existing typecheck errors in el-templo-admin)

Discovered during 136-05 file-scoped typecheck. NOT caused by the segmentation
changes (no `MemberSegment`/`SegmentThresholds` involvement); both files predate
this plan. Left untouched per SCOPE BOUNDARY.

- `src/utils/pdf/session-pdf-builder.ts` — `pdfMake.vfs` property missing on
  `@types/pdfmake@0.3.1`, and two `Content` type-assignment errors (TS2339/TS2322).
  Pre-existing pdfmake typing drift, unrelated to segmentation.
- `src/boot/__tests__/axios-refresh-lock.test.ts` — `Cannot find module 'vitest'`
  (TS2307) + axios interceptor mock typing (TS2322). Pre-existing test-tooling
  type resolution issue, unrelated to segmentation.

## Expected breakage (resolved by 136-07, NOT deferred)

- `src/composables/useSettingsApi.ts` + `src/pages/ConfiguracionPage.vue` —
  typecheck errors after `SegmentThresholds` removal from `types/member.ts`.
  Intentional; plan 136-07 (wave 3, depends_on 05) deletes both files.
