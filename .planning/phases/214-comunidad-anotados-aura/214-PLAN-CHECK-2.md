## ISSUES FOUND

**Fase:** 214, planes 01 a 18 (segunda verificación, alcance parcial: servidor, datos y lógica)
**Resultado:** 1 blocker, 6 warnings, 6 info. Los 4 blockers del primer informe quedaron cerrados.

---

## 1. Los 4 blockers anteriores

| # | Estado | Evidencia |
|---|---|---|
| 1. Bloques ALT | CERRADO | Plan 08 task 1: `requiredBlockRoles` y `proposedSecondsForSession` descartan `ALTERNATIVE_BLOCK_ROLES` (`sessions/types.ts:73`) antes de todo. El test unitario fija el número exacto con `COMBOS_II_ALT`. Plan 09 agrega el caso de integración (`INITIUM`, `COMBOS_I`, `COMBOS_II`, `COMBOS_II_ALT`, `STRETCHING`). La consulta 08 del plan 01 también los excluye. |
| 2. Plan vigente | CERRADO en el papel, con un riesgo nuevo (warning 3) | Plan 16: `listAccess` recibe `hasPlanInEffect` y se calcula con `activeMemberExists`. El verify prohíbe `status === "activo"`. Plan 17 lo reusa y testea el caso `status='activo'` con suscripción vencida. |
| 3. Open Questions | CERRADO | `214-RESEARCH.md:1104` ahora dice `## Open Questions (RESOLVED)` y las 3 tienen marca. La 1 y la 2 quedan "resueltas" por la consulta 05, que corre Franco (info 4). |
| 4. VALIDATION.md | CERRADO | `214-VALIDATION.md` existe. Cubre los 18 planes y los conteos de tareas coinciden con los planes (2, 3, 3, 3, 2, 2, 2, 2, 3, 2, 3, 2, 2, 3, 3, 3, 3, 3). Tiene los 3 huecos de Wave 0 en los planes que los necesitan. Todas las tareas tienen `<automated>`. |

## 2. Los warnings 5 a 15

- **5, 14 (criterio de la 0344).** CERRADO. 16 UPDATE de mapeo más 2 del tope del día dan `>= 18`, y el criterio lo explica sumando. El bloque 0 de la consulta 05 lista los programas con 15 o 100 antes del merge, y la limitación está escrita.
- **6 (foto de ficha).** CERRADO en el diseño. Plan 13 la copia al bucket privado y plan 14 `resolveCommunityPhotos` nunca devuelve `photo_url`. Las claves usan un segmento HMAC y no el id. Los problemas nuevos de implementación están en los warnings 2, 4 y 5.
- **7 (alcance de la lista).** CERRADO. Plan 17 limita a horarios activos, de sedes activas no virtuales y del mismo país del que mira (404 indistinguible). Hay tope por usuario (40/min) además del de IP, pero ver el warning 6 sobre `fastify.rateLimit`.
- **8, 11 (EXIF y peso).** CERRADO como dependencia escrita. Amenaza T-214-14-09 en `transfer` y mensaje accionable en el 400 de más de 8 MB.
- **9 (reportes).** CERRADO. `reporter_ids` da un reporte por persona y foto, y `counts.reported` es el badge. No hay push al staff, y eso queda para el dueño.
- **10 (asistió).** CERRADO. Cuenta solo una asistencia que acreditó (fila `attendance` con monto mayor a 0 y la asistencia sigue existiendo). Wellhub y el auto-registro del profe no bloquean, con test.
- **12 (scope).** PARCIAL. 05 y 10 se partieron bien (7, 10 y 3 archivos). Siguen altos el plan 12 (14 archivos), el 16 (13) y el 02 (12). Ver warning 5.
- **13 (grep frágil).** CERRADO. Ahora filtra `^[0-9]+:\s*(//|\*|/\*)`.
- **15 (D-46).** CERRADO. Está explícito en el plan 15.
- **Info 16, 17, 18.** CERRADOS. El repaso queda con número 0348 y como ítem obligatorio del plan de cierre. El plan 02 ya no cambia la descripción de la racha. El `total` sale de un helper compartido con `getWeeklyGrid`.

