# CONQUER en la app · Síntesis para rearmar el desarrollo

> **Reemplaza a todos los briefs anteriores** (v1.2 a v2.1 y "versión simple"). Es la síntesis de todo lo que armamos: el método, los niveles, los combos, la progresión automática, el registro físico y lo que ve el coach.
> Fecha: 21/10/2026 · De: Nacho · Para: Fran.

---

## 0. La idea

Conquer tiene que **escalar a muchos entrenadores sin que sea una locura para cada uno**. Para eso, el sistema se apoya en cuatro decisiones:

1. **La app hace las cuentas.** Calcula el objetivo de cada serie, detecta cuándo subir de progresión y cuándo frenar. Nadie hace cálculos a mano.
2. **El alumno anota un número por casilla.** Cargar una sesión lleva menos de un minuto en el celular.
3. **El coach arma una vez y después trabaja por excepción.** Da de alta al alumno eligiendo nivel y días (la plantilla sale sola), y después solo mira las alertas. Si no hay alertas, no tiene que hacer nada.
4. **El método no cambia de un alumno a otro.** Cambian el nivel, los días y las progresiones; la estructura es siempre la misma.

**Archivos de referencia (adjuntos):**

| Archivo | Qué muestra | Para qué usarlo |
|---|---|---|
| `conquer-app.html` | La app de carga funcionando: Hoy, Sábado, Progreso. Es la experiencia de un alumno **Toro**. | Especificación de la carga y del motor de progresión. |
| `conquer-prototipo.html` | Prototipo visual: modo bloqueado, inicio, niveles, sesión, carga, cierre, evolución física. | Estética y pantallas que la app de carga no tiene. |
| `conquer-registro.xlsx` | La misma lógica en planilla, con fórmulas visibles. | Ver cada cálculo paso a paso. |

Si algo no está en este documento, no se construye en esta versión.

---

## 1. El método

### 1.1 La serie Conquer

Una serie son **tres escalones seguidos, sin descanso, más un hold final al fallo**:

| Tramo | Qué es | Rango |
|---|---|---|
| Escalón 1 | La variante más difícil | 3 a 8 reps, o 4 a 12 s |
| Escalón 2 | Un poco más fácil | ídem |
| Escalón 3 | Más fácil | ídem |
| Hold final | Isométrico al fallo | segundos libres |

Cada escalón baja **lo mínimo**: la negativa de la misma variante, una variante más fácil o una palanca más corta.

### 1.2 La sesión

**3 ejercicios × 3 series Conquer + finisher de bombeo** (3 series, lejos del fallo). Es igual para todos los niveles. En Toro, además, abre con el **combo de apertura** (sección 3).

### 1.3 La semana (plantilla base, 4 días)

| Día | Patrón | Ejercicio 1 | Ejercicio 2 | Ejercicio 3 | Finisher |
|---|---|---|---|---|---|
| Lunes | Plancha (empuje) | Planche hold | Planche press | L-sit a plancha | Tuck planche hold o lean 20–30 s |
| Martes | Front (tracción) | Front lever hold | Pull-ups en front lever | Front lever raises | Retracciones escapulares + hold en barra |
| Jueves | Vertical (empuje) | HSPU | 90° press | Planche push-up | Fondos o push-ups 15–20 |
| Viernes | Dominadas (tracción) | One arm / archer | Muscle-up | Fondo a pelícano | Curl de bíceps en anillas 15–20 |
| Sábado | Solo Toro | Combo push | Combo pull | | |

Empuje y tracción **siempre intercalados**.

### 1.4 Dos detalles que la app tiene que respetar

- **Tipo de fallo.** Cada variante tiene la marca *brazos rectos sí/no*. Brazos rectos (plancha, front lever): **fallo técnico**, "se rompió la línea". Brazos flexionados: fallo muscular. Solo cambia el texto de ayuda.
- **Unilaterales.** One arm y archer van **por lado**: el objetivo dice "4 por lado" y se carga el número del lado más flojo.

---

## 2. Niveles

Los tres niveles hacen **la misma sesión** (3 × 3 + finisher). Cambia cuánto se acercan al fallo, cuántos días entrenan y si tienen combos.

