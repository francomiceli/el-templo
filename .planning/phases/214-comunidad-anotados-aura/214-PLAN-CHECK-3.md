## ISSUES FOUND

**Fase:** 214, planes 01 a 32 (tercera verificación, alcance completo)
**Resultado:** 0 blockers, 7 warnings, 6 info. Los problemas de las verificaciones 1 y 2 están cerrados salvo los puntos de abajo.

---

## 1. Cierre de los hallazgos anteriores

- **Blocker del repaso de D-49: CERRADO.**
  - Plan 04 `<repaso_d49>` y plan 31 reescriben el tope del día con tres condiciones. (a) Ese día hay una asistencia de 5 o de 10. (b) Ese día no hay ninguna asistencia con monto entre 1 y 4, que es la señal de D-64 ya aplicado. (c) La fila de app tiene `created_at` menor al `applied_at` de la 0344 más una hora.
  - Un día con app 3 y asistencia 2 ya no se toca.
  - El repaso vive en `.planning/phases/214-comunidad-anotados-aura/deploy-2/` y no en `src/db/migrations/`. El verify de plan 31 comprueba que no exista ningún `*repaso*` en migraciones.
  - El README explica cuándo y cómo moverlo.
  - El test cubre 8 casos: app 3 con asistencia 2, ventana de una hora, dos asistencias, idempotencia, saldo igual al ledger y guard de `;`.
- **Warning 1 (bloque 6 y `must_haves` de D-64): CERRADO en lo principal.** Los `must_haves` de los planes 04 y 10 ahora admiten que dos asistencias sumen 10. El bloque 6 usa la asistencia de menor monto, así que dos asistencias de 5 no cuentan como violación. Queda un residual (info 1).
- **Warning 2 (plan 17, caso de foto): CERRADO.** Ahora afirma URL firmada y `photoId` del espejo, alineado con los planes 13 y 14.
- **Warning 3 (`activeMemberExists` en `.select()`): CERRADO.** Plan 16 lo mueve a una segunda consulta con `.where()`.
- **Warning 4 (espejo de la ficha en rutas de lectura): CERRADO, con un riesgo nuevo (warning 1).** Plan 13 task 3 lo pasa a un job cada 15 minutos (`ficha-photo-mirror.ts`), con gate CON-04 y test. Ningún GET copia ni escribe.
- **Warning 5 (barrido de ids): CERRADO.** Plan 14 caso 9b usa ids mayores a 1000 y compara el segmento posterior a `avatars/{tenant}/`.
- **Warning 6 (baseline de `tsc`): PARCIAL.** Plan 01 ahora guarda `TYPECHECK-BASELINE.md`, pero los planes 02 a 18 no cambiaron su verify (warning 2 de esta verificación).
- **Warning 7 (scope): sin cambios.** El plan 12 sigue con 14 archivos, el 16 con 13, el 02 con 12 y el 19 con 11. Ver warning 7 de esta verificación.

---

## 2. Planes 19 a 30 contra el UI-SPEC

**Cada pantalla y sus estados tienen plan.**
- Pantalla 1, encabezado: plan 23 (con `AuraChip.vue`, `VeteranSeal` y `MainLayout`). Estados: cargando con esqueleto, con foto, sin foto, en revisión, aro dorado solo con ficha y 0 de Aura.
- Pantalla 2, selector de nivel: plan 24. Celular con pastilla oscura, ocultar el título bajo 420 px, `aria-haspopup` y `aria-label`. Escritorio con pastilla clara arriba de las pestañas.
- Pantalla 3a, fila "N anotados": plan 25. 3b y 3c, hoja y estados: plan 25. 3d, vista de foto y reporte: plan 26.
- Pantalla 4a y 4b, Perfil: plan 27. 4c, hoja de foto y normas: planes 20 (lógica) y 21 (hoja, `PhotoRulesDialog`, `MemberAvatar` y tokens).
- Pantalla 5, detalle de Aura: plan 22.
- Pantalla 6, celebración: plan 28.
- Pantalla 7, admin: planes 29 (datos) y 30 (página, ruta, menú).

**Textos, tokens y medidas.**
- Todos los planes de pantallas repiten la regla "textos EXACTOS del UI-SPEC, `$pd-*`, escala 4/8/16/24/32/48/64, Geologica nunca en 700, sin color con transparencia en textos".
- Los tokens nuevos (`$pd-aura-deep`, `$pd-gold-bright`, etc.) se crean en plan 21 en `_premium-card.scss`.
- Los montos salen de `AURA_AMOUNTS_UI` (plan 19) o del servidor. No hay "+5" ni "5 de Aura" escritos a mano en los textos.
- Las tres notas obligatorias del verificador del UI-SPEC están en los planes: glifo del nivel con la fuente actual (plan 24), aro blanco sin ficha (plan 23), rol Display con Montserrat 700 incluido.

