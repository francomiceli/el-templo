# Guia del Coach -- El Templo Admin

La aplicacion **El Templo Admin** es la herramienta principal que los coaches utilizan para gestionar las sesiones de entrenamiento de los alumnos. Desde esta aplicacion se pueden revisar, editar y aprobar sesiones generadas por el algoritmo, generar nuevas sesiones para semanas futuras, consultar la biblioteca de ejercicios y ver el progreso de cada alumno.

**Quien debe leer esta guia:** Todo coach que participe en la revision y aprobacion de sesiones de entrenamiento. Tambien es util como referencia rapida para coaches experimentados.

**Cuando consultarla:** Al incorporarse como coach, al encontrar una funcion desconocida, o cuando se necesite un recordatorio sobre el flujo de trabajo correcto.

---

## 1. Acceso y navegacion

### Iniciar sesion

1. Abrir el navegador web e ir a la URL de la aplicacion admin (por ejemplo, `admin.eltemplo.org`).
2. En la pagina de **Login**, ingresar el correo electronico y la contrasena proporcionados por el equipo tecnico.
3. Al autenticarse correctamente, se redirige automaticamente a la vista de **Sesiones**.

> **Nota:** La aplicacion admin es solo web (no tiene version movil). Se recomienda usar un navegador de escritorio para una experiencia optima.

### Barra lateral de navegacion (Drawer)

Al hacer clic en el boton de **menu** (icono de hamburguesa) en la esquina superior izquierda, se despliega el menu lateral con las siguientes secciones:

| Seccion        | Icono               | Ruta         | Descripcion                                 |
| -------------- | ------------------- | ------------ | ------------------------------------------- |
| **Sesiones**   | `fitness_center`    | `/sessions`  | Vista principal de sesiones por semana      |
| **Generar**    | `auto_awesome`      | `/generate`  | Generacion de sesiones para semanas futuras |
| **Ejercicios** | `sports_gymnastics` | `/exercises` | Biblioteca completa de ejercicios           |
| **Alumnos**    | `people`            | `/alumnos`   | Lista de alumnos y su progreso              |

- Al lado de **Sesiones** aparece un **badge rojo** con el numero de sesiones pendientes de revision cuando hay sesiones sin aprobar.
- En la esquina superior derecha se encuentra el boton de **Cerrar sesion** (icono `logout`).

### Banner de sesiones bajas

Si la cobertura de sesiones aprobadas es igual o menor a 1 semana hacia adelante, aparece un banner amarillo de advertencia en la parte superior:

> "Solo hay sesiones aprobadas para la semana actual o menos. Genera y aprueba mas semanas."

Este banner incluye un boton **"Generar"** que lleva directamente a la seccion de generacion.

### Estado en la URL

La aplicacion utiliza parametros en la URL para mantener el estado de navegacion. Por ejemplo:

- `/sessions?week=Y2026W08` -- Sesiones de la semana 8 del 2026
- `/sessions?week=Y2026W08&tab=personalizadas` -- Pestana de sesiones personalizadas
- `/sessions/edit?week=Y2026W08&day=lunes` -- Edicion de sesiones del lunes
- `/sessions/edit?week=Y2026W08&day=martes&journeyType=pull_up` -- Edicion de sesiones journey

Esto permite compartir enlaces directos a vistas especificas y que el boton de retroceso del navegador funcione correctamente.

---

## 2. Sesiones (Vista principal)

La pagina de **Sesiones** (`/sessions`) es el punto de partida para la revision diaria. Aqui se ven todas las sesiones generadas organizadas por semana y dia.

### Pestanas: General y Personalizadas

La vista tiene dos pestanas principales:

- **General**: Sesiones estandar generadas por el algoritmo SPOM (las sesiones regulares de entrenamiento).
- **Personalizadas**: Sesiones de journey (caminos personalizados por zona corporal, como "Pull Up", "Front Lever", etc.).

### Navegacion por semana

En ambas pestanas se dispone de:

- **Flechas de navegacion** (`<` y `>`) para avanzar o retroceder una semana.
- **Selector de fecha** (icono de calendario `event`) que despliega un calendario para saltar directamente a cualquier semana. El calendario empieza la semana en lunes.
- El **numero de semana** se muestra en formato legible (por ejemplo, "Semana 8, 2026").

### Niveles de los alumnos

Las sesiones se generan para 5 niveles de alumnos:

