# Guia del Coach — El Templo Admin

Bienvenido a la app de administracion de El Templo. Esta guia te explica como usar la app para revisar, editar y aprobar las sesiones de entrenamiento de los alumnos.

---

## Acceso

1. Abri `admin.eltemplo.org` en el navegador (funciona mejor en computadora).
2. Ingresa tu email y contrasena.
3. Vas a caer directamente en la pantalla de **Sesiones**.

Para cerrar sesion, usa el boton de logout arriba a la derecha.

---

## Secciones de la app

El menu lateral tiene 4 secciones:

- **Sesiones** — Donde revisas y aprobas las sesiones de cada semana. Si hay sesiones pendientes, vas a ver un numero rojo al lado.
- **Generar** — Para crear sesiones de semanas futuras.
- **Ejercicios** — La biblioteca de todos los ejercicios del sistema.
- **Alumnos** — Lista de alumnos con su nivel, journey activo y progreso.

---

## Sesiones

Esta es la pantalla que mas vas a usar. Muestra las sesiones organizadas por semana y dia.

### Navegacion

- Usa las flechas `<` `>` para moverte entre semanas, o el icono de calendario para saltar a una semana especifica.
- Hay dos pestanas: **General** (sesiones regulares) y **Personalizadas** (sesiones de journey/camino).

### Estados

- **Check verde** = sesion aprobada (los alumnos ya la pueden ver)
- **Reloj ambar** = pendiente de revision (necesita tu aprobacion)

### Que podes hacer desde aca

En cada tarjeta de dia tenes tres botones:

- **PDF** — Descarga un PDF con las sesiones del dia (niveles Alfa a Omega, Spartan no se incluye).
- **Editar** — Entra a la pantalla de edicion detallada del dia.
- **Aprobar** — Aprueba todas las sesiones pendientes del dia de una vez (pide confirmacion antes).

Tambien hay un boton **"PDF Semana"** arriba para descargar toda la semana en un solo PDF.

---

## Edicion de sesiones

Cuando entras a editar un dia, ves todas las sesiones organizadas por bloques (Initium, Nucleus, Deuteros 1, Deuteros 2, Athlos/Epikos).

### Lo basico

- Cada bloque tiene pestanas por nivel de alumno (Alfa, Delta, Sigma, Omega, Spartan). Selecciona un nivel para ver sus ejercicios.
- Los campos de prescripcion (reps, segundos, descanso, notas) **se guardan solos cuando salis del campo** — no hay boton de guardar.

### Cosas que podes hacer

**Con ejercicios:**

- **Intercambiar** un ejercicio por otro del pool disponible
- **Agregar** un ejercicio nuevo al bloque
- **Eliminar** un ejercicio (pide confirmacion)
- **Reordenar** ejercicios dentro del bloque
- Editar la prescripcion de cada ejercicio (reps, segundos, descanso, incremento, notas)

**Con bloques:**

- Cambiar el **formato** del bloque (Straight Sets, EMOM, AMRAP, etc.)
- Cambiar el **rol** del bloque final (Athlos o Epikos)
- Intercambiar o editar el **ejercicio de movilidad** de cada bloque

**Con el dia completo:**

- **Aprobar Dia** — Aprueba todas las sesiones pendientes
- **Revertir Dia** — Vuelve sesiones aprobadas a pendiente
- **Resetear Dia** — Restaura todo al estado original generado por el algoritmo (ojo: borra todos los cambios manuales)
- **Vista Previa** — Ve como queda la sesion desde el punto de vista del alumno

---

## Generar sesiones

Desde la pestana **Generar** podes crear sesiones para semanas futuras (no se puede generar para la semana actual ni pasadas).

1. Elegir el numero de semana.
2. Elegir el alcance: semana completa, un dia, o un dia + nivel especifico.
3. Presionar **Generar**.
4. Las sesiones nuevas aparecen como pendientes en la seccion de Sesiones — hay que revisarlas y aprobarlas.

Para sesiones de **journey**, usa la pestana **Personalizadas** dentro de Generar. Podes generar por tipo de journey individual o todos juntos con "Generar Todo".

> Si ya habia sesiones generadas y queres reemplazarlas, activa la casilla "Regenerar sesiones existentes" (te va a pedir confirmacion porque borra las anteriores).

---

## Ejercicios

