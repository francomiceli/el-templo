# Milestone: Egresos y rendiciones (fases 207-212)

Origen: pedido funcional de administración (2026-11-10), leído punto por punto con Franco. Fuente de verdad de las decisiones: `DECISIONES.md` (D-01..D-24) en esta carpeta. **Leer primero el §20: D-23 (la plata queda en unidades enteras) y D-24 (recorte del milestone).** Brief original: `BRIEF.md` (v2 arriba, v1 abajo; la v2 SACÓ sueldos de profesores). Textos para administración: `RESPUESTA-PARA-ADMINISTRACION.md`.

Planilla modelo (no versionada, binaria): `/home/franco/projects/el-templo/.docs/El Templo · Pagos e imputación · Noviembre 2026 · Plantilla.xlsx` — su estructura está transcripta en `BRIEF.md` §v2.

## Método (D-22)

- Una fase GSD por tanda. Rama única `feat/egresos-rendiciones` en el worktree `/home/franco/projects/et-egresos` (base `origin/master` `8c42c59f8`, 2026-11-10). Fases secuenciales: cada una arranca sobre la anterior.
- Planifica el modelo caro (opus); ejecutan `gsd-executor` en `model: sonnet`, SECUENCIALES (comparten worktree). El orquestador verifica tras cada plan (worktree limpio + `tsc --noEmit` API + vue-tsc admin sin sumar errores).
- Tests de integración se escriben siempre; localmente solo se corren los archivos tocados, en foreground. La suite completa la corre CI.
- Sin push sin OK de Franco. Staging-first. Sin bump de versión de la app.
- Migraciones: la rama usa 0327-0329. `origin/master` ya usó la **0330** (2026-11-11) y la fase 213 tiene reservadas 0340-0342. Las de la 209 van desde la **0331**. RE-VERIFICAR contra `origin/master` y `origin/staging` antes de escribir cada migración y antes de cada push.
- **Plata en unidades enteras (D-23).** Columnas `int`, schemas `type: "integer"`, inputs numéricos enteros en el admin. No existen `shared/money.ts`, `MoneyInput` ni `utils/money`. El detalle del retiro de centavos está en `SIN-CENTAVOS-SUMMARY.md`.
- Tablas gym-owned nuevas: respetar los 5 conteos de tenancy (`reference_tabla_gym_owned_nueva_cinco_conteos`) y los gates de ruta/job nueva (ISO-01, CON-04…). Ver skills del repo en `.claude/skills/` (`el-templo-db-migrations`, `el-templo-change-control`).

## Fases (estado al 2026-11-11, después de D-23 y D-24)

| Fase | Tanda | Estado | Decisiones |
|---|---|---|---|
| 207 | Sede del alumno en cada cobro. El cambio a centavos se revirtió (D-23) | Hecha, centavos retirados en `9a342ad84` | D-14 |
| 208 | Cuentas: USD, Tesoro, cheque, coherencia medio↔cuenta, retiro con destino, arqueo de apertura | Hecha (11 planes) | D-09, D-19 |
| 209 | Egresos recortada: gasto + reparto + pagos, rubros, links de comprobante, estimado/confirmado, tipo de cambio manual, Resumen, sección propia | En curso. Alcance en `.planning/phases/209-egresos/209-CONTEXT.md` | D-01, D-03, D-04, D-05, D-10, D-11, D-23, D-24 |
| 210 | Caja: extracto por cuenta, por conciliar, cambio de moneda | EN ESPERA (D-24). No planificar | D-13, D-20 |
| 211 | Resultado por sede y consolidado, como informe chico | Pendiente, después de la 209 | D-14, D-17 |
| 212 | Rendiciones a inversores | EN ESPERA (D-24). No planificar | D-15, D-16, D-17 |

Quedó fuera de la 209 por D-24: tipo de cambio por API del BNA (D-07, D-08), repartos guardados con nombre (D-02), importador de planilla (D-18) y "cerrar mes" (D-21).

Pendiente fuera de fase: saldo de apertura de los bancos el día que arranque Egresos (hoy los bancos nunca registraron una salida, ver la auditoría en `/home/franco/projects/el-templo/.docs/administracion-egresos-sueldos/AUDITORIA-2026-11-11.md`).

T0 (fuera del milestone): idempotencia de traslados (D-12), rama `fix/traslados-idempotencia`, worktree `et-traslados-idem`.