| | 🐂 Ternero | Novillo | Toro |
|---|---|---|---|
| Para quién | Inicial | Intermedio | Avanzado |
| Días por semana | 2 o 3 | 3 o 4 | 4 + sábado |
| Esfuerzo en los escalones | Le queda 1 rep en cada uno | Le queda 1 rep en E1 y E2; E3 al fallo | Los tres al fallo |
| Hold final | Corta antes del fallo | Al fallo | Al fallo |
| Brazos rectos | Variantes cómodas, sin fallo | Fallo técnico | Fallo técnico |
| Combos | No | No | **Sí:** apertura + sábado |

La leyenda de los nombres (Milón de Crotona cargó un ternero todos los días hasta cargar un toro) y los íconos están en el prototipo.

### 2.1 Plantillas por días

El coach elige nivel y días; la plantilla sale sola. [Las de 2 y 3 días son PROPUESTA: Nacho las valida.]

| Días | Plantilla |
|---|---|
| 4 | La base de la sección 1.3 |
| 3 | **Empuje:** Planche hold · HSPU · Planche push-up · **Tracción:** Front lever hold · Pull-ups en front lever · Muscle-up · **Mixto:** Planche press · One arm / archer · 90° press |
| 2 | **Empuje:** Planche hold · HSPU · Planche push-up · **Tracción:** Front lever hold · One arm / archer · Muscle-up |

### 2.2 Entrar y subir de nivel

- **Nivel de entrada:** lo elige el coach. En la duda, el más bajo.
- **Señal de paso de nivel:** la app la muestra al coach cuando el alumno completó **4 semanas seguidas** su plan, sin molestias de 4 o más. El coach confirma con un toque. Es lo único que el coach confirma.

---

## 3. Combos (solo Toro)

### 3.1 Qué es un combo

Una secuencia fija: **press (sube y baja) → push → hold**, al fallo, bajando de progresión cuando no sale. Siempre un press, un push y un hold: nunca un press directo a un push, porque la bajada del press es la que conecta.

### 3.2 Cuándo y cuánto

| | Cuándo | Series | Objetivo |
|---|---|---|---|
| Apertura | Al principio de cada día, en fresco | Al fallo, a máxima progresión | 3 · y 4 desde la semana 3 del bloque |
| Sábado push | Después de la entrada en calor | 3 máximas + 10 drops | 13 |
| Sábado pull | Después de todo el push | 3 máximas + 10 drops | 13 |

### 3.3 Qué se registra

Como todo va al fallo y bajando de progresión, registrar reps por elemento no es preciso. **Por cada combo, dos datos:**
1. **Progresión de arranque** (desplegable de la escalera Palanca).
2. **Series completadas** (número).

### 3.4 Combos predeterminados

| Bloque | Press | Push | Hold |
|---|---|---|---|
| Plancha | Press de plancha | Push-up en plancha | Hold de plancha |
| Front | Press a front lever | Pull-up en front lever | Hold de front lever |
| Vertical | 90° press | HSPU | Hold de plancha |
| Dominadas | Press a front lever | Muscle-up | Hold de front lever |
| Sábado push | Press de plancha | HSPU | Hold de plancha |
| Sábado pull | Press a front lever | Muscle-up | Hold de front lever |

En esta versión son fijos. El **armador** (elegir press, push y hold de una lista, validando la regla de 3.1) viene después.

---

## 4. Motor de progresión

Es el corazón del sistema y lo que hace que escale: el alumno nunca pregunta "¿qué hago hoy?", y el coach no tiene que calcularlo.

### 4.1 Qué se carga

**Un número por escalón por sesión: la peor de las 3 series.** Reps, o segundos en los isométricos y el hold.

### 4.2 Constantes

| | Reps | Segundos |
|---|---|---|
| Piso | 3 | 4 |
| Techo | 8 | 12 |
| Incremento por sesión | +1 | +2 |

El incremento es un parámetro editable por alumno (por defecto 1 y 2).

### 4.3 Semana 1: calibración

La primera sesión de cada ejercicio (y la primera después de cambiar la progresión del E1) **ubica al alumno**. La app mira el E1:

