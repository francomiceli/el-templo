# Fase 201 — Conquer v2 (de cero, simple)

**Fuente de verdad:** `ref/conquer-desarrollo-sintesis.md` (Nacho, 2026-10-21). Si algo no está ahí, no se construye, salvo lo que se decida abajo.
**Spec ejecutable (oráculo del motor):** `ref/conquer-app.html` (función `next()`), con la planilla `ref/conquer-registro.xlsx`.
**Estética y pantallas:** `ref/conquer-prototipo.html`.

## Decisiones (Franco, 2026-10-21)

- **D-01 De cero sobre master.** Conquer se rehace en esta rama (`feat/201-conquer`, worktree `et-201-conquer`, base `origin/master` `6d0298eef`). No se refactoriza la Conquer de la fase 196.
- **D-02 Sin el circuito de Personalizados.** No hay solicitud, cuestionario, pago ni entrega. El coach activa Conquer a mano y elige nivel y días (§7.2). La pantalla Bloqueado tiene el botón "Quiero desbloquearlo", que avisa al admin (§7.1).
- **D-03 La rama 196 queda guardada** (`feat/196-personalizados`, worktree `et-196-personalizados`). No se borra ni se publica. Sirve de consulta y de cantera para copiar piezas.
- **D-04 Híbrido: piezas que se copian de la 196 y se adaptan:**
  - fotos privadas del control físico (R2 privado + URL firmada)
  - marcas del catálogo `unilateral` y `brazos_rectos`
  - editor de escaleras
  - comparador antes/después
  - **mapa muscular** (D-05)
- **D-05 Mapa muscular SÍ entra.** Es una decisión de Franco que contradice la síntesis §11 ("Mapa de equilibrio muscular" fuera de esta versión). Se trae desde la 196 (`balance-map.ts`, `muscles.ts`, `exercise_muscles`, `BalanceMap.vue`, `anatomia.json`). Ojo con la fase 200 (anatomía), que también trabaja músculos: revisar la superposición antes de planificar.
- **D-06 Lo que se escribe de cero:**
  - registro de la sesión: un número por escalón, el peor de las 3 series, más el `prev`
  - motor de progresión, con el botón Subir del alumno y sin aprobación del coach
  - pantallas Hoy, Sábado y Progreso
  - tablero del coach con semáforo y recortes
  - combos de Toro
- **D-07 Lo que NO se trae de la 196:**
  - bandeja de sugerencias (aprobación del coach)
  - modo sin conexión (cola offline)
  - registro por serie
  - alerta de estancamiento
  - acople con `personalized_*`

## Lectura punto por punto de la síntesis

(Las respuestas se anotan acá antes de pasar a la sección siguiente.)