**Datos de cada pantalla contra los planes 10 a 18.** Todos existen:
- `/me`: `auraEarned`, `photoUrl`, `photo { url, status, pendingUrl, rejectionReason }`, `communityVisible`, `communityNoticeSeen`, `memberSince`, `branchTimezone`.
- Anotados: `total`, `canSeeList`, `reason`, `attendees[]` con `photoId`, `hiddenCount` y `viewer`.
- Movimientos de Aura: `earned`, `movements` y `nextBefore`.
- Check-in: `auraAwarded`, `auraTotal`, `branchName`, `checkedInAt`.
- Admin: cola con `counts` y `reason` obligatorio al rechazar.
- `rejection_reason` está en el schema del plan 12 y se devuelve en el plan 15. La decisión D-69 (motivo del rechazo) quedó implementada de punta a punta en los planes 12, 15, 19, 27 y 30.

**Accesibilidad, tamaños táctiles y `prefers-reduced-motion`.**
- Todos los planes mencionan tocables de 44 o más y `aria-label` del UI-SPEC.
- Las hojas usan `:transition-duration="reducedMotion ? 0 : 280"` (planes 21, 22 y 25).
- La celebración y la ficha respetan movimiento reducido (planes 23 y 28).
- Excepción en el warning 3.

---

## 3. Cobertura de los criterios y de las decisiones

**Criterios del ROADMAP.**
- 1 y 2: planes 16 y 17 (servidor) y 25 (pantalla).
- 3: planes 11 y 18 (servidor) y 22, 23 y 27 (pantallas).
- 4: planes 02, 03, 04, 05 y 06, con el repaso en el 31.
- 5: planes 08, 09 y 10.
- 6: plan 07.
- 7: planes 12 a 15 (servidor) y 20, 21, 29 y 30 (pantallas).
- 8: planes 23 y 24.
- 9: consulta 07 del plan 01 y los gates del plan 32.
- 10: UAT del plan 32. Es manual en teléfono real e iOS por naturaleza.

**Decisiones vigentes.** Todas tienen al menos un plan, salvo estas dos:
- **D-67 (lista de cambios para Apple y Google).** El plan 32 dice que "la escribe el orquestador" y el UAT solo la recuerda. No hay ninguna tarea de plan que la produzca, y el plan no puede escribir en `.docs/` del checkout principal. Ver warning 4.
- **D-29 (fecha real de los 367 importados).** Solo existe la consulta 04 (plan 01). La corrección depende del resultado y de que Franco la corra o tenga el archivo del sistema anterior. Es un pendiente conocido, no un hueco del plan.

D-15 y D-54 revocadas: ningún plan las implementa. D-44 sin interruptor, D-52 sin etiquetas, D-58 sin condición por rol: respetadas.

---

## 4. Ejecutabilidad en cadena

- **Dependencias.** Lineales 01 a 32, con `wave` igual al número. No hay archivos pisados: `MainLayout.vue` pasa por 23 y 24, `AttendeesSheet.vue` por 25 y 26 y `templo-config.ts` por 29 y 30, todos en orden. Los planes de pantallas usan solo lo que crean los anteriores: el 21 antes de 23 y 27, el 22 antes de 23 y 27, el 25 antes del 26.
- **Reglas de ejecución.** Todos los planes de pantallas repiten sin push, sin bump, sin instalar, tests en foreground con `timeout 300` y uno a la vez. Los gates de la app y el admin comparan contra la línea de base con `vue-tsc` del proveedor.
- **Aceptación sin la suite de integración.** Las pantallas se verifican con lint, `vue-tsc`, greps de textos y de tokens y seis tests unitarios puros de la app (`tenure`, `aura-format`, `avatar-image`, `photo-messages`, `attendees-view`, `count-up`).

---

## 5. Privacidad y seguridad en las pantallas

- **Apellido, rol y origen.** La hoja usa `attendeeName` (nombre de pila e inicial del apellido, o "Vos"). El schema del plan 17 no manda rol ni origen. El admin sí muestra apellido completo, como pide el UI-SPEC.
- **Detalle de Aura.** Solo del dueño: `getMovements` no recibe ningún id y la ruta es del JWT (plan 18).
- **Subida de foto.** La app nunca sube el original: `toAvatarJpeg` recorta por canvas a 480 px y re-codifica a JPEG 0,82, así que no lleva EXIF ni ubicación. El único `body` del PUT es el blob resultante. Hay verificación manual con una foto con GPS en el UAT (plan 32) y el texto de cámara de iOS menciona la foto de perfil. El tope de 8 MB del servidor responde con un mensaje accionable y nunca dice "pesada".
- **Errores de subida.** Se traducen a los textos del UI-SPEC y se loguea sin la URL firmada.

---

## 6. Warnings

**1. [Plan 13, tarea 3] El job puede perder una foto de ficha para siempre.**
- `members/routes.ts` guarda `users.photo_url` al generar la URL de subida, antes de que termine el PUT.
- El job (cada 15 minutos) selecciona a todo usuario cuya `photo_url` no tenga espejo. Si corre entre la URL y el PUT, `copyFromPublic` da `false`, inserta una fila `fallida` y esa URL no se reintenta nunca.
- Cada subida del staff genera una URL nueva con timestamp, así que la foto recién subida sin espejo quedaría fuera hasta que el staff vuelva a subirla.
- **Corrección:** ignorar las `photo_url` cuyo timestamp embebido (`{userId}-{ts}`) tenga menos de 15 minutos, o dejar la fila `fallida` reintentable (por ejemplo hasta 3 veces separadas por una hora) en vez de definitiva.