La biblioteca de ejercicios te permite buscar y filtrar por nombre, categoria, nivel, ruta, tipo de contraccion y si tienen video o no.

Desde aca podes:

- Ver los ejercicios disponibles en el sistema
- Subir o reemplazar videos de ejercicios
- Usar "Subida Masiva" para cargar varios videos a la vez

> El boton "Crear Ejercicio" esta deshabilitado por ahora — es una funcion futura.

---

## Alumnos

La seccion de Alumnos te permite buscar alumnos por nombre o filtrar por tipo de journey.

Al entrar al detalle de un alumno podes ver:

- Su nivel actual y sucursal
- Journey activo (tipo, semana actual por duracion)
- Historial de sesiones completadas y RPE reportado
- Journeys anteriores completados

> Esta vista es solo de consulta — no se modifican datos del alumno desde aca.

---

## Flujo de trabajo semanal

El ciclo tipico de un coach es:

1. **Revisar** que haya sesiones generadas para la proxima semana (si no hay, generarlas desde "Generar").
2. **Editar** las sesiones dia por dia — ajustar ejercicios, prescripciones, formatos segun sea necesario.
3. **Aprobar** cada dia cuando estes conforme.
4. **Repetir** para todos los dias de la semana.

Si ves un banner amarillo que dice que hay pocas sesiones aprobadas hacia adelante, es momento de generar y aprobar mas semanas.

---

## Checklist para coaches nuevos

Usa esta lista para asegurarte de que dominas lo basico:

- [ ] Iniciar sesion y navegar por todas las secciones
- [ ] Revisar una sesion pendiente
- [ ] Editar un campo de prescripcion (y verificar que se guardo solo)
- [ ] Intercambiar un ejercicio por otro
- [ ] Aprobar un dia completo
- [ ] Generar sesiones para la proxima semana
- [ ] Descargar el PDF de un dia
- [ ] Buscar un alumno y ver su progreso
- [ ] Reconocer los indicadores de estado (check verde / reloj ambar)

---

## Reportar problemas o sugerencias

Si encontras algo que no funciona, algo confuso, o tenes una idea para mejorar la app, reportalo al equipo tecnico usando esta plantilla:

```
REPORTE
Tipo: [Bug / Mejora / Sugerencia]
Prioridad: [Critico / Alto / Medio / Bajo]
Seccion: [Sesiones / Edicion / Generar / Ejercicios / Alumnos]
Que paso:
  [Descripcion clara del problema o la idea]
Como reproducirlo (si es un bug):
  1. ...
  2. ...
Impacto:
  [Como afecta tu trabajo]
```

**Prioridades:**

- **Critico** — No podes trabajar (la app no carga, no se puede aprobar, etc.)
- **Alto** — Te ralentiza mucho
- **Medio** — Molesta pero se puede trabajar
- **Bajo** — Sugerencia o mejora cosmetica

<!-- TODO: Definir canal de reporte (Slack, email, WhatsApp, etc.) -->

---

## Glosario rapido

| Termino              | Que es                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Bloque**           | Cada seccion de una sesion: Initium (calentamiento), Nucleus (principal), Deuteros (complementarios), Athlos/Epikos (final) |
| **Nivel**            | Categoria del alumno: Alfa, Delta, Sigma, Omega, Spartan (de menor a mayor)                                                 |
| **Formato**          | Como se ejecutan los ejercicios del bloque: Straight Sets, EMOM, AMRAP, Tabata, etc.                                        |
| **Prescripcion**     | Los parametros de un ejercicio: reps, segundos, descanso, incremento, notas                                                 |
| **Movilidad**        | Ejercicio de descanso activo entre series de un bloque                                                                      |
| **Journey / Camino** | Programa personalizado enfocado en una zona corporal o habilidad (Pull Up, Front Lever, etc.)                               |
| **Snapshot**         | Copia del estado original de la sesion — lo que genera el algoritmo antes de ediciones manuales                             |
| **RPE**              | Indice de esfuerzo percibido (1-10) que reportan los alumnos al terminar una sesion                                         |
| **Ruta**             | Eje de entrenamiento de un bloque: PL, HT, FL, GN, MX, etc.                                                                 |
| **Contraccion**      | Tipo de esfuerzo: CON (concentrico), EXC (excentrico), ISO (isometrico)                                                     |

---

_Guia del Coach — El Templo Admin_
_Ultima actualizacion: 2026-02-23_
