## ISSUES FOUND

**Fase:** 214, planes 01 a 15 (alcance parcial de servidor y datos)
**Resultado:** 4 blockers, 11 warnings, 4 info.

Lo que verifiqué y está bien:
- **Estructura:** `verify.plan-structure` da válido en los 15 planes. Cada tarea tiene files, action, verify, done y `<automated>`, y cada plan tiene `<threat_model>`. Las dependencias son una cadena lineal sin ciclos, con un plan por wave (1 a 15).
- **Referencias:** muestreé unas 25 referencias `archivo:línea` repartidas en los planes y todas existen. Hay desvíos de 1 a 5 líneas, por ejemplo `attendance/service.ts:386` contra `:391`. Los 40 archivos nombrados existen, salvo `test/aura/` que el plan 09 declara carpeta nueva.
- **Baselines de tenancy:** `ENTRADAS_BASELINE` parte de 577 y va 581, 585, 587, 588, 589. ISO-03 subs+sched va 74, 76, 77 y members va 38, 42. Cuadra con PATTERNS: da +12 y no +13 porque el plan 15 decidió no hacer la ruta `/summary`. Los conteos 135/140 de la tabla nueva también están bien.
- **Migraciones y repo:** la secuencia 0344 a 0347 es coherente. El `.sql` va en el mismo plan que el schema. Hay guard contra `;` en comentarios y la 0344 no usa fórmulas. Los symlinks de node_modules ya los cubre `info/exclude` y el md5 de los lockfiles coincide.
- **Montos y decisiones:** los montos de D-19 coinciden con los datos de producción. Las 41.468 asistencias son todas de 10, las 2.195 de onboarding todas de 50 y las 139 reversas todas de -10. D-15 y D-54 revocadas, D-08 y D-56 enmendadas por D-52 y D-58 y D-44 sin interruptor están respetadas. No hay etiqueta por rol.
- **Alcance:** no hay scope reduction ("v1", "stub") ni ideas diferidas colándose.

---

### Blockers

**1. [decisión D-20] Plan 07, tarea 1: la regla "todos los bloques" incluye los bloques ALT que el alumno nunca ve.**
- **Evidencia:** `el-templo-api/src/modules/sessions/types.ts:73` define `ALTERNATIVE_BLOCK_ROLES` (`COMBOS_II_ALT`, `TECNICA_II_ALT`) como bloques "para que el profe elija en la TV; la app del alumno no los muestra". `session-response.ts:107` los filtra en `/daily` y `/weekly`.
- **El plan:** lee `getSessionByDayId(dayId, true)`, que reconstruye todos los bloques sin filtrar. `<interfaces>` dice "si no hay Deuteros, todos los bloques", y en `requiredBlockRoles` y `proposedSecondsForSession` no aparece "ALT".
- **Efecto:** en todo día de combos o técnica, `blocksCompleted` nunca trae el rol ALT. El resultado es `bloques_incompletos` y nadie cobra Aura de la app esos días. Si se salteara ese chequeo, el tiempo propuesto igual quedaría inflado con el bloque ALT. Los tests del plan 08 no lo detectan porque su fixture no usa ALT.
- **Corrección:**
  - En el plan 07, que `requiredBlockRoles` y `proposedSecondsForSession` descarten `ALTERNATIVE_BLOCK_ROLES` antes de calcular.
  - Agregar un caso unitario con `INITIUM`, `COMBOS_I`, `COMBOS_II`, `COMBOS_II_ALT` y `STRETCHING`.
  - Agregar un caso de integración en el plan 08.

**2. [decisión D-09] Plan 13 (tareas 1 y 2) y plan 14: "plan vigente" se lee de `users.status = 'activo'`.**
- **Evidencia:** el docblock canónico `shared/active-member.ts` dice que `users.status` se desfasa cuando una suscripción vence sin recompute. Citan unos 48 "fantasmas" (`status='activo'` sin suscripción en vigor, 749 contra 692 reales). Concluye: "Every active member count MUST go through this predicate, never `users.status`". El predicado es `activeMemberExists` / `membershipInEffectSql`.
- **El plan:** `listAccess({ isStaff, status, viewerVisible })` usa `status !== "activo"` → `sin_plan`.
- **Efecto:** cerca del 7 % de los "activos" tienen el plan vencido y verían nombres y fotos. Eso rompe el criterio 1 del roadmap ("con plan vigente") y "cuentas con el plan vencido ven solo el número".
- **Corrección:**
  - `getViewerCommunityState` calcula `hasPlanInEffect` con `activeMemberExists(users.id, ctx)`.
  - `listAccess` pasa a recibir un booleano en vez de `status`.
  - Agregar un test con `status='activo'` y suscripción vencida, que debe dar `sin_plan`.
  - Revisar que los casos `freemium`/`inactivo` del plan 13 siembren suscripciones reales.

