## Deferred (out of scope — plan 150-04)

- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` — errores TS pre-existentes de tipos de `@types/pdfmake@0.3.1` (`vfs` no existe, `margin: number[]` vs `Margins` tuple). No relacionados con el ABM de cuentas bancarias. CI transpila con esbuild/vitest (no vue-tsc estricto) — no bloquean build.
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — ya aparecía modificado (MM) en git status al inicio; ajeno a este plan.
