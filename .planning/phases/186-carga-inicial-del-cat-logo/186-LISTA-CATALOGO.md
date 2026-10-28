# Fase 186 — Lista maestra del catálogo inicial de ejercicios

**Total: 62 ejercicios** (rango duro del brief §2.4: 40 a 80). Esta lista es el **contrato congelado de nombres canónicos** para los 9 lotes de generación (D-07): cada lote escribe en su archivo JSON exactamente los `nombreCanonico` de esta tabla, y resuelve sus `alternatives`, `easierVariant` y `harderVariant` apuntando a nombres de esta misma tabla (D-10). Ningún lote inventa un ejercicio que no esté acá, y ningún nombre se renombra después de la aprobación humana (D-09): renombrar rompe los punteros cruzados entre lotes.

Todos los valores de las columnas `Patrón`, `Grupo primario`, `Equipamiento`, `Dificultad` y `Tipo de carga` salen **textuales** de las listas cerradas de `el-templo-api/src/modules/gimnasio/taxonomies.ts` (14 grupos musculares, 23 equipamientos, 9 patrones, 3 dificultades, 5 tipos de carga). La **categoría no figura**: es capa derivada de `deriveCategory(muscleGroupPrimary)`, nunca un valor elegido a mano.

Esta lista **no contiene fichas**: sin descripción, sin ejecución paso a paso y sin errores frecuentes. Eso lo escriben los planes 04, 05 y 06, uno por lote.

## Tabla maestra

