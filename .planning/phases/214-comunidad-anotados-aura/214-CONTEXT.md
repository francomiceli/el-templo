# Phase 214: Comunidad: anotados en la clase y Aura visible - Context

**Gathered:** 2026-11-17
**Status:** Planes 01 a 15 (servidor y datos) escritos y en revisión. Sketches 030 a 033 elegidos. Sigue el UI-SPEC y los planes de pantallas

<domain>
## Phase Boundary

El alumno ve quiénes están anotados en una clase, y su Aura deja de ser invisible: puntos y movimientos
propios, puntos al lado de cada anotado, encabezado de Mi Templo con nombre, foto, antigüedad y Aura, y
foto de perfil subida por él mismo. Antes de mostrar nada, los valores de Aura se reacomodan a una
escala nueva y el historial se re-valoriza.

Fuera del milestone v6.1, como la 213. Worktree `et-comunidad`, rama `feat/comunidad-anotados-aura`,
base `origin/master` `a51a00271`, migraciones desde la 0344, sin bump de versión.

**El límite cambió durante el discuss.** El prompt original decía "no se toca la economía de Aura".
Franco lo enmendó el 2026-11-17:

- SÍ se tocan los montos de cada fuente y la escala (D-18 a D-24), con el historial re-valorizado.
- SÍ se agrega una fuente nueva: puntos por subir la foto (D-30).
- SÍ se apaga el descuento por Aura en el admin (D-22).
- NO entran los niveles de estatus ni regalar Aura (ver Deferred).

</domain>

<decisions>
## Implementation Decisions

### Lista de anotados

- **D-01:** Endpoint del alumno en `schedulingMemberRoutes`. Para un horario y una fecha devuelve, por
  cada reserva vigente: nombre de pila, inicial del apellido, foto aprobada (o nada) y puntos de Aura.
  Vigente = `reservado`, `qr_escaneado` o `confirmado`. Excluye sesiones de prueba (`is_trial`),
  cancelados, `no_show` y lista de espera. Schema de respuesta declarado: fast-json-stringify descarta
  lo que no está en el schema.
- **D-02:** El número al lado de cada persona es el **Aura ganada**: todo lo acreditado, neto de
  reversas y ajustes, sin restar canjes. Es un solo número para la lista, el encabezado y Perfil. Hoy
  coincide con el saldo porque hay cero canjes en producción. Franco: "si lo canjea igualmente no
  debería perder ese histórico".
- **D-03:** Orden de reserva (quien reservó primero, primero). Nunca por puntos.
- **D-04:** En la fila van solo los puntos. Sin nivel ni insignia.
- **D-05:** Visible por defecto. La primera vez que un alumno abre la lista ve un aviso corto de que su
  nombre y foto también se muestran, con acceso directo a ocultarse desde Perfil.
- **D-06:** Preferencia de visibilidad en Perfil. Quien se oculta cuenta en el número y la lista lo
  agrupa al final con un texto del tipo "y otros 3 más" (pedido literal de Franco).
- **D-07:** Reciprocidad: quien se oculta no ve la lista de los demás, solo el número.
- **D-08:** Staff y usuarios Wellhub que reservan aparecen con nombre y foto, sin puntos. Las cuentas
  borradas no aparecen nunca.
- **D-09:** La lista con nombres y fotos la ven solo los alumnos con plan vigente y el staff. Cuentas
  freemium, de prueba o con el plan vencido ven solo el número.
- **D-10 (RESUELTA, ver D-51):** La ubicación de la lista NO está decidida. Franco: "hay que hacer un ui spec y analizar bien
  dónde queda mejor ponerlo, me suena que dentro de un pop up es demasiada información... podés pensar
  varios sketch con distintas ideas". Se define con `/gsd-sketch` y un UI-SPEC.
- **D-11:** Propuestas mías que Franco vio y no objetó (quedan como decisión salvo que diga otra cosa):
  - los menores de 18 y los alumnos de sedes fuera de Argentina arrancan ocultos hasta que lo activen;
  - antes de encender la lista sale un anuncio a todos (novedad o push) con el acceso para ocultarse.

### Aura visible

