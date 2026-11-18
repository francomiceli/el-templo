# Decisiones de Franco en la revisión previa al push (2026-11-18)

Revisión de las fases 214 y 215 antes de subirlas juntas a staging. Las consultas a producción se
corrieron el 2026-11-18 (resultados en `214-comunidad-anotados-aura/consultas/*.resultado-2026-11-18.txt`).

## Resultados de las consultas a producción

- **04 importados:** 367 alumnos quedaron con el 16 de marzo de 2026 como alta, y la base no tiene su fecha
  real. Hoy solo 5 están activos.
- **05 conciliación:** 2.927 saldos iguales a la suma de sus movimientos, ningún canje, ningún movimiento
  fuera de las reglas de la 0344. Los 6 programas tienen 15/100, los valores por defecto.
- **07 línea de base** (4 semanas antes del 2026-11-16): unos 1.200 alumnos activos, de 1,4 a 1,7 reservas
  y de 1,2 a 1,5 asistencias por alumno y por semana. La columna "reservas desde la app" siempre da 0:
  `source='self_service'` solo lo llevan las clases de prueba, y la consulta las excluye. Para medir sirve
  el total de reservas.
- **08 regla del 80 %:** 54 sesiones de app en 90 días. Solo 19 (35 %) pasarían la regla. La mediana
  del tiempo real es el 20 % del propuesto.

## Decisiones

| # | Tema | Decisión |
|---|------|----------|
| 08 | Regla del 80 % del tiempo propuesto | Queda en 80 %, aunque hoy deje sin Aura a 2 de cada 3 sesiones de app. |
| 7 | Fecha real de los 367 importados | No se corrige. Afecta a 5 alumnos activos. |
| 8 | "+5 AURA" en la 1.9.6 | La 1.9.6 nunca se buildeó: sale a tiendas como 1.9.6 con la 213, la 214 y la 215 juntas. La 214 ya quita los números. Si se buildeara antes de que la 214 llegue a master, hay que sacarlos en master. |
| 1 (ME-01) | Quien se oculta después de un regalo | El aviso dice cuántos puntos se dieron o recibieron **sin mencionar a la otra persona**: nada de nombre, foto ni "Alguien". Corre desde que la persona está oculta, en la bandeja, el detalle de Aura y la card de hoy. **Por implementar.** |
| 2 (ME-06) | Cualquier profe de la sede puede regalar | Queda abierto por las suplencias. Se agrega en la página "Regalos de Aura" del admin un conteo de regalos por profe y por semana. **Por implementar.** |
| 3 (ME-05) | Anular un regalo ya gastado deja saldo negativo | Queda así: hoy no puede pasar, porque el descuento está apagado y no hay canjes. Revisarlo el día que se prenda el descuento. |
| 4 (LO-03) | Ids de asistencia ajenos en la hoja | Pendiente: Franco pidió que le explique cómo llegan. |

Decisión 4 (LO-03), cerrada: queda así. No expone datos de nadie y solo permite estimar el volumen total de asistencias.

## Segunda tanda