| #   | Nombre canónico                                 | Patrón               | Grupo primario | Equipamiento                     | Dificultad   | Tipo de carga                          | Alternativas previstas                                                                              |
| --- | ----------------------------------------------- | -------------------- | -------------- | -------------------------------- | ------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Press de banca plano con barra                  | empuje horizontal    | pecho          | barra olímpica, banco plano      | intermedio   | externa                                | Press de banca plano con mancuernas, Press de pecho en máquina, Flexiones de brazos                  |
| 2   | Press de banca plano con mancuernas             | empuje horizontal    | pecho          | mancuernas, banco plano          | intermedio   | externa                                | Press de banca plano con barra, Press de pecho en máquina, Aperturas con mancuernas en banco plano   |
| 3   | Press de banca inclinado con barra              | empuje horizontal    | pecho          | barra olímpica, banco inclinado  | intermedio   | externa                                | Press de banca inclinado con mancuernas, Press de banca plano con barra, Press de pecho en máquina   |
| 4   | Press de banca inclinado con mancuernas         | empuje horizontal    | pecho          | mancuernas, banco inclinado      | intermedio   | externa                                | Press de banca inclinado con barra, Press de banca plano con mancuernas                              |
| 5   | Press de pecho en máquina                       | empuje horizontal    | pecho          | máquina                          | principiante | externa                                | Press de banca plano con barra, Press de banca plano con mancuernas, Flexiones de brazos             |
| 6   | Flexiones de brazos                             | empuje horizontal    | pecho          | peso corporal, colchoneta        | principiante | peso corporal                          | Flexiones de brazos con manos elevadas en cajón, Press de pecho en máquina, Press de banca plano con mancuernas |
| 7   | Flexiones de brazos con manos elevadas en cajón | empuje horizontal    | pecho          | peso corporal, cajón             | principiante | peso corporal                          | Flexiones de brazos, Press de pecho en máquina                                                       |
| 8   | Press militar con barra de pie                  | empuje vertical      | hombros        | barra olímpica                   | intermedio   | externa                                | Press de hombros con mancuernas sentado, Press de hombros en máquina                                 |
| 9   | Press de hombros con mancuernas sentado         | empuje vertical      | hombros        | mancuernas, banco inclinado      | principiante | externa                                | Press militar con barra de pie, Press de hombros en máquina, Press Arnold con mancuernas             |
| 10  | Press de hombros en máquina                     | empuje vertical      | hombros        | máquina                          | principiante | externa                                | Press de hombros con mancuernas sentado, Press militar con barra de pie                              |
| 11  | Press Arnold con mancuernas                     | empuje vertical      | hombros        | mancuernas, banco inclinado      | intermedio   | externa                                | Press de hombros con mancuernas sentado, Press de hombros en máquina                                 |
| 12  | Fondos en paralelas                             | empuje vertical      | pecho          | paralelas, peso corporal         | avanzado     | peso corporal con lastre o asistencia  | Fondos en banco con pies apoyados, Press de banca plano con barra, Extensión de tríceps en polea alta |
| 13  | Fondos en banco con pies apoyados               | empuje vertical      | tríceps        | banco plano, peso corporal       | principiante | peso corporal                          | Fondos en paralelas, Extensión de tríceps en polea alta                                              |
| 14  | Remo con barra                                  | tracción horizontal  | espalda        | barra olímpica                   | intermedio   | externa                                | Remo con mancuerna a una mano, Remo en máquina sentado, Remo en polea baja sentado                   |
| 15  | Remo con mancuerna a una mano                   | tracción horizontal  | espalda        | mancuernas, banco plano          | principiante | externa                                | Remo con barra, Remo en polea baja sentado                                                           |
| 16  | Remo en polea baja sentado                      | tracción horizontal  | espalda        | polea baja                       | principiante | externa                                | Remo en máquina sentado, Remo con barra, Remo con mancuerna a una mano                               |
| 17  | Remo en máquina sentado                         | tracción horizontal  | espalda        | máquina                          | principiante | externa                                | Remo en polea baja sentado, Remo con mancuerna a una mano                                            |
| 18  | Remo invertido en barra                         | tracción horizontal  | espalda        | barra recta, peso corporal       | principiante | peso corporal                          | Remo en TRX, Remo en polea baja sentado, Remo con mancuerna a una mano                               |
| 19  | Remo en TRX                                     | tracción horizontal  | espalda        | TRX o similar, peso corporal     | principiante | peso corporal                          | Remo invertido en barra, Remo en polea baja sentado                                                  |
| 20  | Face pull en polea alta                         | tracción horizontal  | hombros        | polea alta                       | principiante | externa                                | Remo alto con barra, Remo en polea baja sentado                                                      |
| 21  | Dominadas                                       | tracción vertical    | espalda        | barra de dominadas, peso corporal | avanzado    | peso corporal con lastre o asistencia  | Dominadas asistidas en máquina, Jalón al pecho en polea alta                                         |
| 22  | Dominadas asistidas en máquina                  | tracción vertical    | espalda        | máquina                          | principiante | peso corporal con lastre o asistencia  | Jalón al pecho en polea alta, Dominadas                                                              |
| 23  | Jalón al pecho en polea alta                    | tracción vertical    | espalda        | polea alta                       | principiante | externa                                | Dominadas asistidas en máquina, Dominadas, Remo en polea baja sentado                                |
| 24  | Pullover con mancuerna en banco                 | tracción vertical    | espalda        | mancuernas, banco plano          | intermedio   | externa                                | Pullover en polea alta, Jalón al pecho en polea alta                                                 |
| 25  | Pullover en polea alta                          | tracción vertical    | espalda        | polea alta                       | intermedio   | externa                                | Pullover con mancuerna en banco, Jalón al pecho en polea alta                                        |
| 26  | Remo alto con barra                             | tracción vertical    | hombros        | barra recta                      | intermedio   | externa                                | Face pull en polea alta, Elevaciones laterales con mancuernas                                        |
| 27  | Sentadilla con barra                            | dominante de rodilla | cuádriceps     | barra olímpica                   | intermedio   | externa                                | Prensa de piernas, Sentadilla goblet con mancuerna, Sentadilla frontal con barra                     |
| 28  | Sentadilla frontal con barra                    | dominante de rodilla | cuádriceps     | barra olímpica                   | avanzado     | externa                                | Sentadilla con barra, Sentadilla goblet con mancuerna                                                |
| 29  | Sentadilla goblet con mancuerna                 | dominante de rodilla | cuádriceps     | mancuernas                       | principiante | externa                                | Sentadilla con peso corporal, Sentadilla con barra, Prensa de piernas                                |
| 30  | Sentadilla con peso corporal                    | dominante de rodilla | cuádriceps     | peso corporal                    | principiante | peso corporal                          | Sentadilla goblet con mancuerna, Prensa de piernas                                                   |
| 31  | Prensa de piernas                               | dominante de rodilla | cuádriceps     | prensa                           | principiante | externa                                | Sentadilla con barra, Sentadilla goblet con mancuerna, Extensión de cuádriceps en máquina            |
| 32  | Estocadas con mancuernas                        | dominante de rodilla | cuádriceps     | mancuernas                       | principiante | externa                                | Sentadilla búlgara con mancuernas, Subida al cajón con mancuernas, Prensa de piernas                 |
| 33  | Sentadilla búlgara con mancuernas               | dominante de rodilla | cuádriceps     | mancuernas, banco plano          | intermedio   | externa                                | Estocadas con mancuernas, Subida al cajón con mancuernas                                             |
| 34  | Subida al cajón con mancuernas                  | dominante de rodilla | cuádriceps     | mancuernas, cajón                | principiante | externa                                | Estocadas con mancuernas, Sentadilla búlgara con mancuernas                                          |
| 35  | Peso muerto convencional con barra              | dominante de cadera  | isquiotibiales | barra olímpica                   | avanzado     | externa                                | Peso muerto rumano con barra, Peso muerto rumano con mancuernas                                      |
| 36  | Peso muerto rumano con barra                    | dominante de cadera  | isquiotibiales | barra olímpica                   | intermedio   | externa                                | Peso muerto rumano con mancuernas, Peso muerto convencional con barra, Curl femoral acostado en máquina |
| 37  | Peso muerto rumano con mancuernas               | dominante de cadera  | isquiotibiales | mancuernas                       | principiante | externa                                | Peso muerto rumano con barra, Buenos días con barra                                                  |
| 38  | Buenos días con barra                           | dominante de cadera  | isquiotibiales | barra olímpica                   | intermedio   | externa                                | Peso muerto rumano con barra, Curl femoral acostado en máquina                                       |
| 39  | Empuje de cadera con barra                      | dominante de cadera  | glúteos        | barra olímpica, banco plano      | intermedio   | externa                                | Puente de glúteos con peso corporal, Balanceo con kettlebell                                         |
| 40  | Puente de glúteos con peso corporal             | dominante de cadera  | glúteos        | peso corporal, colchoneta        | principiante | peso corporal                          | Empuje de cadera con barra, Peso muerto rumano con mancuernas                                        |
| 41  | Balanceo con kettlebell                         | dominante de cadera  | glúteos        | kettlebell                       | intermedio   | externa                                | Peso muerto rumano con mancuernas, Empuje de cadera con barra                                        |
| 42  | Curl de bíceps con barra                        | aislamiento          | bíceps         | barra recta                      | principiante | externa                                | Curl martillo con mancuernas                                                                          |
| 43  | Curl martillo con mancuernas                    | aislamiento          | bíceps         | mancuernas                       | principiante | externa                                | Curl de bíceps con barra                                                                              |
| 44  | Curl de muñeca con barra                        | aislamiento          | antebrazo      | barra recta, banco plano         | principiante | externa                                | Curl martillo con mancuernas                                                                          |
| 45  | Extensión de tríceps en polea alta              | aislamiento          | tríceps        | polea alta                       | principiante | externa                                | Press francés con barra EZ, Fondos en banco con pies apoyados                                        |
| 46  | Press francés con barra EZ                      | aislamiento          | tríceps        | barra EZ, banco plano            | intermedio   | externa                                | Extensión de tríceps en polea alta, Fondos en banco con pies apoyados                                |
| 47  | Elevaciones laterales con mancuernas            | aislamiento          | hombros        | mancuernas                       | principiante | externa                                | Face pull en polea alta, Press de hombros con mancuernas sentado                                     |
| 48  | Aperturas con mancuernas en banco plano         | aislamiento          | pecho          | mancuernas, banco plano          | intermedio   | externa                                | Press de banca plano con mancuernas, Press de pecho en máquina                                       |
| 49  | Extensión de cuádriceps en máquina              | aislamiento          | cuádriceps     | máquina                          | principiante | externa                                | Prensa de piernas, Sentadilla goblet con mancuerna                                                   |
| 50  | Curl femoral acostado en máquina                | aislamiento          | isquiotibiales | máquina                          | principiante | externa                                | Peso muerto rumano con mancuernas, Buenos días con barra                                             |
| 51  | Elevación de talones de pie en máquina          | aislamiento          | gemelos        | máquina                          | principiante | externa                                | Salto a la soga                                                                                       |
| 52  | Aducción de cadera en máquina                   | aislamiento          | aductores      | máquina                          | principiante | externa                                | Sentadilla goblet con mancuerna                                                                       |
| 53  | Plancha frontal                                 | core                 | abdominales    | peso corporal, colchoneta        | principiante | tiempo                                 | Plancha lateral, Crunch abdominal en colchoneta                                                      |
| 54  | Plancha lateral                                 | core                 | abdominales    | peso corporal, colchoneta        | principiante | tiempo                                 | Plancha frontal, Press Pallof en polea                                                               |
| 55  | Crunch abdominal en colchoneta                  | core                 | abdominales    | peso corporal, colchoneta        | principiante | peso corporal                          | Elevación de piernas colgado en barra, Plancha frontal                                               |
| 56  | Elevación de piernas colgado en barra           | core                 | abdominales    | barra de dominadas, peso corporal | avanzado    | peso corporal                          | Crunch abdominal en colchoneta, Plancha frontal                                                      |
| 57  | Press Pallof en polea                           | core                 | abdominales    | polea baja                       | intermedio   | externa                                | Plancha lateral, Plancha frontal                                                                     |
| 58  | Superman en colchoneta                          | core                 | lumbares       | peso corporal, colchoneta        | principiante | peso corporal                          | Puente de glúteos con peso corporal, Plancha frontal                                                 |
| 59  | Salto a la soga                                 | cardio               | gemelos        | soga                             | principiante | tiempo                                 | Escaladores en colchoneta, Burpees                                                                   |
| 60  | Burpees                                         | cardio               | cuádriceps     | peso corporal, colchoneta        | intermedio   | tiempo                                 | Escaladores en colchoneta, Salto a la soga                                                           |
| 61  | Escaladores en colchoneta                       | cardio               | abdominales    | peso corporal, colchoneta        | principiante | tiempo                                 | Burpees, Salto a la soga                                                                             |
| 62  | Remo en ergómetro                               | cardio               | espalda        | máquina                          | principiante | distancia                              | Salto a la soga, Burpees                                                                             |