| Nivel       | Color en la interfaz |
| ----------- | -------------------- |
| **Alfa**    | Celeste (light-blue) |
| **Delta**   | Indigo               |
| **Sigma**   | Purpura              |
| **Omega**   | Naranja              |
| **Spartan** | Rojo                 |

### Indicadores de estado

Cada sesion muestra un icono de estado junto al nivel:

- **Check verde** (`check_circle`, color verde): Sesion **aprobada** -- lista para que los alumnos la vean.
- **Reloj ambar** (`schedule`, color ambar): Sesion **pendiente de revision** (`pending_review`) -- necesita revision y aprobacion del coach.

### Tarjetas de dia

Cada dia con sesiones generadas se muestra como una tarjeta que contiene:

- **Nombre del dia** (Lunes, Martes, Miercoles, Jueves, Viernes, Sabado).
- **Filas por nivel** mostrando: icono de estado, nombre del nivel con color, y un resumen de rutas asignadas.
- **Botones de accion** en la esquina superior derecha de cada tarjeta:

| Boton                  | Icono            | Funcion                                                         |
| ---------------------- | ---------------- | --------------------------------------------------------------- |
| **PDF del dia**        | `picture_as_pdf` | Descarga un PDF con las sesiones del dia (niveles Alfa a Omega) |
| **Editar dia**         | `edit`           | Navega a la pagina de edicion del dia completo                  |
| **Aprobar pendientes** | `check_circle`   | Aprueba en bloque todas las sesiones pendientes del dia         |

El boton de **Aprobar pendientes** solo aparece cuando hay sesiones pendientes. Muestra un **badge rojo** con la cantidad de sesiones por aprobar.

### Aprobacion en bloque

Al presionar el boton de aprobacion en bloque, aparece un dialogo de confirmacion:

> "Aprobar [N] sesiones pendientes para [Dia]?"

Con opciones de **Cancelar** o **Aprobar**. Tras confirmar, se muestra una notificacion verde indicando cuantas sesiones fueron aprobadas.

### Descarga de PDF

Hay dos niveles de descarga de PDF:

- **PDF del dia**: Boton en cada tarjeta de dia. Genera un PDF con las sesiones de los niveles Alfa, Delta, Sigma y Omega (Spartan se excluye).
- **PDF de la semana**: Boton **"PDF Semana"** en la parte superior de la pestana General. Genera un PDF consolidado con todas las sesiones de la semana para los mismos 4 niveles.

> **Nota:** Solo se incluyen en el PDF las sesiones de niveles Alfa, Delta, Sigma y Omega. Las sesiones de nivel Spartan no se incluyen.

### Pestana Personalizadas

La pestana **Personalizadas** funciona de manera similar a la General pero filtra por tipo de journey. Incluye:

- Sub-pestanas por tipo de journey (cada tipo tiene un badge de color segun su tier).
- Las mismas tarjetas de dia con indicadores de estado y acciones.
- Boton de **Editar dia** y **Aprobar pendientes** (sin PDF por ahora).

Si no hay sesiones para el tipo de journey seleccionado, se muestra el mensaje:

> "No hay sesiones de [Tipo] para [Semana]. Genera sesiones en la pestana 'Generar Sesiones' > Personalizadas."

---

## 3. Edicion de sesiones

La pagina de edicion (`/sessions/edit?week=...&day=...`) muestra las sesiones de un dia completo agrupadas por bloque. Aqui es donde el coach realiza la revision detallada y los ajustes necesarios.

### Flujo de estados de una sesion

```
Generada (pending_review) --> Coach Revisa y Edita --> Aprobada (approved)
```

Una sesion generada por el algoritmo empieza con estado `pending_review`. El coach la revisa, realiza los ajustes necesarios, y finalmente la aprueba. Una vez aprobada, los alumnos la ven en su aplicacion movil.

### Encabezado

El encabezado muestra:

- Boton **flecha atras** para volver a la lista de sesiones.
- Titulo: **"Editar Sesion - [Semana] - [Dia]"**.
- Badge de estado general: **"Aprobado"** (verde) si todas las sesiones del dia estan aprobadas, o **"Pendiente"** (ambar) si alguna esta pendiente.
- Si es una sesion de journey, se muestra un badge con el tipo de journey.

### Barra de acciones del dia

Debajo del encabezado se encuentran los botones de accion a nivel de dia:

