# Brief para Fran — Rebranding de Referidos a Invitaciones + reglas nuevas

**De:** Nacho
**Para:** Fran (para trabajar con Claude Code)
**Fecha:** 6 de octubre de 2026
**Módulo:** App del socio (sistema de referidos) + Administrador (leads)

---

## 1. Contexto

El sistema de referidos de la app ya está desarrollado: link de referido, accesos gratis y descuentos para el que refiere y para el referido. Ahora queremos:

1. **Rebrandearlo como "Invitaciones".** El socio no "refiere", **invita a alguien a entrenar**.
2. **Ajustar las reglas** para cerrar abusos, sobre todo el de regalar clases gratis siempre a las mismas personas que nunca compran.
3. **Conectarlo con el seguimiento comercial**, para que cada invitado entre al pipeline de leads y las administrativas le hagan seguimiento.

Antes de tocar nada, necesito que **releves qué está codeado hoy** (ver sección 9). Este brief describe cómo tiene que comportarse el sistema al final. Si algo ya funciona así, se deja como está.

---

## 2. Rebranding (copy e interfaz)

**Regla de interfaz:** en toda la app y en el Administrador, "referido/referir/referidos" se reemplaza por **"invitado/invitar/invitaciones"**. Esto incluye botones, pantallas, notificaciones, mensajes del link compartido, reportes y filtros.

| Antes | Después |
|---|---|
| Referí a un amigo | Invitá a alguien a entrenar |
| Mis referidos | Mis invitados |
| Link de referido | Link de invitación |
| Descuento por referido | Descuento por invitación |

- Si la URL del link incluye "referido" o algo similar, se puede migrar a una ruta de invitación. **Los links ya compartidos tienen que seguir funcionando** (redirección o compatibilidad).
- El nombre interno de tablas y variables lo decidís vos. El rebranding es obligatorio solo en lo que ve el usuario.

---

## 3. Quién puede invitar

El socio tiene que estar **activo y al día** con su membresía. Si no lo está, no puede generar ni activar invitaciones.

**Cupo: 2 invitaciones por mes calendario.**

- El cupo se consume **cuando la invitación se activa**, es decir, cuando el invitado se registra y queda habilitado. No se consume al compartir el link.
- Si comparto el link y nadie lo activa, no pierdo cupo.
- El cupo no se acumula de un mes al siguiente.
- El socio ve en la app cuántas invitaciones le quedan este mes.

---

## 4. Quién puede ser invitado

Una persona puede ser invitada solo si se cumplen **todas** estas condiciones:

| Condición | Regla |
|---|---|
| Historial como socio | Nunca fue socia, **o** lleva **≥ 6 meses** sin membresía activa |
| Ventana de reinvitación | No recibió ni usó una invitación en los últimos **90 días**, **la haya invitado quien sea** |
| Sesión de prueba comercial | **No bloquea.** Alguien que ya hizo la prueba gratuita por el canal comercial puede ser invitado igual |

**Importante:** la ventana de 90 días es **por persona invitada, no por par invitador–invitado**. Si no fuera así, un grupo de socios podría ir rotándose a la misma persona y regalarle clases gratis todos los meses.

### Identificación del invitado (punto crítico)

Para que las reglas de arriba funcionen, el invitado tiene que quedar identificado con un dato confiable, **teléfono y/o DNI, nunca solo el nombre**, y ese dato tiene que poder cruzarse contra la base de socios (para saber si es o fue socio) y contra el historial de invitaciones.

- Si hoy el registro por link no pide ese dato, hay que agregarlo como obligatorio.
- Si el invitado ya existe en el sistema (como ex socio o como lead), la invitación se vincula a ese registro. No se crea un duplicado.

---

## 5. Beneficio del invitado (accesos gratis)

- **3 accesos gratis.**
- Se usan en **cualquier sede** (Mar del Plata y Barcelona).
- Vigencia: **10 días hábiles** desde la activación de la invitación. Si vencen sin usarse, se pierden.
- Si el invitado quiere más, tiene que comprar una membresía.

---

## 6. Descuentos por conversión

### Regla base

Cuando un invitado **compra y paga una membresía**:

- **El invitado** paga con **10% de descuento**.
- **El invitador** obtiene **10% de descuento** en su membresía.

### El descuento es recurrente y condicionado

El descuento **no es solo para el primer pago**. Se mantiene en cada renovación **mientras las dos personas sigan entrenando**, es decir, mientras ambas tengan membresía activa y al día.

- Si **cualquiera de las dos** se cae, el descuento se pierde **para las dos**.
- La baja aplica **desde la próxima renovación**. No es retroactiva.
- (Según tengo entendido, esta lógica ya está codeada. Verificalo en el relevamiento.)

### Acumulación del invitador

Cada invitado activo suma **10%** al descuento del invitador.

| Invitados activos (del invitador) | Descuento del invitador |
|---|---|
| 1 | 10% |
| 2 | 20% |
| 3 | 30% |
| n | n × 10% (hasta el tope) |

El descuento del invitador se recalcula en cada renovación según cuántos de sus invitados siguen activos en ese momento. El del invitado es fijo: 10%, mientras él y su invitador sigan activos.