## Conteos

Todos los conteos salen de parsear la tabla de arriba, en el orden de las listas de `taxonomies.ts` (nunca alfabético).

### Por patrón de movimiento (los 9 cubiertos)

| Patrón               | Objetivo del plan | Real   |
| -------------------- | ----------------- | ------ |
| empuje horizontal    | 8                 | 7      |
| empuje vertical      | 6                 | 6      |
| tracción horizontal  | 7                 | 7      |
| tracción vertical    | 6                 | 6      |
| dominante de rodilla | 8                 | 8      |
| dominante de cadera  | 7                 | 7      |
| aislamiento          | 10                | 11     |
| core                 | 6                 | 6      |
| cardio               | 4                 | 4      |
| **Total**            | **62**            | **62** |

Dos desviaciones de ±1, compensadas entre sí para dar el total exacto de 62: empuje horizontal baja a 7 (sale el press declinado, ver "Decisiones de recorte") y aislamiento sube a 11 para que antebrazo, gemelos y aductores tengan cada uno un ejercicio con ese grupo como primario.

### Por grupo muscular primario (13 de 14 cubiertos)

espalda 12 · cuádriceps 10 · pecho 9 · hombros 7 · abdominales 6 · isquiotibiales 5 · glúteos 3 · tríceps 3 · bíceps 2 · gemelos 2 · antebrazo 1 · aductores 1 · lumbares 1 · **cuello 0** (ver "Decisiones de recorte").