| Boton            | Icono     | Color      | Funcion                                                        |
| ---------------- | --------- | ---------- | -------------------------------------------------------------- |
| **Aprobar Dia**  | `check`   | Verde      | Aprueba todas las sesiones pendientes del dia                  |
| **Revertir Dia** | `undo`    | Amarillo   | Revierte todas las sesiones aprobadas a pendiente              |
| **Resetear Dia** | `restore` | Secundario | Restaura TODAS las sesiones al snapshot original del algoritmo |
| **Vista Previa** | `preview` | Info       | Abre un dialogo con la vista previa como la veria un alumno    |

> **Atencion:** El boton **"Resetear Dia"** elimina permanentemente todos los cambios manuales. Se requiere confirmacion antes de ejecutar.

### Estructura de bloques

Las sesiones se organizan en bloques. Cada bloque se muestra como una tarjeta con:

**Encabezado coloreado** con el nombre del bloque:

| Bloque            | Color   | Descripcion                            |
| ----------------- | ------- | -------------------------------------- |
| **INITIUM**       | Azul    | Calentamiento                          |
| **NUCLEUS**       | Purpura | Bloque principal de fuerza             |
| **DEUTEROS_1**    | Teal    | Primer bloque complementario           |
| **DEUTEROS_2**    | Teal    | Segundo bloque complementario          |
| **ATHLOS/EPIKOS** | Ambar   | Bloque de finalizacion (seleccionable) |

### Operaciones a nivel de bloque

**Cambio de formato:** Junto al nombre del bloque hay un selector desplegable de formato. Las opciones muestran el nombre del formato y su **puntaje de compatibilidad** entre parentesis. Ejemplos de formatos: Straight Sets, EMOM, AMRAP, Complex, For Time, Tabata, etc.

**Cambio de rol (ATHLOS/EPIKOS):** Para el bloque final, un selector permite alternar entre ATHLOS y EPIKOS.

**Pestanas de nivel:** Debajo del encabezado del bloque (excepto INITIUM), hay pestanas para cada nivel de alumno. Al seleccionar un nivel, se ven los ejercicios asignados a ese nivel especifico.

**Estadisticas del bloque:** Debajo de las pestanas se muestra informacion del bloque seleccionado:

- **Ruta** del bloque (por ejemplo, PL, HT, FL, GN, MX).
- **Cantidad de ejercicios** (con advertencia si hay mas de 3 en bloques no-INITIUM).
- **Intensidad** en porcentaje.
- **Reps recomendadas** (budget de repeticiones).
- **Dificultad promedio**.

**Barra de presupuesto (Budget Bar):** Muestra visualmente cuanto del presupuesto de repeticiones se ha utilizado. Se visualiza como una barra de progreso con porcentaje.

**Indicadores de mezcla de contraccion (Contraction Mix Badge):** Muestra la distribucion actual de tipos de contraccion (CON/EXC/ISO) comparada con la esperada.

**Editor de parametros de formato:** Para formatos configurables, aparece un editor con los parametros especificos (por ejemplo, duracion para AMRAP, intervalo para EMOM).

### Operaciones a nivel de ejercicio

Cada ejercicio dentro de un bloque se muestra como una fila editable con:

**Campos de prescripcion (editables):**

- **Reps** / **Reps Max** -- Repeticiones (minimo y maximo).
- **Segundos** / **Segundos Max** -- Duracion en segundos.
- **Incremento** -- Incremento de carga.
- **Descanso** -- Tiempo de descanso en segundos.
- **Notas** -- Notas adicionales para el alumno.

> **Importante:** Los campos de prescripcion se **guardan automaticamente al salir del campo** (comportamiento "blur-save"). Es decir, al hacer clic fuera del campo o presionar Tab, el cambio se envia al servidor automaticamente. No hay boton de "Guardar" separado.

**Botones de accion por ejercicio:**

| Accion                 | Descripcion                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| **Intercambiar**       | Abre el dialogo de seleccion de ejercicio para reemplazar el actual |
| **Agregar ejercicio**  | Agrega un nuevo ejercicio al bloque                                 |
| **Eliminar ejercicio** | Elimina el ejercicio (con confirmacion)                             |
| **Reordenar**          | Permite cambiar el orden de los ejercicios dentro del bloque        |

### Dialogo de intercambio de ejercicio

Al presionar **Intercambiar**, se abre un dialogo que muestra el pool de ejercicios disponibles para ese bloque. El dialogo incluye:

