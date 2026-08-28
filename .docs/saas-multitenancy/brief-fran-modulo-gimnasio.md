# Brief para Fran — Módulo Gimnasio: catálogo, rutinas y seguimiento del alumno

**De:** Nacho
**Para:** Fran (para trabajar con Claude Code)
**Fecha:** 24 de julio de 2026
**Módulo:** Nuevo — Gimnasio (web app de alumnos + panel del profesor)

---

## 1. Contexto

La web app de alumnos ya está armada y hoy resuelve **Calistenia**, con la planificación propia de El Templo. Lo que falta es el equivalente para **gimnasio y musculación**, que es lo que entrena la mayoría de los socios de los gimnasios que van a usar el SaaS. Hoy la app no les ofrece nada a esos socios.

El ciclo completo que tiene que quedar cerrado es este:

> catálogo de ejercicios → plantilla de rutina → el profe la asigna a un alumno → el alumno la ejecuta y registra lo que realmente hizo → el sistema le devuelve su evolución → el profe ve los resultados y las señales de alarma

El punto central del módulo, y el que justifica todo el desarrollo, es la brecha entre **lo que el profe sugiere** y **lo que el alumno hace**. Hoy ese dato no existe en ningún lado. Si lo capturamos, el alumno ve que progresa (que es lo que lo sostiene entrenando) y el profe deja de planificar a ciegas.

**Definición de alcance importante: la v1 va sin video.** Ver punto 2.5.

---

## 2. Catálogo de ejercicios

### 2.1 Propiedad y alcance

Hay un **catálogo global**, propiedad nuestra, que usan todos los gimnasios del SaaS. Sobre eso:

- Todos los gimnasios ven y usan el catálogo global. Es la base estandarizada.
- Cada gimnasio puede **crear ejercicios propios**, visibles solo para él.
- Un gimnasio **nunca puede editar ni desactivar un ejercicio global**. Si quiere una versión distinta de un ejercicio global, el sistema le crea una copia local que edita libremente. Sin esto, el primer gimnasio que cambie un nombre se lo cambia a todos.
- Nosotros podemos **promover** un ejercicio local al catálogo global cuando nos parece que suma. Regla que no se negocia: al promover, **ningún registro histórico se rompe ni se pierde**. Los entrenamientos ya cargados contra el ejercicio local tienen que seguir apuntando a algo válido y las métricas del alumno no pueden cambiar por una decisión administrativa nuestra.
- Los ejercicios **no se borran**: se desactivan. Un ejercicio desactivado desaparece del buscador y no se puede asignar en rutinas nuevas, pero sigue existiendo para todo el historial que lo referencia.

### 2.2 Ficha del ejercicio

| Campo | Obligatorio | Nota |
|---|---|---|
| Nombre canónico | Sí | Uno solo por ejercicio. Ver 2.4 |
| Alias / sinónimos | No | Lista, solo para el buscador. Que "press banca" y "press plano" encuentren el mismo ejercicio |
| Grupo muscular principal | Sí | De lista cerrada (2.3) |
| Grupos musculares secundarios | No | De la misma lista cerrada |
| Equipamiento requerido | Sí | De lista cerrada (2.3). Puede ser más de uno |
| Patrón de movimiento | Sí | De lista cerrada (2.3) |
| Nivel de dificultad | Sí | Principiante / Intermedio / Avanzado |
| Tipo de carga | Sí | Externa / Peso corporal / Peso corporal con lastre o asistencia / Tiempo / Distancia |
| Descripción breve | Sí | Una o dos líneas |
| Ejecución paso a paso | Sí | Ver 2.5: sin video, este campo es el que sostiene todo |
| Errores frecuentes | Sí | |
| Recomendaciones de seguridad | No | |
| Variante más fácil | No | Referencia a otro ejercicio |
| Variante más difícil | No | Referencia a otro ejercicio |
| Ejercicios alternativos | No | Lista de referencias. Ver 2.6 |
| URL de video | No | **Se deja el campo previsto aunque en v1 vaya vacío** |
| Imagen | No | Ídem |
| Alcance | Sí | Global / gimnasio X |
| Estado | Sí | Borrador / Publicado / Desactivado |

### 2.3 Taxonomías cerradas