### Por equipamiento (18 de 23 usados; un ejercicio cuenta en cada equipamiento que requiere)

peso corporal 16 · mancuernas 14 · barra olímpica 10 · banco plano 10 · máquina 9 · colchoneta 8 · barra recta 4 · polea alta 4 · banco inclinado 4 · polea baja 2 · barra de dominadas 2 · cajón 2 · barra EZ 1 · kettlebell 1 · prensa 1 · TRX o similar 1 · paralelas 1 · soga 1.

Sin uso (deliberado, D-12 — el catálogo no es un muestrario): discos, banco declinado, multipower, bandas elásticas, anillas.

### Por dificultad y por tipo de carga

principiante 37 · intermedio 20 · avanzado 5.

externa 43 · peso corporal 10 · tiempo 5 · peso corporal con lastre o asistencia 3 · distancia 1.

El sesgo a principiante es intencional: el catálogo tiene que servir a un gimnasio nuevo el día uno. Los 5 avanzados (dominadas, fondos en paralelas, sentadilla frontal, peso muerto convencional, elevación de piernas colgado) son todos la punta de una cadena de progresión que arranca en un principiante de la misma lista.

## Decisiones de recorte

### Casi-duplicados resueltos como alias (no llevan ficha propia)

Aplicación literal de §2.4: dos ejercicios son distintos **solo** si cambia el patrón de movimiento, el equipamiento o el ángulo de trabajo. Los siguientes casos NO cumplen ninguno de los tres, así que quedan como entradas del campo `aliases` del ejercicio indicado (D-11), y el buscador de la 185 los va a encontrar igual.