- **D-12:** Endpoint propio del alumno con sus puntos y su historial. Un alumno no puede leer los
  puntos ni el historial de otro. Hoy no existe ninguna ruta de Aura.
- **D-13 (vigente, ver D-57):** Detalle de Aura: el total y los últimos 20 movimientos con un texto claro por motivo, y
  "ver más" para seguir. Las filas de 0 puntos (referidos) no se muestran. Las reversas sí, en negativo.
  No hay tabla de "cómo ganar puntos" (propuesta mía no objetada, en línea con lo que Franco dijo en la
  reunión: "está ahí, no te explico ni para qué ni por qué").
- **D-14:** Sin niveles de estatus. Solo puntos.
- **D-15 (REVOCADA por D-58):** Al staff no se le muestra Aura en ningún lado. Franco: "que no se muestre para los que hoy
  están marcados como staff". Staff = roles de `ALL_STAFF_ROLES`. La acreditación al staff no se toca.
- **D-16:** Dónde se ve: encabezado de Mi Templo, Perfil y la lista de anotados. Tocar los puntos del
  encabezado lleva al detalle.
- **D-17:** Sin ranking entre alumnos.

### Valores de Aura (enmienda al límite original)

Investigación y simulación sobre datos reales en `214-AURA-VALORES-RESEARCH.md`. Franco: "de acuerdo".

- **D-18:** Escala nueva: **una clase vale 5 puntos** (hoy 10).
- **D-19:** Valores nuevos por fuente:

  | Fuente | Hoy | Nuevo |
  |---|---|---|
  | Asistir a una clase (y su reversa) | 10 | 5 |
  | Completar el onboarding | 50 | 5 |
  | Antigüedad 3 meses / 6 meses / cada año | 50 / 100 / 250 | 15 / 25 / 50 |
  | Rachas de 7 / 14 / 30 / 60 / 100 sesiones | 20 / 35 / 50 / 100 / 200 | 5 / 10 / 15 / 25 / 50 |
  | Entrenar en la app (por día) | 10 | 3, con regla de tiempo (D-20) |
  | Sesión de plan a medida (por día) | 10 | 3, misma regla |
  | Bloque libre (por día) | 5 | 2 |
  | Estiramiento post-clase (por día) | 5 | 1 |
  | Subir la foto de perfil, una sola vez | — | 5 (D-30) |

- **D-20:** Entrenar en la app da Aura solo si la sesión duró al menos el **80 % del tiempo propuesto
  total** y están todos los bloques. Franco eligió "solo tiempo total": cambia solo el servidor, no se
  manda tiempo por bloque. El día que el alumno asistió a clase, la sesión de la app **no da Aura** (no
  se suman). La regla condiciona solo el Aura: no toca el registro de la sesión, la racha ni el
  programa.
- **D-21:** Lo ya acreditado se **re-valoriza por migración** con los valores nuevos y los saldos se
  recalculan. Hoy es gratis: nadie vio su Aura y no hubo canjes.
- **D-22:** El **descuento por Aura se apaga** en el admin por ahora, hasta que se defina la economía.
  Los tramos (500 / 1.000 / 2.000 / 5.000) no se reescalan.
- **D-23:** Los textos fijos de la app que prometen un monto se corrigen: los "+5 AURA" de estirar y
  bloque libre, y el "+50" de respaldo del onboarding. Conviene que salgan antes de los builds de
  tiendas de la 1.9.6.
- **D-24:** La economía con puntos "gastables / gastados" (para que canjear no descuente el histórico)
  se ve cuando se instale la economía. No es de esta fase.

### Encabezado de Mi Templo

- **D-25:** Se sacan "Hola" y la fecha. Queda el nombre con una miniatura de la foto al costado, o el
  acceso para subir una foto si no tiene. Datos: cuánto tiempo lleva en El Templo y cuántos puntos de
  Aura tiene.
- **D-26:** **Sin contador de sesiones** en el encabezado. El total sigue al pie de "Tus sesiones" como
  hoy. Motivo: las sesiones se registran desde abril de 2026 y un alumno de 3 años aparecería con 57.
- **D-27:** El encabezado está duplicado en `MainLayout.vue` (escritorio y celular): se extrae a un solo
  componente.
