# Phase 193: Comunicaciones - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 193-comunicaciones
**Areas discussed:** Destino de las push, Arbitraje de pop-ups, Editor de avisos y alcance, Avisos en TV, Número de ventas y tenancy, Métricas por aviso, Permisos y menú

---

## Destino de las push

**Pregunta:** Origen de la lista de secciones destino

| Option                             | Selected |
| ---------------------------------- | -------- |
| Lista curada en código, compartida | ✓        |
| Todas las rutas del router         |          |
| Vos decidís                        |          |

**User's choice:** Lista curada en código, compartida api+admin+app, validada server-side

**Pregunta:** Texto pre-cargado de WhatsApp ventas

| Option                                | Selected |
| ------------------------------------- | -------- |
| Editable por notificación con default | ✓        |
| Texto global fijo                     |          |
| Sin texto                             |          |

**User's choice:** Editable por notificación, con default global; mismo campo para pop-ups y tarjetas

**Pregunta:** App vieja recibe destino WhatsApp

| Option                                       | Selected |
| -------------------------------------------- | -------- |
| Cae en Mi Templo                             | ✓        |
| Bloquear envío hasta umbral de actualización |          |
| Aceptar 404                                  |          |

**User's choice:** Cae en Mi Templo (payload con ruta nueva + fallback; app vieja ignora el campo nuevo)

**Pregunta:** Salto a WhatsApp al tocar la push

| Option                        | Selected |
| ----------------------------- | -------- |
| Directo a WhatsApp            | ✓        |
| Pantalla intermedia con botón |          |
| Vos decidís                   |          |

**User's choice:** Directo a WhatsApp, app queda en Mi Templo por detrás; botón de respaldo si el salto automático se bloquea

---

## Arbitraje de pop-ups

**Pregunta:** Prioridad entre pop-ups el mismo día

| Option                                       | Selected |
| -------------------------------------------- | -------- |
| Vencimiento > aviso > calificación > mejoras | ✓        |
| Calificación > vencimiento > aviso > mejoras |          |
| Prioridad configurable por aviso             |          |

**User's choice:** Orden fijo server-side: vencimiento > aviso > calificación > mejoras; el editor del admin ADVIERTE ese orden

**Pregunta:** Significado de 'una vez por semana' para calificación

| Option            | Selected |
| ----------------- | -------- |
| 7 días móviles    |          |
| Semana calendario |          |
| Día fijo          |          |

**User's choice:** Ventana móvil de 7 días desde la última vez pedida, server-side, EDITABLE: la calificación es un TIPO DE AVISO de sistema con regularidad configurable

**Pregunta:** Qué hacer con el pop-up de mejoras

| Option                             | Selected |
| ---------------------------------- | -------- |
| Se mantiene con prioridad más baja |          |
| Pasa a ser un aviso editable       | ✓        |
| Se apaga                           |          |

**User's choice:** Pasa a ser un aviso más (de sistema), editable en texto, frecuencia y destino

**Pregunta:** Frecuencias por socio de un aviso

| Option                                | Selected |
| ------------------------------------- | -------- |
| Una vez / cada N días / cada apertura | ✓        |
| Solo una vez o diario                 |          |
| Vos decidís                           |          |

**User's choice:** Una vez / cada N días / cada apertura; 'cerró' y 'tocó' registrados server-side por socio (alimenta métricas)

---

## Editor de avisos y alcance

**Pregunta:** Imagen en pop-ups

| Option                          | Selected |
| ------------------------------- | -------- |
| Solo texto en v1                | ✓        |
| Imagen opcional desde el inicio |          |
| Vos decidís                     |          |

**User's choice:** Solo texto en v1 (título, mensaje, botón, destino); imagen diferida

**Pregunta:** Alcance

| Option                           | Selected |
| -------------------------------- | -------- |
| Sede, país y segmento            | ✓        |
| Solo sede y país                 |          |
| Lo anterior más estado del socio |          |

**User's choice:** Sede, país y segmento de comportamiento (óptima/regular/alerta/ausente, los mismos de las push); vacío = todos

**Pregunta:** Vencimiento de plan como aviso de sistema

| Option                              | Selected |
| ----------------------------------- | -------- |
| Entra, solo texto y botón editables |          |
| Queda fuera del editor              |          |
| Entra con frecuencia editable       |          |

**User's choice:** Entra al listado de avisos de sistema con solo texto y botón/WhatsApp editables; regla de disparo (≤3 días, diario, supresión por cobertura) fija en código

**Pregunta:** Tarjetas editables del carrusel de Mi Templo

| Option                             | Selected |
| ---------------------------------- | -------- |
| Mejoras editable + tarjetas libres |          |
| Solo mejoras                       |          |
| Todas las fijas editables en texto | ✓        |

**User's choice:** Todas las fijas (mejoras, referidos, upsell, programa) con copy editable (título, texto, botón, destino); sus reglas de visibilidad siguen en código. **Revisado después del cierre:** Franco pidió sumar también las tarjetas libres (avisos con ubicación tarjeta que se agregan al carrusel).

---

## Avisos en TV

**Pregunta:** Modo manual: disparo y ubicación

| Option                                                   | Selected |
| -------------------------------------------------------- | -------- |
| Botón en la tira, pantalla completa en cualquier momento |          |
| Solo en los extremos                                     |          |
| Vos decidís                                              |          |

**User's choice:** Botón AVISO grande en la tira de bloques del control (solo si hay aviso activo para la sede); pantalla completa sobre el velo crema/charcoal según hora, en cualquier momento; bloque en curso queda detrás

**Pregunta:** Duración en pantalla

| Option                    | Selected |
| ------------------------- | -------- |
| Hasta que el profe avance | ✓        |
| Tiempo fijo configurable  |          |
| Vos decidís               |          |

