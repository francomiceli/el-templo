# Nuevo Sistema de Entrenamiento — Documento de Diseño

> Estado: **discusión de diseño** (2026-06-03). Base para futuro milestone GSD. Sin código aún.
> Fuente original: audios en `.docs/new-training-system/`.

## Propósito

Tres cambios entrelazados en el sistema de entrenamiento de la app:

1. **Nivel Kairos** — un escalón previo a Alfa para principiantes absolutos / "viejardos" / sesiones de prueba.
2. **Árbol de habilidades** — progresiones de ejercicios encadenadas por familia, con % de avance visible.
3. **Ajuste de dificultad in-session** — subir/bajar un ejercicio puntual durante la clase, con el árbol sugiriendo el equivalente que cumple las condiciones del bloque.

El árbol (2) es el cimiento de los otros dos.

---

## Estado actual del sistema (hallazgos del código)

- **Niveles** (hardcodeados como enum en `exercises.ts`, `users.ts`, `completed-sessions.ts`, `level-mapping.ts`, admin `constants/levels.ts`): `alfa → delta → sigma → omega → spartan`. Agregar Kairos toca varios lugares.
- **Ejercicios** (`exercises` table, ~1.493 filas): campos relevantes `pattern`, `category`, `route`, `position`, `effort` (CON/EXC/ISO), `level`, `difficulty` (1-3 por nivel), `dificultadLineal` (1-12), `videoUrl`.
- **No existe** relación de progresión/regresión entre ejercicios. La progresión hoy es implícita: subir de nivel + `dificultadLineal`. El algoritmo `exercise-fallback.ts` ya elige "ejercicio equivalente" por `(route, effort, difficulty, level)`.
- **Rutas** (`routes` table + campo `exercises.route`): 24-32 códigos que son **familias de habilidad** (PL=planche, FL=front lever, BL=back lever, HS=handstand, MU=muscle-up, L=L-sit, etc.), no "push/pull" genéricos.
- **Player** (`DayPlayer.vue`, `BlockProgressionView.vue`): NO tiene botón más fácil/difícil. Se marca "completado" en local + RPE de la sesión entera. No hay registro de "ejercicio dominado".

---

## El marco conceptual: la dificultad emerge de 3 ejes ortogonales

Todo ejercicio de calistenia se descompone en tres dimensiones independientes. La progresión "qué precede a qué" es subir por estos ejes:

| Eje                        | Qué es                    | Ejemplos                                             | Dónde vive hoy                                                                 |
| -------------------------- | ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| **1. Gesto / sub-familia** | _qué_ movimiento          | Planche, Dragon Flag, FL Press, Muscle Up, Victorian | escondido en el nombre `exercise`; **no existe como dato**                     |
| **2. Palanca / posición**  | _cuánto_ brazo de palanca | Tuck → Adv Tuck → Straddle → Half Layout → Full      | `position` (53% poblado, **sucio**: mezcla palanca + implemento + orientación) |
| **3. Contracción**         | _cómo_ se ejecuta         | EXC (negativa) → ISO (hold) → CON (completa)         | `effort` (70% poblado, limpio)                                                 |

`dificultadLineal` (1-12) es el **aplastamiento** de los 3 ejes en un solo número, con empates (ej: dl=2 en planche tiene 7 ejercicios hermanos).

**Evidencia en los datos:**

- Dentro de una ruta hay **varias sub-familias paralelas**. Ej: `FL` contiene Dragon Flag, FL Press, Elbow Victorian, Yewkies, Inv Bar… cada una con su propia escala tuck→full.
- La **palanca** es el eje universal: tuck es más fácil que straddle que full en _toda_ sub-familia.
- La **contracción ordena el aprendizaje**: en muscle-up, `MUSCLE UP RINGS` aparece primero como EXC (dl7, la negativa) y luego como CON (dl8, la subida completa).

**Jerarquía resultante:**

```
CATEGORÍA temática (Empuje/Tracción/Piernas/Core/Movilidad)
  └─ RUTA / área (FL = tracción horizontal)
      └─ SUB-FAMILIA / gesto   ← el grafo ramificado vive ACÁ
          └─ PALANCA (tuck → adv tuck → straddle → full)
              └─ CONTRACCIÓN (exc → iso → con)
```

---

## Decisiones tomadas

1. **Forma del árbol:** grafo ramificado (DAG), no lista lineal. Las sub-familias convergen (dominar tuck planche + pseudo-pushups habilita adv tuck) y ramifican (desde full FL → victorian o one-arm).
2. **Agrupación visible:** categorías temáticas. Mapeo ruta→categoría es casi 1:1 con `pattern`:

   | Categoría      | Rutas                                                 | Ejercicios aprox. |
   | -------------- | ----------------------------------------------------- | ----------------- |
   | Tracción       | FL, OAP, MU, FLR, OAR, MN/RP                          | 501               |
   | Empuje         | PL, PLPU, HSPU, HS, PHS, BL, OAPU, HD/ID              | 414               |
   | Piernas        | PS, HT, SU, QC, DS, SS, L                             | 260               |
   | Core           | TTB, HR                                               | ~170              |
   | Movilidad/Flow | BRIDGE, SIDE PCK, PIKE, REVERSE HYPER, SPAGAT, AF, NC | ~290              |