- **Filtro por tipo de contraccion** (CON, EXC, ISO) -- al cambiar se recarga desde el servidor.
- **Busqueda por nombre** -- filtra en tiempo real (lado del cliente).
- Los ejercicios del pool se muestran con: nombre, ruta, tipo de contraccion, dificultad.
- Los ejercicios de **cruce** (cross-route, de la ruta secundaria via `pattern_2`) se identifican con un badge **"Cruce"** en color naranja oscuro.

### Movilidad por bloque

Cada bloque no-INITIUM puede tener un **ejercicio de movilidad** asociado (descanso activo). En la tarjeta del bloque se muestra una seccion de movilidad con:

- Nombre del ejercicio de movilidad actual.
- Campos de prescripcion editables (misma mecanica de blur-save).
- Boton para **intercambiar** el ejercicio de movilidad. Se abre el mismo dialogo de intercambio pero en **modo movilidad**, que filtra ejercicios de la categoria MOVILIDAD. Los ejercicios relevantes para la ruta del bloque muestran un badge **"Relacionado"** en verde.

### Intercambio de bloque

Ademas de intercambiar ejercicios individuales, se puede intercambiar un bloque completo con otro bloque del mismo tipo (por ejemplo, intercambiar DEUTEROS_1 con DEUTEROS_2) mediante el boton de intercambio a nivel de bloque.

---

## 4. Generacion de sesiones (Generar)

La pagina **Generar** (`/generate`) permite crear sesiones de entrenamiento para semanas futuras. Tiene dos pestanas: **General** y **Personalizadas**.

### Pestana General

**Selector de semana:** Un campo numerico para ingresar el numero de semana. Se muestra la semana actual como referencia.

> **Restriccion:** Solo se pueden generar sesiones para semanas **futuras** (semana actual + 1 como minimo). No se pueden regenerar semanas pasadas ni la semana en curso.

**Nivel de regeneracion:** Tres opciones que determinan el alcance de la generacion:

| Opcion              | Descripcion                                              |
| ------------------- | -------------------------------------------------------- |
| **Semana Completa** | Genera sesiones para todos los dias y niveles            |
| **Un Dia**          | Genera sesiones para un dia especifico (selector de dia) |
| **Dia + Nivel**     | Genera sesiones para un dia y nivel especifico           |

**Selectores adicionales:**

- **Selector de dia:** Aparece cuando se elige "Un Dia" o "Dia + Nivel". Opciones: Lun, Mar, Mie, Jue, Vie, Sab.
- **Selector de nivel:** Aparece solo con "Dia + Nivel". Opciones: Alfa/Delta, Sigma, Omega.

**Tabla de estado de la semana:** Una tabla que muestra el estado actual de cada dia y nivel:

- Columnas: Dia | a/D (Alfa/Delta) | S (Sigma) | O (Omega).
- Iconos de estado: check verde (aprobada), reloj ambar (pendiente), guion gris (no existe), candado (semana pasada/actual).

**Casilla de regeneracion:** Si ya existen sesiones en el alcance seleccionado, aparece una casilla:

> "Regenerar sesiones existentes (se eliminaran permanentemente)"

Al activarla y generar, aparece un dialogo de confirmacion con boton rojo **"Eliminar y Regenerar"** advirtiendo que la accion es irreversible.

**Boton de generacion:** El boton cambia su etiqueta segun el alcance seleccionado:

- "Generar Semana Completa"
- "Generar [Dia]"
- "Generar [Dia] - [Nivel]"

**Resultado:** Tras generar, aparece un banner verde indicando cuantas sesiones se generaron y cuantas se omitieron (si ya existian).

> **Despues de generar:** Las sesiones nuevas aparecen con estado `pending_review` en la seccion de Sesiones. Es necesario revisarlas y aprobarlas antes de que los alumnos las vean.

### Pestana Personalizadas

Para la generacion de sesiones de journey (caminos personalizados):

**Selector de semana:** Igual que en la pestana General, con restriccion de semanas futuras.

**Tipos de journey:** Se muestran agrupados por tier (nivel de dificultad):

- **Principiante** -- Journeys introductorios.
- **Intermedio** -- Journeys de nivel medio.
- **Avanzado** -- Journeys avanzados.

Cada tipo se muestra como un chip seleccionable. Al hacer clic se activa o desactiva.

**Boton "Generar Todo":** Genera sesiones para todos los tipos de journey seleccionados. La generacion es secuencial (un tipo a la vez) para no sobrecargar el sistema.

