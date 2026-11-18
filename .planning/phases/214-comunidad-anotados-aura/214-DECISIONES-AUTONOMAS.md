# Fase 214 — Decisiones tomadas sin consultar a Franco

Franco pidió el 2026-11-17 que la 214 se planifique y ejecute "todo autónomamente, sin mi supervisión".
Este archivo junta cada decisión que le tocaba a él y que se tomó con la opción recomendada para no
frenar la cadena. **Todas se pueden cambiar**: dice dónde está implementada cada una.

Lo que NO se hizo por no tener su OK: push, SSH o consultas a producción, instalar dependencias y bump de
versión.

## 1. Decisiones abiertas del UI-SPEC (`214-UI-SPEC.md`, sección "Decisiones abiertas para Franco")

| # | Tema | Lo que se tomó | Alternativa descartada |
|---|---|---|---|
| 1 | Selector de nivel en la computadora | Pastilla clara arriba de las pestañas de Entrenar, a la derecha | — (en escritorio no hay barra de arriba) |
| 2 | Dónde revisa el staff las fotos | Ítem nuevo "Fotos" en Gestión del admin, con la pelotita de pendientes | Dentro de Feedback (solo lo ven los dueños) |
| 3 | Motivo del rechazo de una foto | El staff elige un motivo de una lista y va en el aviso al alumno | Aviso genérico sin motivo |
| 4 | Sello de antigüedad | Solo el de 1 año o más pasa a crema con logo terracota. Bronce y plata no cambian | Rehacer los tres sellos |
| 5 | Línea bajo el nombre cuando no hay foto | Siempre la antigüedad | "Subí tu foto y sumá 5 de Aura", como en el sketch |
| 6 | Recorte de la foto | Automático al centro, con vista previa antes de subir | Recorte manual |
| 7 | Movimientos de Aura | Sin íconos, solo texto y monto | Con ícono por tipo |
| 8 | "Reservar" desde la hoja "Quiénes van" | Pasa por la ventana de confirmación de siempre | Reservar en el acto |
| 9 | Aura en 0 en el encabezado | La ficha muestra "0" | Ocultar la ficha |
| 10 | Textos borrador | Se usan tal como están en "Borradores para aprobar" del UI-SPEC | — |
| 11 | Aro dorado de la foto | Dorado siempre que se vea la ficha de Aura, aunque tenga 0 | Aro de otro tono sin Aura |

**Textos para revisar** (todos en `214-UI-SPEC.md`, sección "Borradores para aprobar"): normas para subir
la foto, aviso de primera vez de la lista, interruptor de visibilidad, permiso de cámara de iOS, motivos
de rechazo, textos de cada movimiento de Aura y anuncio previo. Las normas son las que más importan:
Google Play exige que el alumno las acepte antes de subir la foto.

## 2. Preguntas que dejó el planificador de servidor

| Tema | Lo que se tomó | Dónde |
|---|---|---|
| Quien viene por Wellhub | Aparece en la lista, pero como no tiene plan vigente ve solo el número | Plan 16 |
| Alcance de quien aprueba fotos | Igual que hoy al cargar la foto de ficha: profes, recepción y gestión en todo el país; el admin de sede, solo en su sede | Plan 15 |
| Aviso de foto rechazada | Push por la categoría de anuncios, más el estado visible en Perfil para quien tenga los anuncios apagados | Planes 15 y pantallas |
| Programas con premio de Aura | 15 pasa a 8 y 100 pasa a 50 donde el valor es el de fábrica. La consulta 05 lista los programas afectados antes del merge | Plan 04 |
| Foto reportada | Sigue visible hasta que el staff decide. Un reporte por persona y foto | Plan 14 |
| Lista de anotados | Solo para los horarios que el alumno ve en su grilla | Plan 17 |
| Visita por Wellhub y tope del día | No bloquea el Aura de la app de ese día | Planes 08 y 10 |

## 3. Supuestos técnicos que hay que confirmar en staging

- **Copia de la foto de ficha al almacenamiento privado.** Se asume que el almacenamiento permite copiar
  del lugar público al privado. Si no, las fotos de ficha salen sin imagen en la lista.
- **Check-in forzado de noche.** Guarda la fecha en UTC, así que puede no cruzarse con el día de la app
  para el tope de 5. Deuda conocida, sin arreglar.
- **Tests de integración.** Corren en CI. Hasta que haya un push a staging, lo ejecutado está verificado
  solo con typecheck, lint y tests unitarios o angostos.

