# Phase 214: Comunidad: anotados en la clase y Aura visible - Discussion Log

> **Solo auditoría.** No usar como insumo de planificación, investigación ni ejecución.
> Las decisiones están en `214-CONTEXT.md`. Este registro guarda las alternativas consideradas y las
> respuestas literales de Franco.

**Date:** 2026-11-17
**Phase:** 214-comunidad-anotados-aura
**Areas discussed:** Lista de anotados, Niveles y detalle de Aura, Valores de Aura, Encabezado y foto propia, Regalar Aura y medición

---

## Selección de áreas (texto libre de Franco, 2026-11-17)

### ¿Qué áreas querés discutir antes de planificar?

**Opciones presentadas:** Lista de anotados · Niveles y detalle de Aura · Encabezado y foto propia · Regalar Aura y medición

**Respuesta:** Las cuatro: Lista de anotados, Niveles y detalle de Aura, Encabezado y foto propia, Regalar Aura y medición.

### Profes y Aura (el relevamiento mostró que la exclusión es parcial: attendance/service.ts:108-126 solo cubre coach y coach_actividad en el auto-escaneo QR)

**Respuesta:** Literal: "profes: no tienen aura". Pendiente de precisar: qué roles cuentan como profes y si alcanza con no mostrarles Aura o también hay que dejar de acreditarles.

### Fotos: tope de tamaño

**Respuesta:** Literal: "si el tope es 8mb, asegurarse de que si alguien sube una foto mas pesada hacemos la reduccion de calidad nosotros". Lectura: nunca rechazar una foto por pesada, la reducción corre por nuestra cuenta.

### Aura ganada histórica (no existe como dato. Sumar positivos sobrecuenta asistencias revertidas)

**Respuesta:** Literal: "contamos las asistencias confirmadas, no importan las revertidas, estos puntos no sirven para canjear nada todavia". Lectura a confirmar: lo ganado es neto de reversas (una asistencia revertida no suma).

### Toasts "+N AURA" (hoy no existen: son pantallas de celebración con el +5 fijo)

**Respuesta:** Literal: "hace un sketch de un toast mejorado para cuando se marca asistencia en las sedes". Se suma a la ronda de /gsd-sketch posterior al discuss. Pendiente: si la implementación entra en la fase.

---

## Lista de anotados

### ¿Qué número va al lado de cada persona?

**Opciones presentadas:** Aura ganada (Recomendada) · Saldo actual

**Respuesta:** Aura ganada (histórico). Literal: "todo lo que ganó, si lo canjea igualmente no debería perder ese histórico, lo vemos luego cuando instalemos la economía correctamente, me imagino que esos puntos de aura tendran como estado 'gastables' o 'gastados' como para que no se descuenten de cada uno". Neto de reversas (nota previa: no importan las revertidas). Un solo número para lista, encabezado, Perfil y nivel.

### ¿En qué orden aparecen las personas?

**Opciones presentadas:** Orden de reserva (Recomendada) · Alfabético · Con foto primero

**Respuesta:** Orden de reserva

### ¿Cómo arranca la visibilidad de cada alumno?

**Opciones presentadas:** Visible, con aviso (Recomendada) · Visible, sin aviso · Oculto hasta aceptar

**Respuesta:** Visible por defecto, con aviso la primera vez que abre la lista y acceso directo a ocultarse desde Perfil

### ¿Qué hacemos con quienes reservan pero no tienen Aura (staff, Wellhub)?

**Opciones presentadas:** Aparecen sin puntos (Recomendada) · Cuentan pero no aparecen · Staff no, Wellhub sí

**Respuesta:** Aparecen con nombre y foto, sin puntos. Las cuentas borradas no aparecen nunca.

### ¿En qué momentos se ve la lista?

**Opciones presentadas:** Al reservar y en mis reservas (Recomendada) · Solo al reservar · También desde la grilla

**Respuesta:** Sin decidir en el discuss. Literal: "aca hay que hacer un ui spec y analizar bien donde queda mejor ponerlo, me suena que dentro de un pop up es demasiada información... podes pensar varios sketch con distintas ideas". Va a /gsd-sketch (varias ideas de ubicación, no solo el diálogo) y a un UI-SPEC.

### Si un alumno se oculta, ¿sigue viendo la lista de los demás?

**Opciones presentadas:** Sí, la ve igual (Recomendada) · No, solo ve el número

**Respuesta:** No, solo ve el número (reciprocidad)

### Profes sin Aura: ¿hasta dónde llega la fase?