**User's choice:** Hasta que el profe avance a otro bloque o vuelva (sin timer)

**Pregunta:** Contenido del aviso TV

| Option                               | Selected |
| ------------------------------------ | -------- |
| Título + cuerpo estilo cápsula/frase | ✓        |
| Texto + imagen o logo                |          |
| Vos decidís                          |          |

**User's choice:** Título + cuerpo, estilo cápsula/frase (Cinzel, oro, velo); sin imagen

**Pregunta:** Vigencia del aviso TV

| Option                              | Selected |
| ----------------------------------- | -------- |
| Activo/inactivo + vigencia opcional |          |
| Solo activo/inactivo manual         | ✓        |
| Vence solo al fin del día           |          |

**User's choice:** Solo activo/inactivo manual (sin fechas); alcance por sedes (vacío = todas)

---

## Número de ventas y tenancy

**Pregunta:** Dónde vive el número de WhatsApp de ventas

| Option                                   | Selected |
| ---------------------------------------- | -------- |
| Configurable por país en tenant_settings | ✓        |
| Configurable por sede                    | ✓        |
| Sigue hardcodeado en la app              |          |

**User's choice:** Configurable por país del tenant en tenant_settings, editable desde Comunicaciones; la API lo resuelve por la sede del socio y lo manda con el destino

**Pregunta:** Fallback en la app si no recibe número

| Option                               | Selected |
| ------------------------------------ | -------- |
| Usa el hardcode actual como fallback |          |
| Sin número no hay botón              |          |
| Vos decidís                          |          |

**User's choice:** La app prefiere el número del servidor y cae al hardcode AR/ES actual; Reservas, Volver y vencimiento pasan a la misma fuente

**Pregunta:** Nacimiento de los avisos de sistema por tenant

| Option                     | Selected |
| -------------------------- | -------- |
| Migración + alta en wizard |          |
| Lazy al primer uso         |          |
| Vos decidís                |          |

**User's choice:** Migración los crea con el copy actual para los tenants existentes + el wizard de alta de tenant (fase 182) los crea para los nuevos

**Pregunta:** Gating por módulo

| Option                      | Selected |
| --------------------------- | -------- |
| Core con TV gateada         |          |
| Módulo nuevo comunicaciones |          |
| Todo core                   |          |

**User's choice:** Core para todos los tenants; solo la pestaña Avisos en TV gateada por el módulo de TV de sucursal

---

## Métricas por aviso

**Pregunta:** Contadores por aviso

| Option              | Selected |
| ------------------- | -------- |
| Socios únicos       | ✓        |
| Impresiones totales |          |
| Ambos               |          |

**User's choice:** Socios únicos: alcanzados, cerraron, tocaron el botón (derivados del registro por socio que ya exige la frecuencia)

**Pregunta:** Dónde se ven

| Option                  | Selected |
| ----------------------- | -------- |
| Columnas en la lista    | ✓        |
| Lista + detalle por día |          |
| Vos decidís             |          |

**User's choice:** Columnas en la lista de avisos, como enviadas/abiertas en plantillas push; sin detalle

**Pregunta:** Lista de socios que tocaron

| Option                          | Selected |
| ------------------------------- | -------- |
| Sí, lista con nombre y teléfono |          |
| Solo contadores                 |          |
| Vos decidís                     |          |

**User's choice:** Sí: 'ver socios' por aviso con nombre y teléfono, con el patrón de WhatsApp de las bandejas actuales

**Pregunta:** Métricas de tarjetas

| Option             | Selected |
| ------------------ | -------- |
| Solo clics         | ✓        |
| Mismas que pop-ups |          |
| No miden           |          |

**User's choice:** Solo clics en el botón

---

## Permisos y menú

**Pregunta:** Quién edita Comunicaciones

| Option                 | Selected |
| ---------------------- | -------- |
| Dueño y admin          | ✓        |
| Solo dueño             |          |
| Dueño, admin y coaches |          |

**User's choice:** Dueño y admin (mismos roles que la ruta Notificaciones hoy); coaches no la ven

**Pregunta:** Coach y avisos de TV

| Option                            | Selected |
| --------------------------------- | -------- |
| Solo dispararlos desde el control |          |
| También crear y activar           |          |
| Vos decidís                       |          |

**User's choice:** Solo los dispara desde el control (botón AVISO si hay uno activo para su sede); crear/editar/activar es del admin

**Pregunta:** Ubicación en el menú

| Option                                      | Selected |
| ------------------------------------------- | -------- |
| Reemplaza a Notificaciones en Configuración | ✓        |
| Entrada propia en Alumnos                   |          |
| Vos decidís                                 |          |

**User's choice:** Reemplaza a Notificaciones en la categoría Configuración; ruta /comunicaciones con redirect desde /notificaciones

**Pregunta:** Vista previa en el editor

| Option                     | Selected |
| -------------------------- | -------- |
| Vista previa simple inline | ✓        |
| Sin vista previa           |          |
| Vos decidís                |          |

**User's choice:** Vista previa simple inline del pop-up, tarjeta o placa de TV con el estilo real

---

## Claude's Discretion

- Destinos no disponibles para el socio → fallback a Mi Templo (área ofrecida, no seleccionada).
- Modelo de tablas, transporte del destino en el payload FCM, mecanismo del aviso en el poll del TV, estados del aviso, copy de la advertencia de prioridad, ubicación del número de ventas dentro de la sección.

## Deferred Ideas

- Imagen en avisos pop-up (subida a R2)
- Filtros de alcance por estado del socio (lead, vencido, freemium)
- Imagen/placa gráfica en avisos de TV
- Vigencia por fechas en avisos de TV
