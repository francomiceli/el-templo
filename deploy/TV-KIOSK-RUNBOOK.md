# El Templo - Runbook del kiosco TV de sucursal

Guía operativa para poner en marcha y mantener la pantalla de la sala. Está escrita para leerse **de pie frente a un televisor**, sin computadora al lado y sin saber nada del código.

**Pantalla del televisor:** `https://admin.eltemplo.org/tv/` (staging: `https://admin-staging.eltemplo.org/tv/`)
**Control del profe:** admin → Gestión → **Control TV**
**Vinculación de aparatos:** admin → Gestión → **Televisores**
**Last updated:** 2026-07-24

---

## 1. Qué es

Una **página web por sede** que se abre en el browser del propio televisor y muestra la plani del día en vivo: el bloque en curso, la lista del nivel elegido, el timer del formato y el video del ejercicio. Fuera de clase muestra un reloj gigante con segundero, el logo y una frase.

Tres cosas que conviene tener claras desde el principio:

- **No es una app.** No se instala nada en el televisor: es una URL. Lo único que el TV guarda es su vinculación (queda en el almacenamiento del browser).
- **El televisor no se toca durante la clase.** Todo se maneja desde el celular del profe, en el admin → **Control TV**. El TV solo mira: consulta al servidor cada 2,5 segundos y refleja lo que el profe apretó.
- **El estado es por sede, no por aparato.** Si una sede tiene dos televisores vinculados, los dos muestran exactamente lo mismo.

Si no hay clase iniciada, o la sesión del día no está aprobada, el televisor muestra el reloj y la frase. **Nunca muestra mensajes de error ni cocina interna**: los socios no tienen por qué ver eso. Si algo no anda, el que se entera es el profe desde el control.

---

## 2. Setup de un TV nuevo

Se hace una sola vez por aparato y lleva unos minutos.

1. **Abrir el browser del televisor.** En Samsung suele llamarse "Internet"; en LG, "Navegador web". Está entre las apps del menú principal.
2. **Entrar a la URL:**
   - Producción: `https://admin.eltemplo.org/tv/`
   - Staging (pruebas): `https://admin-staging.eltemplo.org/tv/`

   Escribirla **con la barra final** (`/tv/`, no `/tv`). Con el control remoto conviene usar el teclado en pantalla despacio: un carácter mal escrito da una página en blanco.

3. **Guardarla como marcador y como página de inicio.** En el menú del browser: "Agregar a favoritos" y, si el televisor lo permite, "Establecer como página de inicio". Esto ahorra tener que tipear la URL cada vez.
4. **Poner el browser en pantalla completa.** El botón depende del modelo (suele estar en el menú del navegador, o con el botón de zoom / pantalla del control remoto). La página está diseñada 16:9 y se escala sola: si sobra una barra de navegación arriba, el contenido se achica pero se sigue viendo entero.
5. **Anotar el código de 6 caracteres** que aparece en la pantalla del televisor. Se muestra grande y separado de a tres para leerlo desde lejos (por ejemplo `K7M 2QX`). Al cargarlo se escriben los 6 caracteres seguidos, sin el espacio.
6. **Cargarlo en el admin,** desde cualquier computadora o celular: **Gestión → Televisores → Vincular un televisor**. Ahí se completa:
   - **Código:** los 6 caracteres del televisor.
   - **Sede:** la sucursal donde está colgado ese TV. Este dato decide qué plani muestra: si se elige mal, el televisor muestra la clase de otra sede.
   - **Nombre (opcional):** algo que sirva para reconocerlo después en la lista ("Sala grande", "Sala de arriba").
7. **Confirmar en el televisor.** En pocos segundos la pantalla del código desaparece sola y pasa al reloj (o a la clase, si ya hay una iniciada). No hay que tocar nada en el TV.

**Dos detalles del código:**

- **No expira.** Puede quedar días en la pantalla esperando que alguien lo cargue; sigue siendo válido.
- **Se usa una sola vez.** Una vez vinculado, ese código muere. Si más adelante hace falta vincular de nuevo (ver sección 6), el televisor va a mostrar un código nuevo y distinto.

Después de vincular, el aparato aparece en la lista de **Televisores** con su sede, su estado y un **"Visto hace"** que se actualiza con cada consulta del TV. Si ese "visto hace" queda viejo (minutos u horas), el televisor está apagado, sin internet o con el browser cerrado.

