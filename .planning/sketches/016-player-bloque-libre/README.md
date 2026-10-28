---
sketch: 016
name: player-bloque-libre
question: "¿Cómo se ve el player en modo bloque libre con cambios mínimos (D7): mismo flujo, tokens del rework y contraste corregido?"
winner: "Bloque libre tal cual el sketch"
tags: [player, fase-197, bloque-libre, aura, contraste, app]
---

# Sketch 016: Player en modo bloque libre

## Design Question

D7: al player se le agrega el modo "bloque libre" y se lo pasa a los tokens del rework, sin rediseñar su estructura. Se comparan las 5 pantallas del flujo, hoy (sesión completa) contra bloque libre.

## How to View

open .planning/sketches/016-player-bloque-libre/index.html

## Qué cambia en el bloque libre

1. **Inicio**: el overlay pasa a ser hermano de los pop-ups (sketch 010 A). El título es el nombre del bloque, debajo van formato y cantidad de ejercicios, y luego "+5 AURA al completarlo" en dorado ("Ya sumaste tu AURA de hoy" en el 2.º del día).
2. **En curso**: misma estructura. El encabezado dice "Bloque libre · rol". Si el formato no dicta el tiempo, bajo el timer hay una barrita dorada hasta los 10'. No aparece "Ver bloques anteriores".
3. **Bloque completo**: "Ver resumen". Si el formato no dicta el tiempo y no llegó a 10': "Te faltan 3:00", con "Seguir entrenando" o "Salir sin guardar" (D4).
4. **Celebración**: "¡Bloque completado!" con +5 AURA grande en dorado. El 2.º del día no muestra AURA (D5).
5. **Resumen**: sin RPE, sin notas y sin "Repetir". Muestra el bloque con sus ejercicios tildados, minutos de trabajo y ejercicios, "Sumaste 5 AURA" (solo el 1.º del día), "Listo" y "Elegir otro bloque".

## Contraste (medido sobre el color del diseño; la medición sobre el fondo real se hace en la fase)

Los textos con opacidad que hoy fallan pasan a colores sólidos:

| Texto                      | Hoy   | Bloque libre           |
| -------------------------- | ----- | ---------------------- |
| Autor de la cita           | 4,2:1 | 8,2:1                  |
| Parámetros del formato     | 3,9:1 | 5,0:1                  |
| Descripción del formato    | 3,3:1 | 5,0:1                  |
| "Ver bloques anteriores"   | 2,8:1 | (no aparece)           |
| Título "Resumen de sesión" | 2,4:1 | 6,5:1 (kicker #7e4529) |
| Mensaje del RPE            | 3,3:1 | (no aparece)           |

En la sesión completa también se corrigen estos contrastes (D7).

## Fuente

El relevamiento de `origin/master` lo hizo un subagente: `DayPlayer.vue`, `BlockProgressionView.vue`, `components/player/*`. Copys y estilos de "Hoy" reproducidos del código. La cita y los ejercicios son de ejemplo.

> **Actualización 2026-10-20 (D13):** se eliminó la regla de los 10 minutos. Si el formato no declara minutos, el reloj corre libre y el bloque cuenta al terminar sus ejercicios. Quedan sin efecto la barrita dorada hasta 10' (pantalla 2) y "Te faltan 3:00" (pantalla 3, HSPU + "A los 7'"). El resto del sketch sigue vigente.

> **Actualización 2026-10-20 (D15, reemplaza la nota anterior):** el bloque cuenta y se guarda al terminar sus ejercicios, sin mínimo. Los +5 AURA piden 10' de reloj en todos los formatos, y solo los cobra el primer bloque del día que llega a 10'. Vuelve la barrita dorada hasta 10' (solo si todavía hay AURA para cobrar). "Te faltan 3:00 / Salir sin guardar" pasa a ser parte del resumen: "Para sumar AURA hacen falta 10 minutos" + "Seguir entrenando", y si sale, el bloque queda guardado sin AURA.
