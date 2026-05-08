# Deferred Items — Phase 113

## Pre-existing tsc errors in admin (out of scope for 113-02)

3 TS errors in `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` exist on `master` BEFORE Plan 113-02 changes:

- `(218,11)` — `Property 'vfs' does not exist on type 'typeof pdfmake'` (pdfmake type drift)
- `(481,7)` and `(662,7)` — `margin: number[]` not assignable to `Margins` tuple type

These are stale pdfmake @types compatibility issues — unrelated to scheduling/activities. Verified by stashing the Plan 113-02 changes and re-running `pnpm tsc --noEmit` → same 3 errors. Recommend a future housekeeping plan to widen pdfmake types or pin a compatible @types/pdfmake version.