**3. [Dimensión 11, Research Resolution] `214-RESEARCH.md:1104` tiene `## Open Questions` sin `(RESOLVED)` y sus 3 preguntas sin marca.**
- Pregunta 3 (variante B de la card): ya resuelta por D-59.
- Preguntas 1 y 2 (fila de antigüedad fuera de 50/100/250, programas con bonus personalizado): se resuelven recién al correr la consulta 05 bloque 1. Eso es un paso manual de Franco.
- **Corrección:** marcar las tres como `RESOLVED` con su vía de resolución, y renombrar el encabezado a `## Open Questions (RESOLVED)`. La 1 y la 2 como "resuelta por la consulta 05 bloque 1, antes del merge".

**4. [Dimensión 8, Nyquist, check 8e] No existe `214-VALIDATION.md`.**
- El RESEARCH tiene "Validation Architecture" y `nyquist_validation` no está apagado en `config.json`, así que la dimensión aplica y falla con una sola condición.
- Las otras fases con VALIDATION.md son 194, 195, 200, 201, 203 y 206. La 213 salió sin uno.
- Los checks 8a a 8d pasan: todas las tareas tienen `<automated>`, no hay watch ni E2E, y el muestreo es continuo.
- **Corrección:** generar el archivo desde RESEARCH:1122-1160 (3 huecos de Wave 0 y tabla criterio a test). O decidir explícitamente `workflow.nyquist_validation=false`. Es un trámite de minutos.

---

### Warnings

**5. [Plan 04, tarea 1] Criterio imposible de cumplir.**
- Pide "al menos 17 `UPDATE aura_transactions`", pero las reglas dadas suman 16: attendance 1, reversa 1, onboarding 1, tenure 3, streak 5, `training`+`goal_plan` juntos 1, extra_block 1, stretch 1, program_week 1, program_completion 1.
- Un ejecutor sonnet va a inventar un split o a fallar el verify.
- **Corrección:** poner `-ge 16`, o separar explícitamente `training_completion` y `goal_plan_completion`. Lo mismo en la regla del test.

**6. [Plan 14 y plan 11, `resolveCommunityPhotos`] La foto de ficha se devuelve cruda y expone el id interno del usuario.**
- La URL es `${R2_PUBLIC_URL}/members/photos/{userId}-{Date.now()}.{ext}` (`members/routes.ts:~2095`). Cada anotado con foto de ficha entrega su `userId` en la URL. Eso contradice el must-have "nunca id de usuario" del plan 14. El test solo barre claves, no valores.
- Además `removeCommunityPhoto` solo hace `photo_url=NULL`. El objeto del bucket público no se borra, así que D-32 ("el staff puede quitar") no revoca nada de lo ya distribuido.
- D-43 manda mostrarlas, pero no manda exponer esa URL.
- **Corrección:** copiar la foto de ficha al bucket privado en el primer `resolve` y firmarla, borrando el objeto público al quitarla. O, como mínimo, que el plan 14 declare el riesgo y se lleve a Franco. Agregar un test que afirme que ningún valor devuelto contiene `userId`.

**7. [Plan 14 y plan 13, `/slots/:scheduleId/:date/attendees`] Se puede recorrer "quién va a qué clase" en todo el gimnasio.**
- La ruta acepta cualquier horario del tenant, de cualquier sede y país, hasta +31 días. El tope es 120/min por IP (`rate-limits.ts` usa IP).
- Un alumno con plan puede enumerar los scheduleIds de todas las sedes sin gastar más que un puñado de minutos (el `/weekly` ya le da los ids).
- **Corrección:** `keyGenerator` por `userId` además de la IP. Valorar limitar a horarios de su sede o de aquellos que puede reservar (ver pregunta al dueño n.º 2).

**8. [Plan 11, plan 14] EXIF y GPS solo se controlan en el cliente.**
- Los demás alumnos descargan el JPEG original por URL firmada. El servidor nunca lo recodifica. Solo valida cabecera y tamaño con HEAD, y el PUT firmado fija `Content-Type: image/jpeg`.
- El RESEARCH (V8 y Pitfall 10) cuenta "EXIF descartado" como control, pero ningún plan de servidor lo verifica.
- **Corrección:** dejar escrito en el plan 11 que depende del canvas de la app. En la segunda pasada, exigirlo como criterio de aceptación y probarlo con una foto con ubicación en iOS (D-39).

