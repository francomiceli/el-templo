**Introducción**

El objetivo de este documento es consolidar las oportunidades de mejora identificadas durante el uso de la plataforma y principalmente de su organización. La idea es que sirva como una guía para optimizar la experiencia de uso del sistema, priorizando la simplicidad, la consistencia y la facilidad de navegación.

En una primera sección se presenta una visión general de la experiencia de usuario, proponiendo ajustes en la lógica de navegación, jerarquía de contenidos y funcionamiento integral de la plataforma. Posteriormente, el documento desarrolla cada pantalla de forma individual, detallando las correcciones, mejoras funcionales y ajustes de interfaz propuestos, acompañados, cuando corresponda, de referencias visuales o comentarios específicos.

La idea es tener el MVP white label listo para poder salir a ofrecerlo a gimnasios. Por este motivo, se recomienda analizar las modificaciones desde una perspectiva integral de experiencia de usuario (UX), priorizando lo que más relevancia comercial tiene de corto plazo y no únicamente como cambios aislados en cada pantalla.

**Re-estructuración**

Grandes categorías: Finanzas. Alumnos. Horarios. Planes. Profes.  
![][image1]  
Pagos, deudas, caja, analíticas y reportes irán dentro de finanzas. Programas será subcategoría de planes y puntuaciones de profes. Por lo pronto campañas y profes en su conjunto no serán parte del MVP al igual que todo lo relacionado a la landing.

Finanzas será una categoría que en todo su conjunto estará disponible solo para el admin del gimnasio al igual que planes mientras que alumnos y horarios serán libres. el administrativo o profe solo podrá ver Pagos (de los de finanzas) y no tendrá la posibilidad de editar nada de los planes solo podrá ver que incluye y sus precios.

**A continuación se desarrollan las modificaciones por cada categoría.**  
**FINANZAS** categoría más importante para el dueño del gimnasio, su principal relevancia es REGISTRAR **COBROS** y el control de **CAJA**. No debería estar disponible para el empleado. El orden de lo que va a incluir viene desde lo que requiere la atención del dueño del gimnasio y las funcionalidades que le va a pedir al sistema. Sus sub-categorías van a ser:

1. REGISTRAR PAGO  
2. Caja  
3. Análiticas  
4. Reportes  
5. Deudas.

Avanzó en sugerencias por cómo aparecen las actuales categorías, futuras subcategorías y las correcciones que habría que hacer dentro de ellas

**PAGOS** (o debería llamarse cobros)  
Debería simplificarse, una sola cosa que hacer: registrar el cobro. Dentro del registro del cobro aparecen las opciones en las cargas desplegables, no suma darle alternativas a alguien que no queres que piense.

**Registro de Pagos**  
Diseño similar a cobro suelto combinado con alta \+ Plan ya que incluye la opción de crear alumno y seleccionar a que se asocia el pago que puede ser suelto, no tiene plan o seleccionar plan; en ese caso se asocia a uno de los planes existentes. Por otro lado el continuar debería estar arriba de mis Mis cargas de hoy (que podría ser un único desplegable paralelo que valga la pena). La sucesión de expansiones que se dan al registrar el pago no hacen sentido en la pantalla de la pc, quizás si del celular. Me parece que la versión más sencilla que aplique a las dos es que sean como pantallas separadas en el registro del pago.

 

además:

1. En caso de seleccionar transferencia o tarjeta deberá seleccionar una cuenta ya creada. En caso que no esté creada deberá tener la opción de crear cuenta bancaria rápidamente (ver lo que dice en caja \- saldos)  
2. En caso de pago con tarjeta deberían tomarse los datos del frente de la tarjeta (no el código detrás como para poder identificar que no se trate de una estafa y eventualmente para poder llevar a pagos al exterior)  
3. Todo movimiento de carga de un profesor deberá estar pendiente de validación.  
4. Los “pagos de hoy” no tienen fecha sin embargo no son solo los registros del día sino los registros históricos. Deberían no solo incluir horario sino también fecha y denominarse “Cobros”.  
   ![][image2]

**CAJA**   
**![][image3]**  
**Pendientes:** 

1. No debería ser lo primero a ver, debería ser lo segundo ya que requiere acción concreta.   
2. No sé de donde vienen ya que no todos los movimientos me aparecen a validar, entiendo que debe ser por permisos y lo que debería validarse es todo lo registrado por los profes (confirmar de ser así).  
   

**Saldos:** **![][image4]**

1. No se de donde vienen ni que muestran. Totales del día? del mes? pendientes de validar?  Por otro lado si digo saldos, como cargo cuando saco la plata de cada caja para poder dejar de ver un error acá. Siento que esta pantalla no va a funcionar para un usuario externo.  
2. Debería tener que tener la opción de CREAR cuenta bancaria y Cerrar cuenta bancaria. La cuenta bancaria a crear debería ser flexible para que la persona pueda organizar sus cobros a su manera (muchos monotributos, una empresa, muchas cuentas bancarias, cuenta afuera cuenta adentro etc). Los inputs necesarios para crear una cuenta: Banco, N° de cuenta, Titular, CUIT, CBU/CVU, Alias (Sólo 3 obligatorios) ![][image5]  
3. Los pagos deberían si o si asociarse a la cuenta de cobro, si no hay cuentas cargadas al querer poner transferencia te debería obligar a cargar cuenta bancaria o no poder finalizar el cobro.  
4. Debería tener una nota que diga “si no se registran egresos y retiros sobre cuentas no mostrarán los saldos reales”  como un avivador de boludos.