**Esto es lo más importante de la sección y tiene que estar definido antes de generar un solo ejercicio.** Las tres listas de abajo son cerradas: el catálogo no puede inventar valores nuevos fuera de ellas. Si se generan libres, terminamos con "espalda", "dorsales", "dorsal ancho" y "espalda alta" como cuatro categorías distintas, y ahí se rompen los filtros, las variantes automáticas y cualquier métrica agrupada por músculo.

**Grupos musculares:** pecho, espalda, hombros, bíceps, tríceps, antebrazo, cuádriceps, isquiotibiales, glúteos, gemelos, aductores, abdominales, lumbares, cuello.

**Equipamiento:** peso corporal, mancuernas, barra olímpica, barra recta, barra EZ, discos, kettlebell, máquina, polea alta, polea baja, banco plano, banco inclinado, banco declinado, multipower, prensa, bandas elásticas, TRX o similar, anillas, paralelas, barra de dominadas, colchoneta, cajón, soga, agarre neutro, agarre supino, agarre prono.

**Patrones de movimiento:** empuje horizontal, empuje vertical, tracción horizontal, tracción vertical, dominante de rodilla, dominante de cadera, aislamiento, core, cardio.

Si alguna de estas listas cambia, se cambia acá y se regenera. No se parchea ejercicio por ejercicio.

**Nota sobre el equipamiento:** el equipamiento se etiqueta **en el ejercicio**, no en el gimnasio. Ningún gimnasio configura qué máquinas tiene, ni por sede, ni por cantidad. Eso quedó explícitamente fuera de alcance. El campo existe para que el profe sepa qué necesita cada ejercicio y para poder filtrar el buscador, y para que el día que queramos activar filtrado por sede no haya que rehacer el catálogo entero.

### 2.4 Reglas para la generación del catálogo

El catálogo inicial lo vamos a generar nosotros con agentes. Las reglas que tiene que respetar la generación:

- **Un ejercicio, un nombre canónico.** Nada de tres fichas para el mismo movimiento. Las variaciones de nombre van al campo de alias, no a fichas separadas.
- **Un ejercicio es distinto de otro solo si cambia el patrón, el equipamiento o el ángulo de trabajo.** "Press de banca inclinado" y "press de banca plano" son dos ejercicios. "Press de banca" y "press banca con barra" son el mismo.
- Todos los valores de grupo muscular, equipamiento y patrón salen de las listas del 2.3. Cualquier valor fuera de lista es un error de carga, no un valor nuevo.
- Todo ejercicio generado entra en estado **Borrador**. Se publica después de una revisión humana. Un catálogo generado sin revisar y publicado directo nos deja errores anatómicos y de seguridad a la vista de los socios de todos los gimnasios del SaaS al mismo tiempo.
- Volumen inicial sugerido: entre 40 y 80 ejercicios publicados que cubran los nueve patrones de movimiento, antes que 300 a medias. El catálogo crece después.

### 2.5 Sobre la ausencia de video en v1

En v1 no hay videos ni imágenes. La consecuencia es que **el campo de ejecución paso a paso y el de errores frecuentes son lo único que tiene el alumno para saber cómo se hace el ejercicio.** Tienen que estar bien escritos, en lenguaje llano y sin jerga: no aplica acá el vocabulario interno de El Templo.

Riesgo asumido que conviene tener escrito: un alumno principiante que se autogestiona su rutina, sin profe y sin video, va a tener una experiencia pobre. Por eso la autogestión es un permiso que cada gimnasio decide si habilita (ver punto 4.2), y no algo que viene prendido por default.

### 2.6 Variantes y alternativas

Como no configuramos el equipamiento por gimnasio, cuando un ejercicio no se puede hacer la salida es manual y tiene que ser instantánea: cada ejercicio lleva sus **alternativas** cargadas en el catálogo. El profe (o el alumno, si tiene el permiso) abre el ejercicio, ve las alternativas y reemplaza con un toque.

Cuando se reemplaza un ejercicio dentro de una sesión, **el registro guarda cuál se hizo realmente**, no el que estaba planificado. Si no, las métricas mienten.

---

## 3. Plantillas de rutina

Mismo esquema de propiedad que el catálogo: hay **plantillas globales** nuestras (full body principiante, torso-pierna, push/pull/legs, y las que definamos), y cada gimnasio o profe puede **crear y guardar las suyas**.