| # | Tema | Decisión |
|---|------|----------|
| 5 (214 ME-04) | Ubicación en las fotos | Se instala `sharp` (OK de Franco el 2026-11-18). El servidor re-codifica cada foto y verifica que sea una imagen. **Por implementar.** |
| 214 · Programas | Aura de los programas | Se aceptan 8 por semana y 50 por programa terminado. |
| 215 · Silenciar | Interruptor para los avisos de regalos | Se agrega el interruptor "Regalos de Aura" en Perfil. Con el interruptor apagado no llega la push, pero el regalo queda igual en la bandeja y en el Aura. **Por implementar.** |
| 214 · Reportes | Foto reportada visible hasta la revisión | Pendiente: Franco preguntó por qué los compañeros pueden reportar. |
| 214 · Reportes | Qué hace un reporte de foto | Solo avisa: la foto sigue visible, entra a la cola de revisión y suma a la pelotita. **No se oculta sola**, porque el reporte puede estar equivocado. Así funciona hoy, no hay cambio. |
| Admin · Comunidad | Dónde se maneja la comunidad | Nueva página **"Comunidad" dentro del grupo "Gerencia"** del menú, con pestañas **Fotos** y **Regalos de Aura** (como Caja con Egresos). Salen los dos ítems sueltos de "Gestión". Cada pestaña mantiene sus permisos: Fotos para todo el staff, Regalos para dueño, admin y admin de sede. La 216 suma ahí lo suyo. **Por implementar.** |
| 215 · Anulados | Regalo anulado sin explicación en la bandeja | La bandeja muestra el motivo junto a "Anulado", por ejemplo "Anulado: la asistencia se corrigió" o "Anulado por el staff". Sin push. **Por implementar.** |
| 215 · Sin regalo | Quien no puede regalar no sabe por qué | Solo los ocultos ven un texto: "Para dar Aura, activá Aparecer en las listas en tu Perfil". A quien no tiene plan o viene por Wellhub no se le muestra nada. **Por implementar.** |
| 214 · Texto 1 y 3 | Normas de la foto e interruptor de visibilidad | Aprobados tal cual. |
| 214 · Texto 2 | Aviso de la primera vez en la lista | El texto queda. "Entendido" pasa a ser un botón grande y "Ocultarme" un texto subrayado debajo. **Por implementar.** |
| 214 · Texto 4 | Push al rechazar una foto | **No se manda push.** El alumno ve el estado y el motivo en Perfil. **Por implementar.** |
| 214 · Texto 6 | Anuncio previo | No se hace nada con el anuncio por ahora. |
| 214 · Texto 5 | Textos de los movimientos de Aura | Aprobados, con dos cambios: "Racha de N sesiones" pasa a "N días seguidos entrenando en la app", y "Sesión de tu plan" pasa a "Sesión de tu plan online". **Por implementar.** |

## Revisión de la lista de 40 (`.docs/REVISION-decisiones-autonomas-214-215-2026-11-18.md`)