| En el E1 hizo | La app propone |
|---|---|
| 6 reps o más (9 s o más) | Subir una progresión: le quedó fácil |
| 3 a 5 reps (4 a 8 s) | Quedarse |
| Menos de 3 reps (menos de 4 s) | Bajar una progresión |

El alumno acepta o no con un toque. Desde la segunda sesión corre la regla 4.4.

### 4.4 Objetivo y estado de cada escalón

Mirando las sesiones de ese día **posteriores al último cambio de progresión** del escalón:

```
sin sesiones:                              objetivo = piso                          estado = sin datos
ultimo = última marca; anterior = la previa (0 si no hay)
ultimo >= techo y anterior >= techo:       objetivo = piso de la progresión nueva   estado = SUBIR
ultimo >= techo:                           objetivo = techo                         estado = techo 1 de 2
ultimo < piso:                             objetivo = ultimo + incremento           estado = bajo el piso
si no:                                     objetivo = min(techo, ultimo + incremento) estado = en rango
```

- El objetivo aparece **precargado** en el contador de la próxima sesión.
- Si no llegó, el objetivo no baja solo.
- El hold final no tiene objetivo: siempre "al fallo".

### 4.5 Subir de progresión

- Cuando un escalón dice **SUBIR**, el alumno ve un botón **Subir** que lo pasa al siguiente peldaño más difícil de su escalera (sección 8). **No espera al coach.**
- Se guarda la **fecha del cambio**; desde ahí el escalón arranca de nuevo en el piso.
- **Un escalón por vez:** si dos del mismo ejercicio dicen SUBIR, primero el E1.
- Si la escalera no tiene siguiente peldaño, se avisa al coach (tope de escalera).
- El alumno también puede cambiar la progresión a mano desde el desplegable: mismo efecto.

### 4.6 Acierto del modelo

Cada sesión guarda el objetivo mostrado (`prev`) junto a lo que hizo. **Acierto** = porcentaje de escalones con real igual o mayor al objetivo; **Δ** = diferencia promedio. Se muestra en Progreso y al coach. Si el Δ es positivo varias semanas, el coach puede subir el incremento de ese alumno.

---

## 5. Alertas y freno: el trabajo del coach

El coach **no revisa sesiones**: mira un tablero con sus alumnos y un semáforo. Solo aparece algo cuando hay que actuar.

| Alerta | Cuándo | Qué propone la app |
|---|---|---|
| 🔴 Molestia | Cualquier registro de 4 o más | Recortar según 5.1 |
| 🔴 Caída | El E1 de un ejercicio baja 2 sesiones seguidas (sin contar la semana 1 de calibración) | Recortar según 5.1 |
| 🟡 Inactivo | 7 días sin cargar | Escribirle |
| 🟡 Control físico vencido | Más de 6 semanas sin control | Recordarle |
| 🟡 Tope de escalera | Un escalón llegó al último peldaño | Extender la escalera |
| 🟢 Paso de nivel | Sección 2.2 | Confirmar el nivel nuevo |

### 5.1 Orden de recorte (lo propone la app; el coach acepta)

Un paso por vez, y se reevalúa a la semana:

1. Sábado: drops de 10 a 6.
2. Sábado: series máximas de 3 a 2.
3. Sábado: se saca.
4. Combo de apertura: de 4 a 3.
5. Combo de apertura: se saca.
6. (Ternero y Novillo, que no tienen combos) Bajar una progresión el escalón que dispara la molestia.

---

## 6. Registro físico: el antes y el después

El objetivo del método es **una evolución muscular grande**; esto es lo que lo demuestra y de donde salen los testimonios. Entra en esta versión porque la foto del día 0 no se recupera después.

- **Control físico** al activar Conquer (día 0) y cada 4 semanas: fotos de frente, perfil y espalda, y perímetros de brazo, pecho, hombros y cintura. Peso opcional. Menos de 3 minutos.
- **Comparador:** día 0 contra el último control, lado a lado, con la diferencia de cada perímetro.
- **Privacidad:** las fotos las ven solo el alumno, su coach y Nacho. Para usarlas como testimonio, el alumno activa un **permiso de publicación** (con opción "sin cara") y lo puede retirar.
- **Galería del coach:** sus alumnos con su antes y después, filtrable por "autorizados".

---

## 7. Pantallas