- **D-28 (RESUELTA, ver D-55 y D-61):** Si el sello de antigüedad (`VeteranSeal`) y el selector de nivel se quedan, y cómo convive el
  dorado del sello oro con el dorado reservado a Aura, se define en los sketches.
- **D-29:** 367 alumnos importados en marzo de 2026 tienen la fecha de importación como fecha de alta.
  Al planificar se investiga si hay una fecha real (primera suscripción u otro dato). Si existe se
  corrige por migración. Si no, se le lleva a Franco.

### Foto propia

- **D-30:** El alumno sube su propia foto con un endpoint propio. Subirla da 5 puntos de Aura, una sola
  vez: si después se quita, no se devuelven ni se vuelven a dar.
- **D-31:** La foto queda **pendiente de aprobación** y el staff la revisa desde una sección del admin.
  Franco: "que quede pendiente de aprobación y revisamos desde el admin en alguna sección".
- **D-32:** El staff puede quitar una foto ya aprobada. `/me` devuelve `photoUrl`.
- **D-33:** Nunca se rechaza una foto por pesada: la reducción de calidad corre por nuestra cuenta.
- **D-34:** Las fotos no quedan en una dirección pública adivinable. Al planificar se revisa qué exigen
  las tiendas para fotos visibles entre usuarios. Si piden un mecanismo de reporte, entra un botón
  mínimo que avisa al staff.
- **D-35:** `@capacitor/camera` ya está instalado y con permisos declarados. No se instala ni actualiza
  ninguna dependencia sin preguntarle a Franco. Hay que actualizar el texto del permiso de iOS.

### Medición y prueba

- **D-36:** Línea de base de 4 semanas antes de lanzar y la misma medición después: reservas y
  asistencias por alumno activo por semana. Alumno activo = asistió al menos una vez en las últimas 8
  semanas.
- **D-37:** Tests de integración: el endpoint de anotados nunca devuelve apellido completo, teléfono,
  sesiones de prueba ni a quien se ocultó; un alumno no puede leer los puntos ni el historial de otro.
- **D-38:** Consulta de conciliación: los puntos que muestra la app son iguales a la suma del ledger,
  por usuario. Hoy coinciden 2.898 de 2.898.
- **D-39:** Prueba en teléfono real, iOS incluido.
- **D-40:** Aviso mejorado al marcar asistencia en la sede: se dibuja en los sketches y se implementa
  en esta fase si alguna variante convence.

### Ejecución

- **D-41:** Planes con `gsd-executor` en sonnet, secuenciales, verificando typecheck y lint después de
  cada plan. Staging primero. Preguntar a Franco antes de cualquier push.
- **D-42:** Antes de planificar: `/gsd-sketch` (ubicación de la lista con varias ideas, encabezado en
  celular y escritorio, fila de anotado con foto y puntos, aviso de asistencia) y después un UI-SPEC.

### Decisiones posteriores a la investigación (2026-11-17)

Tomadas por Franco después de leer el resumen de `214-RESEARCH.md`. Pisan lo que el RESEARCH recomiende
en contrario.

- **D-43:** Las fotos que el staff ya subió desde la ficha (y las que suba en adelante) **cuentan como
  aprobadas y se muestran** en la lista de anotados. El RESEARCH recomendaba que no: manda esta
  decisión. Los 5 puntos de D-30 se dan solo por la foto que sube el propio alumno, al aprobarse.
- **D-44:** **Sin interruptor de encendido.** La lista funciona apenas se despliega. Franco acepta que
  quien tenga la app vieja aparece sin poder ocultarse hasta que actualice. El anuncio de D-11 sale
  antes del deploy de las pantallas.
- **D-45:** **Sin bloqueo entre alumnos.** Entra un botón "Reportar foto" que avisa al staff y devuelve
  la foto a la cola como reportada. Riesgo aceptado: que Apple pida el bloqueo en la revisión y haya
  que agregarlo en la versión siguiente.
- **D-46:** Aprueban y rechazan fotos los mismos roles que hoy suben la foto desde la ficha
  (`MEMBER_ROLES`, profes incluidos), cada uno acotado a sus sedes.