Una plantilla se **clona**. El profe agarra "Principiante full body", la clona para el alumno, la ajusta y la asigna. La plantilla original no se toca.

Estructura:

```
Plantilla de rutina
 └── Día / Sesión (Día 1, Día 2… o Torso, Pierna…)
      └── Ejercicio (orden, referencia al catálogo)
           ├── Series objetivo
           ├── Repeticiones objetivo (valor o rango: 8, u 8-12)
           ├── Peso sugerido (opcional, puede quedar vacío)
           ├── Descanso entre series
           └── Observaciones del profe
```

Consideraciones:

- Una plantilla no tiene fechas. Tiene días numerados o nombrados. La fecha aparece recién cuando el alumno la ejecuta.
- Tiene que soportar agrupaciones tipo superserie o circuito, aunque sea de forma simple (ejercicios marcados como parte del mismo bloque).
- Las plantillas también se desactivan, no se borran.

---

## 4. Asignación al alumno

### 4.1 Por el profesor

El profe asigna una rutina a un alumno concreto, con fecha de inicio y, opcionalmente, de fin. Un alumno tiene **una rutina activa por vez**; las anteriores quedan en su historial y se pueden consultar.

**Regla que no se negocia: la rutina asignada es una copia, no un puntero a la plantilla.** Si el profe edita después la plantilla global, las rutinas ya asignadas no cambian. Nadie puede encontrarse con que la rutina que viene haciendo hace tres semanas mutó sola de un día para el otro.

Cuando el profe modifica la rutina de un alumno en curso (le sube el peso, le cambia un ejercicio), el cambio queda visible para el alumno como una modificación, con su fecha.

### 4.2 Autogestión del alumno

Es un **permiso configurable por gimnasio**, apagado por default. Cada gimnasio decide según cómo trabaja: hay gimnasios donde el profe planifica todo y hay gimnasios donde el socio se maneja solo.

- **Apagado:** el alumno solo ve la rutina que le asignó su profe. Si no tiene ninguna asignada, ve una pantalla que lo invita a hablar con un profesor. Que no quede en blanco.
- **Prendido:** el alumno puede elegir una plantilla del catálogo disponible para su gimnasio y autoasignársela. A efectos del sistema, actúa como su propio profesor: la rutina queda marcada como autoasignada, para distinguirla en el panel de las que asignó un profe.

---

## 5. Ejecución y registro

Esta es la parte donde se juega el módulo. **Si cargar cuesta, el alumno no carga; si no carga, no hay historial; sin historial no hay evolución, y sin evolución el módulo entero no sirvió para nada.** Todo lo de abajo apunta a eso.

### 5.1 Reglas de fricción mínima

- Los valores que planificó el profe vienen **precargados** en cada serie. El alumno confirma, no tipea.
- Botón grande de **"hice lo planificado"** que completa la serie entera de un toque.
- La serie siguiente **hereda el peso** de la anterior ya cargada.
- El alumno puede **cargar todo al final** de la sesión. No es obligatorio cargar serie por serie en el momento.
- Los inputs numéricos son de pulgar: steppers y valores frecuentes, no teclado libre. Alguien con las manos sudadas, entre series, no tipea decimales.

### 5.2 Estados de la sesión

| Estado | Cuándo |
|---|---|
| Pendiente | Programada, no arrancada |
| En curso | El alumno la inició |
| Completada | **El alumno la finalizó manualmente** |
| Abandonada | Quedó en curso y pasó el timeout sin finalizarse (parametrizable, default 12 horas) |

**Una sesión se cuenta como completada únicamente si el alumno la cierra a mano.** No hay porcentaje automático de ejercicios que la dé por terminada. Las abandonadas conservan lo que se haya cargado, pero no suman a la métrica de sesiones completadas.

### 5.3 Qué se registra por serie

- Repeticiones realizadas
- Peso utilizado
- Duración, en ejercicios por tiempo
- Distancia, cuando corresponda
- Para ejercicios de peso corporal: peso corporal, lastre agregado y asistencia utilizada, según el tipo de carga del ejercicio
- Se guarda **el ejercicio efectivamente realizado**, aunque difiera del planificado

Unidades: **kilogramos** en v1. Libras queda previsto en el modelo pero no se implementa.

### 5.4 Edición de resultados

El alumno puede corregir sus registros hasta **24 horas** después de finalizada la sesión (parametrizable). Pasado ese plazo, queda en solo lectura y solo el profe puede tocarlo.