**Generacion por tipo:** Debajo hay una lista individual de cada tipo de journey con un boton **"Generar"** independiente. Al lado de cada tipo se muestra el resultado si ya fue generado (cuantas sesiones generadas y omitidas).

**Casilla de regeneracion:** Permite regenerar sesiones existentes.

---

## 5. Ejercicios

La pagina de **Ejercicios** (`/exercises`) es la biblioteca completa de ejercicios disponibles en el sistema.

### Encabezado

- Titulo: **"Ejercicios"**.
- Boton **"Subida Masiva"** (`cloud_upload`): Abre un dialogo para subir videos de ejercicios en lote. Solo disponible en produccion.
- Boton **"Crear Ejercicio"** (`add`): Actualmente **deshabilitado** (funcionalidad futura). Muestra un tooltip "Proximamente".

### Filtros

La barra de filtros permite buscar y filtrar ejercicios por:

| Filtro                | Tipo     | Opciones                                                 |
| --------------------- | -------- | -------------------------------------------------------- |
| **Buscar por nombre** | Texto    | Busqueda libre con debounce de 300ms                     |
| **Categoria**         | Selector | Todas, Fuerza, Halterofilia, Gimnasia, Movilidad, Cardio |
| **Nivel**             | Selector | Todos, Alfa, Delta, Sigma, Omega, Spartan                |
| **Ruta**              | Selector | Todas, PL, HT, FL, GN, MX, CD, MV                        |
| **Contraccion**       | Selector | Todos, CON, EXC, ISO                                     |
| **Estado de video**   | Toggle   | Todos, Con Video, Sin Video                              |

### Tabla de ejercicios

La tabla muestra los siguientes campos por ejercicio:

| Columna         | Descripcion                                    |
| --------------- | ---------------------------------------------- |
| **ID**          | Identificador unico                            |
| **Nombre**      | Nombre del ejercicio                           |
| **Categoria**   | Fuerza, Halterofilia, Gimnasia, etc.           |
| **Nivel**       | Nivel minimo del ejercicio                     |
| **Ruta**        | Ruta del ejercicio (PL, HT, FL, etc.)          |
| **Contraccion** | Tipo de contraccion (CON, EXC, ISO)            |
| **Video**       | Icono verde si tiene video, gris si no         |
| **Acciones**    | Botones de subir/ver/reemplazar/eliminar video |

### Gestion de videos

Las acciones disponibles dependen de si el ejercicio tiene video:

**Sin video:**

- Boton **"Subir"** para cargar un archivo MP4.

**Con video:**

- Boton **ver** (icono `open_in_new`): Abre el video en una nueva pestana.
- Boton **reemplazar** (icono `swap_horiz`): Permite subir un nuevo video para reemplazar el actual.
- Boton **eliminar** (icono `delete`, rojo): Elimina el video con confirmacion previa.

> **Nota:** La subida y gestion de videos solo esta disponible en el entorno de produccion.

### Subida masiva

El boton **"Subida Masiva"** abre un dialogo que permite seleccionar multiples archivos de video y asignarlos a ejercicios existentes en lote.

---

## 6. Alumnos

La pagina de **Alumnos** (`/alumnos`) permite ver y gestionar la informacion de los miembros del gimnasio.

### Lista de alumnos

**Filtros disponibles:**

| Filtro                | Tipo     | Descripcion                                     |
| --------------------- | -------- | ----------------------------------------------- |
| **Buscar por nombre** | Texto    | Busqueda libre por nombre del alumno            |
| **Tipo de Journey**   | Selector | Filtrar por journey activo (agrupados por tier) |

**Columnas de la tabla:**

| Columna      | Descripcion                                        |
| ------------ | -------------------------------------------------- |
| **Nombre**   | Nombre completo del alumno                         |
| **Nivel**    | Nivel del alumno mostrado con letra griega y color |
| **Sucursal** | Nombre de la sucursal a la que pertenece           |
| **Journey**  | Journey activo (badge de color) o "Sin journey"    |
| **Semana**   | Semana actual del journey mas avanzado             |
| **Acciones** | Boton de **ver detalle** (icono `visibility`)      |

### Detalle del alumno

Al hacer clic en el boton de ver detalle, se navega a `/alumnos/[userId]` que muestra:

**1. Informacion del alumno:**

- Letra griega del nivel con color.
- Nombre completo.
- Nivel y sucursal.

**2. Journey activo (si existe):**

