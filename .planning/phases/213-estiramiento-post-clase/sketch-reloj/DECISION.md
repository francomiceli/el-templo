# Decisión del reloj del estiramiento (213-10)

> **Reemplazada el 2026-11-12.** Franco vio el sketch y pidió otro modelo: sin lados, sin marcar, minutero que solo avanza, dosis de la plani y botón "Terminar". Eligió el teléfono 1 de `minutero.html` con avance a mano (planes 213-14 y 213-15). Lo de abajo queda como historia.

**Opción elegida: B, reloj por ejercicio** (componente nuevo `StretchClock`, alimentado por `stretchPhaseAt`).

Decisión tomada por el ejecutor con la recomendación de partida del planificador: el sketch no mostró nada en contra, al contrario (ver mediciones). Franco la revisa en el UAT; el sketch es `index.html` en esta misma carpeta (autocontenido, sin red, x10 para acelerar).

Rutina de la prueba: `W37-lunes-kairos` (COUCH STRETCH x2, STR PIKE STANDING, BUTCHER FLOOR STRETCH, SITTED GLUTE STRETCH x2, LAYED DOWN HAM BENT x2): 8 lados, 5 ejercicios, 410 s = 6:50 (`plannedSeconds` del servidor).

## Criterios

| # | Criterio | A: `work_rest` 45/10 (reloj de bloque) | B: reloj por ejercicio |
|---|----------|----------------------------------------|------------------------|
| 1 | El alumno sabe qué estiramiento y qué lado hace | 0/2. Muestra "Trabajo 3/8"; el ejercicio de la historia es el que marcó el alumno, no el que toca; no nombra el lado | 2/2. Nombre grande, "Lado 2 de 2", "Ahora: X" en la transición |
| 2 | Sabe cuánto falta y cuándo cambiar de lado sin mirar números chicos | 1/2. La cuenta es grande pero el cambio de lado no se distingue de un descanso entre ejercicios | 2/2. Cuenta grande, aviso "Cambiá de lado" y barra de la rutina con cortes por ejercicio |
| 3 | Funciona con las manos ocupadas | 1/2. Corre solo, pero hay que mirar la lista para saber dónde va | 2/2. Todo lo que hay que saber está en la tarjeta, sin tocar entre lados |
| 4 | Duración igual a `plannedSeconds` | 0/2. 8 x 55 s = 7:20, +30 s (mete 10 s tras CADA lado; la regla solo 10 s antes de CADA ejercicio) | 2/2. 8 x 45 s + 5 x 10 s = 6:50 |
| 5 | Costo (no tocar `DayPlayer`, en `BlockProgressionView` solo props opcionales) | 1/2. Sin componente nuevo, pero igual hay que corregir textos de `BlockProgressionView` (ver abajo) y mentiría la duración | 1/2. Un componente + una función pura con test; mismas props opcionales en `BlockProgressionView` |
| | **Total** | **3/10** | **9/10** |

## Motivo

A no resuelve lo que pide el alumno (qué ejercicio, qué lado) y desfasa la duración 30 s respecto de lo que el servidor planificó y mide. B reproduce exactamente la línea de tiempo que ya existe como función pura (`stretchTimeline`), así que reloj, `plannedSeconds` y rutina no pueden divergir.

## Hallazgo de integración (inspección de `BlockProgressionView` en modo `free`)

Montar un bloque `STRETCHING` en `mode="free"` tal cual muestra cosas que no valen para un estiramiento, aun con `timerSpec: null`:

- Encabezado "Bloque libre · Stretching".
- La fila del formato pinta el formato `stretch` y un reloj de bloque que cuenta hacia arriba ("00:00 Bloque", `blockTimerView(null)` cae en `countup`): sería un segundo reloj compitiendo con `StretchClock` (y arranca con el 3-2-1).
- Al marcar todo, la tarjeta dice "Bloque completo / Hacé una elongación antes de terminar. / Ver resumen": para un estiramiento no tiene sentido.

Por eso el reloj elegido exige una prop OPCIONAL `copy` en `BlockProgressionView` (y su pase a `StoryExerciseCard`), con default `null` = comportamiento de siempre para `DayPlayer`, `FreeBlockPlayer` y `GoalPlanSession`.

## Qué se descartó

- A como reloj principal (ver tabla).
- Un tercer camino (`TimerSpec` `interval`): una "ronda" por lado tampoco nombra el ejercicio ni respeta las transiciones.
- Que el reloj marque los ejercicios solo: D-08 dice "marcó todos"; el reloj solo destaca al terminar que hay que marcar y terminar.

## Qué tiene que mirar Franco en el UAT

1. En el teléfono, con las manos ocupadas, ¿alcanza la tarjeta de arriba (nombre, lado, cuenta, "Cambiá de lado") sin tocar nada?
2. ¿La tarjeta arriba del encabezado del player (flecha atrás debajo de la tarjeta) se siente bien, o prefiere el reloj sobre el área del video?
3. Los 10 s de transición del primer ejercicio: ¿alcanzan para acomodarse tras el 3-2-1?
4. Si el reloj termina y falta marcar algún ejercicio, solo se puede salir sin guardar: ¿se quiere un "terminar igual"?
5. El sketch no se pudo abrir en un navegador desde el entorno de ejecución (sin Chrome local): verificar que se vea bien en un navegador real.