Toda edición o eliminación de un registro **obliga a recalcular los récords personales** del alumno para ese ejercicio.

---

## 6. Valoración del ejercicio

**En v1 hay una sola pregunta por ejercicio, más un flag.** El documento original proponía tres escalas (esfuerzo, sensación, preferencia) más comentario libre; tres escalas por ejercicio matan la tasa de respuesta y terminamos sin ninguna de las tres.

Al terminar cada ejercicio, el alumno responde:

**¿Cómo te resultó?** → Fácil / Adecuado / Difícil

Y opcionalmente:

**¿Sentiste alguna molestia?** → Sí / No. Si marca sí, puede indicar dónde y dejar un comentario libre.

Las dos son **opcionales**: si el alumno las saltea, la sesión se completa igual. Un formulario que bloquea el avance es un formulario que hace abandonar la sesión.

Preferencia ("me gusta / no me gusta") y sensación ("muy bien / incómodo / dolor") quedan para v2.

---

## 7. Evolución del alumno

Tres métricas en v1, no más. La pantalla tiene que ser legible de un vistazo y motivar; una docena de indicadores confunde y desmotiva.

| Métrica | Qué muestra |
|---|---|
| **Récord de peso por ejercicio** | El peso máximo que levantó en ese ejercicio y la fecha en que lo logró |
| **Comparación con la vez anterior** | Al abrir un ejercicio: qué hizo la última vez que lo entrenó, para que sepa contra qué está compitiendo |
| **Sesiones completadas en el mes** | Cuántas cerró este mes, con el mes anterior al lado |

El récord de peso se recalcula cada vez que se agrega, edita o elimina un registro.

Quedan explícitamente para v2: volumen total, 1RM estimado, récords de repeticiones y de volumen, gráficos de evolución, y el feedback automático en texto ("aumentaste 5 kg respecto de tu última sesión"). El 1RM estimado en particular lo dejamos afuera a propósito: es un número que se malinterpreta fácil y termina con gente buscando el máximo sin supervisión.

---

## 8. Panel del profesor

Entra en v1. Sin esto, la valoración del alumno es data muerta: si alguien marca molestia tres sesiones seguidas y nadie del otro lado lo ve, no sirvió de nada haberlo preguntado.

**Vista de alumnos.** Lista de sus alumnos con rutina activa, última sesión registrada, y las señales de atención destacadas.

**Señales que tienen que saltar a la vista, sin buscarlas:**

- Alumno que registró **molestia** en algún ejercicio. Es la prioridad más alta de la pantalla.
- Ejercicio calificado como **Difícil** en varias sesiones seguidas (umbral parametrizable, default 3): la carga está mal puesta.
- Ejercicio calificado como **Fácil** repetidamente: hay que subirle el peso.
- Alumno **sin sesiones registradas** en los últimos N días (parametrizable, default 14).

**Ficha del alumno.** Rutina asignada, historial de sesiones, resultados por ejercicio con lo planificado al lado de lo realizado, valoraciones y comentarios. Desde acá el profe ajusta series, repeticiones y pesos.

Los umbrales de estas señales son configurables por gimnasio.

---

## 9. Privacidad

**No hay toggle de consentimiento.** Si el profesor te arma la rutina, ve lo que registrás: resultados, valoraciones y molestias. Se avisa una vez en el onboarding del módulo y listo. Es una pantalla menos y una decisión menos para el alumno.

Lo que un profesor ve es únicamente lo de **los alumnos de su gimnasio**. Nada cruza de un gimnasio a otro, en ninguna dirección.

---

## Validaciones / guardrails

- **Nada se borra: se desactiva.** Ejercicios, plantillas, rutinas asignadas y registros de entrenamiento. Un ejercicio desactivado sale del buscador pero sigue resolviendo todas las referencias históricas.
- **Ningún valor de grupo muscular, equipamiento o patrón fuera de las listas cerradas del 2.3.** Se valida en la carga, no después.
- **Un gimnasio no puede modificar contenido global.** Editar un ejercicio o plantilla global genera automáticamente una copia local.
- **Aislamiento entre gimnasios.** Un gimnasio no ve ejercicios propios, alumnos ni datos de otro. Vale también para el buscador del catálogo.
- **La rutina asignada no muta.** Editar una plantilla nunca modifica retroactivamente lo ya asignado.
- **Los récords se recalculan ante cualquier alta, edición o baja de registro.** Un récord mal calculado que después se corrige solo, para el alumno es la app mintiendo.
- El registro guarda siempre el ejercicio realizado, no el planificado, cuando difieren.
- Los pesos y repeticiones aceptan cero y valores parciales: la serie que salió mal también es dato.