### 7.1 Alumno

| Pantalla | Qué tiene | Referencia |
|---|---|---|
| **Bloqueado** | Portada, frase y botón "Quiero desbloquearlo" (avisa al admin) | Prototipo, Portada |
| **Inicio** | Nivel con su ícono, semana, último resultado por patrón, aviso de control físico pendiente | Prototipo, Inicio |
| **Hoy** | Combo de apertura (Toro): progresión de arranque y series completadas. Los 3 ejercicios: por escalón, progresión y modo (desplegables) y contador precargado con el objetivo. Finisher como texto. Molestia. Guardar. | App, Hoy |
| **Sábado** (Toro) | Entrada en calor como texto. Combo push y combo pull: progresión de arranque y series completadas. Molestia. Guardar. | App, Sábado |
| **Progreso** | Sesiones, % de acierto, "Hoy toca subir" con botón, y por ejercicio y escalón: progresión, última marca, próximo objetivo, estado y curva del E1 | App, Progreso |
| **Evolución** | Control físico, comparador, permiso de publicación | Prototipo, Evolución |

### 7.2 Coach

| Pantalla | Qué tiene | Cuánto trabajo |
|---|---|---|
| **Alta de alumno** | Activar Conquer, elegir nivel y días. La plantilla y las progresiones iniciales salen solas; la semana 1 las ajusta (4.3). | Una vez, menos de 5 minutos |
| **Tablero** | Lista de alumnos con semáforo (sección 5) y acceso a cada uno | Solo cuando hay alertas |
| **Ficha del alumno** | Su Progreso y su Evolución; puede corregir progresiones, el incremento y aceptar recortes o paso de nivel | Por excepción |
| **Galería** | Antes y después de sus alumnos | Cuando quiera |

---

## 8. Catálogo

### 8.1 Escaleras (de más difícil a más fácil)

| Escalera | Peldaños |
|---|---|
| Palanca | full · half lay · straddle · super adv tuck · adv tuck · tuck · lean |
| HSPU | libre déficit · libre · paralelas profundas · pared · wide en piso · pike elevado · pike |
| 90° press | full · straddle · adv tuck · tuck · pike elevado |
| Planche push-up | full · straddle · super adv tuck · adv tuck · tuck · pseudo · flexión |
| Tracción vertical | one arm · OAP asistida · archer · estricta lenta · dominada · al pecho |
| Muscle-up | estricto · con impulso · al pecho · dominada |
| Fondo | pelícano · supinado profundo · anillas profundo · anillas · paralelas profundo |
| L-sit a plancha | a straddle · a adv tuck · a tuck · a lean |

Se editan desde el admin. Modo de cada escalón: completa, negativa u hold.

### 8.2 Progresiones iniciales por nivel

La tabla es la de **Toro**. Para Novillo, cada escalón arranca **un peldaño más fácil**; para Ternero, **dos**. La semana de calibración corrige el resto. [PROPUESTA: Nacho valida.]

| Ejercicio (escalera, tipo) | E1 | E2 | E3 | Hold final |
|---|---|---|---|---|
| Planche hold (Palanca, s) | full | straddle | adv tuck | tuck |
| Planche press (Palanca) | tuck | tuck · negativa | lean | lean |
| L-sit a plancha (L-sit) | a tuck | a tuck · negativa | a lean | a tuck |
| Front lever hold (Palanca, s) | full | straddle | adv tuck | tuck |
| Pull-ups en front lever (Palanca) | adv tuck | adv tuck · negativa | tuck | tuck |
| Front lever raises (Palanca) | straddle | straddle · negativa | tuck | adv tuck |
| HSPU (HSPU) | paralelas profundas | paralelas profundas · negativa | wide en piso | pike |
| 90° press (90° press) | full | full · negativa | pike elevado | tuck |
| Planche push-up (Planche push-up) | tuck | tuck · negativa | pseudo | pseudo |
| One arm / archer (Tracción, por lado) | OAP asistida | one arm · negativa | estricta lenta | dominada |
| Muscle-up (Muscle-up) | estricto | estricto · negativa | al pecho | dominada |
| Fondo a pelícano (Fondo) | pelícano | pelícano · negativa | supinado profundo | anillas |