**Opciones presentadas:** Solo no mostrarles Aura (Recomendada) · También cortar la acreditación · Cortar y poner saldos en cero

**Respuesta:** Literal: "que no se muestre para los que hoy estan marcados como staff". Solo visualización: al staff no se le muestra Aura. No se cambia la acreditación.

---

## Datos de producción (2026-11-17, consultas/01-distribucion-aura.sql, SSH con OK de Franco)

### Distribución de Aura

**Respuesta:** 8.571 alumnos, 2.750 con Aura, máximo 1.750. Cero canjes en todo el ledger: saldo = ganado para todos hoy. Conciliación saldo vs ledger: 2.898 de 2.898 coinciden. Fuentes: asistencia 414.680 (41.468 filas), onboarding 109.750, hitos de antigüedad 43.450, 139 reversas de asistencia (-1.390). Alumnos activos (asistencia en 56 días): 1.254, p10 20, p25 90, p50 260, p75 575, p90 880, p95 1.070, p99 1.360. Staff con Aura: coach 7 de 9 (máx 880), admin_sede 590, owner 70, admin 60, recepcion 50. Resultado completo en consultas/01-distribucion-aura.resultado-2026-11-17.txt

### Configuración vigente (consultas/03-sesiones-y-config.sql)

**Respuesta:** aura_config en producción: training 10, attendance 5 (el código paga 10), streak_bonus 15, referral 10 (descartada la alerta de 50), goal_plan 10, onboarding 50, tenure 0, extra_block 5, stretch 5, challenge 20, social 5. system_settings: solo referral.max_percent_cap=40, sin claves de racha (usa defaults del código 20/35/50/100/200). Resultado en consultas/03-sesiones-y-config.resultado-2026-11-17.txt

---

## Niveles y detalle de Aura

### Fila de cada anotado: ¿qué se muestra de su Aura?

**Opciones presentadas:** Puntos e insignia de nivel (Recomendada) · Solo puntos · Solo nivel

**Respuesta:** Solo puntos

### Detalle de Aura: ¿qué ve el alumno de sus movimientos?

**Opciones presentadas:** Últimos movimientos (Recomendada) · Resumen por origen · Las dos cosas

**Respuesta:** Opción 1: total y últimos movimientos con texto claro, filas de 0 ocultas, reversas en negativo, con 'ver más'. Franco preguntó de dónde salen los textos (asistencia, antigüedad): son los motivos ya guardados en aura_transactions.source_type. Redacción a definir.

### Niveles de Aura: ¿entran en la fase?

**Opciones presentadas:** Con niveles (tabla 100/350/750/1500) · Solo puntos, niveles más adelante

**Respuesta:** NO. Literal de Franco: "por ahora no instalemos niveles de aura, que quede fuera del scope". Se muestran solo puntos. Sin niveles, nombres ni umbrales.

### Revisión de los montos de Aura antes de mostrarlos

**Respuesta:** Franco levanta el límite sobre los montos. Literal: "te parece repasar los puntos? es algo que una vez que mostremos no podríamos volver atrás, asique te voy a encomendar una tarea de investigación para que definas mejor los valores entre las distintas opciones que dan valor, y que no queden numeros muy inflados". Investigación en curso (inventario de fuentes en el código + benchmark externo), después propuesta de esquemas con los números reales de producción. Fuentes y canje siguen sin tocarse salvo indicación.

### Valores de Aura: proporciones, escala e historial

**Opciones presentadas:** Clase = 5 con bonos chicos (recomendada) · Dejar 10 y achicar solo los bonos · Clase = 3 con bonos chicos

**Respuesta:** DECIDIDO por Franco (2026-11-17): "de acuerdo" con la propuesta de 214-AURA-VALORES-RESEARCH.md: una clase = 5 puntos, onboarding 1 clase (5), antigüedad 3/5/10 clases (15/25/50, el año se repite), rachas 1/2/3/5/10 clases (5/10/15/25/50), y el historial se re-valoriza por migración. Excepción pedida por Franco: entrenar en la app tiene que valer MENOS que lo propuesto, literal: "tal vez 3 puntos y siendo muy estrictos con que se cumpla el tiempo total / el tiempo propuesto de cada bloque". La regla de tiempo queda por definir (relevamiento del código en curso). Pendiente: valor de estirar, bloque libre y plan a medida en la escala nueva, y qué pasa con los tramos de canje.

### Entrenar en la app (3 puntos): ¿qué tan estricta es la regla de tiempo?