---

## Carga inicial del catálogo

El catálogo se genera con agentes, así que aplica el mismo cuidado que una migración:

1. La generación corre primero contra una **base de prueba**, no contra producción.
2. Antes de publicar nada, validar: total de ejercicios generados, cuántos por grupo muscular, cuántos por patrón de movimiento (que los nueve estén cubiertos), cuántos por equipamiento, y **cuántos nombres colisionan o son sinónimos entre sí**. El conteo de duplicados es el que más importa.
3. Revisión humana del listado completo antes de pasar de Borrador a Publicado.
4. **Backup antes de cargar sobre producción**, y carga en una sola transacción que se pueda revertir.
5. Si después hay que regenerar por un cambio de taxonomía, la regeneración no puede pisar ejercicios que ya tengan registros de entrenamiento asociados.

---

## Opcional: si es barato suma, si no, va después

- **Videos e imágenes por ejercicio.** Es lo primero que sumaría después de v1, y el campo ya queda previsto.
- Temporizador de descanso entre series con aviso.
- Preferencia y sensación en la valoración (v2).
- Volumen total, récords de repeticiones y de volumen, gráficos de evolución.
- Feedback automático en texto sobre la sesión.
- Sugerencia automática de alternativa cuando el alumno marca que no puede hacer un ejercicio.
- Exportar la rutina a PDF para el que la quiere en papel.

---

## Resumen de definiciones que quedan de tu lado

1. **(Bloqueante, define todo lo demás) ¿Calistenia y Gimnasio comparten modelo de datos o son módulos separados?** Ya tenemos Calistenia funcionando con su propia planificación. Necesito que evalúes si conviene unificar el modelo de sesión y registro para ambos, o mantenerlos separados y unirlos solo en la capa de presentación. Los ejercicios de peso corporal con lastre (dominadas, fondos) viven en los dos mundos y son el punto donde se va a notar la decisión. De acá sale también la respuesta a si el alumno ve un historial o dos.
2. **Modelo de alcance global / por gimnasio** para ejercicios y plantillas, y qué pasa exactamente al promover un ejercicio local a global sin romper los registros históricos que lo referencian.
3. **Comportamiento sin conexión.** Los gimnasios suelen tener mala señal, y muchos están en subsuelo. Si la carga de series depende de que haya red, se pierde. Necesito saber si va con guardado local y sincronización posterior, y qué pasa si el mismo alumno carga desde dos dispositivos.
4. Cómo se resuelve el **recálculo de récords personales**: en el momento de cada registro o en proceso diferido. Lo que importa es que el alumno nunca vea un récord que después cambia solo.
5. Estructura de la plantilla de rutina y cómo se modelan las agrupaciones (superseries, circuitos) sin complicar el caso simple, que es el 90%.
6. **Volumen de datos.** Un registro por serie, por ejercicio, por sesión, por alumno, por gimnasio. Crece rápido. Definí el esquema y los índices pensando en la consulta más frecuente, que es "historial de este alumno en este ejercicio".
7. Cómo se maneja el permiso de autogestión por gimnasio, junto con los demás parámetros configurables de este brief (timeout de sesión abandonada, plazo de edición, umbrales de las señales del panel del profe).

Los renombres y cambios de navegación del documento original (Guía → Gimnasio, Entrenar → Calistenia, Planes → Contratar, historiales, banners) van en un brief aparte. Este es el grueso.

Cualquier duda me escribís.

---

# Addendum — Decisiones y agregados de la sesión 2026-07-26 (Franco + Claude)

> El texto de arriba es el brief de Nacho, intacto. Esto de abajo registra lo decidido al
> incorporarlo al plan SaaS, más dos agregados que habían quedado fuera del brief.

## A1. Frontera arquitectónica — DECIDIDO: módulo duro dentro del mismo sistema