3. **Enfoque de modelado:** **estructurar las 3 dimensiones** (gesto / palanca / contracción) como datos, no cablear aristas a mano. Bootstrap asistido por LLM (propone la descomposición de cada nombre) + revisión humana de los profes. El orden, el árbol ramificado y el eje 3 emergen de las dimensiones. Reutilizable para combos / upsell / generación de planes.
4. **Construcción y mantenimiento del árbol (decisión Franco):** el árbol se **auto-construye desde el orden que ya tiene el SPOM / `dificultadLineal`** (no se pide a los profes cargarlo). Las sub-familias salen del bootstrap LLM (dimensión gesto). Sobre el árbol ya construido, los profes **ajustan precedencias y agrupaciones desde una sección nueva en el admin** (editor de árbol). Esto desbloquea el milestone sin esperar la curaduría manual previa.

---

## Tensiones / decisiones abiertas

### Árbol (eje 2)

- **"Estáticos" no es categoría paralela.** Planche/FL/BL/HS/L-sit son estáticos _y_ empuje/tracción. "Estático vs dinámico" es un eje transversal. Recomendación: categorías = patrones; "estático/dinámico" como atributo/filtro. → **decisión de Franco/profes.**
- ~~**Derivación de aristas:**~~ RESUELTO: el orden se toma del SPOM/`dificultadLineal` y los profes ajustan después en el editor de árbol del admin.
- **Editor de árbol en el admin (nuevo en el scope):** sección para que los profes reordenen ejercicios, agrupen/separen sub-familias y editen precedencias sobre el árbol ya construido.
- **Definición de "dominar" un nodo:** ¿auto por sesiones completadas, o autoreporte del alumno, o criterio objetivo (X seg de hold / X reps limpias)? → **necesita expertise de profes.**
- **Saneo de datos:** ~103 ejercicios sin ruta; duplicados (ej: "PL LEAN" en 3 niveles); `position` mezcla 3 cosas.

### Kairos (eje 1)

**DECIDIDO (Franco 2026-06-03): modelo HÍBRIDO — nivel real que hereda de Alfa.** Kairos es un nivel propio (enum nuevo, recuadrito real, identidad, futuro contenido propio), pero su generación hereda de Alfa: mismas rutas/SPOM, toma ejercicios de Alfa (los más fáciles), y le aplica encima una **capa que fuerza formatos simples** (Singlet `id 129` / For Quality / lineal) y 1-2 ejercicios. Cuando Fran cargue ejercicios propios de Kairos, dejan de heredarse de Alfa.

Hallazgos que lo hacen viable: el nivel ya funciona como override de lectura (`dayId = W{semana}-{día}-{nivel}`, Alfa ya es caso especial en `routes.ts`); los formatos Singlet/For Quality ya existen en la tabla `formats`.

Toca (a confirmar en planificación): enum en `exercises.ts`, `users.ts`, `completed-sessions.ts`, `level-mapping.ts`, admin `constants/levels.ts`; mapeo kairos→levelGroup (probablemente alfa_delta); capa de override de formato/cantidad; UI 5→6 niveles.

**Estructura de sesión (decidido; refinado 2026-06-04):** mismo esqueleto que una sesión normal (INITIUM + NUCLEUS + DEUTEROS + ATHLOS/EPIKOS), pero **cada bloque en formato SOLO LINEAL (sets×reps: 4×12, 4×8…; nada de EMOM/AMRAP/circuitos/complejos) con exactamente 2 ejercicios por bloque**. El alumno hace el recorrido completo, sin complejidad de formato. _(Esto cierra la ambigüedad previa "1 vs 1-2 ejercicios": queda **2 por bloque**. Pendiente fino a definir con producto: cómo aplica el "2 por bloque" al INITIUM, que hoy está fijo en 4 — ¿se baja a 2 o el INITIUM queda excluido?)_

**Motivación (contexto, NO requisito de código — 2026-06-04):** Kairos existe para bajar la barrera de entrada (principiantes / poca experiencia / arranque ultra-simple, "amigarse con El Templo", baby steps; que alguien se quede meses en Kairos es deseable). La conversión de la sesión de prueba que esto busca mejorar ocurre **del lado de los profes y la experiencia de clase** — NO es algo que este milestone deba resolver ni medir a nivel código. El alcance de código de Kairos es **solo lo estructural**: formato lineal + 2 ej/bloque + ejercicios simplificados. **Pendiente de los profes (no bloquea el código):** trabajo "de pie" (audio del Trainer que no llegó) y la dosis lineal exacta.