| # | Decisión |
|---|----------|
| 2 | La copia de la foto de ficha al bucket privado **se reintenta** en las vueltas siguientes del job (unas pocas veces) antes de quedar como fallida. **Por implementar.** |
| 4 | Se muestra en Perfil el motivo del rechazo de la foto. Queda como está. |
| 5 | Recorte automático al centro, con vista previa. Queda como está. |
| 6 | Las normas de la foto se muestran la primera vez y después de un rechazo, no en cada "Elegir otra". **Por implementar.** |
| 7 | Quien viene por Wellhub sin plan propio ve solo el número de anotados. Queda. |
| 8 | La lista de anotados se ve solo en los horarios de la grilla del alumno. Queda. |
| 9 | "Reservar" desde "Quiénes van" pide la confirmación de siempre. Queda. |
| 12 | Acreditar Aura sin transacción ni reintento: **queda pendiente para más adelante**, fuera de estas fases. |
| 13 | El historial anterior al 9 de noviembre no se recorta con el tope del día. Queda. |
| 14 | Una visita por Wellhub no bloquea el Aura de la app ese día. Queda. |
| 15 | Una sesión hecha solo con bloques alternativos **también suma Aura**, con el tiempo propuesto calculado sobre esos bloques. **Por implementar.** |
| 16 | **Arreglar ahora** el check-in forzado de noche: tiene que guardar la fecha local de la sede y no la UTC (supuesto técnico 2 de la 214). **Por implementar.** |
| 17 | Sin foto, debajo del nombre en el encabezado aparece **"Subí tu foto y sumá Aura"**; con foto, la antigüedad. Sin nombre cargado sigue diciendo "Atleta". **Por implementar.** |
| 17b | Con Aura en 0, el encabezado muestra el 0. En la lista sigue oculto. Queda. |
| 18 | **Los tres sellos de antigüedad** (bronce, plata y 1 año o más) se rehacen con la paleta de la marca (cálida, sin azul: memoria `reference_brand_palette`). **Por implementar.** |
| 20 | La tarjeta en columna en Reservas queda para el UAT: si en el teléfono se ve pesada, vuelve a la fila con el número al costado. |
| 19 | **El título "EL TEMPLO" se mantiene siempre.** En celulares angostos, el selector de nivel oculta el nombre del nivel y muestra solo su ícono. Vale también para el corte de 460 px de la 215 (campana). **Por implementar.** |
| 21 | Sin el dato del servidor, el renglón de Aura no aparece en estirar, bloque libre ni onboarding. Queda. |
| 22 | Los movimientos de Aura van sin íconos. Queda. |
| 24 | Anulan regalos el dueño, los administradores y los admin de sede (en sus sedes). Queda. |
| 25 | El regalo del profe vale 2 de base, editable entre 1 y 10 por dueño y administradores. Queda. |
| 26 | El botón de regalo en el panel de asistencia **lo ve todo el staff, pero solo lo pueden usar los profes con la sede**. Para el resto aparece deshabilitado, con una nota del tipo "Solo los profes pueden dar Aura". **Por implementar.** |
| 27 | La medición de "alumnos que regalaron" queda como está. |
| 29 | Un regalo anulado no devuelve el cupo del día ni de la semana. Queda. |
| 32 | La hoja de dar Aura va en una sola pantalla, con las caras arriba y los motivos abajo (sketch 034 A). Queda. |
| 33 | **Celebración chica** la primera vez que abre la app después de recibir un regalo: un cartel breve "Juan te dio Aura por Buena energía", no a pantalla completa. Si quien regaló está oculto, va sin nombre (decisión 1). **Por implementar.** |
| 34 | Freno anti-abuso: 10 regalos y 30 aperturas de la lista por minuto. Queda. |
| 35 | **Al entrar a Notificaciones se marca todo como leído** y la campana vuelve a 0. Los avisos nuevos se ven resaltados esa vez. **Por implementar.** |
| 36 | La bandeja guarda 90 días, con los avisos personales aunque las push estén apagadas y sin las Novedades masivas. Queda. |
| 38 | Si quien regala no tiene nombre cargado, el aviso **no menciona a nadie**, igual que con el oculto: "Te dieron 1 de Aura por Buena energía". **Por implementar.** |
| 39 | **Se saca ya la frase "Solo vos ves este detalle"** del detalle de Aura. **Por implementar.** |

Revisión completa el 2026-11-18: están resueltas las 40 entradas y las 8 decisiones abiertas del handoff.

## Bocetos (2026-11-18)

| # | Decisión |
|---|----------|
| 18 | Sellos de antigüedad: **variante B del sketch 036**. Los tres niveles son crema con el logo terracota y se distinguen por la cantidad de anillos terracota: ninguno a los 3 meses, uno a los 6 y dos al año o más. **El logo va chico y del mismo tamaño en los tres niveles.** El tamaño del sello (21 o 24 px) se ajusta para que los anillos se distingan. **Por implementar (plan D).** |
| 33 | Celebración: **mezcla de la C y la A del sketch 037.** Sale del Aura del encabezado de Mi Templo: el Aura late y el número cuenta hasta el total nuevo, como en la C. El diseño es el de la A: tarjeta marfil con borde dorado y una línea que se vacía, y se va sola a los 5 s. **Se usa para cualquier Aura sumada desde la última visita a Mi Templo** (regalos, rachas, foto aprobada, antigüedad, programas, onboarding), con el texto del motivo. Si hay varios: "Sumaste N de Aura" con los dos últimos motivos. La asistencia (pantalla completa), el estiramiento y el bloque libre ya tienen su celebración y no se repiten. Si el regalo viene de alguien oculto o sin nombre, el texto no menciona a nadie. Boceto actualizado como variante D del 037 antes de construirlo. **Por implementar (plan D).** |