## 4. Pendientes que solo puede resolver Franco

- Correr (o autorizar) las consultas de solo lectura de `consultas/`: 04 (fecha real de los 367
  importados), 05 (conciliación y programas afectados), 07 (línea de base) y 08 (calibración de la regla
  del 80 % con sesiones reales).
- Si tiene el archivo "Socios según fecha de ingreso" del sistema anterior.
- Revisar en App Store Connect y Play Console que "Fotos" figure como dato recopilado.
- Decidir si en la 1.9.6 se saca el número de los textos "+5 AURA" antes de generar los builds.
- Push a staging de la rama `feat/comunidad-anotados-aura` cuando la quiera probar.

## 5. Registro de lo que se vaya sumando durante la ejecución

Cada vez que un ejecutor se encuentre con una decisión de producto, se anota acá con la opción tomada.

| Fecha | Plan | Tema | Lo que se tomó |
|---|---|---|---|
| 2026-11-17 | 214-21, 214-27 | Motivo del rechazo visible en Perfil (el UI-SPEC no trae el texto) | Segundo renglón "Motivo: {etiqueta}." en la hoja de foto y caption "Motivo: {etiqueta}. Podés subir otra." en Perfil, con las etiquetas que ve el staff; sin renglón para "Otro motivo" |
| 2026-11-17 | 214-13 | Copia de la foto de ficha al almacenamiento privado | Job cada 15 minutos, una sola vez por foto; si falla queda marcada y no se reintenta. Una foto de ficha nueva aparece en la lista hasta 15 minutos después |
| 2026-11-17 | 214-17 | Cuentas borradas en la card del horario | Tampoco cuentan en el número de la card (misma cuenta que la hoja) |
| 2026-11-17 | 214-31 | Migración de repaso de D-49 | Queda preparada en `deploy-2/` y se mueve a migraciones recién para el deploy siguiente al de la 0344 |
| 2026-11-17 | 214-08 | Regla del 80 % sin calibrar | La consulta 08 (cuántas sesiones reales pasarían la regla) no se corrió porque pide acceso a producción. La regla sale con la fórmula del plan. Conviene correr la 08 antes de mergear a master |
| 2026-11-17 | 214-01 | Consulta 08 | El ejecutor la escribió tratando la duración en minutos. Corregida a segundos por el orquestador (`215686b9e`) |
| 2026-11-17 | 214-32 | Lista de cambios para Apple y Google (D-67) | No la escribe un ejecutor: la escribe el orquestador al cierre, en `.docs/` del checkout principal |
| 2026-11-17 | 214-04 | Historial: dos sesiones de app el mismo día (anteriores al tope diario del 9 de noviembre) | No se colapsan: cada una queda en 3. Son pocas filas (252 sesiones de app en total) y la consulta 05 las mide. Hacia adelante el día paga una sola |
| 2026-11-17 | 214-04 | Historial: asistencia que después fue anulada | Cuenta igual para el tope del día, porque la anulación no guarda a qué asistencia corresponde. Caso marginal |