**Asignación (decidido):** **todos los alumnos nuevos arrancan en Kairos** (cambia el default de `users.level` de `alfa` a `kairos`). Graduación a Alfa por **criterio automático (X sesiones — número a definir)** o **salto manual del coach**. Implica lógica nueva de graduación + override manual.

**Ejercicios que califican (decidido, Franco 2026-06-03):** todos los ejercicios Alfa de `difficulty = 1` (escalón más fácil de Alfa, que cubre difficulty 1-2-3 ≡ dificultadLineal 1-3). Ajustable después por los profes.

Pendiente fino: criterio exacto de graduación (cuántas sesiones); UI del 6º recuadrito (scroll/paginado del selector de nivel); dosis simples exactas (4×12, 5×8…) — de los profes.

### Ajuste in-session (eje 3)

**DECIDIDO (2026-06-03):**

- **Criterio de avance** (de los profes): binario contra la prescripción del SPOM. Le sale como pide el bloque → puede subir; no le sale → baja.
- **Disparo:** **manual** — botones "↓ más fácil / más difícil ↑" en el ejercicio durante la sesión. El alumno decide cuándo; el árbol sirve el equivalente un escalón arriba/abajo.
- **Qué se preserva al sustituir** (derivado): el reemplazo entra en el mismo bloque conservando ruta + contracción + formato + dosis; solo cambia el ejercicio por su vecino en la cadena (misma ruta × contracción) del árbol.
- **Anti-salto** (derivado): al ser manual y de a un escalón por toque, el salto está acotado naturalmente.
- **Persistencia:** **se recuerda** como ejercicio dominado/bajado → alimenta el % del árbol, lo ve el coach, y habilita el upsell futuro ('estancado en piernas → plan de $10'). **NO** cambia automáticamente el nivel ni la planificación del SPOM (eso sigue siendo del coach/criterio). Requiere registro nuevo de "dominado" (hoy solo hay "completado" local + RPE).

---

## Lo que necesitamos de los profes (decisiones de dominio)

Ver `BRIEF-PROFES.md` en `.docs/new-training-system/`. Resumen: validar el modelo de 3 ejes, listar las sub-familias por ruta, definir las precedencias (qué antes de qué), confirmar categorías, definir el criterio de "dominar", y proponer el contenido de Kairos.

---

## Feedback de los profes (2026-06-03)

Primera ronda. Resuelto:

- **Categorías:** usar **las que ya existen** en el sistema, no crear nuevas. Apuntan a la columna `category` actual (ej. "PULL HORIZONTAL"). → **"Estáticos" NO se crea como zona** — se respeta el armado existente. (Pendiente fino: confirmar si la agrupación visible es `category` —fina, ~22 valores— o `pattern` —gruesa, ~9—; "tracción horizontal" sugiere `category`.)
- **Modelo de 3 ejes (gesto / palanca / contracción):** validado.
- **Criterio de "dominar" / avanzar (responde la pregunta clave):** NO es por repeticiones ni volumen. Es **binario**: el movimiento está desbloqueado o no. El disparador es el SPOM — **si el alumno hace el ejercicio como lo prescribe el SPOM ese día, avanza al siguiente; si no le sale como viene del SPOM, baja un ejercicio.** "Dominar" = cumplir la prescripción del bloque (reps/seg/contracción), no acumular progreso.

Implicación para el eje 3: el subir/bajar in-session se ancla en **cumplir o no la prescripción del bloque del día**, no en un sistema de volumen. La unidad que avanza/retrocede es el ejercicio individual dentro de la familia.

Aún pendiente de los profes (no respondido en esta ronda):

- Las **familias/sub-familias dentro de cada ruta** (pregunta 2) y el **orden de precedencia dentro de cada una** (pregunta 3). Posible lectura del feedback: consideran que el orden "ya está armado" en el SPOM / dificultad lineal. **A confirmar**: ¿el orden de progresión ya está completo y correcto en el SPOM, o todavía hay que separar las sub-familias paralelas y resolver los empates de `dificultadLineal`?
- Si falta algún eje además de los 3 (tempo, rango, asistencia con banda).
- Contenido de Kairos (ejercicios de Alfa + formatos simples).

## Próximos pasos sugeridos

1. Pasar el `BRIEF-PROFES.md` a los entrenadores y recoger sus respuestas.
2. Con eso, armar el milestone GSD. Primer entregable probable: **fase 0 de estructuración de datos** (introducir gesto/palanca/contracción estructurados, con bootstrap LLM + revisión).
3. Sobre la base estructurada: modelar el grafo, la UI del árbol, el eje 3 in-session, y Kairos.