El módulo Gimnasio vive en la misma API y la misma base que el resto del SaaS, con
**frontera dura**: tablas propias, rutas propias, **cero imports desde/hacia el SPOM**
(en ninguna dirección), y acople con el core únicamente por FKs a `users`/`branches`/
`tenants` (+ lectura de `subscriptions` para saber si el socio está activo). Se descartó
el sistema separado con DB propia: obligaría a sincronizar socios/membresías/sedes/profes
entre dos bases (dos verdades que divergen) sin aportar funcionalidad. La frontera limpia
deja la extracción futura posible si algún día se justifica.

Consecuencia visual: cada tenant tiene UN sistema de entrenamiento prendido — El Templo
ve el SPOM (módulo Templo), los demás gimnasios ven el módulo Gimnasio. Nunca se cruzan.

## A2. Dos catálogos de ejercicios — CONFIRMADO (ya era la decisión del doc 02)

La tabla `exercises` actual es el árbol de progresión del SPOM y **no se toca** (módulo
Templo). El catálogo del §2 de este brief son **tablas nuevas**: catálogo global (sin
`tenant_id`, propiedad de la plataforma) + ejercicios locales por gimnasio (con
`tenant_id`). Coincide con doc 02 §2 y con el "club GLOBAL" del inventario (doc 05 §3),
que gana acá sus primeros miembros reales.

## A3. Prior fuerte para la pregunta 1 de Nacho

Posición de Franco (2026-07-26), a validar en la fase de diseño: **Calistenia y Gimnasio
NO comparten modelo de datos** — los dominios difieren demasiado (sesión generada por
algoritmo vs plantilla→registro de series). Se unifican a lo sumo en la capa de
presentación. Los ejercicios de peso corporal con lastre existen en ambos mundos como
fichas independientes, sin puente de datos.

## A4. AGREGADO — Categoría del ejercicio (pedido: espalda, pecho, bíceps, tríceps, piernas, hombros)

Para no violar el principio de taxonomías cerradas del §2.3 (que prohíbe que "piernas" y
"cuádriceps" compitan como valores), la categoría **no es un campo editable**: es una
**capa de presentación derivada** del grupo muscular principal por mapeo fijo, para
filtros y navegación del catálogo:

| Categoría | Grupos musculares que agrupa |
|---|---|
| Pecho | pecho |
| Espalda | espalda |
| Hombros | hombros |
| Bíceps | bíceps, antebrazo |
| Tríceps | tríceps |
| Piernas | cuádriceps, isquiotibiales, glúteos, gemelos, aductores |
| Core | abdominales, lumbares, cuello |

*Nota:* "Core" es la 7ª categoría agregada porque abdominales/lumbares/cuello no entran
en las 6 pedidas. Mapeo propuesto — validar con Nacho (en particular antebrazo→Bíceps).

## A5. AGREGADO — Opción "Crear rutina desde cero"

Además de clonar una plantilla (§3), el panel del profe ofrece explícitamente **crear una
rutina desde cero** eligiendo ejercicios del catálogo (misma estructura del §3; se puede
guardar como plantilla propia del gimnasio). **Solo el profe en v1** — decidido
2026-07-26: el alumno autogestionado (§4.2) elige plantillas existentes; armarse la
rutina desde cero queda para v2 (coherente con el riesgo asumido del §2.5: principiante
sin video y sin profe).

## A6. Superficie member-facing — se decide en la fase de diseño

Este brief reabre la diferida del 2026-07-02 ("app de miembros multi-tenant: futura; MVP
admin-only"): el §5 requiere que socios de otros gimnasios ejecuten y registren. **Dónde
vive esa superficie** (web app nueva vs otra opción; `el-templo-app` NO se transforma,
eso sigue firme) se decide en la fase de diseño del milestone Gimnasio, junto con la
pregunta 1. Recordar: la app multi-tenant era el trigger del split de repos — esa
discusión puede adelantarse.

## A7. Secuencia de milestones — DECIDIDO

1. **Milestone Tenancy** (fases T1-T6+ del doc 06 §7) — la infra que este brief REQUIERE
   (aislamiento entre gimnasios, `tenant_settings` para todos los parámetros por gimnasio
   del brief: autogestión, timeout 12 h, edición 24 h, umbrales del panel del profe).
2. **Milestone Módulo Gimnasio** — el producto de este brief, arrancando con la fase de
   diseño que responde las 7 definiciones del final (la 1 es bloqueante).