---

## 9. Datos

Cómo se modela es decisión tuya. Esto es lo que hay que guardar.

**Alumno**
```json
{
  "conquer": true, "nivel": "toro", "dias": 4, "coach": "id",
  "incremento": {"reps": 1, "s": 2},
  "prog": { "Plancha": { "0": { "e1": {"p":"full","m":"hold","desde":"2026-10-27"}, "e2": {}, "e3": {}, "hold": {"p":"tuck"} } } },
  "recortes": [],
  "permisoPublicacion": {"activo": false, "sinCara": false, "fecha": null}
}
```

**Sesión** (una por fecha y día; guardar de nuevo la sobreescribe)
```json
{
  "fecha": "2026-10-27", "dia": "Plancha",
  "comboProg": "straddle", "combos": 3,
  "pasos": { "0": {"e1":7,"e2":9,"e3":10,"hold":11}, "1": {}, "2": {} },
  "prev":  { "0": {"e1":7,"e2":9,"e3":10}, "1": {}, "2": {} },
  "dolor": 0
}
```
Sábado: `{ "fecha", "dia":"Sabado", "progPush", "push", "progPull", "pull", "dolor" }`.

**Control físico**: `{ "fecha", "fotos": {frente, perfil, espalda}, "brazo", "pecho", "hombros", "cintura", "peso" }`.

**Alerta**: `{ "alumno", "tipo", "fecha", "detalle", "estado": "abierta|vista|resuelta" }`.

---

## 10. Estética

Conquer es una submarca: dentro del modo, el alumno siente que entró a otro lugar. Detalle completo en el prototipo.

- **Colores:** azul noche `#131d44`, dorado `#cfae6b`, dorado claro `#f6e2a4`, crema `#fdf3d3`. Sin rojo ni verde, salvo el chip SUBIR y el semáforo del coach.
- **Letra:** Cormorant Garamond para títulos y números grandes; Jost para el resto.
- **Componentes:** el sol con el dato principal en Inicio, el botón principal sobre nubes blancas, un templo de tres columnas por ejercicio que se llena por serie, letras griegas para los tramos (Α, Β, Γ, Ω), hornacinas para las fotos.
- **Íconos de niveles:** ternero, novillo y toro, en SVG dentro del prototipo.

---

## 11. Lo que no va en esta versión

- Armador de combos (los combos son fijos).
- Mapa de equilibrio muscular.
- Cargar las 3 series de cada escalón por separado.
- Cargar reps de cada elemento del combo.
- Confirmación del coach para subir de progresión.
- Cobro dentro de la app (el desbloqueo es manual), IA, modo sin conexión.

---

## 12. Cómo saber que está terminado

- [ ] Un coach da de alta un alumno (nivel y días) en menos de 5 minutos y la plantilla aparece sola.
- [ ] El alumno carga una sesión completa en menos de un minuto, con los contadores precargados.
- [ ] Ternero y Novillo no ven combos ni sábado; Toro sí.
- [ ] La semana 1 propone subir, quedarse o bajar según el E1.
- [ ] Con 6, 7, 8, 8 en un escalón aparece SUBIR; el botón pasa a la progresión siguiente y la próxima sesión arranca en 3.
- [ ] Una molestia de 4 genera una alerta roja con la propuesta de recorte.
- [ ] Un coach con 30 alumnos ve en una pantalla quién necesita algo.
- [ ] El control físico del día 0 se pide al activar el modo; las fotos no se ven sin permiso.
- [ ] Todo funciona en un celular de 390 px.

## 13. Orden de trabajo sugerido

1. Catálogo, alumno y sesiones en la base.
2. Hoy, con el motor de progresión (sección 4).
3. Progreso, con el botón Subir.
4. Alta del alumno por el coach, con plantillas y niveles.
5. Alertas y tablero del coach.
6. Sábado y combos de Toro.
7. Registro físico y galería.
8. Estética.

## 14. Decisiones abiertas (para Nacho)

1. Plantillas de 2 y 3 días (2.1).
2. Progresiones iniciales de Novillo y Ternero (8.2).
3. Regla de progresión de los combos. Propuesta: si completa el objetivo de series dos semanas seguidas, sube la progresión de arranque.