**2. [Planes 02 a 18] La línea de base de `tsc` no llega a los verify.**
- El `node_modules` del proveedor no tiene `@fastify/rate-limit` (`package.json:35`), así que `tsc` de la API no da 0 ya en la base. Plan 01 ahora registra la línea de base en `TYPECHECK-BASELINE.md`.
- Pero 17 planes siguen con `<automated>` de la forma `pnpm exec tsc --noEmit && pnpm lint:tenant && …`, que exige código 0. El primer plan de servidor ya fallaría y los ejecutores quedan sin un criterio objetivo.
- Plan 17 pide verificar `fastify.rateLimit` en `node_modules/@fastify/rate-limit/types`, que no existe.
- **Corrección:** en `<lessons>` de los planes de servidor, definir el gate como "`tsc` sin errores nuevos respecto de `TYPECHECK-BASELINE.md`", o un script chico que compare la cantidad. Para el plan 17, asumir el decorador sin poder tiparlo. Sin instalar nada.

**3. [Plan 23, tarea 2] Afirma algo falso sobre el sello.**
- Dice "la animación existente (que ya respeta movimiento reducido)". `VeteranSeal.vue` anima `veteran-seal-pop` (líneas 129-134) y no tiene ningún `prefers-reduced-motion`.
- El UI-SPEC (Accesibilidad) exige apagar "el pop del sello que ya existe".
- **Corrección:** el plan 23 agrega `@media (prefers-reduced-motion: reduce) { animation: none }` sobre `veteran-seal--pop` y lo agrega al verify.

**4. [Plan 32] D-67 no tiene tarea.**
- La lista de cambios para Apple y Google (política de privacidad, etiquetas, texto del permiso, notas para el revisor, reglas de contenido de usuario) no la produce ningún plan, y es un entregable pedido por Franco.
- **Corrección:** sumar a plan 32 una tarea que escriba `214-TIENDAS.md` en la carpeta de la fase, a partir de `214-RESEARCH.md` §1 y de los textos del UI-SPEC, para que el orquestador la copie a `.docs/`.

**5. [Plan 01, consulta 08] Calibración de la regla del 80 % y mensaje al staff.**
- La consulta 08 debe correrla Franco antes del plan 08. En modo autónomo (D-68) no hay quien la corra, y el plan 08 procede igual con la fórmula (3 s por repetición, 60 s mínimo por bloque).
- **Corrección:** anotar en `214-DECISIONES-AUTONOMAS.md` §4 que la regla sale sin calibrar, y que el log `Regla de Aura de la sesión` es el sustituto para medirla en las primeras semanas.

**6. [Plan 27 y UI-SPEC] El motivo del rechazo en Perfil no tiene texto aprobado.**
- Plan 27 inventó "Motivo: {etiqueta}. Podés subir otra." (registrado en `214-DECISIONES-AUTONOMAS.md` §5). Aceptado por D-68, pero queda como texto no aprobado que se publica en la app.

**7. [Scope Sanity] Planes con más de 10 archivos.** Plan 12 (14), plan 16 (13), plan 02 (12) y plan 19 (11). Todos con 2 o 3 tareas y por debajo del umbral de blocker (15).

---

## 7. Info

1. **Bloque 6 de la consulta 05.** Cuenta los usuario-días con `app > 3`, y el historial viejo puede tener días con dos sesiones de app, porque antes de la fase 214 no había tope diario. Podrían quedar filas que impidan llegar a 0. Conviene tratarlas como informativas.
2. **Reversa histórica.** Si se deshace una asistencia ya re-valorizada a 5, el día baja a 0 y no a 3.
3. **Carrera app y plan a medida.** La ventana de la lectura `otherAppAuraToday` no está declarada en el plan 08.
4. **Job del espejo.** Con 50 fotos por pasada y por gimnasio, un backlog grande al lanzar tarda horas. Sin impacto funcional.
5. **Plan 14 caso 9b.** Usa `ALTER TABLE users AUTO_INCREMENT` en la base de test: es DDL con commit implícito dentro de una suite compartida. Funciona, pero es frágil; sembrar un usuario con `id` explícito sería más seguro.
6. **Plan 01.** La acción dice "tres archivos" y ahora son cuatro (04, 06, 07 y 08).

---

## 8. Resumen de lo que no está cubierto

- **D-67:** sin tarea de plan (warning 4).
- **D-29:** solo la consulta, pendiente de Franco.
- **SC-10 (teléfono real, iOS incluido):** solo el UAT manual del plan 32.
- **SC-9, parte "después":** solo la nota de correr la consulta 07 después del lanzamiento, en plan 32.