Quién puede vincular: **Dueño y coaches**.

---

## 3. Evitar que la pantalla se apague

**Esto se configura en el televisor, no en la página.** No hay nada del lado del código que pueda impedir que un smart TV se apague solo: hay que desactivar el ahorro de energía del aparato.

**Samsung (Tizen):**

- _Settings → General → Eco Solution → Auto Power Off_ (a veces "Apagado automático"): ponerlo en **Off** o en el valor máximo.
- _Settings → General → System Manager → Time → Screen Saver Time_ (protector de pantalla): **Off** o el valor más alto disponible.
- Si el modelo tiene _Eco Solution → Ambient Light Detection / Energy Saving Mode_, conviene apagarlo también: baja el brillo solo y la pantalla se vuelve ilegible desde el fondo de la sala.

**LG (webOS):**

- _Ajustes → General → Ahorro de energía / Eco_: desactivar **apagado automático** ("Auto Power Off", suele venir en 4 horas de fábrica) y el **apagado por falta de señal**.
- _Ajustes → General → Temporizadores_: verificar que no haya un **temporizador de apagado** activo.
- _Ajustes → General → Protector de pantalla_ (aparece como "Screen Saver" o "Cambio de imagen"): ponerlo en el máximo o desactivarlo.

Los nombres cambian entre años y modelos. La regla práctica: **buscar en los ajustes cualquier cosa que diga "eco", "ahorro de energía", "apagado automático", "protector de pantalla" o "temporizador" y dejarla desactivada o al máximo.**

**Por qué la página no lo resuelve sola.** Existe una API del navegador para mantener la pantalla encendida (`navigator.wakeLock`), y a propósito **no se usa**: en webOS no es parte de la especificación soportada y en la práctica la promesa **se cuelga — ni resuelve ni rechaza**. O sea: no funciona y, peor, deja al código esperando para siempre una respuesta que no llega. La configuración del televisor es la única forma que realmente funciona.

---

## 4. Al encender el TV

**El browser nativo del televisor no puede abrir una URL sola al arrancar.** No existe la opción "abrir esta página al encender" en Tizen ni en webOS. El flujo diario es manual y son tres pasos:

1. Encender el televisor.
2. Abrir el browser (Internet / Navegador web).
3. Entrar a la última pestaña abierta o al marcador `/tv/`.

Si el browser conservó la pestaña, el paso 3 no existe: abre directo donde quedó. **La vinculación sobrevive al apagado**: no hay que volver a cargar ningún código, el televisor entra directo a la pantalla del reloj o de la clase.

**Salida operativa conocida si esto se vuelve insoportable** (NO implementada, y contradice la restricción de que tiene que andar en el TV tal como viene): un Android TV barato conectado por HDMI con **Fully Kiosk Browser**, que sí abre una URL al arrancar, bloquea la pantalla y no deja salir de la página. Es un cambio de hardware y de criterio, no de código: si se llega a ese punto, se decide aparte.

---

## 5. Beeps

Los beeps del timer (aviso de cambio de fase) **vienen apagados por default** y los enciende el profe desde el celular: **Control TV → sección TIMER → botón SONIDO**. Es un interruptor: queda encendido hasta que se apague o hasta que termine la clase.

Si se activó el sonido y el televisor no suena:

1. **Volumen del televisor.** Es lo primero y lo más común: el TV en mute o en volumen 0. El sonido sale por los parlantes del televisor, no por otro lado.
2. **Permiso de audio del browser.** Algunos navegadores de TV no dejan que una página reproduzca sonido hasta que alguien interactuó con ella. Si pasa: con el control remoto del TV, hacer un click sobre la página (mover el cursor y apretar OK una vez) y volver a activar el sonido desde el celular.
3. **El aparato no tiene soporte de audio web.** Se verifica en un renglón del diagnóstico (sección 7): `AudioContext (beeps)`. Si dice **NO**, ese televisor no puede hacer beeps y no hay arreglo posible desde la página. **Todo lo demás sigue funcionando igual**: el sonido es una mejora opcional, no un requisito.

El primer cambio de fase después de arrancar el timer nunca suena, a propósito: un televisor que se reconecta en medio de una ronda no tiene que pegar un grito en el medio de la sala.

---

## 6. Re-vincular / revocar

**Para revocar un televisor** (se lo llevaron, se rompió, se cambió de sede, o alguien lo vinculó mal): admin → **Gestión → Televisores** → botón **Revocar** en la fila del aparato.