- Tipo de journey con badge de color y tier.
- Fecha de inicio.
- Contadores de semana por duracion: Semana 20 min, Semana 40 min, Semana 60 min.

**3. Progreso de entrenamiento (sesiones regulares):**

- Sesiones completadas (total).
- Dias entrenados (total).
- Racha actual (con icono de fuego si es mayor a 0).

**4. Progreso de journey:**

- Total de sesiones journey completadas.
- Desglose por duracion: 20 min, 40 min, 60 min.

**5. Historial de sesiones (ultimas 20):**

- Tipo (Entrenamiento o nombre del journey).
- Duracion (si aplica).
- Fecha de completado.
- RPE reportado (si el alumno lo proporciono).
- Numero de bloques completados.

**6. Journeys anteriores (archivados):**

- Journey que el alumno ya completo o abandono.
- Fechas de inicio y fin.
- Contadores de semana al momento del archivo.

> **Nota:** El coach puede consultar toda esta informacion pero no modificar datos del alumno desde esta vista. Los cambios de nivel y asignacion de journeys se gestionan desde otros canales.

---

## 7. Flujos de trabajo comunes

### 7.1 Revisar y aprobar sesiones de la semana

1. Ir a **Sesiones** (sidebar > Sesiones).
2. Navegar a la semana que necesita revision usando las flechas o el selector de fecha.
3. Identificar los dias con sesiones pendientes (icono de reloj ambar).
4. Para cada dia con pendientes, hacer clic en el boton **"Editar dia"** (icono `edit`).
5. En la pagina de edicion, revisar cada bloque:
   - Verificar que los ejercicios sean apropiados para cada nivel.
   - Revisar las prescripciones (repeticiones, segundos, descanso).
   - Verificar la mezcla de contraccion y el presupuesto de repeticiones.
6. Realizar ajustes si es necesario (ver flujo 7.2 para editar ejercicios).
7. Una vez satisfecho con el dia, presionar **"Aprobar Dia"** (boton verde con icono `check`).
8. Confirmar en el dialogo que aparece.
9. Repetir para cada dia de la semana.
10. Alternativamente, en la vista de lista de sesiones, usar el boton de **aprobacion en bloque** por dia (icono `check_circle` verde con badge).

### 7.2 Editar un ejercicio en una sesion

1. Desde la pagina de edicion de un dia, localizar el bloque que contiene el ejercicio.
2. Seleccionar el nivel del alumno usando las pestanas del bloque (Alfa, Delta, Sigma, etc.).
3. **Para cambiar la prescripcion:** Hacer clic en el campo a modificar (reps, segundos, descanso, etc.), escribir el nuevo valor, y hacer clic fuera del campo o presionar Tab. El cambio se guarda automaticamente.
4. **Para intercambiar el ejercicio:** Hacer clic en el boton de intercambio del ejercicio. En el dialogo:
   - Opcionalmente filtrar por tipo de contraccion (CON, EXC, ISO).
   - Buscar por nombre si se conoce el ejercicio deseado.
   - Seleccionar el nuevo ejercicio de la lista.
5. El ejercicio se reemplaza y la pagina se actualiza automaticamente.

### 7.3 Generar sesiones para la proxima semana

1. Ir a **Generar** (sidebar > Generar).
2. Verificar que el numero de semana corresponda a una semana futura (debe ser mayor a la semana actual).
3. Seleccionar el alcance de generacion: Semana Completa, Un Dia, o Dia + Nivel.
4. Si ya existen sesiones y se desea regenerarlas, activar la casilla **"Regenerar sesiones existentes"**.
5. Presionar el boton **"Generar..."** correspondiente.
6. Si se activo regeneracion, confirmar en el dialogo de advertencia.
7. Esperar a que termine el proceso. Se mostrara un banner verde con el resultado.
8. Ir a **Sesiones** para revisar y aprobar las sesiones recien generadas.

### 7.4 Descargar PDF de un dia

1. Ir a **Sesiones** y navegar a la semana deseada.
2. Localizar la tarjeta del dia para el cual se quiere el PDF.
3. Hacer clic en el boton **PDF del dia** (icono `picture_as_pdf` en color purpura).
4. Esperar mientras se genera el PDF (el boton muestra un spinner de carga).
5. El PDF se descarga automaticamente. Incluye las sesiones de niveles Alfa, Delta, Sigma y Omega.

> **Para PDF de semana completa:** Usar el boton **"PDF Semana"** en la parte superior de la pestana General.

