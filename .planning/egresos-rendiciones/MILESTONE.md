# Milestone: Egresos y rendiciones (fases 207-212)

Origen: pedido funcional de administración (2026-11-10), leído punto por punto con Franco. Fuente de verdad de las decisiones: `DECISIONES.md` (D-01..D-22) en esta carpeta. Brief original: `BRIEF.md` (v2 arriba, v1 abajo; la v2 SACÓ sueldos de profesores). Textos para administración: `RESPUESTA-PARA-ADMINISTRACION.md`.

Planilla modelo (no versionada, binaria): `/home/franco/projects/el-templo/.docs/El Templo · Pagos e imputación · Noviembre 2026 · Plantilla.xlsx` — su estructura está transcripta en `BRIEF.md` §v2.

## Método (D-22)

- Una fase GSD por tanda. Rama única `feat/egresos-rendiciones` en el worktree `/home/franco/projects/et-egresos` (base `origin/master` `8c42c59f8`, 2026-11-10). Fases secuenciales: cada una arranca sobre la anterior.
- Planifica el modelo caro (opus); ejecutan `gsd-executor` en `model: sonnet`, SECUENCIALES (comparten worktree). El orquestador verifica tras cada plan (worktree limpio + `tsc --noEmit` API + vue-tsc admin sin sumar errores).
- Tests de integración se escriben siempre; localmente solo se corren los archivos tocados, en foreground. La suite completa la corre CI.
- Sin push sin OK de Franco. Staging-first. Sin bump de versión de la app.
- Migraciones: master está en **0326** (2026-11-10). Numerar desde 0327 y RE-VERIFICAR contra `origin/master` y `origin/staging` antes de cada push (otras sesiones agregan migraciones).
- Tablas gym-owned nuevas: respetar los 5 conteos de tenancy (`reference_tabla_gym_owned_nueva_cinco_conteos`) y los gates de ruta/job nueva (ISO-01, CON-04…). Ver skills del repo en `.claude/skills/` (`el-templo-db-migrations`, `el-templo-change-control`).

## Fases

| Fase | Tanda | Decisiones |
|---|---|---|
| 207 | Centavos en el sistema de plata + sede del alumno en cada cobro | D-06, D-14 |
| 208 | Cuentas: USD, Tesoro, cheque, coherencia medio↔cuenta, retiro con destino, arqueo de apertura | D-09, D-19 |
| 209 | Egresos: gasto + reparto + pagos, repartos guardados, rubros, comprobantes, estimado/confirmado, TC BNA, Resumen, cerrar mes, sección propia, importar planilla | D-01..D-05, D-07, D-08, D-10, D-11, D-18, D-21 |
| 210 | Caja: extracto por cuenta, por conciliar, cambio de moneda | D-13, D-20 |
| 211 | Resultado por sede y consolidado | D-14, D-17 |
| 212 | Rendiciones a inversores | D-15, D-16, D-17 |

T0 (fuera del milestone): idempotencia de traslados (D-12), rama `fix/traslados-idempotencia`, worktree `et-traslados-idem`.