### Tope del descuento del invitador — ⚠️ decisión pendiente de Nacho

Como el beneficio es recurrente y se acumula, sin tope un socio con 10 invitados activos entrenaría gratis. **El tope tiene que ser un parámetro configurable.** El valor inicial lo cierro yo antes de salir a producción. Mientras tanto, dejalo configurable con **50%** como valor por defecto.

### Convivencia con otras promos

El descuento por invitación **no se acumula** con otras promociones o descuentos: se aplica el mayor.

---

## 7. Lo que ve el socio en la app

Una sección **"Mis invitados"** con:

- Invitaciones disponibles este mes (ej.: "Te quedan 1 de 2 invitaciones").
- Botón para compartir el link de invitación.
- Lista de sus invitados con su estado:

| Estado | Significado |
|---|---|
| Invitado | Activó la invitación, todavía no usó accesos |
| Entrenando | Está usando sus accesos gratis |
| Vencido | Se le vencieron los accesos sin comprar |
| Socio activo | Compró y sigue activo, **suma descuento** |
| Inactivo | Compró pero se dio de baja, ya no suma |

- Su **descuento actual** y cuántos invitados activos lo generan.

Todos los estados se actualizan **solos** a partir de los datos que ya existen en el sistema (activación, asistencias, compras, estado de membresía). Nadie los carga a mano.

---

## 8. Administrador: invitados al pipeline de leads

Cada invitación activada **crea o actualiza automáticamente un lead** en el Administrador para que las administrativas le hagan seguimiento comercial.

- Origen del lead: **"Invitación"**, con el **invitador vinculado** (nombre + link a su ficha).
- Datos visibles: fecha de activación, accesos usados (x/3), fecha de vencimiento de los accesos y sede donde entrenó.
- El estado del lead avanza solo:
  - Activa la invitación → lead nuevo.
  - Usa accesos → en prueba.
  - Compra → **ganado**.
  - Vencen los accesos sin compra → queda para seguimiento, no se cierra automáticamente.
- Filtro por origen "Invitación" en el listado de leads.

**Opcional (si es barato suma, si no va después):** un reporte simple del programa con invitaciones activadas por mes, tasa de conversión (invitados que compran / invitados que activan), invitados activos totales y monto total de descuentos otorgados por mes. Me sirve para calibrar el tope y la ventana.

---

## 9. Relevamiento previo (antes de codear)

Necesito que me pases un resumen corto de lo que hay hoy:

1. Qué reglas tiene implementadas el sistema de referidos: cupos, accesos, vigencias, descuentos y condición de "ambos activos".
2. Qué datos se piden al registrarse por link y si permiten identificar al invitado con teléfono o DNI.
3. Cómo se define hoy "socio activo" para el descuento (¿membresía vigente?, ¿al día con el pago?, ¿hay días de gracia?).
4. Volumen actual: cuántos referidos hay registrados y cuántos convirtieron.

Si encontrás diferencias con este brief, avisame antes de cambiar el comportamiento de descuentos que ya se están aplicando.

---

## 10. Parámetros configurables

Ningún valor de este brief va hardcodeado:

| Parámetro | Valor inicial |
|---|---|
| Invitaciones por socio por mes calendario | 2 |
| Accesos gratis por invitación | 3 |
| Vigencia de los accesos | 10 días hábiles |
| Ventana de reinvitación por persona | 90 días |
| Inactividad mínima para invitar a un ex socio | 6 meses |
| Descuento del invitado | 10% |
| Descuento del invitador por invitado activo | 10% |
| Tope del descuento del invitador | 50% (pendiente de confirmar por Nacho) |

---

## Migración de datos existentes

- Los referidos actuales pasan a ser **invitaciones**, conservando su historial y sus descuentos vigentes. **Nadie pierde un descuento que hoy tiene por el cambio de reglas.**
- Si algún socio queda por encima del tope nuevo por referidos previos, se le mantiene lo que tiene hasta que baje naturalmente (sin recortes retroactivos). Decime si hay casos.
- **Backup de las tablas involucradas antes de migrar.** Primero corré la migración sobre una copia y validá conteos contra los números del relevamiento (punto 9.4).
- No se borra ningún registro. Los referidos que nunca convirtieron quedan con su estado correspondiente.

---

## Resumen de definiciones que quedan de tu lado

1. **(Bloqueante) Relevamiento del sistema actual** (sección 9). Todo lo demás depende de esto.
2. **Identificador del invitado:** cómo garantizar teléfono o DNI en el registro y cómo deduplicar contra socios y leads existentes.
3. Cálculo de **días hábiles** con feriados distintos en Argentina y España (calendario por sede o región).
4. Cuándo y cómo se **recalcula** el descuento del invitador en cada renovación, y cómo se refleja en los cobros (incluida la domiciliación si aplica).
5. Compatibilidad de los **links viejos** de referido.
6. Mecanismo de actualización automática de estados (invitado y lead) a partir de activaciones, asistencias y compras.
7. Nombres internos de tablas y campos (el rebranding es obligatorio solo en la interfaz).

Cualquier duda me escribís.