### 7.5 Ver el progreso de un alumno

1. Ir a **Alumnos** (sidebar > Alumnos).
2. Buscar al alumno por nombre usando el campo de busqueda, o filtrar por tipo de journey.
3. Hacer clic en el boton de **ver detalle** (icono de ojo) del alumno.
4. En la pagina de detalle, revisar:
   - **Journey activo:** Tipo, tier, fecha de inicio, y semana actual por duracion.
   - **Progreso de entrenamiento:** Sesiones completadas, dias entrenados, racha actual.
   - **Progreso de journey:** Total de sesiones y desglose por duracion.
   - **Historial:** Ultimas 20 sesiones completadas con fecha, RPE y bloques.
5. Si el alumno tiene journeys anteriores, se muestran en la seccion de **Journeys Anteriores**.

---

## 8. Checklist de onboarding para coaches nuevos

Utiliza esta lista para verificar que dominas todas las funciones basicas de la aplicacion. Marca cada item al completarlo:

- [ ] Iniciar sesion en la aplicacion admin y navegar por todas las secciones del menu lateral
- [ ] Revisar una sesion pendiente en la vista de edicion
- [ ] Editar un campo de prescripcion (por ejemplo, cambiar las repeticiones de un ejercicio) y verificar que se guardo automaticamente
- [ ] Intercambiar un ejercicio por otro usando el dialogo de seleccion
- [ ] Agregar un ejercicio de movilidad a un bloque
- [ ] Aprobar una sesion individual desde la pagina de edicion
- [ ] Aprobar en bloque todas las sesiones pendientes de un dia desde la lista de sesiones
- [ ] Generar sesiones para la proxima semana desde la pagina de generacion
- [ ] Descargar el PDF de un dia especifico
- [ ] Buscar un alumno y consultar su progreso y journey activo
- [ ] Identificar correctamente los indicadores de estado (check verde = aprobada, reloj ambar = pendiente)
- [ ] Saber donde y como reportar problemas o sugerencias (ver seccion siguiente)

---

## 9. Reporte de ineficiencias, mejoras y solicitudes de cambio

Tu experiencia como coach es fundamental para mejorar la aplicacion. Si encuentras algun problema, una friccion en la experiencia de uso, una funcion que falta, o una ineficiencia en el flujo de trabajo, por favor reportalo.

### Cuando reportar

- **Bugs:** La aplicacion se comporta de manera inesperada o incorrecta.
- **Friccion UX:** Un flujo de trabajo toma demasiados pasos o es confuso.
- **Funciones faltantes:** Necesitas hacer algo que la app no permite actualmente.
- **Ineficiencias en el flujo:** Tareas repetitivas que podrian automatizarse.
- **Datos incorrectos:** Ejercicios mal categorizados, prescripciones con valores incorrectos, etc.

### Como reportar

Utiliza la siguiente plantilla para estructurar tu reporte. Copia y completa los campos relevantes:

```
--- REPORTE ---
Tipo: [Bug / Mejora / Solicitud de cambio]
Prioridad: [Critico / Alto / Medio / Bajo]
Seccion de la app: [Sesiones / Edicion / Generar / Ejercicios / Alumnos / General]
Descripcion del problema:
  [Describe claramente que ocurre o que necesitas]
Pasos para reproducir (si es un bug):
  1. [Paso 1]
  2. [Paso 2]
  3. [Resultado obtenido vs resultado esperado]
Impacto:
  [Como afecta tu trabajo diario]
Sugerencia (opcional):
  [Si tienes una idea de como resolverlo]
--- FIN REPORTE ---
```

### Donde reportar

Envia los reportes al equipo tecnico/administrador a traves del canal designado por tu gimnasio (por ejemplo: canal de Slack, correo electronico del equipo tecnico, o formulario interno).

<!-- TODO: Completar con el canal de comunicacion especifico de tu organizacion -->

### Niveles de prioridad

| Prioridad   | Descripcion                                             | Ejemplo                                         |
| ----------- | ------------------------------------------------------- | ----------------------------------------------- |
| **Critico** | Bloquea el trabajo. No se puede continuar sin resolver. | No se pueden aprobar sesiones, la app no carga. |
| **Alto**    | Ralentiza significativamente el trabajo.                | La edicion tarda mucho, filtros no funcionan.   |
| **Medio**   | Es una molestia pero se puede trabajar de forma normal. | Un boton mal ubicado, informacion no clara.     |
| **Bajo**    | Sugerencia de mejora, no afecta el trabajo actual.      | "Seria bueno poder...", mejoras cosmeticas.     |