**Transacciones:** **![][image6]**

1. Debería ser el tercero más importante.  
2. Lo llamaría cobros.  
3. Debería tener la etiqueta de validada/pendiente de validación  
4. El filtro de fecha esta bueno que venga predeterminado por mes pero debería permitir elegir por días para revisar cuando algo genere dudas puntuales en retrospectiva.  
5. En el detalle debería incluir la fecha de validación y el usuario, parecido a como aparece en movimientos de caja.![][image7] ![][image8]  
   

**movimientos de caja:** 

1. hermoso.  
2. Debería ser portada de caja.  
3. Idem filtro de transacciones  
4. ![][image9]Revisar desplegables de egresos, muy específicos del templo que aclare de la sucursal el alquiler. Si está bueno que haya alquiler. Seguro debería tener la opción “Pago a proveedores” y “retiros”.  
5. Incluir la opción retiros de las cuentas bancarias porque debería ser todo lo que el dueño decide patinarse en su vida personal, recomendaremos que sus gastos diarios los lleve en una cuenta no asociada al gimnasio si quiere que los saldos sean consistentes  
   

**ANALÍTICAS y reportes**  
Voy a dejar sus correcciones para el final de las mejoras a realizar. Seguro hay muchas cosas que salgan en la práctica.

De por si voy a ir reportando puntos de mejora:

**Finanzas**  
Finanzas debería ser lo primero a ver en analiticas.

![][image10]  
Ante la duda priorizar lo cobrado por sobre devengado, sino poner los dos.  
![][image11]

Se excluyen 4225 suscripciones por problemas de fecha o duración. Hay algo de como se gestionan los planes que termina siendo contraintuitivo acá (aunque probablemente el error venga de cargar el histórico). Por default debería asignarse el pago y la membresía a un mes. Los pagos por varios meses es una situación menos probable (aunque en aumento).

**Miembros**  
Uno de los aspectos más importantes a seguir son los planes que no renovaron pago. Estrictamente no son bajas. Es por ello que deberían tener su propio total y deberían ser seguidos de manera automática.   
![][image12]  
**Ingresos**  
Debería marcar cobrado y devengado.  
LTV no está activo, o se lo configura o se lo da de baja.  
![][image13]

**Asistencia**  
No lo entiendo. Ver categorías, explicar rangos, automatizar asistencias.  
![][image14]  
**Retención**  
Unificar ambos  
Como idea me encanta, pero funciona? Revisar cómo se calcula. Se necesita video explicativo. Sino nos convence el cálculo se  lo da de baja.  
![][image15]  
![][image16]

**Conversión**  
Es solo para clases de prueba no? Menos relevancia, último en aparecer. Si funciona bien se queda. Eventualmente debería también incluir algunas cosas del funnel de campañas de mkt.  
![][image17]  
**Programas**  
No entiendo que deberíamos ver acá. Así como lo veo lo sacaría, si es gráficos de torta de tipos de programas lo dejamos. O me lo explica.  
![][image18]  
**![][image19]**  
**![][image20]**  
**DEUDAS**   
No parece tener mucho valor por si solo. Me parece atractivo que también traiga a todas las personas que se les venció el plan. Es solo para ver, pero sirve para ocuparse del negocio. 

**a incorporar:**

1. fecha desde que se registra la deuda  
2. Motivo por el que registra una deuda  
3. Al pago de qué está asociado esa deuda (plan? de qué mes?)

**![][image21]**

**Los cambios sugeridos para esta ventana son de poca relevancia. No creo que tenga mucha utilidad esta pantalla.**

**Alumnos** categoría principal para la gestión del día a día del profe.   
Tiene pocos puntos importantes a ser modificados relacionados a la experiencia del profesor gestionando y del cliente interactuando con el gimnasio. La mayoría de las modificaciones sugeridas serán de quitar hipercustomizaciones desarrolladas para el templo y dejarlas a libre decisión del dueño del gimnasio o aún más sencillo, estandarizarse o quitarlas.

La asistencia debería marcarse con QR de ingreso a la sucursal desde la App del alumno lo que le saca gestiones al profesor. De la misma manera que el registro de entrenamientos debería venir automático de la App.

Esta sección va a tener dos funciones principales: cargar alumnos y registrar pagos; por defecto también se registraran las NO RENOVACIONES cuando no se registre el pago de quien era un cliente. A pesar de que registrar pagos tiene su propio acceso directo también tiene que estar fácil desde la gestión de alumnos ya que es lo único que nos importa que haga el empleado. 

**En líneas generales este campo está listo para el MVP de un cliente.**

Algunos aspectos a mejorar:

1. Crear nuevo alumno como opción más grande.   
2. Dentro de cada Alumno el registro de pago tiene que tener un acceso directo y no estar anidado ya que es una acción siempre prioritaria. Debería aparecer como el lápiz de acciones.![][image22]![][image23]  
3. Registro de pagos tiene algo que me hace ruido y es que si selecciono con tarjeta me da un precio mayor pero luego finalmente puede pagar en efectivo. Necesito ver estas reglas de negocio porque las tenemos que estandarizar para la marca blanca, quitarlas o dejar que el usuario pueda ponerlas. Acá se hacen solas y podrían no tener lógica para el dueño del gimnasio que no sea el templo.**![][image24]![][image25]**  
4. Deberíamos sacar otras personalizaciones muy específicas para el templo para dejar algo más estandarizado. Yo estandarizaría niveles, como para poder hacerle un seguimiento con denominaciones sencillas de entender para cualquiera. Explicaría las reglas de asistencia y quitaría el avatar (o expliquenme cuál es la idea de eso).

**![][image26]![][image27]![][image28]**

**Horarios**   
Es una categoría que no va a servir en todos los clientes pero que está bueno tenerla de entrada. Para que realmente tenga valor me parece que debería tener algunas mejoras arriba pero para un MVP hoy camina.

Aspectos de mejora:

1. No me permite tener dos clases en simultáneo en una misma sucursal. Eso no necesariamente es así en un gimnasio clásico. De hecho muchas veces la musculación convive con las actividades especiales que se realizan en el gimnasio.**![][image29]**  
2. Sería práctico poder cargar la clase directamente desde la selección del horario y no solo el test de profe que me parece que es algo que en cualquier otro gimnasio no va a existir.  
   **![][image30]**  
3. Al crear la actividad me debería permitir ponerle la cantidad de personas que la actividad resiste. Entiendo que esto fue configurado en la sucursal sin embargo no necesito el mismo espacio para todas las actividades.**![][image31]**  
4. También creo que la reserva debería ser indicativa pero después la asistencia real debería marcarse con el QR de esa manera tener un histórico de tránsito de personas por horarios. Esto sirve principalmente para musculación y que muchas veces estan las máquinas ocupadas. No es algo urgente.

**Planes y programas**  
Los nombres son confusos. Rutinas de entrenamiento y planes de pago sería más claro De acá la mayoría de los gimnasios van a sacar el “cuanto te cobro? 3 veces por semana o libre?” La creación de ambos debe ser simplificada para que sea aún más APB. En principio con solo los planes de pago sean configurados es suficiente para el MVP. 

Un aspecto importante es que lo más probable es que solo se actualicen los precios por inflación y no por creación de nuevos programas. Si al actualizar el precio tengo que crear un nuevo programa O retroactivamente va a creer que todos los planes anteriores deberían haber pagado lo que hay que pagar ahora estaría boludo. Creo que funciona bien pero chequiemoslo.

De la misma manera, la asignación de estos planes, ¿limita la funcionalidad de la App de cliente? Me parece que esa es una regla de negocio interesante a incorporar en caso que no esté así desarrollado. La app del cliente es un mundo que todavía no tocamos.

Aspectos de mejora de planes de pago:

1. Hiper personalización del templo debe pasar a algo estandarizado. Por ejemplo cuál es la idea de pagar “ZERO”, efectivo, descuento qué?![][image32]  
2. Excelente dar acceso a todos los programas, pero también debería tener la opción de seleccionar varios.  
   ![][image33]  
3. No entiendo la configuración de lo días acá, entiendo que esta vinculada a otra funcionalidad, que está seleccionando ahí? Debería ser más clara la funcionalidad de lo que se selecciona. Estandarizar también facilita la comprensión.![][image34]  
4. Perfecta lo de promo pero no lo imagino muy útil salvo para cadenas de gimnasios. Está bueno tenerlo desde el vamos.  
   ![][image35]  
   

Idealmente estos **programas** deberían ir por objetivos y por grupos de músculo a trabajar cada día y arriba de eso una IA que dialogue con las máquinas que tiene el gimnasio le tire rutinas posibles. Lo que se pondrían son períodos de revisión (ejemplo cada mes o cada 3 meses) para poder pasarlo de nivel dentro del entrenamiento.**No es necesario tener esto listo para el MVP**.

Programas no está planteado como rutinas pero podría ser una gran funcionalidad, el problema es que no me interesa que las rutinas estén alineadas a los planes de pago sino que deberían estar alineadas a la persona. Es por eso que los programas tienen que convertirse en los posibles ejercicios que se pueden hacer en el gimnasio supongamos gimnasio, pilates y funcional, por niveles en caso que los haya (principiante y avanzado) y por días de entrenamiento. Esto debería explicarse en el manual para el dueño del gimnasio para que no hagan que no se enrosquen tanto.

Aspectos de mejora de programas/rutinas:

1. Hiper personalización del templo debe pasar a algo estandarizado o en este caso oculto. Nosotros tenemos que configurar el por defecto por asistencia en los gimnasios que no manejamos, no es algo que tenga que quedar en la experiencia del dueño del gimnasio que no va a entender nada. Duración en semanas queda.  
2.   
5. ![][image36]![][image37]