**Opciones presentadas:** Estricta por bloque (Recomendada) · Solo tiempo total · Sin exigir tiempo por ahora

**Respuesta:** Solo tiempo total: hay Aura si la sesión duró al menos el 80 % del tiempo propuesto total y están todos los bloques. Cambia solo el servidor. El plan a medida se trata igual (3 puntos, misma regla): supuesto mío informado a Franco, sin objeción. Hechos del código: el servidor calcula la duración desde el startedAt del cliente (sessions/routes.ts:482-486), no hay tiempo por bloque, no hay función de duración propuesta en la API (solo en la app: blockMeta.ts:53,103), el plan a medida no guarda duration (goal-plans/routes.ts:359-369) y al retomar manda startedAt ≈ ahora (GoalPlanSession.vue:306,403).

### Asistir a clase y completar la sesión en la app el mismo día

**Opciones presentadas:** No se suman (Recomendada) · Se suman

**Respuesta:** No se suman: el día que asistió, la sesión de la app no da Aura

### Valor de estirar y bloque libre con la clase en 5

**Opciones presentadas:** 2 y 2 (Recomendada) · 3 y 3 · Estirar 1, bloque libre 2

**Respuesta:** Estirar 1, bloque libre 2. Los textos fijos '+5 AURA' de la app cambian.

### Tramos de descuento por Aura (500/1000/2000/5000)

**Opciones presentadas:** Bajarlos a la mitad (Recomendada) · Apagar el descuento por ahora · Dejarlos como están

**Respuesta:** Apagar el descuento por Aura por ahora: el admin deja de ofrecerlo hasta que se defina la economía

---

## Regalar Aura y medición

### Regalar Aura a otros: ¿entra en la fase 214 o va aparte?

**Opciones presentadas:** Fase propia, justo después (Recomendada) · En la 214, solo los profes · Todo en la 214

**Respuesta:** Fase propia, justo después de la 214 (decisión de Franco, 2026-11-17). En la 214 se deja preparado el terreno: el número visible se calcula de modo que los regalos puedan sumar después, y la fuente 'social' del enum queda reservada. Insumos para esa fase: benchmark de cupo aparte que vence (Bonusly, HeyTaco), ejemplo de Matías con un profe que regala, lista de anotados como lugar desde donde regalar.

### Línea de base: ¿quién cuenta como alumno activo en una semana?

**Opciones presentadas:** Con plan vigente esa semana (Recomendada) · Que asistió en las últimas 8 semanas · Que asistió esa semana

**Respuesta:** Quien asistió al menos una vez en las últimas 8 semanas (misma definición de los 1.254). Métricas: reservas y asistencias por alumno activo por semana, 4 semanas antes de lanzar y la misma medición después.

### Aviso mejorado al marcar asistencia en la sede: ¿la implementación entra en la fase?

**Opciones presentadas:** Sí, si el sketch convence (Recomendada) · Solo el sketch

**Respuesta:** Sí, si el sketch convence. Se dibuja junto con los demás sketches.

---

## Encabezado y foto propia

### Puntos por subir la foto de perfil, una sola vez

**Opciones presentadas:** Sí, 2 puntos (Recomendada) · Sí, 5 puntos · No, sin puntos

**Respuesta:** Sí, 5 puntos (lo mismo que una clase). Una sola vez: si el staff quita la foto no se devuelven ni se vuelven a dar. Es una fuente nueva de Aura, aprobada por Franco.

### Tope de tamaño de la foto

**Respuesta:** Nunca rechazar por pesada: la reducción de calidad corre por nuestra cuenta (nota de Franco al elegir áreas).

### Contador de sesiones del encabezado

**Opciones presentadas:** Ese número, movido arriba (Recomendada) · Arriba y también en el pie · Sin sesiones en el encabezado

**Respuesta:** Sin sesiones en el encabezado. El encabezado muestra antigüedad y Aura; el total queda al pie de 'Tus sesiones' como hoy (WeekStrip.vue:36). Dato de producción: las sesiones se registran desde abril de 2026 (presencial espejo desde 2026-04-30, asistencias desde 2026-03-18), mediana de 57 para alumnos de más de 2 años.

### Antigüedad de los 367 importados en marzo de 2026 (fecha de alta = fecha de importación)

**Opciones presentadas:** Investigar si hay fecha real (Recomendada) · Dejarlo como está · No mostrar antigüedad a esos 367