- **D-47:** Los menores pasan a visibles al cumplir 18, como cualquier adulto y con el aviso de primera
  vez. Los alumnos sin fecha de nacimiento cargada se tratan como adultos. (Propuesta mía, sin
  objeción.)
- **D-48:** Se arregla en esta fase el inicio mal enviado al retomar una sesión de plan a medida
  (`GoalPlanSession.vue:306, 403`), porque con D-20 esas sesiones no darían Aura. (Propuesta mía, sin
  objeción.)
- **D-49:** La re-valorización va en dos pasos: la migración de re-valorización y una migración de
  repaso en un deploy posterior, porque entre la migración y el reinicio la API vieja sigue
  acreditando con los valores viejos.
- **D-50:** Antes de subir la foto, el alumno acepta unas normas cortas (lo exige Google Play). El texto
  lo aprueba Franco: se le propone un borrador junto con las pantallas.

Pendientes de Franco que no bloquean los planes de servidor: si tiene el archivo "Socios según fecha de
ingreso" del sistema anterior (D-29), revisar en App Store Connect y Play Console que "Fotos" figure
como dato recopilado, y decidir si en la 1.9.6 se saca el número de los textos "+5 AURA" antes de
generar los builds.

Precisiones técnicas del mapeo de patrones (`214-PATTERNS.md`) que el planificador debe respetar:
`member_photos` va dentro del módulo `members` existente. ISO-03 aplica solo a `/api/members/scheduling`
y `/api/admin/members`. Los montos viven en constantes de código y no en `aura_config`, y los defaults
de rachas salen de `streak-reward.ts`. La preferencia de visibilidad va en `member_profiles`.

### Decisiones de los sketches 030 a 033 (2026-11-17)

- **D-51:** La lista de anotados vive en una **hoja desde abajo** que se abre desde la card del horario
  (sketch 030, variante C), con las personas como **caras en grilla** de cuatro por fila (sketch 032,
  variante B). Resuelve D-10. Sin el texto "ver quiénes". Pendiente de la ronda 2: si la card del horario
  muestra hasta 4 caras o solo el número (lo primero pide datos nuevos en la grilla semanal).
- **D-52:** La lista **no etiqueta a nadie**: ni profe ni Wellhub. Franco: "lo de profe no tiene sentido
  porque eso aparece por franja". Enmienda a D-08: staff y Wellhub siguen apareciendo con nombre y foto y
  sin puntos, pero sin ninguna marca. El endpoint no devuelve rol ni origen de la reserva.
- **D-53:** El encabezado de Mi Templo es la **variante C** del sketch 031: ficha oscura con los puntos de
  Aura y la foto con aro dorado. Cuánto se parece la ficha a la card de hoy se define en la ronda 2
  (`031-encabezado-mi-templo/ronda2.html`), junto con el sello de antigüedad.
- **D-54 (REVOCADA por D-57):** El **detalle de movimientos de Aura NO entra en esta fase.** Franco: "luego que se pueda entrar
  a ver de dónde se sumó el aura, no mostrarlo por ahora, que no sea público". Los puntos del encabezado
  no llevan a ninguna pantalla. Reemplaza a D-13 y a la parte de D-16 que decía "tocar los puntos lleva
  al detalle". No se planifica la ruta de movimientos ni los textos por motivo.
- **D-55:** El **selector de nivel sale del encabezado de Mi Templo**. Pasa a la barra de arriba, a la
  izquierda del acceso al perfil, y aparece solo dentro de Entrenar. En escritorio no hay barra de arriba:
  la ubicación ahí queda por definir en el UI-SPEC.
- **D-56:** El aviso al marcar asistencia es la **celebración a pantalla completa** (sketch 033, variante
  B). El staff también la ve, sin la parte de Aura (lectura mía de "que la vea también staff": D-15 sigue
  vigente).

### Cambios de Franco tras la primera ronda de sketches (2026-11-17)

- **D-57:** El **detalle de movimientos de Aura SÍ entra en esta fase, y es privado.** Franco: "hagamos
  detalle privado". Revoca D-54 y repone D-13 y D-16: tocar los puntos del encabezado abre el detalle,
  que solo ve su dueño.
