# Métricas de Gestión — Cómo las queremos ver en el panel

> **Para qué es este documento.** Ya construimos 6 métricas nuevas de gestión. Hoy los números existen pero todavía no se ven en el panel de Analíticas del admin. Antes de dibujar las pantallas, queremos que vos —que pediste estas métricas— nos digas **cómo las querés ver y usar en el día a día**. Este doc te explica qué responde cada una y, al final de cada una, te deja preguntas concretas para que opines. No hace falta que sepas nada técnico.

---

## Cómo encarar la charla

La idea no es repasar fórmulas, sino responder, para cada métrica, tres cosas:

1. **¿La mirás todos los días, una vez por semana, o solo cuando hay un problema?** (define qué va arriba de todo y qué va en una pestaña secundaria).
2. **¿Querés un número grande para "tomar la temperatura", o una lista de gente concreta para actuar?** (algunas métricas sirven para decidir, otras para llamar por teléfono a alguien).
3. **¿Con qué lo querés comparar?** (entre sucursales, entre planes, contra el mes pasado).

Con esas tres respuestas por métrica, ya sabemos cómo diseñar cada pantalla.

---

## Las 6 métricas

### 1. Ticket promedio — _"¿Cuánto estamos cobrando de verdad por cada plan?"_

**Qué responde.** El precio promedio real que se cobra por cada membresía vendida — no el precio de lista, sino lo que efectivamente entró. Muestra cuánto descuento estás haciendo sin darte cuenta.

**Qué trae el número.**

- El promedio general (separado por moneda: pesos y euros nunca se mezclan).
- Dividido en dos grupos: los que pagaron **precio de lista** vs. los que pagaron **con descuento**.
- Desglose por **plan**, por **sucursal** y por **tipo de duración** (mensual vs. largo plazo).
- El **% de descuento promedio** y el **% de altas a $0** (cortesías, promos).

**Para vos, decisiones de visualización:**

- ¿Cuál es el número "titular" que querés ver primero: el promedio general, o el promedio de los que pagan precio de lista (sin descuentos)?
- El desglose por plan y por sucursal, ¿lo querés ver siempre, o como detalle que se abre?
- ¿Te importa ver el % de gente que entró con descuento / a $0, o eso es ruido?

---

### 2. Churn de no-renovación — _"¿Cuánta gente se nos fue sin renovar?"_

**Qué responde.** El porcentaje de personas a las que se les venció la membresía y **no renovaron** dentro de un margen de días. Es la gente que realmente se fue.

**Qué trae el número.**

- El % de "se fueron", contado **por persona** (no por membresía, así no se cuenta doble a alguien que tuvo dos planes).
- Una **ventana de gracia** configurable: cuántos días le damos a alguien para renovar antes de considerarlo "perdido". Hoy probamos 5, 10 y 15 días.
- La gente que recién se venció y **todavía está en el margen** (no la contamos ni como perdida ni como renovada todavía).
- Evolución **mes a mes**, y desglose por sucursal / plan / duración.

**Para vos, decisiones de visualización:**

- ¿Cuántos días de gracia es lo "oficial" para decir que alguien se fue: 5, 10 o 15? (podemos mostrar el que elijas como titular y los otros como comparación).
- ¿Querés ver el churn como un solo número del período, o la curva mes a mes?
- ¿Te sirve el desglose "qué sucursal / qué plan pierde más gente", o con el número general alcanza?

---

### 3. Tasa de renovación — _"¿Cuánta gente que se vencía volvió a pagar?"_

**Qué responde.** El reverso del churn: de los que se les venció la membresía, qué % **renovó** dentro del margen. Cambiar de plan también cuenta como renovar (lo que importa es que siga pagando).

**Qué trae el número.**

- El % de renovación, sobre **la misma base de gente** que el churn.
- Es un **"número vivo"**: sube con el tiempo, porque la gente puede renovar tarde. Por eso churn y renovación **no siempre suman 100%** (hay gente todavía en el margen).
- Mismo desglose por sucursal / plan / duración (ej: "Flex+ en una sede renueva al 70%, Flex en otra al 35%").

**Para vos, decisiones de visualización:**

- ¿Querés ver renovación y churn **juntos** (en el mismo bloque, como dos caras de lo mismo) o **separados**?
- El hecho de que sea un "número vivo" que sube con el tiempo, ¿lo entendés mejor con una nota/aclaración al lado, o preferís que no se note?

---

### 4. Frecuencia de asistencia — _"¿Quién está viniendo menos y se nos puede estar por ir?"_