| Nombre de uso corriente                                                | Resuelto como alias de              | Motivo                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| "press de banca", "press banca con barra", "press plano", "bench press" | Press de banca plano con barra      | Caso textual del brief §2.4: mismo movimiento, mismo equipamiento, mismo ángulo                                                |
| "dominadas supinas", "dominadas con agarre supino", "chin up"           | Dominadas                           | El agarre NO es equipamiento (la 184 sacó los 3 agarres de la lista) y no cambia patrón ni ángulo                              |
| "zancadas", "desplantes", "lunges"                                      | Estocadas con mancuernas            | Variantes regionales del mismo nombre                                                                                          |
| "peso muerto piernas rígidas", "stiff leg deadlift"                     | Peso muerto rumano con barra        | Mismo patrón, mismo equipamiento; la diferencia de flexión de rodilla es de ejecución, no de ejercicio                         |
| "jalón al pecho", "polea al pecho", "lat pulldown"                      | Jalón al pecho en polea alta        | Solo abrevia el nombre                                                                                                        |
| "gemelos de pie", "elevación de talones"                                | Elevación de talones de pie en máquina | Solo abrevia el nombre                                                                                                     |
| "sentadilla libre", "air squat"                                         | Sentadilla con peso corporal        | Solo abrevia el nombre                                                                                                        |

### Ejercicios legítimos que quedan afuera de esta carga inicial

Estos SÍ serían fichas propias según §2.4 (cambia equipamiento o ángulo), pero se dejan afuera por volumen: "40-80 que cubran los nueve patrones, antes que 300 a medias". Entran cuando el catálogo crezca, sin cambiar nada de lo que ya está.

| Ejercicio omitido                                | Por qué                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Press de banca declinado con barra               | Requiere banco declinado, poco frecuente en un gimnasio nuevo; el pecho ya tiene 7 entradas                |
| Sentadilla en multipower                         | El multipower no aporta un patrón nuevo; la cadena peso corporal → goblet → barra ya cubre la progresión   |
| Peso muerto sumo con barra                       | Ficha legítima (cambia el ángulo de cadera), pero la cadera ya tiene 7 entradas y 3 pesos muertos          |
| Curl de bíceps con mancuernas                    | Bíceps ya cubierto por barra + martillo; la mancuerna sola no agrega patrón                                |
| Elevaciones posteriores con mancuernas           | El deltoide posterior ya lo cubre Face pull en polea alta                                                  |
| Extensión de tríceps sobre la cabeza con mancuerna | Tríceps ya cubierto por polea + press francés + fondos en banco                                          |
| Cruce de poleas                                  | Pecho de aislamiento ya cubierto por aperturas con mancuernas                                              |
| Abducción de cadera en máquina                   | Glúteo ya cubierto por empuje de cadera, puente y balanceo                                                 |
| Saltos al cajón                                  | Cardio ya cubierto con 4 entradas; el salto pliométrico pide progresión que no existe en esta lista        |

### Grupos musculares sin ejercicio en esta lista

- **cuello**: no hay un ejercicio honesto de gimnasio general para cuello (el trabajo de cuello es específico de deportes de contacto y necesita arnés o asistencia manual, nada de lo cual está en la lista de 23 equipamientos). Queda representado en la taxonomía y sin ficha en la carga inicial. Los otros 13 grupos musculares tienen al menos un ejercicio con ese grupo como primario.