**9. [Plan 11 y plan 12, reportes de foto] D-45 queda a medias.**
- D-45 dice "avisa al staff". La función solo suma el contador y hace `log.info`. No hay push ni badge, así que un reporte puede quedar en la cola sin que nadie se entere.
- Cualquier alumno puede reportar muchas veces la misma foto. No hay dedupe por reportante.
- `photoId` es un autoincremental, no "opaco". Sirve para saber qué ids existen y están aprobados (el 204/404 hace de oráculo).
- La foto reportada sigue visible hasta que el staff actúe.
- **Corrección:** avisar al staff (`queueAdHocNotification` a roles de revisión de la sede, o al menos un conteo para el badge). Limitar a un reporte por usuario y foto, o por lo menos un tope por usuario.

**10. [Plan 07, tarea 2] Qué cuenta como "asistió".**
- `attendedToday` cuenta cualquier origen, incluidas `wellhub` y `wellhub_manual` (no dan Aura) y el auto-registro del profe. El día que alguien asiste por Wellhub, la sesión de la app tampoco da Aura, aunque no haya nada que "no sumar".
- El caso app-primero-y-clase-después queda con 3+5. Está dentro de la discreción de CONTEXT, pero el criterio 5 del roadmap dice "no suma el día que asistió".
- **Corrección:** contar solo asistencias que acreditaron (`source IN ('qr','manual')` y no staff), o llevarlo a Franco. Ver preguntas 3 y 4 del dueño.

**11. [Plan 11, tarea 1 y D-33] Rechazo por peso en el servidor.**
- `confirm` rechaza con 400 los objetos mayores de 8 MB. D-33 y el criterio 7 dicen que ninguna foto se rechaza por pesada.
- Es coherente solo si la app reduce antes, lo cual es de la segunda pasada.
- **Corrección:** dejar escrita en el plan la dependencia. En la segunda pasada, exigir la reducción como condición y que el servidor responda un mensaje accionable.

**12. [Scope Sanity] Planes con muchos archivos.** Todos con 2 a 3 tareas; los umbrales numéricos son warning a 10 y blocker a 15.
- Plan 05: 17 archivos (API 7 y app 10). Una sola tarea toca 10 componentes Vue. Es en su mayoría texto, pero cruza el umbral de 15.
- Plan 10: 16 archivos.
- Plan 13: 13 archivos.
- Plan 02: 12 archivos.
- **Corrección:** partir el 05 en API y app, y el 10 en tabla/enum y tienda privada. Con ejecutores sonnet en worktree compartido conviene que sean más chicos.

**13. [Plan 14, tarea 1] Check frágil.** El verify `! grep -nE "kind:|role:\s|source:\s|phone|email" … | grep -v "^\s*//"` no filtra comentarios, porque `-n` antepone el número de línea. Un docblock que diga "ni teléfono" o "sin role:" falla el verify.
- **Corrección:** usar `grep -vE "^[0-9]+:\s*(//|\*)"` o chequear solo el SELECT.

**14. [D-19 programas y plan 04] Re-valorización de programas personalizados.**
- `UPDATE programs SET aura_weekly_bonus=8 WHERE =15` toca también un programa que Franco haya puesto a mano en 15. La consulta 05 bloque 1 lo detecta, pero solo después. Es una decisión de discreción que CONTEXT pide mostrar a Franco (pregunta 8 del dueño).

**15. [Plan 12, tarea 1] D-46 "acotado a sus sedes".**
- Solo se fuerza para `admin_sede` (`branch-access.ts:isBranchScopedRole`). Profes, recepción y gestión aprueban en todo el país.
- Es igual que la subida de foto de ficha de hoy, y D-46 dice "los mismos roles que hoy", pero conviene decirlo explícito.

---

### Info

- **16. [Planes 04 y 13 y el repaso D-49]**
  - La migración de repaso solo está descripta en prosa (`<repaso_d49>`). Conviene dejarla como ítem obligatorio del plan de cierre en STATE/ROADMAP.
  - Su número natural sería 0348, porque la 0347 ya es del plan 13.
  - Mientras tanto, la 0344 se aplica a `eltemplo_staging` al deployar staging y a prod en el deploy de master (bases separadas en el mismo host). La ventana que cubre el repaso es de minutos, no de días.
- **17. [Plan 02, tarea 3]** Cambia la descripción del asiento de racha de "dias" a "sesiones". Ningún D lo pide. El docblock de `streak-reward.ts` la declara byte a byte estable y las filas históricas quedan con "dias". Valor bajo, riesgo bajo: sacarlo o aceptarlo.
- **18. [Plan 14, `total` contra card]** `total` excluye cuentas borradas, pero el `bookedCount` de la card (`scheduling/service.ts:384-399`) no hace join con `users`. Puede haber un desfasaje de 1 entre la card y la hoja. D-59 espera el mismo número.
- **19. [Segunda pasada]**
  - Texto del permiso de iOS (D-35), reducción y EXIF en la app, y fallback a iniciales cuando `photo_url` apunta a algo roto (`users.photo_url` se guarda al pedir la URL, antes del PUT).
  - Con D-43 esas fotos rotas llegarían a otros alumnos.
  - La celebración del plan 09 no incluye `scheduleId` ni `sessionDate`; si la pantalla "con quiénes entrenás hoy" los necesita, hay que sumarlos en esa pasada.
