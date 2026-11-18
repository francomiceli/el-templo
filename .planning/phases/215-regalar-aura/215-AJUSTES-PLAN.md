# Fase 215: ajustes de la revisión con Franco (2026-11-18)

Origen: `DECISIONES-REVISION-2026-11-18.md`, en esta misma carpeta. Ese archivo manda: en cada ajuste
figura su número (el de la decisión o el de la lista de 40). Lo implementan tres ejecutores, en orden
y de a uno: **A**, después **B**, después **C**. Los sellos de antigüedad (#18) y la celebración chica
(#33) **no van en este plan**: esperan a que Franco elija el boceto (sketches 036 y 037). Son el plan D.

Reglas: `215-EJECUTORES.md` completo, con estos cambios:

- **El `node_modules` de la API ya no es un symlink.** Es una instalación propia de `et-comunidad` e
  incluye `sharp@0.35.5`, commiteado en `938a39ec6`. Sigue prohibido instalar cualquier otra cosa.
- Si hace falta una migración, se toma el número libre siguiente a la 0351 (la **0348 está reservada**) y
  se verifica con `git fetch` contra `origin/master` y `origin/staging`. Las migraciones nunca se aplican
  en la base local.
- Cada ajuste lleva su test: unitario en `test/unit/` si es lógica pura; si no, de integración, que corre
  en CI. En el admin no hay vitest local, así que sus cambios se verifican con `vue-tsc` y lint.
- Un commit por ajuste o por grupo chico, con el número de decisión en el asunto, por ejemplo
  `fix(215): ME-01 avisos sin nombre si la otra persona está oculta`.

---

## Plan A: servidor (API)

1. **ME-01 y #38: anónimo si está oculto o no tiene nombre.** En cada lugar donde se muestra a la otra
   persona de un regalo, si esa persona **hoy** está oculta de las listas o no tiene nombre de pila, no
   se manda nombre, inicial ni foto. El texto tampoco dice "Alguien": nombra solo la cantidad y el
   motivo, por ejemplo "Te dieron 1 de Aura por Buena energía" o "Diste 1 de Aura por Constancia".
   - Vale para el receptor (bandeja, detalle de Aura, push) y para quien regaló (card de hoy,
     `listGivenToday`).
   - Archivos de partida (`215-REVIEW.md` ME-01): `aura/member-routes.ts`,
     `notifications/inbox-routes.ts` y `aura/gift-service.ts`.
   - La visibilidad se toma de la misma fuente que usa la lista de anotados (`effectiveVisible` o
     equivalente).
   - En la push del momento: si quien regala no tiene nombre, se usa el texto sin nombre. El profe sin
     nombre sigue siendo "Tu profe te dio Aura".
   - Tests: los cuatro cruces (dador oculto, receptor oculto, sin nombre, normal).
2. **Decisión 5: re-codificar la foto con `sharp`.** Al confirmar la subida de la foto propia, el
   servidor:
   - descarga el objeto;
   - verifica la firma (JPEG `FF D8 FF`; PNG o WebP solo si la app los manda);
   - aplica `.rotate()` según la orientación;
   - limita el tamaño (máximo 1024 px de lado);
   - re-codifica a JPEG sin metadatos, con `sharp` por defecto y **sin** `withMetadata`;
   - y sobrescribe el objeto.

   Si la firma no es válida o `sharp` falla, la foto se rechaza con un error claro y no queda en la cola.

   Va como función pura testeable en `test/unit/`, con una imagen generada por `sharp` que traiga EXIF y
   GPS: después de re-codificar, `metadata()` no debe tener `exif`. Archivo:
   `members/profile-photo-service.ts`.
3. **#2: reintentos de la copia de la foto de ficha.** `members/ficha-photo-mirror.ts`: hoy una falla
   deja la fila `fallida` para siempre. Debe reintentar en las corridas siguientes del job hasta **4
   intentos** en total y recién ahí quedar `fallida`. Si hace falta una columna de intentos, va por
   migración. Los logs no llevan URLs. Tests del conteo de intentos.
4. **#15: sesiones con solo bloques alternativos.** `sessions/proposed-time.ts`: si los bloques hechos
   son todos alternativos (`COMBOS_II_ALT`, `TECNICA_II_ALT` o los que defina `isAlternative`), el tiempo
   propuesto se calcula sobre esos bloques y la regla del 80 % se aplica igual. Una sesión sin ningún
   bloque hecho sigue dando `sin_bloques`. Tests unitarios en `evaluateTrainingAura`.
5. **#16: check-in forzado de noche con la fecha local de la sede.** Hay que encontrar dónde el staff
   fuerza un check-in. Hoy la fecha se guarda en UTC (supuesto técnico 2 de `214-DECISIONES-AUTONOMAS.md`
   §3) y tiene que guardarse con la fecha local de la sede. Hay helpers de zona horaria por sede en el
   código, del tipo `todayInTz`. `CONVERT_TZ` no sirve en producción. Test: un check-in forzado a las
   23:30 hora argentina queda con la fecha de ese día y el tope del día lo cruza bien con el Aura de la
   app.
6. **Texto 4: sin push al rechazar una foto.** Se quita la push del rechazo. El estado y el motivo
   siguen visibles en Perfil ("Motivo: X. Podés subir otra."). Se ajustan los tests que esperaban la
   push.
7. **Texto 5: movimientos de Aura.** En `aura/movement-labels.ts`:
   - `streak_bonus` con ref N pasa a "N días seguidos entrenando en la app"; sin ref, "Días seguidos
     entrenando en la app".
   - `goal_plan_completion` pasa a "Sesión de tu plan online".

   Se actualizan los tests de las etiquetas.

## Plan B: app de alumnos, con el servidor que haga falta

1. **#30: interruptor "Regalos de Aura" en Perfil.** Va junto a los demás interruptores de
   notificaciones. Apagado, no se manda la push de regalos recibidos, pero el aviso queda igual en la
   bandeja y en el Aura. Si hay que sumar una categoría o una preferencia de notificación en la API, se
   sigue el patrón de las existentes. Arranca encendido para todos. Tests de API: con la preferencia
   apagada no hay push y sí hay fila en la bandeja.
2. **#28 y #37: motivo de anulación en la bandeja.** Donde hoy dice "Anulado", se agrega el motivo
   según `aura_gifts.void_cause`:
   - "Anulado: la asistencia se corrigió" cuando la causa es una asistencia deshecha o anulada;
   - "Anulado por el staff" cuando lo anuló el staff.

   Sin push al anular. Si la API no expone la causa en la bandeja y en el detalle, se agrega.
3. **#31: texto para los ocultos.** Si el alumno no da Aura **solo porque está oculto**, en el lugar de
   la oferta (la card de hoy, debajo de "Estirar") ve: "Para dar Aura, activá *Aparecer en las listas*
   en tu Perfil". El texto lleva al interruptor. Si no tiene plan o viene por Wellhub, no ve nada. El
   motivo de no poder regalar tiene que venir de la API; no se adivina en la app.
4. **Texto 2: aviso de la primera vez en la lista.** El texto no cambia. "Entendido" pasa a ser un botón
   grande, primario y de ancho completo. "Ocultarme" pasa a ser un texto subrayado, chico y debajo del
   botón.
5. **#6: normas de la foto.** Se muestran la primera vez y después de un rechazo. No vuelven a aparecer
   en cada "Elegir otra" si ya las aceptó y no le rechazaron ninguna foto después.
6. **#17: "Subí tu foto y sumá Aura".** En el encabezado de Mi Templo, sin foto propia aprobada ni foto
   de ficha, debajo del nombre aparece "Subí tu foto y sumá Aura" y lleva a subirla. Con foto, se muestra
   la antigüedad, como hoy. Con la foto en revisión, la antigüedad. Sin nombre, sigue "Atleta". Con Aura
   en 0 se muestra el 0.
7. **#19: título siempre visible.** "EL TEMPLO" no se oculta en ningún ancho, ni el corte de 420 px de
   la 214 ni el de 460 px de la 215. En celulares angostos, el selector de nivel de Entrenar muestra solo
   el ícono del nivel, sin el nombre. Hay que comprobar en el CSS que en 320, 360 y 375 px entren el
   título, el selector, la campana y el perfil sin cortarse.
8. **#35: marcar leído al entrar.** Al abrir la pantalla Notificaciones se marcan todos como leídos y la
   campana vuelve a 0, con el endpoint de "Marcar todo como leído" que ya existe. Los avisos que eran
   nuevos se ven resaltados esa vez y el resaltado se calcula al entrar. El botón "Marcar todo como
   leído" se saca si deja de tener sentido.
9. **#39: se saca la frase "Solo vos ves este detalle"** del detalle de Aura.

## Plan C: admin, con el servidor que haga falta

1. **Página "Comunidad" en Gerencia.**
   - Nueva entrada **"Comunidad"** en el grupo **"Gerencia"** de `config/templo-config.ts`, con
     pestañas **Fotos** y **Regalos de Aura**, al estilo de Caja con su pestaña Egresos (copiar ese
     patrón).
   - Salen de "Gestión" los ítems sueltos "Fotos" y "Regalos de Aura".
   - Permisos por pestaña, los mismos de hoy: Fotos para todo el staff (`ALL_STAFF_ROLES`) y Regalos
     para `owner`, `admin` y `admin_sede`. El menú muestra "Comunidad" si el rol ve al menos una pestaña.
     Si ve una sola, no hay barra de pestañas.
   - La pelotita de fotos pendientes y reportadas pasa a "Comunidad".
   - Las rutas viejas `/alumnos/fotos` y `/alumnos/regalos` redirigen a la pestaña que corresponde, por
     si hay enlaces guardados.
2. **ME-06: conteo de regalos por profe.** En la pestaña Regalos, un cuadro con cuántos regalos dio
   cada profe en la semana (lunes a domingo, hora de la sede), con las semanas anteriores navegables y
   el total. Respeta las sedes del admin de sede. Endpoint de API con test de integración, incluido el
   recorte por sede.
3. **#26: botón de regalo del profe visible para todo el staff.** En el panel de asistencia, el botón de
   dar Aura lo ve todo el staff que entra al panel. Solo lo pueden usar los profes con la sede de la
   clase (la regla de hoy). Para el resto se ve deshabilitado, con la nota "Solo los profes pueden dar
   Aura". La API no cambia: sigue rechazando a quien no es profe.

## Verificación del orquestador después de cada plan

- El worktree queda limpio, sin archivos sin trackear salvo el `.tsv` de siempre.
- API: `npx tsc --noEmit` da 0. App: 20 errores de base, ninguno nuevo. Admin: 36, ninguno nuevo.
- `pnpm lint:tenant` en la API y lint en la app y el admin.
- Tests unitarios nuevos en verde con la configuración unitaria.