### Que pasa despues de reportar

1. El equipo tecnico recibe y categoriza el reporte.
2. Los reportes criticos y altos se atienden con prioridad.
3. Se te notificara cuando el problema este resuelto o la mejora implementada.
4. Los reportes de baja prioridad se acumulan y se abordan en ciclos de mejora.

---

## 10. Glosario

| Termino                  | Definicion                                                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SPOM**                 | Sistema de Planificacion y Organizacion de Mesociclos. Es el modelo algoritmico que determina la estructura, intensidad y distribucion de ejercicios por semana, ruta y nivel.                                                                     |
| **Ruta**                 | Eje de entrenamiento que determina el tipo de ejercicios en un bloque. Rutas principales: PL (Powerlifting), HT (Halterofilia), FL (Fuerza Funcional/Front Lever), GN (Gimnasia), MX (Mixto), CD (Cardio), MV (Movilidad).                         |
| **Bloque**               | Subdivision de una sesion de entrenamiento. Existen 5 tipos de bloques: **Initium** (calentamiento), **Nucleus** (bloque principal), **Deuteros 1 y 2** (bloques complementarios), **Athlos/Epikos** (bloque final).                               |
| **Initium**              | Bloque de calentamiento. Contiene ejercicios de movilidad y activacion. No tiene restriccion de presupuesto de repeticiones.                                                                                                                       |
| **Nucleus**              | Bloque principal de la sesion. Enfocado en fuerza con la mayor intensidad del dia.                                                                                                                                                                 |
| **Deuteros**             | Bloques complementarios (Deuteros 1 y Deuteros 2). El alumno elige uno de los dos para realizar durante su sesion.                                                                                                                                 |
| **Athlos/Epikos**        | Bloque de finalizacion de la sesion. Puede ser tipo Athlos (cardio/acondicionamiento) o Epikos (skill/trabajo tecnico). El coach elige cual asignar.                                                                                               |
| **Nivel**                | Categoria que refleja la experiencia y capacidad del alumno. De menor a mayor: Alfa, Delta, Sigma, Omega, Spartan.                                                                                                                                 |
| **Formato**              | Estructura de ejecucion de los ejercicios dentro de un bloque. Ejemplos: Straight Sets (series normales), EMOM (Every Minute On the Minute), AMRAP (As Many Rounds As Possible), Complex, For Time, Tabata, Ladder, Couplet, Triplet, entre otros. |
| **Prescripcion**         | Parametros especificos de un ejercicio: repeticiones, segundos, descanso, incremento de carga, y notas adicionales.                                                                                                                                |
| **Movilidad**            | Ejercicio de descanso activo asignado a cada bloque no-Initium. Se realiza entre series del bloque principal como recuperacion activa.                                                                                                             |
| **Snapshot**             | Copia del estado original de una sesion generada por el algoritmo. Permite restaurar la sesion a su estado inicial si los cambios manuales no fueron satisfactorios (boton "Resetear Dia").                                                        |
| **Journey / Camino**     | Programa personalizado de entrenamiento enfocado en una zona corporal o habilidad especifica (por ejemplo: Pull Up, Front Lever, Handstand). Tiene su propio sistema de semanas y duraciones.                                                      |
| **Tier**                 | Clasificacion de dificultad de los journeys: Principiante, Intermedio, Avanzado.                                                                                                                                                                   |
| **Contraccion**          | Tipo de esfuerzo muscular de un ejercicio: **CON** (concentrico - acortamiento), **EXC** (excentrico - alargamiento), **ISO** (isometrico - estatico).                                                                                             |
| **Budget / Presupuesto** | Cantidad total de repeticiones recomendadas por el algoritmo para un bloque. El coach puede ajustar la distribucion pero idealmente se mantiene cerca del presupuesto calculado.                                                                   |
| **Cross-route / Cruce**  | Ejercicio proveniente de una ruta secundaria (pattern_2), incluido para agregar variedad al bloque. Se identifica con un badge "Cruce" en naranja oscuro.                                                                                          |
| **RPE**                  | Rate of Perceived Exertion (indice de esfuerzo percibido). Escala del 1 al 10 que los alumnos reportan al finalizar una sesion.                                                                                                                    |

---

_Guia del Coach -- El Templo Admin_
_Ultima actualizacion: 2026-02-23_