## 3. D-64 de punta a punta

**Funciona en el flujo principal.**
- App primero y clase después: plan 10 `attendanceAuraAmountFor` da 5 menos la Aura de app (2), el día suma 5, y plan 11 informa `auraAwarded` desde el ledger.
- Clase primero y app después: plan 08 `attendedToday` bloquea.
- App y plan a medida: se bloquean entre sí con `otherAppAuraToday`. La extensión de 3 en total sigue "a confirmar" en CONTEXT.
- Reversa exacta: plan 10 lee lo acreditado del ledger (`attendanceAuraCredited`) y gasta exactamente eso. El test cubre -2 y -5.
- Día local: `checkIn` usa `todayInTz(tz de la sede)`, igual que la app (`localDateForBranch`). `forceCheckIn` usa UTC (`attendance/service.ts:543`). La deuda está anotada en plan 10, y de noche el forzado puede caer en otro día que el de la app.
- Wellhub y el profe: no bloquean ni reciben diferencia.

**Casos borde y resultado.**
- Dos asistencias el mismo día en categorías distintas: plan 10 test 3 cubre que la segunda paga 5. Es coherente con D-64 ("no cambia"), pero el día puede sumar 10. Eso contradice las frases "nunca suma más de 5" de los planes 04 y 10 y el bloque 6 de la consulta 05 (warning 1).
- App y plan a medida el mismo día: cubierto por planes 08 y 09 (test de 3 en total).
- Reversa de una asistencia que acreditó solo la diferencia: cubierta (plan 10 test 5, -2).
- Día local contra UTC: cubierto en `checkIn` y `coachCheckIn` (la fecha la manda el coach). Gap solo en `forceCheckIn`, ya declarado.
- Historial (plan 04 4b): en el historial la asistencia queda en 5 y la fila de app en 0. Es idempotente y el test lo cubre. Pero la regla (a) se reaplica en el repaso (blocker 1).
- Carrera entre cierre de app y check-in: aceptada (T-214-10-03). La misma ventana existe entre app y plan a medida en plan 08, sin riesgo declarado (info 5).
- Si se deshace una asistencia de 5 que había bloqueado a la app, la app no recupera sus 3 puntos. Y en el historial, la reversa de una asistencia ya re-valorizada a 5 deja el día en 0 y no en 3 (info 3).

---

## 4. Blocker nuevo

**1. [D-49 / D-64] Plan 04, `<repaso_d49>` y regla 4b(a): el repaso borra Aura legítima de días nuevos.**
- **Evidencia:** `<repaso_d49>` dice que el repaso incluye "los dos UPDATE del tope del día (D-64, misma forma que en la 0344)". La regla (a) pone en 0 toda fila de app con `amount = 3` cuyo usuario tenga ese día una asistencia con `amount > 0`.
- **Efecto:** desde que el código nuevo está en producción, un día con app 3 y asistencia 2 (plan 10) es legítimo. Si el repaso corre en un deploy posterior (puede pasar días o semanas, no solo la ventana de minutos), (a) ve la asistencia de 2 y anula la app: el día pasa de 5 a 2. Lo mismo con "app 3, A1 2, A2 5": se anula la app y el día baja de 10 a 7. Nada de lo planificado detecta esto: el test 4 solo prueba que una asistencia de 2 no se re-mapea, no que (a) la respete.
- **Corrección, en el plan 04 ahora porque el plan de cierre copia ese texto:**
  - La regla (a) debe exigir que no haya ninguna asistencia del día con monto menor a 5 (por ejemplo `NOT EXISTS` de una asistencia de ese día con `amount < 5`, o solo filas con `amount = 5`).
  - Y en el repaso, además, acotar por `created_at` anterior al arranque de la API nueva.
  - Agregar un caso al test 4: app 3 y asistencia 2 el mismo día quedan intactos tras correr los UPDATE dos veces.