- **D-58:** **Al staff SÍ se le muestra Aura.** Franco: "que al staff se le muestre aura". Revoca D-15 y
  la parte de D-08 y D-56 que los dejaba sin puntos. No hay ningún ocultamiento por rol: encabezado,
  detalle, lista de anotados y celebración muestran lo que el servidor informa. Un profe que se
  auto-registra no acredita Aura (regla existente), así que su celebración sale sin el "+5". La
  acreditación al staff no se toca. Sigue vigente D-52: la lista no devuelve rol ni origen.
- **D-59:** La card del horario muestra **solo el número de anotados** como botón para abrir la hoja
  (sketch 030, variante C2). No se agregan caras a la grilla semanal.
- **D-60:** La **ficha oscura de Aura del encabezado queda descartada.** Franco: "no me convence que sea
  oscuro el fondo de lo de aura". Se mantiene la estructura de la variante C (foto, nombre, antigüedad y
  Aura a la derecha). El tratamiento se elige en la ronda 3 (`031-encabezado-mi-templo/ronda3.html`).

- **D-61:** El **sello de antigüedad se queda, sin dorado** (resuelve D-28). El dorado queda solo para
  Aura. El tono exacto del sello lo fija el UI-SPEC.
- **D-62:** El selector de nivel en la barra de Entrenar muestra **la letra y el nombre** del nivel
  (por ejemplo "Δ DELTA"), no solo la letra.

### Respuestas de Franco a los supuestos del planificador (2026-11-17)

- **D-63:** Quitar una foto (lo haga el alumno o el staff) **quita también la foto de ficha** que cargó
  el staff. Franco: "si quieren quitarla que la quiten". Se mantiene lo que planificó el plan 12.
- **D-64:** **Tope del día: es una o la otra, nunca más de 5.** Franco: "si completa en app y después
  asiste, que sume 5 en total por el día (el de más valor) pero nunca más de 5". Entre asistir a clase
  (5), entrenar en la app (3) y la sesión de plan a medida (3), el día paga solo la de más valor, sin
  importar el orden. Reemplaza el supuesto 6 del planificador (que dejaba 3 + 5 cuando la app iba
  primero) y amplía D-20. Estirar (1) y bloque libre (2) son extras y se suman aparte.
  - Forma recomendada (a criterio del planificador): si ese día ya hay Aura por la app o por plan a
    medida, la asistencia acredita solo la diferencia hasta 5, y la reversa de una asistencia revierte
    exactamente lo que esa asistencia acreditó. Así el ledger no necesita filas negativas extra y, si
    se anula la asistencia, el día vuelve a valer 3.
  - Extensión mía, a confirmar si aparece el caso: app y plan a medida el mismo día pagan 3 en total,
    no 6.
  - No cambia: dos asistencias presenciales el mismo día en categorías distintas (clase regular y
    actividad especial) siguen acreditando cada una, como hoy.
- **D-65:** En la lista, quien tiene 0 de Aura aparece **sin número** (supuesto del planificador, sin
  objeción de Franco).

- **D-66:** El Aura del encabezado va en la **ficha clara** (sketch 031, ronda 3, variante L1): marfil con
  filete dorado y el número en dorado oscuro. Cierra D-53 y D-60. Tocarla abre el detalle privado, que
  también va en claro. Con esto quedan elegidos los cuatro sketches (030 C2, 031 C + L1, 032 B, 033 B con
  el "+5" sin chispa y la chispa antes del total).

### Claude's Discretion

- Cómo se calcula el "Aura ganada" (suma del ledger sin canjes, o saldo más canjes) mientras la
  conciliación de D-38 se cumpla.
- Programas: la propuesta mantenía su peso en clases, así que 15 por semana y 100 por programa pasan a
  8 y 50. El redondeo y si se tocan los valores ya cargados por programa quedan a criterio del
  planificador. Decirlo en el plan para que Franco lo vea.
- Orden de los hechos en D-20: qué pasa si el alumno completa la sesión en la app y después asiste ese
  mismo día.