| 2026-11-17 | 214-06 | Texto de Aura en estiramiento, bloque libre y onboarding | Dejan de mostrar montos fijos ("+5", "+50") y muestran el monto que informa el servidor. Si el servidor no lo informa (versión vieja), no se muestra el bloque de Aura en vez de un número inventado |
| 2026-11-17 | 214-06 | Resumen del bloque libre al "Seguir entrenando" | La línea "Sumaste N AURA" se mantiene tras seguir entrenando, con el monto acumulado de lo que efectivamente se acreditó en esa vuelta |
| 2026-11-17 | 214-07 | Descuento por Aura al asignar un plan (admin) | El selector "Descuento AURA" ya no aparece en el diálogo de asignar plan. La API lo sigue aceptando y el código quedó comentado para poder restaurarlo |
| 2026-11-17 | 214-07 | Asistente de programas: montos de Aura por defecto | Arranca proponiendo 8 de Aura por semana y 50 por programa completo (antes 15 y 100). El admin puede cambiarlos al crear el programa |
| 2026-11-17 | 214-08 | Sesión con solo bloques alternativos | Si los únicos bloques de la sesión son alternativos, no se acredita Aura por tiempo (se trata como sesión sin bloques). La sesión, la racha y el progreso se registran igual |
| 2026-11-17 | 214-08 | Entrenamiento de la app y plan a medida el mismo día | Cada uno mira al otro como "otra fuente" para el tope diario: si ya se acreditó Aura por uno ese día, el otro no vuelve a pagar |
| 2026-11-17 | 214-09 | Retomar un plan a medida a mitad de entrenamiento | Al retomar, el tiempo de entrenamiento cuenta desde el inicio real (lo ya entrenado se suma) y no desde el momento de retomar, así el Aura por tiempo no se pierde por haber salido y vuelto |
| 2026-11-17 | 214-13 | Foto de ficha nueva y espejo privado | Una foto de ficha recién subida tarda entre 15 y unos 30 minutos en aparecer en la comunidad, porque el sistema espera 15 minutos antes de copiarla a la tienda privada |
| 2026-11-17 | 214-13 | Foto de ficha que no se puede copiar | Si la dirección de la foto no tiene la forma esperada, se marca como fallida y no se muestra. Sin tienda privada configurada no se copia ni se borra nada |
| 2026-11-17 | 214-14 | Reportar la propia foto | Una persona puede reportar su propia foto de perfil sin que el sistema se lo impida |
| 2026-11-17 | 214-14 | Confirmar una foto ya procesada | Si se intenta confirmar una subida que ya fue aprobada o rechazada, la app recibe un aviso de que esa foto ya fue procesada y no se vuelve a sumar nada |
| 2026-11-17 | 214-15 | Alcance del admin de sede en la revisión de fotos | El acotado por sede aplica solo al admin de sede, como pide el plan. Profes, recepción y gestión ven la cola de todo el país |
| 2026-11-17 | 214-15 | Aviso de rechazo con los anuncios apagados | Si la persona tiene apagada la categoría de anuncios, no recibe el push de foto rechazada y se entera solo por el estado en Perfil. Queda anotado para Franco |
| 2026-11-17 | 214-15 | Estado de la foto en Perfil con varias fotos | "En revisión" gana sobre cualquier otro estado. "Rechazada" se muestra si la última foto subida por la persona fue rechazada |
| 2026-11-17 | 214-15 | Cola de revisión sin storage | Con la cola vacía se muestra vacía normalmente. Si hay fotos y el almacenamiento privado no está configurado, la cola da error de servicio en vez de mostrar fotos rotas |
| 2026-11-17 | 214-16 | Usuario Wellhub sin suscripción | Una persona que entra con Wellhub y no tiene suscripción propia no tiene plan en vigor: en la lista de anotados ve solo el número, no los nombres |
| 2026-11-17 | 214-16 | Mayoría de edad el 29 de febrero | Quien nació un 29 de febrero cumple los 18 el 1 de marzo en los años no bisiestos, y recién ese día pasa a ser visible por defecto en la comunidad |
| 2026-11-17 | 214-17 | Aura en la lista de anotados | Si la persona ganó 0 de Aura, o el módulo de gamificación está apagado, no se muestra Aura (queda vacío en vez de "0"). Avisar a Franco por si prefiere ver el 0 |
| 2026-11-17 | 214-17 | Horario de otro país | Si el horario es de una sede de otro país, la lista de anotados da "no encontrado", también para el staff |
| 2026-11-17 | 214-17 | Cuentas borradas en los contadores | Las cuentas borradas no cuentan en el total de anotados ni en el de clases de prueba |
| 2026-11-17 | 214-18 | Detalle de Aura sin referencia | Si un hito de antigüedad o una racha no tiene dato de referencia (vacío o cero), el movimiento se muestra igual con el texto genérico "Antigüedad en El Templo" o "Racha" |
| 2026-11-17 | 214-18 | Detalle de Aura sin movimientos | Quien todavía no tiene movimientos de Aura ve la lista vacía, sin error |
| 2026-11-17 | 214-19 | Antigüedad con fecha ilegible o futura | Si la fecha de alta no se puede leer, no se muestra la antigüedad. Si es futura, se muestra "Tu primer mes" |
| 2026-11-17 | 214-19 | Fecha larga de un movimiento de Aura de otro año | Si el movimiento no es del año en curso, la fecha lleva " de AAAA" al final (el spec no lo definía) |
| 2026-11-17 | 214-19 | Refrescar el perfil falla | Si no se puede actualizar el perfil, se avisa y se conserva el que ya estaba en pantalla, sin cortar nada |
| 2026-11-17 | 214-20 | Foto: errores de subida | Si la red se cae, hay un conflicto o falla algo desconocido al subir la foto, se muestra "No pudimos subir la foto…" para reintentar |
| 2026-11-17 | 214-20 | Foto: imagen que no se puede procesar | Si la imagen falla por un motivo que no es el formato, se muestra el mismo texto que cuando el servidor la rechaza por formato |
| 2026-11-17 | 214-20 | Foto recién confirmada | Apenas se confirma la foto, la persona ve el estado "pendiente de revisión" aunque falle la recarga del perfil |
| 2026-11-17 | 214-20 | Foto: permisos | Elegir de la galería no pide permiso de cámara |
| 2026-11-17 | 214-21 | Foto: "Elegir otra" | Al elegir otra foto se vuelven a mostrar las normas antes de subirla, así toda foto pasa por la aceptación |
| 2026-11-17 | 214-21 | Foto: cerrar las normas | Si la persona cierra las normas sin tocar "Acepto, elegir foto", no se sube nada y la hoja se cancela |
| 2026-11-17 | 214-21 | Foto: salir de la hoja | La hoja de la foto de perfil tiene un link "Cerrar" en la vista principal (el spec no lo pedía) |
| 2026-11-17 | 214-22 | Aura: falla la primera carga | Si no se puede cargar el detalle de Aura, se ve solo el título "TU AURA" y el aviso de error con "Reintentar", sin el recuadro del total |
| 2026-11-17 | 214-22 | Aura: módulo apagado | Si el módulo de Aura no está disponible (404), la hoja se cierra sola sin mostrar ningún mensaje |
| 2026-11-17 | 214-22 | Aura: botón atrás de Android | El botón "atrás" de Android cierra la hoja del detalle de Aura (el spec no lo pedía) |
| 2026-11-17 | 214-23 | Sello de 1 año o más | El sello de antigüedad pasa a roseta color crema con el logo en terracota, sin el polvillo dorado |
| 2026-11-17 | 214-23 | Sello: animación | El sello respeta la preferencia del teléfono de reducir movimiento (antes no lo hacía) |
| 2026-11-17 | 214-23 | Nombre en el encabezado | Si la persona no tiene nombre cargado, el encabezado dice "Atleta" |
| 2026-11-17 | 214-23 | Foto que no carga | Si la foto no se puede mostrar, se vuelve a pedir el perfil una sola vez y después queda la inicial |
| 2026-11-17 | 214-24 | Selector de nivel | El selector de nivel aparece solo en la pantalla Entrenar y solo si la persona tiene sesión iniciada y un nivel activo |
| 2026-11-17 | 214-24 | Selector en celulares angostos | En pantallas de menos de 420 px el título del encabezado se oculta para dar lugar al selector, y el logo lleva a Mi Templo |
| 2026-11-17 | 214-24 | Selector y vidriera | Si alguien sin plan ve la vidriera en Entrenar, en celular el selector igual puede aparecer (sigue la pantalla, no el contenido) |
| 2026-11-17 | 214-24 | Selector con teclado | Enter y Espacio abren el menú del selector de nivel |
| 2026-11-17 | 214-25 | Tarjeta de horario con anotados | En la pantalla de reservas principal la tarjeta del horario pasa a ir en columna para dar lugar a la fila de anotados; las grillas de prueba y de partner quedan como estaban |
| 2026-11-17 | 214-25 | Hoja sin lista (404) | Si la lista de anotados no está disponible, el pie de la hoja dice "Cerrar" y no se muestra el total |
| 2026-11-17 | 214-25 | Error al marcar el aviso como visto | Si falla el registro de que la persona vio el aviso, no se le frena ni se le muestra un error: sigue normalmente |
| 2026-11-17 | 214-25 | Hoja con error | Si la lista falla al cargar, el encabezado de la hoja no muestra el total de anotados |
| 2026-11-17 | 214-25 | Al cerrar la hoja | La lista de anotados se descarta al cerrar la hoja y se vuelve a pedir al abrirla |
| 2026-11-17 | 214-26 | Reporte de foto no disponible (404) | Si la foto ya no está disponible al reportarla, se muestra un aviso y el diálogo se cierra |
| 2026-11-17 | 214-26 | Reporte con error o demasiados intentos (429) | Se muestra un aviso y el paso de confirmación queda abierto para reintentar |
| 2026-11-17 | 214-26 | Mientras se envía el reporte | El diálogo no se puede cerrar y "Cancelar" queda deshabilitado hasta que termine |
| 2026-11-17 | 214-26 | Foto sin identificador | El botón "Reportar foto" queda deshabilitado |
| 2026-11-17 | 214-26 | Al abrir la foto de un compañero | Cada apertura vuelve al primer paso (ver la foto), sin recordar un reporte a medio hacer |