### Notas de selección

- **Sesgo a equipamiento básico (D-12) cumplido y no forzado:** la lista usa 18 de los 23 equipamientos y NO intenta cubrirlos todos. `discos`, `banco declinado`, `multipower`, `bandas elásticas` y `anillas` no aparecen: ninguno agregaba un movimiento que la lista no tuviera ya con barra, mancuernas, peso corporal, poleas o máquinas.
- **Rutina de cuerpo entero solo con esta lista (criterio de éxito 5 del roadmap):** cada uno de los 6 bloques de una rutina full body tiene al menos una opción de nivel principiante con equipamiento básico — empuje horizontal (Press de pecho en máquina, Flexiones de brazos), empuje vertical (Press de hombros con mancuernas sentado), tracción horizontal (Remo con mancuerna a una mano), tracción vertical (Jalón al pecho en polea alta, Dominadas asistidas en máquina), rodilla (Sentadilla goblet con mancuerna, Prensa de piernas), cadera (Peso muerto rumano con mancuernas, Puente de glúteos con peso corporal) y core (Plancha frontal).
- **Peso corporal presente en todos los patrones donde tiene sentido:** empuje horizontal (Flexiones), empuje vertical (Fondos), tracción horizontal (Remo invertido, Remo en TRX), tracción vertical (Dominadas), rodilla (Sentadilla con peso corporal), cadera (Puente de glúteos), core (5 de 6) y cardio (3 de 4). Aislamiento es el único sin peso corporal, y es esperable.
- **Cadenas de progresión naturales para `easierVariant`/`harderVariant`** (los lotes las escriben, acá se declara que existen): Flexiones en cajón → Flexiones → Fondos en paralelas · Dominadas asistidas en máquina → Dominadas · Sentadilla con peso corporal → Sentadilla goblet con mancuerna → Sentadilla con barra → Sentadilla frontal con barra · Puente de glúteos con peso corporal → Empuje de cadera con barra · Peso muerto rumano con mancuernas → Peso muerto rumano con barra → Peso muerto convencional con barra · Crunch abdominal en colchoneta → Elevación de piernas colgado en barra · Fondos en banco con pies apoyados → Fondos en paralelas. Donde la progresión no es natural (aislamiento en máquina, cardio) los campos quedan en `null`: sin cadenas forzadas (D-10).
- **Clusters sustituibles:** ningún ejercicio queda huérfano de alternativas. Los dos clusters más finos son gemelos (una sola entrada, alterna con Salto a la soga) y aductores (una sola entrada, alterna con Sentadilla goblet con mancuerna): son sustituciones por "no tengo la máquina", que es exactamente el caso de uso de §2.6.

## Aprobación

**Checkpoint D-09 — revisión humana de la lista antes de generar una sola ficha.**

| Vuelta   | Fecha      | Veredicto                | Cambios pedidos |
| -------- | ---------- | ------------------------ | --------------- |
| Vuelta 1 | 2026-09-01 | **aprobada sin cambios** | Ninguno         |

_(la columna de vuelta no arranca con un número suelto a propósito: la verificación automatizada del plan parsea como fila de ejercicio toda línea cuya primera celda sea un entero)_

Los cuatro puntos que la ejecución levantó como discutibles quedan resueltos tal como se propusieron, sin modificar la tabla:

1. **Dominadas supinas / chin-up** siguen como alias de `Dominadas`, sin ficha propia.
2. **Los dos pullovers** (`Pullover con mancuerna en banco` y `Pullover en polea alta`) quedan como fichas separadas.
3. **`Remo invertido en barra` y `Remo en TRX`** quedan los dos.
4. **Aislamiento queda en 11** y empuje horizontal en 7 (el press de banca declinado no entra en esta carga).

A partir de acá la lista está **congelada**: los 62 nombres canónicos de la tabla son el contrato que escriben los lotes de los planes 04, 05 y 06, y contra el que resuelven `alternatives`, `easierVariant` y `harderVariant`. Cualquier corrección posterior de un nombre rompe punteros cruzados entre lotes y hay que hacerla acá primero, no en un JSON suelto.