Qué pasa del lado del televisor: en la siguiente consulta (menos de 3 segundos) el servidor le responde que ya no tiene permiso. El kiosco **borra su vinculación solo** y vuelve a mostrar una pantalla con un **código nuevo**. No hay que ir a la sede a tocar nada. Para volver a ponerlo en marcha, alcanza con cargar ese código nuevo desde el admin, eligiendo la sede correcta.

**Casos habituales:**

| Situación                                  | Qué hacer                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| El TV quedó vinculado a la sede equivocada | Revocar desde el admin y vincular de nuevo eligiendo la sede correcta                      |
| Se cambió el televisor por otro aparato    | Revocar el viejo (para que no quede ensuciando la lista) y vincular el nuevo desde cero    |
| El TV muestra un código y nadie lo pidió   | Alguien lo revocó, o el browser perdió sus datos. Vincular con el código que muestra ahora |
| El TV muestra la clase de otra sede        | Está vinculado a la sede equivocada: revocar y volver a vincular                           |

**Si hace falta forzar la re-vinculación desde el televisor** (por ejemplo, no hay quién entre al admin en ese momento): abrir `/tv/` con la URL limpia y, si el browser del TV lo permite, **borrar los datos del sitio** (suele estar en el menú del navegador como "Borrar datos de navegación" / "Configuración → Privacidad"). Al recargar, el televisor pide un código nuevo. Es la opción menos cómoda: revocar desde el admin es más rápido y no requiere pelear con el control remoto.

---

## 7. Diagnóstico sin devtools

En una sede **nadie puede abrir la consola del navegador** de un televisor: no hay teclado ni consola remota. Por eso la página trae dos modos de diagnóstico que se abren cambiando la URL. La forma de usarlos: abrirlos en el TV, **sacarles una foto con el celular** y mandarla.

### `/tv/?selftest=1` — ¿el televisor puede con esto?

`https://admin.eltemplo.org/tv/?selftest=1`

Corre las cuentas del timer contra una lista de casos conocidos y muestra el resultado. Tiene que decir **PASS n/n en verde**. Si dice FAIL, ese televisor calcula mal los tiempos y hay que reportar la pantalla completa.

### `/tv/?diag=1` — ¿qué aparato es este y qué ve?

`https://admin.eltemplo.org/tv/?diag=1`

Una pantalla de texto con todo lo que hace falta para diagnosticar de lejos:

- **version** y **version.txt** — qué versión tiene cargada el televisor y cuál es la publicada (ver sección 8).
- **hora local** — el reloj del propio televisor.
- **ua** — el user agent: marca, sistema y versión del motor del browser. **Es el dato más importante** si algo no anda.
- **ventana** — la resolución que reporta y el tamaño del marco 16:9 calculado.
- **device token** — si está vinculado (se muestran solo los últimos 4 caracteres) o "sin vincular".
- **REQUERIDO POR EL KIOSCO** — cinco renglones que tienen que decir **OK**. Si alguno dice **FALTA**, ese televisor no puede correr la pantalla y el motivo está ahí escrito.
- **MOTOR** — antigüedad del navegador. **La página no usa nada de esto**: son referencias para saber con qué aparato se está tratando. Que digan NO es normal y esperable.
- **RED** — la base del API y el resultado de una consulta de prueba, con su latencia.
- **LOG** — las últimas líneas de lo que el kiosco fue registrando.

### Qué mirar primero según el síntoma

| Síntoma                                          | Primer paso                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pantalla en blanco / negra**                   | Abrir `?diag=1`. Si el diag tampoco carga, el problema es el televisor o la red (probar otra web cualquiera). Si el diag SÍ carga, fotografiar **ua** y el bloque **REQUERIDO**: ahí está la respuesta.                             |
| **El código de vinculación no avanza**           | Verificar que se cargó bien en el admin (los 6 caracteres, sin el espacio) y que la sede es la correcta. En `?diag=1`, el renglón **RED** dice si el televisor llega al servidor.                                                   |
| **Muestra el reloj y no la clase**               | Normal si no hay clase iniciada o la sesión del día no está aprobada. Confirmar desde **Control TV**: ahí sí se avisa explícitamente. Verificar también que la sede del televisor sea la correcta.                                  |
| **El timer va desfasado o muestra algo raro**    | `?selftest=1`. Si da PASS, el cálculo está bien y el desfasaje viene del reloj del televisor — en `?diag=1`, comparar **hora local** con la hora real. La página se corrige sola contra el servidor, así que esto debería ser raro. |
| **El video no carga** (queda el cartel del logo) | Es esperable si ese ejercicio no tiene video cargado. Si pasa con todos, es la red de la sede: los videos pesan ~1,5 MB cada uno y con wifi flojo tardan.                                                                           |
| **La pantalla se ve cortada o desbordada**       | Fotografiar la pantalla completa y el renglón **ventana** de `?diag=1`. Verificar antes que el browser esté en pantalla completa (sección 2).                                                                                       |
| **Todo se congeló**                              | Recargar la página desde el browser del TV. Si vuelve a pasar seguido, reportarlo con la foto de `?diag=1` (el bloque **LOG** guarda las últimas líneas).                                                                           |