---

## 5. Warnings

**1. [Planes 04 y 10, bloque 6 de la consulta 05] "Nunca más de 5 por día" no vale con dos asistencias.**
- Plan 04 `must_haves` y plan 10 `must_haves` afirman "ningún usuario-día suma más de 5". D-64 deja explícito que dos asistencias en categorías distintas siguen acreditando cada una, y plan 10 test 3 lo prueba. El bloque 6 espera 0 filas con suma mayor a 5 y mide justo eso: dará falsos positivos y nunca llegará a 0.
- En el historial antiguo también puede haber días con dos sesiones de app (el código viejo no tenía tope diario), que ni (a) ni (b) resuelven.
- La condición de control "los bloques 4 y 6 en 0 antes de mostrar puntos" no se podría cumplir.
- **Corrección:** redefinir el bloque 6 como "usuario-días con exactamente una asistencia donde app + asistencia supera 5". Contar aparte, informativos, los días con dos o más asistencias y los de dos sesiones de app. Reescribir los `must_haves` ("la app no suma sobre una asistencia del día, y la asistencia absorbe lo de la app hasta 5").

**2. [Plan 17, tarea 3] Caso de foto desactualizado.**
- Pide "uno solo con `users.photo_url` de ficha → esa URL y `photoId: null` (D-43)".
- Plan 14 ahora devuelve siempre la URL firmada del espejo y un `photoId` entero. El mismo plan 17 pide un barrido que prohíbe `members/photos/` en cualquier valor.
- Los dos casos se contradicen y el executor tendrá que elegir.
- **Corrección:** el caso debe afirmar URL firmada del bucket privado y `photoId` entero. El schema puede dejar `photoId` `["integer","null"]` solo por prudencia.

**3. [Plan 16, tarea 2] `activeMemberExists` dentro de `.select()`.**
- El plan pide que `getViewerCommunityState` seleccione `hasPlanInEffect` con `activeMemberExists(schema.users.id, ctx)` dentro de la consulta.
- Es la trampa (b) del skill de migraciones: `${columna}` se renderiza sin calificar en un `select`. En el EXISTS correlacionado, `s.user_id = id` resuelve contra la propia tabla `s` y siempre da falso. Todos los usos existentes del helper están en `.where()`.
- El test lo detectaría, pero solo en CI.
- **Corrección:** hacer la lectura con una consulta aparte `select 1 from users where tenantWhere(...) and id = ? and activeMemberExists(users.id, ctx) limit 1` (en `.where`), o pasar una referencia literal calificada.

**4. [Planes 14, 15 y 17] Espejo de la ficha en rutas de lectura.**
- `resolveCommunityPhotos` hace `CopyObject` e INSERT en `member_photos` dentro de `GET /attendees` y de `GET /me`.
  - La primera vez que se abre una clase con N personas con foto de ficha son N copias y N transacciones en un GET.
  - Si el objeto no existe (`members/routes.ts` guarda `photo_url` antes del PUT), se reintenta cada vez: `/me` es la ruta más caliente de la app y haría una llamada a R2 por apertura.
  - Si R2 no admite `CopyObject` entre buckets, el supuesto del plan 13 queda para staging.
- **Corrección:** acotar el espejo por pedido (por ejemplo máximo 5 copias), guardar un intento fallido (fila `quitada` o una marca con fecha) para no reintentar cada pedido, y no espejar desde `/me` o hacerlo por un job.

