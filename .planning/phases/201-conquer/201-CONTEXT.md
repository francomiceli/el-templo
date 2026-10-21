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

- **D-08 Quién maneja Conquer (§5, §7.2).** Por ahora solo los roles `owner` y `admin`: activan alumnos, ven el tablero y las fichas, aceptan recortes y pasos de nivel. Más adelante se abre a los `coach`. Para que abrirlo después sea barato, el alumno guarda igual su campo `coach` (§9), y los permisos se resuelven en un solo helper. Las fotos (§6, "solo el alumno, su coach y Nacho") las ven por ahora el alumno, owner y admin.
- **D-09 Estética (§10).** Se usa la submarca de Nacho: azul noche, dorado y crema, Cormorant Garamond + Jost, sol, nubes, templo de columnas, letras griegas. Aplica **solo dentro de Conquer**; el resto de la app sigue con la paleta de El Templo. Revierte la D-51 de la fase 196. Las fuentes van empaquetadas en el build, sin CDN en producción.
- **D-10 Dónde vive en la app.** Conquer va dentro de **Entrenar**, como tab. Vuelven las tabs de la fase 197, que hoy están apagadas con `ENTRENAR_TABS_ENABLED = false` (`99152a195`). Por ahora son solo dos: **"Semana"** y **"Conquer"**. Libre sigue apagado. Por eso la rama 201 se basa en `origin/staging`, que tiene la 197.
- **D-11 Pop-up de lanzamiento.** Se diseña un pop-up que se muestra **una vez a todos los alumnos** cuando Conquer esté listo y lleva a Entrenar ▸ Conquer. Se arma con el sistema de pop-ups de Comunicaciones (fase 193, modo "una vez"), más un destino nuevo hacia la tab Conquer. El diseño va en un boceto antes de planificar.
- **D-12 Alumno sin Conquer (§7.1 Bloqueado).** Todos los alumnos ven la tab Conquer. Si no la tiene activada, ve la pantalla Bloqueado con el botón **"Quiero desbloquearlo"**. Tocarlo registra un **pedido**: aparece en una lista de pedidos en el admin, con contador, y el alumno ve "Ya le avisamos al equipo". Desde la lista, owner o admin lo activan eligiendo nivel y días (§7.2).
- **D-13 Mapa muscular: dónde se ve (complementa D-05).** Como en la 196, en dos lugares: (a) al tocar **Guardar** en Hoy, la figura con lo que se iluminó en esa sesión; (b) en **Progreso**, la figura de la semana. Solo se encienden los músculos trabajados, sin números, porcentajes ni rojo. La regla de encendido de la 196 (2 series como principal o 4 como secundario) se adapta al registro nuevo: cada escalón cargado con valor mayor que 0 cuenta como 3 series (las 3 series de la sesión). El hold final y el finisher no cuentan. Para planificar: reusar la figura anatómica compartida de la 197 (plan 197-10) en vez de copiar `anatomia.json`, y revisar qué hace la fase 200.