**Extra:** `/tv/?api=<url>` fuerza la página a hablar con otro servidor. Sirve para probar staging contra el API de staging desde la sede. **No se usa en la operación normal.**

---

## 8. Actualizaciones

El kiosco **se actualiza solo**, sin que nadie toque el televisor. Cada minuto compara la versión que tiene cargada contra la publicada; cuando detecta una nueva, espera y recarga **únicamente cuando la pantalla está en reposo** (reloj, sin clase). Nunca recarga en el medio de un bloque: una pantalla que se pone en blanco durante un tabata sería peor que la versión vieja.

Lo mismo aplica al reciclado preventivo: si el televisor lleva muchas horas prendido, se recarga solo, también en reposo.

**Si un televisor quedó viejo:** alcanza con **dejarlo en reposo un minuto** (terminar la clase desde el control, o esperar a que no haya clase iniciada). Se actualiza solo. Si hay apuro, recargar la página a mano desde el browser del TV logra lo mismo.

**Cómo verificar qué versión tiene:** `?diag=1`, los dos primeros renglones — **version** (la cargada) y **version.txt** (la publicada). Si son distintas, hay una actualización pendiente esperando el reposo.

---

## 9. Deploy (para quien shippea cambios)

**Advertencia operativa que ya mordió antes en este proyecto.** El workflow de deploy usa `paths-filter` comparando contra `event.before`: **solo reconstruye las apps cuyos archivos tocó ESE push**. Consecuencias concretas para el kiosco:

- Un push que solo toca `el-templo-api/**` **no reconstruye el admin**, y el kiosco vive dentro del admin (se genera en `el-templo-admin/public/tv/` durante el build y se sirve desde ahí). Resultado típico: "el back anda pero la pantalla no cambió".
- Peor todavía: si un push muere en CI, el siguiente compara contra ese commit fallido y puede saltearse paths que sí cambiaron en el medio.

**Regla:** al shippear cambios del kiosco, asegurarse de que el push **toque los paths de `el-templo-admin/`**, o disparar el deploy a mano con **`workflow_dispatch`** (que reconstruye todo sin mirar el filtro).

**Cómo verificar que llegó,** sin entrar al servidor: abrir `https://admin-staging.eltemplo.org/tv/?diag=1` (o el de producción) desde cualquier computadora y mirar el renglón **version.txt**. Si cambió, el deploy llegó.

**Qué tiene que devolver `/tv/`:** la pantalla del kiosco (mármol, logo, reloj). **Si aparece el login del admin**, el servidor web no está resolviendo el directorio y está sirviendo el SPA en su lugar — eso es un problema de configuración del servidor, no de la página: frenar y reportarlo antes de mandar a nadie a una sede.

---

## 10. Prerequisito por sede

**Sin wifi no hay kiosco.** La pantalla necesita internet permanente: consulta el estado cada 2,5 segundos y descarga los videos de los ejercicios a medida que el profe avanza.

Aguanta cortes breves sin romperse — si se cae la red, la pantalla **no parpadea ni se vacía**: el timer sigue contando localmente con el último estado conocido y, al volver la conexión, se realinea sola. Pero un corte largo deja la pantalla congelada en el último bloque que alcanzó a recibir.

**Estado por sede:**

- **Moreno: pendiente.** No tiene wifi todavía. Hasta que lo tenga, esa sede queda fuera — no es algo que se pueda resolver desde el código.

---

_Fase 164 — Pantalla TV de sucursal. El detalle técnico vive en `.planning/phases/164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-/`._
