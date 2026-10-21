---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 22
subsystem: app-training
tags: [verificacion-visual, contraste, wcag, d-16, staging]
requires: ["197-21"]
provides:
  - Capturas "después" a 360/390/412 de 24 estados, contraste medido sobre fondo real, primer viewport y desborde
  - Lista de hallazgos (sin correcciones) para /gsd:plan-phase 197 --gaps
key-files:
  created: []
  modified: []
requirements: [D-02, D-03, D-04, D-06, D-15, D-16, D-17, D-18]
---

# Fase 197 Plan 22: Verificación visual medida — Summary

Task 1 (decisión) quedó resuelta por el orquestador: Franco aprobó, la rama está en `origin/staging` (commit `51352365c`, CI verde, app + API con migraciones 0285/0286), así que se capturó contra **staging** (no option-a ni option-c). No se buildeó, instaló ni pusheó nada. Staging en solo lectura: toda escritura interceptada (63 en total, 0 llegaron a staging); los endpoints nuevos se mockearon con datos realistas según `sessions/schemas.ts`.

Todo el material está fuera del repo, en `/home/franco/projects/el-templo/.docs/entrenar-rediseno/despues/` (gitignoreado): `RESUMEN.md` (tablas completas), `hallazgos.md`, 24 carpetas `S*/` con capturas a los 3 anchos, `contrast.txt/json`, `report.json`, `writes.json`, y `mocks/`. Herramientas adaptadas en `.../herramientas/` (`capture.cjs` con `__post`/`setPost`/`__byQuery`/rutas `*`/`__shiftClock`, `mkmocks-despues.cjs`, `analyze-despues.py`, `run.sh`; originales en `*.pre22`). El contraste se mide a 390 (la herramienta captura el fondo sin texto solo a ese ancho); a 360 y 412 se mide posición de botones y desborde.

## Commits

Ninguno de código. Este SUMMARY es el único commit (`docs(197-22): ...`).

## Estados capturados (24, ninguno salteado)