**Respuesta:** Investigar al planificar si hay fecha real (primera suscripción u otro dato). Si existe se corrige por migración, si no se le trae a Franco para decidir. Dato: users.created_at tiene historia real desde 2022-11, con un pico de 367 altas en un solo día de 2026-03.

### Supuestos de foto informados a Franco sin objeción

**Respuesta:** Las fotos no quedan en una dirección pública adivinable. Si las tiendas exigen un mecanismo de reporte (se investiga al planificar), entra un botón mínimo que avisa al staff.

---

## Temas propuestos al cierre

### Privacidad de la lista: ¿qué temas discutir? (los no marcados quedan con la propuesta)

**Opciones presentadas:** Quién puede ver la lista · Menores y sedes fuera de Argentina · Anuncio antes de encender

**Respuesta:** Marcó 'Quién puede ver la lista' y agregó literal: "en las listas de asistencia, agrupar los que se marquen como ocultos con algo como 'y otros 3 mas' o algo asi". No marcó 'Menores y sedes fuera de Argentina' (queda la propuesta: arrancan ocultos) ni 'Anuncio antes de encender' (queda la propuesta: anuncio previo a todos).

### Aura y fotos: ¿qué temas discutir? (los no marcados quedan con la propuesta)

**Opciones presentadas:** Aprobación de fotos · Explicar cómo se gana Aura · Aura para los de siempre

**Respuesta:** Marcó 'Aprobación de fotos' y agregó literal: "para aprobacion de fotos, que quede pendiente de aprobacion y revisamos desde el admin en alguna seccion". No marcó 'Explicar cómo se gana Aura' (queda la propuesta: movimientos con motivo, sin tabla) ni 'Aura para los de siempre' (queda la propuesta: sin Aura retroactiva).

### ¿Quién puede ver la lista de anotados con nombres y fotos?

**Opciones presentadas:** Alumnos con plan vigente (Recomendada) · Solo quien reservó esa clase · Cualquier cuenta

**Respuesta:** Alumnos con plan vigente (y staff). Freemium, prueba y plan vencido ven solo el número.

### ¿En qué momento revisamos sketch? (pregunta de Franco)

**Respuesta:** Justo después de cerrar el discuss y antes de planificar: /gsd-sketch y después UI-SPEC.

---

## Claude's Discretion

Ver la sección homónima de `214-CONTEXT.md`.

## Deferred Ideas

- Posible bug (sin confirmar en ejecución): trialSpotsRemaining se calcula en scheduling/service.ts:510 pero no está declarado en weeklySlotViewSchema, fast-json-stringify lo recortaría
- Posible bug (sin confirmar en ejecución): el detalle de horario del staff (scheduling/service.ts ~620) no filtra cancelados ni lista de espera pese al comentario
- onboarding/service.ts:68,173 pasa el saldo total como auraAwarded (coincide solo porque es el primer premio)
- El monto de asistencia está fijo en 10 en el código y aura_config.attendance siembra 5 (economía de Aura, fuera de la fase)
- Economía de Aura: modelar puntos gastables/gastados para que canjear no descuente el histórico (idea de Franco, 2026-11-17)
- Cortar la acreditación de Aura al staff en todos los caminos (asistencia manual, check-in forzado, sesiones en la app) y decidir qué hacer con lo ya acreditado: economía, fuera de la fase
- Niveles de estatus de Aura (cortes, nombres, insignia): fuera del scope de la 214 por decisión de Franco del 2026-11-17. Datos de distribución ya relevados en consultas/01-distribucion-aura.resultado-2026-11-17.txt
- Bug: program_week_completion se acredita una sola vez por inscripción, la clave de idempotencia es igual para todas las semanas (programs/service.ts:914-919, 961-966)
- La racha cuenta sesiones y no días (streaks/service.ts:175-283)
- La reversa de asistencia no se aplica si el saldo es menor a 10 y no distingue si la asistencia había acreditado (attendance/service.ts:1297-1310)
- El canje se guarda como manual_adjustment y gasta puntos antes de la transacción de la suscripción (aura/pricing-benefits.ts:208)
- Reconocimiento retroactivo de antigüedad: los alumnos de más de 2 años tienen la misma Aura que los de 6 a 11 meses porque el Aura arrancó en marzo de 2026
- FASE SIGUIENTE (215): regalar Aura entre personas. A definir ahí: origen (cupo aparte que vence vs saldo), valor del regalo, tope por semana y por persona, si los profes regalan (sin tener Aura propia), si lo recibido suma al número visible, desde dónde se regala, aviso, control de abuso