**5. [Plan 14 test 9b, plan 15 y plan 17] El barrido `/{userId}/` puede dar falsos positivos.**
- Las claves y las URLs firmadas contienen `private/avatars/{tenantId}/…`.
- Los ids de usuario en las bases de test son chicos. Un usuario con id 1 y tenant 1 hace fallar `/{userId}/` sin ninguna fuga real.
- **Corrección:** buscar el id en el segmento posterior a `avatars/{tenant}/`, o con prefijos de longitud mayor (por ejemplo `-{id}-`), o comparar contra la clave sin el prefijo del tenant.

**6. [Entorno, todos los planes] El `node_modules` del proveedor no tiene `@fastify/rate-limit`.**
- `package.json:35` y el lockfile lo declaran. `el-templo/el-templo-api/node_modules/@fastify` solo trae `cors` y `jwt`. Es la única dependencia que falta.
- `app.ts` ya lo importa, así que el `tsc` de base no da 0 y los verify de la forma `pnpm exec tsc --noEmit && …` fallan desde el primer plan. Solo el plan 01 lo prevé ("anotar errores preexistentes").
- El plan 17 pide verificar `fastify.rateLimit` en `node_modules/@fastify/rate-limit/types/index.d.ts`, que no existe, y las rutas nuevas con `config: { rateLimit }` (planes 14, 17) tampoco se pueden tipar.
- **Corrección:**
  - Que el plan 01 registre la cantidad de errores base y que los demás planes comparen contra esa cantidad, o buscar otro worktree con la dependencia.
  - Que el plan 17 asuma `fastify.rateLimit` sin poder verificarlo.
  - No instalar nada sin permiso de Franco.
  - Esto ya existía en la primera versión y se me pasó en el primer informe.

**7. [Scope Sanity] Siguen altos.** Plan 12 (14 archivos), plan 16 (13) y plan 02 (12), todos con 2 o 3 tareas. Ninguno llega al umbral de blocker (15). Conviene partir el 12 en enum/tabla y tenancy/conteos.

---

## 6. Info

1. **Referencias cruzadas viejas.** Plan 02 (línea 74) dice "textos de la app (plan 05)" y ahora son del plan 06. Plan 10 (`<done>` de la tarea 2) dice "plan 09 del lado de la app" y el lado de la app está en el plan 08. Plan 01 task 2 dice "tres archivos" y enumera cuatro. Ningún otro plan cita a otro por su número viejo.
2. **Consulta 08.** Usa el rol guardado en `session_blocks.role`. `ATHLOS_EPIKOS` no coincide con `ATHLOS` o `EPIKOS` de `blocks_completed`, así que subestima el tiempo propuesto y los resultados salen algo mejores que los reales (manda el código). Conviene anotarlo en el encabezado.
3. **Reversa histórica.** Si se deshace una asistencia ya re-valorizada a 5, el día baja a 0 y no a 3. Es una consecuencia aceptable del 4b (la app quedó en 0).
4. **Open Questions 1 y 2.** Figuran RESOLVED por vía de consulta 05, que Franco debe correr antes del merge. Cumple la regla, pero hasta que corra siguen siendo un paso manual.
5. **Carrera app y plan a medida.** Plan 08 no declara que el chequeo `otherAppAuraToday` tiene la misma ventana de carrera que T-214-10-03. Efecto: como mucho 3 puntos de más en un día.
6. **`hiddenCount`.** Plan 17 lo calcula como `total - filas mostradas`, así que las cuentas borradas aparecen sumadas en "y otros N más". Es consistente con el número de la card (D-59) pero choca con "las cuentas borradas no aparecen nunca" (D-08). Producto.

---

## 7. Verificado sin hallazgos