- Cómo se estima el tiempo propuesto de los bloques por repeticiones, que no declaran minutos.
- Qué se muestra mientras una foto está pendiente (iniciales o la foto anterior), cuándo se acreditan
  los 5 puntos (propongo al aprobarse), qué aviso recibe el alumno si se la rechazan y qué roles del
  staff aprueban.
- Redacción de los textos de cada movimiento y del aviso de visibilidad.
- Bucket, formato de la URL y redimensionado de la foto.
- Si `aura_config` pasa a ser la fuente de los montos o siguen en constantes de código.

</decisions>

<canonical_refs>
## Canonical References

**Los agentes que sigan DEBEN leer esto antes de planificar o implementar.**

### Pedido y origen

- `.planning/phases/214-comunidad-anotados-aura/214-BRIEF.md` — Prompt vigente de Franco (copia de
  `.docs/PROMPT-fase214-comunidad-aura.md`) y extracto de la transcripción de la reunión del
  2026-11-16. Donde el brief y este CONTEXT difieran, manda el CONTEXT.
- `.planning/phases/214-comunidad-anotados-aura/214-DISCUSSION-LOG.md` — Opciones presentadas y
  respuestas literales de Franco. Solo auditoría.

### Valores de Aura

- `.planning/phases/214-comunidad-anotados-aura/214-AURA-VALORES-RESEARCH.md` — Inventario de fuentes,
  datos de producción, benchmark con fuentes, simulación de escalas, lista de lo que hay que tocar y
  hallazgos fuera de alcance.
- `.planning/phases/214-comunidad-anotados-aura/consultas/` — Consultas de solo lectura corridas en
  producción el 2026-11-17 y sus resultados: distribución de Aura, conciliación, sesiones por
  antigüedad, altas por mes y configuración vigente.

### Decisiones previas que condicionan

- `.planning/phases/213-estiramiento-post-clase/213-CONTEXT.md` y `213-SPEC.md` — Fuente `stretch`,
  mínimo de 3 minutos medido por el servidor. El monto de 5 queda reemplazado por D-19.
- `.planning/phases/197-entrenar-tabs-canasta-bloque-libre/197-CONTEXT.md` — Fuente `extra_block`
  (D-12) y dorado reservado a Aura (D-18). El monto de 5 queda reemplazado por D-19.
- `.planning/phases/204-usuarios-wellhub/204-CONTEXT.md` — La visita Wellhub no da Aura.
- `.planning/phases/194-invitaciones/194-CONTEXT.md` — Arbitraje entre descuento por Aura, partner e
  invitación (D-08, D-21, D-22). Relevante para apagar el descuento por Aura.
- `.planning/phases/81-streaks-engagement-mechanics/81-CONTEXT.md` — Rachas (D-11, D-12, D-13).
- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — Onboarding 50 (D-22).

### Comunidad

- `.planning/research/COMMUNITY-BENCHMARK.md` — Evitar rankings públicos, gamificación moderada.
- `.planning/research/COMMUNITY-AGORA-CONTRAST.md` — Nombres no estigmatizantes, comparación pública.

### Reglas del repo

- `.claude/skills/el-templo-change-control/SKILL.md` — Staging primero, `git add` por ruta, gates.
- `.claude/skills/el-templo-db-migrations/SKILL.md` — Migraciones a mano, sin `;` en comentarios SQL.
- `el-templo-api/test/tenant-manifest.ts` y `el-templo-api/test/tenancy/` — Gates de tenancy para
  rutas y tablas nuevas.

</canonical_refs>

<code_context>
## Existing Code Insights

Relevado el 2026-11-17 sobre `a51a00271`. Rutas relativas al repo.

### Reusable Assets

- `el-templo-api/src/modules/scheduling/routes.ts:1168` — `schedulingMemberRoutes`, montado en
  `/api/members/scheduling`. Guard `authenticate` + `attachCountryScope` (`:1233`). Schemas en
  `scheduling/schemas.ts`.
- `el-templo-api/src/modules/scheduling/service.ts:344-408` — De ahí sale `bookedCount` de la grilla
  semanal (reservas no-trial vigentes, incluye Wellhub).
- `el-templo-api/src/modules/aura/service.ts:54-147` — `AuraService.award` y `spend`. Saldo en caché
  en `aura_balances`, mantenido en la misma transacción.