**Qué responde.** Cómo se reparten los socios activos según cuántas veces por semana vienen. Lo más valioso: detectar a los que **se están enfriando** (venían seguido y bajaron el ritmo) para llamarlos antes de que se vayan.

**Qué trae el número.** _(ventana fija: últimas 4 semanas)_

- Una distribución en bandas: **inactivo** (0 visitas), **bajo**, **medio**, **alto**.
- Una **lista de gente "enfriándose"**: socios que bajaron de banda respecto del mes anterior.
- Un dato de control: **qué % usa el check-in (QR)** por sucursal. Si en una sede casi nadie escanea, los números de frecuencia de esa sede no son confiables (hay "fantasmas" que vienen pero no registran).

**Para vos, decisiones de visualización:**

- ¿El foco es la **foto general** (cuántos en cada banda) o la **lista de gente para contactar**?
- La lista de "enfriándose", ¿la querés clickeable / exportable para que recepción los llame?
- ¿Mostramos una alerta cuando una sede tiene poca adopción de check-in (y por ende datos flojos)?

---

### 5. LTV / Vida del cliente — _"¿Cuánto tiempo se queda y cuánto deja un socio en toda su vida?"_

**Qué responde.** Cuántos meses, en promedio, dura un socio con nosotros, y cuánta plata deja en total desde que entra hasta que se va.

**Qué trae el número.**

- **Meses de vida promedio** (estimado a partir del churn).
- Una segunda estimación más fina (estadística de supervivencia): el mes en el que ya se fue la mitad de un grupo. Si las dos estimaciones difieren mucho, significa que mucha gente se va **al principio**.
- El **valor en plata** por moneda, en dos versiones: **proyectado** (estimación) y **observado** (la suma real de lo que pagaron los que ya se fueron).

**Para vos, decisiones de visualización:**

- ¿El titular es **"meses de vida"** o **"$ por cliente"**? (o los dos, uno al lado del otro).
- ¿Mostramos las **dos estimaciones** (la simple y la fina), o una sola para no confundir?
- ¿Te interesa ver lado a lado el valor **proyectado vs. el real**, o con uno alcanza?

---

### 6. Funnel de sesiones de prueba — _"De los que vienen a probar, ¿dónde los perdemos: no vienen, o vienen y no compran?"_

**Qué responde.** El recorrido de un lead nuevo: **reservó** una prueba → **asistió** → **compró**. Muestra si el problema está en que no aparecen (asistencia) o en que aparecen pero no cierran (venta).

**Qué trae el número.**

- Los tres números del embudo: **reservaron / asistieron / compraron**.
- Tres tasas: **% que asiste**, **% que compra de los que asistieron** (la clave para medir la venta), y **punta a punta**.
- Evolución semanal/mensual y desglose por **sucursal**, **turno** (mañana / tarde) y **plan que compraron**.
- Solo cuenta **leads nuevos** (gente que nunca pagó antes); el que ya fue socio no entra acá.

**Para vos, decisiones de visualización:**

- ¿Lo querés como un **embudo visual clásico** (tres escalones que se achican)?
- ¿Cuál es la tasa estrella que querés ver grande: la de **cierre** (compran sobre los que asistieron)?
- ¿Te sirve cortar por **turno** (saber si la mañana convierte mejor que la tarde) y por sucursal?

---

## Preguntas transversales (para el final de la charla)

1. **Agrupación.** Hoy el panel tiene pestañas (Miembros, Finanzas, etc.). ¿Cómo agrupamos estas 6? Opciones: una pestaña por métrica, o agrupadas por tema (ej: "Ingresos" = ticket + LTV; "Retención" = churn + renovación; "Conversión" = funnel; "Asistencia" = frecuencia).
2. **Prioridad.** Si tuvieras que elegir las **2 o 3 que mirás todos los días**, ¿cuáles son? Esas van arriba.
3. **Filtros que importan.** Todas se pueden filtrar por período, sucursal, país y plan. ¿Cuáles de esos filtros usás de verdad?
4. **Limpieza.** Vamos a **eliminar** métricas viejas que ya reemplazamos (un ARPU viejo, una renovación vieja). ¿Hay alguna pantalla actual del panel que uses y quieras conservar igual?

---

> **Sugerencia.** Si querés, antes de la reunión podemos sacar **números reales** de cada una de estas métricas (de los datos actuales) y llevarlos impresos. Discutir "cómo se ve" es mucho más fácil mirando cifras concretas de nuestro propio gimnasio que en abstracto.