- **Cosmético:** cada plan termina con un `</output>` duplicado.

### Cobertura de decisiones de servidor/datos/lógica

Quedan sin cubrir D-29 (corrección por migración, solo existe la consulta 04 y depende de lo que traiga Franco) y D-35 (texto del permiso de iOS, segunda pasada). Más D-02 (por el blocker 2 solo a medias en la visibilidad) y D-20 (por el blocker 1).

- **D-01 a D-09, D-11, D-44, D-47, D-51, D-52, D-59:** planes 13 y 14, con el blocker 2 y el warning 7.
- **D-12 y D-13:** planes 09 y 15.
- **D-57 y D-58:** planes 09, 14 y 15, sin condición por rol.
- **D-18, D-19 y D-23:** planes 02, 03 y 05. **D-21, D-38 y D-49:** plan 04.
- **D-20 y D-48:** planes 07 y 08, con el blocker 1.
- **D-22:** plan 06, con la API intacta.
- **D-30 a D-34, D-43, D-45, D-46, D-50:** planes 10, 11 y 12, con los warnings 6, 8, 9 y 11.
- **D-36 y D-37:** plan 01, planes 14 y 15.

---

## Decisiones de producto que deberían ir al dueño

1. **Wellhub y la lista.** Hoy un usuario Wellhub aparece en la lista (D-08) pero no puede verla (`status != activo`). D-09 no lo dice. ¿Que Wellhub no vea es lo querido?
2. **Alcance de la lista.** ¿Un alumno puede ver los anotados de cualquier sede y cualquier horario del gimnasio? ¿O solo de su sede, o de las clases que puede reservar?
3. **Orden app y clase el mismo día.** El plan acepta que app antes de clase dé 3+5 (sin reversa). El criterio 5 dice "no suma el día que asistió". ¿Se acepta, o se anula la app al asistir?
4. **Qué cuenta como asistió para D-20.** ¿Una visita Wellhub o el auto-registro del profe bloquean la Aura de la app ese día?
5. **Foto de ficha.** ¿Se acepta que sea pública, permanente y con el `userId` en la URL al mostrarla a otros, o se la copia al bucket privado? Y al quitarla, ¿se borra el objeto?
6. **"Quitar" mi foto.** ¿Debe borrar también `users.photo_url` (la foto que usa recepción para reconocer al alumno), o solo las propias? (Supuesto del plan 11.)
7. **Reportes.** ¿La foto reportada se oculta apenas se reporta o sigue visible hasta que el staff decide? ¿Cómo se avisa al staff? ¿Se limita a un reporte por persona y foto?
8. **Programas.** 15 a 8 y 100 a 50, que también pisa los programas con bonus puesto a mano en esos valores. Redondeo 7,5 a 8.
9. **`aura: null` cuando es 0.** ¿Se muestra "0" o nada? Así un Wellhub y un recién llegado se ven igual, sin número.
10. **Rechazo de foto.** El push va por la categoría `anuncios`, que el alumno puede apagar y entonces no se entera. ¿Es suficiente?
11. **Fórmula del tiempo propuesto para el 80 %.** Repeticiones × 3 s, mínimo 60 s por bloque, ventana de 12 h. Es una estimación que puede negar Aura a quien entrena de verdad. ¿Se acepta sin calibrar con datos reales?
12. **Peso de la foto.** Tope duro de 8 MB y solo JPEG en el servidor, con reducción en la app. D-33 dice nunca rechazar por peso.
13. **D-29.** Si Franco tiene el archivo "Socios según fecha de ingreso". Si no, dejar a los 367 con antigüedad desde marzo de 2026.
14. **1.9.6.** Sacar el número de los "+5 AURA" en la rama de la 213 antes de generar los builds de tiendas. También revisar las etiquetas de privacidad de las tiendas.
15. **Texto de las normas (D-50).** Lo aprueba Franco en la segunda pasada.

Planes revisados, todos en `/home/franco/projects/et-comunidad/.planning/phases/214-comunidad-anotados-aura/`: `214-01-PLAN.md` a `214-15-PLAN.md`, contra `214-CONTEXT.md`, `214-RESEARCH.md`, `214-PATTERNS.md` y `214-AURA-VALORES-RESEARCH.md`.

Código citado como evidencia, en `/home/franco/projects/et-comunidad/el-templo-api/src/modules/`:
- `sessions/types.ts`
- `sessions/session-response.ts`
- `shared/active-member.ts`
- `members/routes.ts`
- `shared/branch-access.ts`