- `el-templo-api/src/modules/aura/daily-award.ts` — `awardOncePerLocalDay`, día local de la sede.
- `el-templo-api/src/modules/conquer/private-media.ts:63` y `body-check-service.ts:445-496` — Circuito
  privado de fotos del alumno: URL firmada, tope de 8 MB, confirmación de subida. Precedente a copiar.
- `el-templo-admin/src/components/MemberPhotoUpload.vue` — Subida de foto por el staff.
- `el-templo-app/src/components/VeteranSeal.vue` — Sello bronce, plata y oro a los 3, 6 y 12 meses.
- `el-templo-app/src/pages/ProfilePage.vue:17, 307-312` — Iniciales inline. No hay componente de
  avatar en la app.
- `el-templo-app/src/modules/progression/utils/blockMeta.ts:53, 103` — Minutos declarados y estimados
  por bloque. Existe solo en la app: la API no tiene función de duración propuesta.
- `@capacitor/camera` 8.2.0 instalado (`el-templo-app/package.json:26`), usado en
  `modules/bar-challenge/pages/Timer.vue:141-152`. Permisos en `src-capacitor/ios/App/App/Info.plist`.
- Toggles guardados en el servidor: `notification_preferences` y `GET`/`PUT
  /api/notifications/preferences` (`notifications/routes.ts:472-505`), con UI en
  `ProfilePage.vue:314-376`. La categoría es un enum cerrado: sirve de patrón, no tal cual.

### Established Patterns

- **fast-json-stringify recorta lo no declarado.** Todo campo nuevo va en el schema de respuesta.
- **Gates de tenancy.** Ruta nueva: entrada en `test/tenant-manifest.ts`, subir `ENTRADAS_BASELINE`
  (577, `test/tenancy/iso-01-manifiesto.test.ts:473`), caso de aislamiento en `iso-03-*` y subir
  `CASOS_BASELINE` (74). `users`, `bookings`, `schedules` son tablas strict. Las tablas de Aura no lo
  son y `AuraService` está en la allowlist del lint, que no se puede agrandar: el código nuevo que las
  lea usa `tenantWhere`.
- **Montos de Aura repartidos.** Asistencia y onboarding fijos en código, antigüedad en
  `shared/tenure-milestones.ts:40-44`, rachas en `aura/streak-reward.ts:336-350`, y solo cuatro fuentes
  leen `aura_config`. `is_active` no se lee en ningún lado.
- **El unique del ledger** `(user_id, source_type, reference_type, reference_id)` no protege las filas
  con `reference_id` NULL (onboarding, canjes, reversas).
- **Migraciones** a mano desde la 0344, SQL en el mismo commit que el schema, sin `;` en comentarios.

### Integration Points

- Asistencia: `attendance/service.ts:386, 558, 1036` (10 fijo en `:391, :563, :1041`) y reversa en
  `:1297-1310`.
- Onboarding: `onboarding/service.ts:68-71, 173-176`. Devuelve el saldo como si fuera el monto.
- Entrenar en la app: `sessions/routes.ts:482-486` (duración desde el `startedAt` del cliente) y
  `:568` (Aura). Plan a medida: `goal-plans/routes.ts:359-369, 426`, que no guarda `duration`.
- Descuento por Aura: `aura/pricing-benefits.ts:112-243`, tramos en `subscriptions/types.ts:185-190` y
  copia en `el-templo-admin/src/types/subscription.ts:69-74`. Selector en
  `el-templo-admin/src/components/AssignPlanDialog.vue:380-395, 1579-1588`.
- Foto del staff: `members/routes.ts:2023-2100`. Bucket público con nombre predecible
  (`members/photos/{userId}-{ts}.{ext}`), sin tope de tamaño ni validación de contenido.
- `GET /auth/me`: `auth/routes.ts:974-1166`. No devuelve `photoUrl`. `memberSince` sale de
  `users.createdAt`.
- Encabezado: `el-templo-app/src/layouts/MainLayout.vue:34-61` (escritorio) y `:111-139` (celular).
- Diálogo de reserva: `el-templo-app/src/pages/ReservasPage.vue:836-853`, armado en `onSlotTap`
  (~1895-1950). Hoy solo tiene título, texto y botones.