Semana (hoy con Nucleus/Athlos/Deuteros 2 de nombre largo/Initium, pasado completado, futuro, domingo, sábado Movilidad, semana anterior, hoy completada con "Hecha" y link a Libre, hoy lunes sin plani, hoy domingo) · vidriera sin plan · Libre (con AURA: todo, filtro espalda con "ya trabajado", piernas, 1 zona con 1 bloque, ver más con 87 bloques, tap en la figura; AURA cobrada; vacío con y sin filtro; error de carga) · Desafíos y Conquer · player libre (inicio con y sin AURA, en curso con barra vacía/mitad/llena y sin barra, bloque completo, confirmación de salir, celebración con +5 y "otro bloque", resumen con y sin AURA, resumen <10' con "Seguir entrenando", segunda vuelta con +5, bloque no disponible 404) · player de la sesión completa (17 escenas del antes) · resumen de sesión (desde Mi Templo, desde Semana por Mi Templo y con carga directa) · Guía (7 historias) · Mi Templo (link con sesión completada incl. su click, sin reserva, con asistencia; antes de la clase SIN link como control) · socio masculino (Semana y Libre).

Estados extremos cubiertos: nombre largo ("Front Lever Pull Ups · Buy-in / Cash-out"), zona con 1 bloque, 87 bloques/varias páginas, día sin plani, `female` y `male`.

## Contraste (fallan instancias / únicos / reales; antes → después)

| Pantalla | Antes | Después |
|---|---|---|
| Semana hoy (`E1` carrusel viejo → `S1`) | 28 / 10 / 10 | 2 / 2 / 0 (CTA deshabilitado "Disponible el...", exento) |
| Semana completada (`E1b` → `S1b`) | 4 / 4 / 4 | 2 / 1 / 1 (link "¿Te quedaste con ganas?", 4,27) |
| Vidriera / sin plan (`E2` → `S2`) | 1 / 1 / 1 | 2 / 2 / 0 (flechas decorativas del fondo desenfocado) |
| Player sesión completa (`E4` → `S6`) | 127 / 60 / 56 | 7 / 5 / 0 (artefactos y botón deshabilitado) |
| Resumen (`E5` → `S7`) | 13 / 7 / 7 | 0 / 0 / 0 |
| Guía (`E3` → `S8`) | 0 / 0 / 0 | **3 / 3 / 3 (regresión)** |
| Libre (S3, S3b, S3c, S3d), player libre (S5..S5d), Desafíos/Conquer, Mi Templo (S9..S9d), S10, S1c, S7b | n/a (nuevos) | 0 reales salvo: "Ver más bloques"/"Quitar filtro" 4,27-4,32 (hallazgo 3), "Salir" 4,43 (10), ícono 404 1,13 (8), vacío de resumen 2,30/1,13 (2) |

Totales: 3851 textos medidos, 23 textos únicos fallan, 13 reales (todos en hallazgos). Las 66 fallas reales únicas del "antes" (E1b/E2/E3/E4/E5) quedaron resueltas o ya no existen: 0 siguen.

### Las 8 fallas conocidas de D-16 (p10 medido, antes → después)

| # | Texto | Antes | Después |
|---|---|---|---|
| 1 | Autor de la cita (blanco .5) | 4,23 | 6,20 OK |
| 2 | Parámetros del formato (negro .5) | 3,86 | 6,03 OK |
| 3 | Descripción del formato (negro .45) | 3,27 | 6,03 OK |
| 4 | "Ver bloques anteriores" (negro .4) | 2,79 | 6,03 OK |
| 5 | "Resumen de sesión" (terracota .6) | 2,24 | 5,84 OK |
| 6 | Mensaje del RPE (terracota .8) | 2,91 | 5,45 OK |
| 7 | "Objetivo" del ajuste (secondary .65) | 2,6 estimado | no medible: `IN_SESSION_ADJUST_ENABLED` apagado, no se renderiza |
| 8 | "DESCANSO ACTIVO" (blanco .5) | 4,23 | 6,20 OK |

## Primer viewport (390x844, zona útil y=50..788) y desborde

- **Desborde horizontal: ninguno** a 360/390/412 en los 24 estados y todas las escenas.
- CTA dentro del primer viewport en los 3 anchos: Semana (todos los estados: "Empezar", "Ver resumen", "Hacerla igual", "Disponible el...", "Elegir un bloque libre"), vidriera, inicio/celebración/resumen del player libre, "Seguir entrenando", "Probá el modo Libre" (y=327-394), Reintentar.
- **No caben**: "Empezar" de la primera card de Libre a 360 y 390 (757-793; a 412 sí) → hallazgo 4. Sin cambio respecto del antes: "Terminar sesión" del resumen con RPE (953-1005) y "Repetir sesión" del resumen de solo lectura (942-994).

## Hallazgos (sin corregir; para `/gsd:plan-phase 197 --gaps`), por severidad

Rutas bajo `/home/franco/projects/el-templo/.docs/entrenar-rediseno/despues/`; detalle y capturas completas en `hallazgos.md`.

1. **Media — Guía: D-16 empeoró 3 textos** (0 → 3 fallas): "En un minuto te contamos..." 4,29; "No se sube por antigüedad..." 4,49; "Cuando tus sesiones te resultan cómodas..." 4,26. `S8-guia/01-bienvenida-w390-00.png`, `S8-guia/05-avanzar-w390-00.png`. Sospecha `GuiaPage.vue:408` (`$story-dark-muted: $pd-cream-2`, más oscuro que el `rgba(cream,.9)` anterior) y `:413` (`$story-light-muted: $pd-ink-2`).
2. **Media — Semana "Ver resumen" con carga directa en /training** muestra "No hay sesión completada hoy" (`progressionStore.todaySession` solo lo hidrata Mi Templo); además ese vacío usa grises de Quasar (2,30 / 1,13). `S7b-resumen-desde-semana/01-ver-resumen-carga-directa-sin-hidratar-w390-00.png`. Sospecha `EntrenarView.vue:156` / `SessionSummaryPage.vue:13-14` (no llama `fetchStats`).
3. **Media — links de 13 px `#96593a` a 4,27-4,32** sobre el fondo real ("¿Te quedaste con ganas?...", "Ver más bloques", "Quitar filtro"). `S1b-semana-completada/01-hoy-completada-w390-01.png`, `S3-libre/01-todo-con-aura-w390-04.png`. Sospecha `SemanaHero.vue:192`, `LibreTab.vue:353` (usar `$pd-kicker-ink`).
4. **Baja-media — Libre: "Empezar" de la primera card cortado por la tab bar** a 360/390 y ~50 px de aire alrededor de la figura. `S3-libre/01-todo-con-aura-w390-00.png`. Sospecha `LibreTab.vue` `&__stage` (~l.92-109) + figura de 210.
5. **Baja — player libre a 360, encabezado de 3 líneas choca con el check de "Bloque completo"** (rutas largas reales). `S5c-player-libre-menos-10/02-bloque-completo-w360-00.png`. Sospecha `BlockProgressionView.vue:711-725`.
6. **Baja — título cortado por el guion de "Buy-in"/"Cash-out"** ("Buy-/in", "Cash-/out"). `S3-libre/01-todo-con-aura-w390-00.png`. `FreeBlockCard.vue:66-73`.
7. **Baja — error de Libre en inglés** ("Request failed with status code 500"). `S3d-libre-error/01-error-de-carga-w390-00.png`. `utils/extract-error.ts:11-13` + `freeBlocksStore.ts`.
8. **Baja — ícono "bloque no disponible" a 1,13:1.** `S5d-player-libre-no-disponible/01-bloque-no-disponible-w390-00.png`. `FreeBlockPlayer.vue:10` (`grey-4`).
9. **Baja — chips ROM repiten rol y nombre** y a 360 el rol se parte en 2 líneas. `S1-semana-hoy/08-sabado-movilidad-w360-00.png`. `BlockChipStack.vue:12-13`.
10. **Baja — "Salir" 4,43:1.** `S5c-player-libre-menos-10/01-en-curso-salir-confirmacion-w390-00.png`. `FreeBlockPlayer.vue:229`.
11. **Info** — "Disponible el viernes" 2,46 (exento: deshabilitado, `SemanaHero.vue:175-177`); chips de bloque truncan "Entrada en c…" a 360 (intencional); "Objetivo" del ajuste no medible (flag apagado).

## Desvíos del plan

- Task 1 resuelto por el orquestador (staging); no hubo pregunta a Franco. La herramienta se adaptó en `herramientas/` (con backups `*.pre22`) en vez de `despues/herramientas/`, según la instrucción del orquestador; el `__post` pedido por el plan se implementó en `capture.cjs` junto con `setPost`, `__byQuery`, rutas con prefijo `*` y `__shiftClock` (necesarios para el player libre y la paginación).
- Se agregaron estados no listados en el plan: `S1c/S1d` (sin plani, domingo), `S3d` (error), `S5c/S5d` (<10', 404), `S7b/S7c` (resumen desde Semana), `S9b/c/d` (Mi Templo), `S10` (varón).
- Bug de la herramienta corregido en el camino: `setPost` mutaba el mock entre anchos (se reinicia por ancho). Reintentos de escena por selector: 2 (chip "Todo" por `nth`, S5c rerun).
- Contraste a 390 solamente (limitación de la herramienta, como en el antes). Videos en `null`: sin medición sobre imagen real.

## Known Stubs

Ninguno (el plan no crea código).

## Self-Check: PASSED

`RESUMEN.md` y `hallazgos.md` existen en `despues/`, hay 24 carpetas de estado con los 3 anchos, `RESUMEN.md` contiene las secciones de contraste, 360/412, desborde y "Autor de la cita"; nada escrito fuera de `despues/` y `herramientas/` en el checkout principal; worktree limpio salvo este SUMMARY.