- **Dependencias y waves.** `depends_on` es una cadena lineal 01 a 18 y `wave` coincide con el número. Ningún plan usa algo de uno posterior. No hay archivos que un plan pise a otro: `day-cap.ts` nace en el 08 y lo amplía el 10. `profile-photo-service.ts` nace en el 14 y lo amplía el 15 (`removeCommunityPhoto` ahora está en el 14 y el 15 lo reusa). `auth/routes.ts` pasa por 11, 15 y 16 y `scheduling/routes.ts` por 16 y 17.
- **Baselines.** `ENTRADAS_BASELINE` 577, 581 (plan 14), 585 (15), 587 (16), 588 (17), 589 (18). ISO-03 members 38 a 42 (plan 15). ISO-03 subs+sched 74, 76 (plan 16), 77 (plan 17). El plan 12 suma 1 a los conteos de tabla (135, 140). Cada plan parte del valor que dejó el anterior y manda re-verificar el real.
- **Migraciones.** 0344 (04), 0345 y 0346 (12), 0347 (16), y el repaso será 0348. Sin choques, con guard del `;` y orden de respaldo.
- **Tareas por plan.** Todas las tareas tienen files, action, verify y done (`verify.plan-structure`).
- **CLAUDE.md y skills.** Cumplidos: sin push, sin bump, `git add` explícito, sin `any`, sin `console`, sin variables de entorno nuevas y sin instalar. `JWT_SECRET` ya existe (`.env.example:12`).
- **Referencias `archivo:línea`.** Las nuevas verificadas existen: `sessions/types.ts:73`, `session-response.ts:107`, `attendance/service.ts:543`, `daily-award.ts:66-100`, `shared/active-member.ts`, `scheduling/service.ts:384-399`, `members/routes.ts:~2097-2107`.

---

## 8. Decisiones de producto que deberían ir al dueño

1. **Wellhub y la lista.** El plan 16 lo deja explícito en un test: un usuario Wellhub (sin suscripción) ve solo el número y aparece en la lista de otros. ¿Es lo querido?
2. **Alcance de la lista.** El planificador lo resolvió limitando a horarios de la grilla del que mira (mismo país, sedes activas no virtuales). Confirmar.
3. **Reportes de foto.** La foto reportada sigue visible hasta que el staff decide. El staff se entera solo por el contador de la cola (sin push). ¿Alcanza?
4. **Doble asistencia el mismo día.** Con D-64, dos asistencias en categorías distintas siguen sumando 5 cada una y el día puede pasar de 5. ¿Es lo querido? ¿Y las dos sesiones de app del mismo día en el historial viejo?
5. **D-64, extensión "app y plan a medida pagan 3 en total".** Sigue "a confirmar" en CONTEXT.
6. **D-64 al deshacer.** Si se anula una asistencia que había bloqueado a la app, ¿la app recupera sus 3 puntos? Hoy no.
7. **Programas.** 15 a 8 y 100 a 50, que también pisa los programas cargados a mano con 15 o 100 (el bloque 0 los lista).
8. **Fórmula del 80 %.** Calibrar con la consulta 08 antes de ejecutar el plan 08. Si muchas sesiones reales quedan abajo del 80 %, ajustar los 3 segundos por repetición o el mínimo de 60 s por bloque.
9. **Peso de la foto y formato.** Servidor con tope de 8 MB y solo JPEG, con reducción en la app. D-33 dice nunca rechazar por peso.
10. **Push de rechazo de foto.** Va por la categoría `anuncios`, que el alumno puede apagar.
11. **Foto de ficha.** Se copia al bucket privado la primera vez que se muestra y al quitarla se borra el objeto público. Hay que confirmar en staging que R2 admite `CopyObject` entre los dos buckets.
12. **`hiddenCount` y cuentas borradas.** ¿Cuentan en "y otros N más"?
13. **D-29.** Si Franco tiene el archivo "Socios según fecha de ingreso". Si no, los 367 quedan con antigüedad desde marzo de 2026.
14. **Builds de la 1.9.6 y normas.** Sacar el número de los "+5 AURA" en la rama de la 213 antes de generar builds. El texto de las normas (D-50) lo aprueba Franco en la segunda pasada.
15. **Quién corre qué.** Franco corre las consultas 04 a 08 y decide cuándo se escribe y despliega el repaso 0348, que no debe usar la regla (a) tal como está hoy.