- Textos fijos con monto: `StretchPlayer.vue:125`, `StretchDone.vue:15`, `LibreTab.vue:80`,
  `FreeBlockCelebration.vue:14`, `FreeBlockSummary.vue:18`, `OnboardingResult.vue:24`,
  `OnboardingRecommendation.vue:14`.
- Tests que afirman montos: lista por archivo en la sección 5 del inventario, resumida en
  `214-AURA-VALORES-RESEARCH.md` §5.

### Datos de producción (2026-11-17)

- 8.571 alumnos, 2.750 con Aura, máximo 1.750, cero canjes. Conciliación perfecta.
- Asistencia 72 % del Aura repartido, onboarding 19 %, antigüedad 8 %.
- 684 personas con Aura y ninguna asistencia acreditada (679 con exactamente 50).
- Staff con Aura: 7 de 9 coaches (hasta 880) y un admin de sede con 590.
- `aura_config` vigente: asistencia 5 (el código paga 10), referido 10 (es un %, no puntos).

</code_context>

<specifics>
## Specific Ideas

- Matías en la reunión: mostrar "la gente que se anotó en la clase cuando alguien se vaya a anotar, tipo
  un desplegable", y un "leveleo de estatus" que "solo sirva para estatus".
- Franco: los ocultos se agrupan con algo como "y otros 3 más".
- Franco: un aviso mejorado para cuando se marca asistencia en las sedes.
- Franco sobre la lista: dentro de un pop-up le parece demasiada información.
- Franco sobre la escala: una vez que se muestre no se puede volver atrás, y no quiere números inflados.

</specifics>

<deferred>
## Deferred Ideas

### Fase siguiente: regalar Aura entre personas

Decisión de Franco: fase propia, justo después de la 214. A definir ahí: de dónde salen los puntos (cupo
aparte que vence o saldo propio), valor del regalo, tope por semana y por persona, si los profes regalan
sin tener Aura propia, si lo recibido suma al número visible, desde dónde se regala, aviso y control de
abuso. Insumos ya relevados en `214-AURA-VALORES-RESEARCH.md` §2 y §8. En la 214 se deja el terreno
preparado: el número visible se calcula de modo que los regalos puedan sumar después.

### Fuera de la fase por decisión de Franco

- Niveles de estatus de Aura (cortes, nombres, insignia). La distribución ya está relevada en
  `consultas/01-distribucion-aura.resultado-2026-11-17.txt`.
- Economía de Aura con puntos gastables y gastados, y volver a encender el descuento.
- Cortar la acreditación de Aura al staff y decidir qué hacer con lo ya acreditado.
- Aura retroactiva por antigüedad para los alumnos de muchos años.
- Regla estricta por bloque para entrenar en la app (inicio registrado por el servidor y tiempo por
  bloque enviado por la app).

### Posibles bugs encontrados, sin tocar

- `trialSpotsRemaining` no está en `weeklySlotViewSchema` y la app lo leería vacío
  (`scheduling/service.ts:510`). Sin confirmar en ejecución.
- El detalle de horario del staff no filtra cancelados ni lista de espera (`scheduling/service.ts`
  ~620).
- La semana de programa se acredita una sola vez por inscripción (`programs/service.ts:914-919,
  961-966`).
- La racha cuenta sesiones y no días (`streaks/service.ts:175-283`).
- La reversa de asistencia no se aplica si el saldo no alcanza, y no distingue si la asistencia había
  acreditado (`attendance/service.ts:1297-1310`).
- El canje gasta los puntos antes de la transacción de la suscripción (`aura/pricing-benefits.ts:208`).
- El plan a medida, al retomar una sesión, manda un inicio casi igual al fin
  (`GoalPlanSession.vue:306, 403`).
- `/sessions/complete` no valida que el `dayId` corresponda a la fecha ni al nivel del alumno, y acepta
  cualquier lista de bloques (`sessions/routes.ts:445`). D-20 tiene que cubrir al menos los bloques.

</deferred>

---

*Phase: 214-comunidad-anotados-aura*
*Context gathered: 2026-11-17*
