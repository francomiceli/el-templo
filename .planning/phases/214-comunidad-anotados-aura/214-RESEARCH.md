# Fase 214: Comunidad: anotados en la clase y Aura visible - Research

**Investigado:** 2026-11-17, sobre `feat/comunidad-anotados-aura` (`868e1be29`, base `a51a00271`). Rutas relativas al worktree `et-comunidad`.
**Dominio:** API Fastify + Drizzle/MySQL (ledger de Aura, reservas, fotos privadas en R2), app Quasar + Capacitor, admin Quasar.
**Confianza:** ALTA en código y datos, MEDIA en las políticas de tiendas (hay interpretación), BAJA en el comportamiento de HEIC en la web (no verificado en dispositivo).

## Summary

La fase se parte limpia en dos mitades. Una mitad no depende de los sketches: reescala de Aura con migración, regla de tiempo para entrenar en la app, apagado del descuento, endpoints de Aura, anotados, visibilidad, circuito de la foto propia y consultas de medición. La otra mitad sí depende: pantallas de la app (encabezado, lista, Perfil, detalle de Aura, aviso de asistencia) y la sección de revisión del admin. La primera mitad puede planificarse y ejecutarse ya. La segunda espera al UI-SPEC.

Hay cinco hallazgos que cambian el plan respecto de lo que dice el CONTEXT:
(1) La re-valorización puede ser **idempotente sin depender del respaldo**: cada valor viejo es distinguible del nuevo por `(source_type, reference_type, reference_id, amount)`. Hay una ventana entre la migración y el reinicio en la que el código viejo sigue acreditando con valores viejos. Hace falta una migración de "puesta al día" en un deploy posterior.
(2) Con la regla de tiempo (D-20), **todos los tests que hoy completan sesiones esperando Aura se rompen**: mandan `startedAt = ahora` y bloques incompletos (`test/sessions/complete-aura-cap.test.ts:53-54`). Además, el plan a medida retomado nunca va a dar Aura hasta que se arregle la app (`GoalPlanSession.vue:403`).
(3) Los 367 de marzo **no son "sin fecha" por accidente**. Hubo tres pasadas de importación que ya corrigieron `created_at` con datos del sistema anterior: `import-members.ts:838`, `import-vigentes.ts:544-549` e `import-fecha-ingreso.ts`, esta última por email. Los 367 son los que ninguna pasada pudo emparejar, así que casi seguro la base no tiene su fecha real. La consulta de abajo lo confirma.
(4) Las rutas del admin para fotos **tienen que ir por `/:userId/`** y no por `/:photoId`. Si no, el filtro de sede del `admin_sede` no se aplica (`shared/branch-access.ts:491-501`).
(5) Las tiendas sí piden un mecanismo de reporte dentro de la app, y Google Play pide además aceptar términos antes de subir contenido. Apple pide además bloqueo de usuarios. Eso suma un botón de reporte y un texto de normas que Franco tiene que aprobar.

**Recomendación principal:** que los montos de Aura salgan de un solo archivo de constantes (`aura/amounts.ts`) pasados explícitamente a `award`. La migración 0344 re-valoriza por valor y queda idempotente. La foto va al bucket privado de Conquer con una tabla `member_photos` nueva. Los anotados son un solo endpoint por horario y fecha con schema declarado. Todo detrás de un interruptor que se prende después del anuncio.

<user_constraints>
## User Constraints (de CONTEXT.md)

### Locked Decisions (copiado de `214-CONTEXT.md` § Implementation Decisions)

**Lista de anotados**
- **D-01:** Endpoint del alumno en `schedulingMemberRoutes`. Para un horario y una fecha devuelve, por cada reserva vigente: nombre de pila, inicial del apellido, foto aprobada (o nada) y puntos de Aura. Vigente = `reservado`, `qr_escaneado` o `confirmado`. Excluye sesiones de prueba (`is_trial`), cancelados, `no_show` y lista de espera. Schema de respuesta declarado: fast-json-stringify descarta lo que no está en el schema.
- **D-02:** El número al lado de cada persona es el **Aura ganada**: todo lo acreditado, neto de reversas y ajustes, sin restar canjes. Es un solo número para la lista, el encabezado y Perfil. Hoy coincide con el saldo porque hay cero canjes en producción. Franco: "si lo canjea igualmente no debería perder ese histórico".
- **D-03:** Orden de reserva (quien reservó primero, primero). Nunca por puntos.
- **D-04:** En la fila van solo los puntos. Sin nivel ni insignia.
- **D-05:** Visible por defecto. La primera vez que un alumno abre la lista ve un aviso corto de que su nombre y foto también se muestran, con acceso directo a ocultarse desde Perfil.
- **D-06:** Preferencia de visibilidad en Perfil. Quien se oculta cuenta en el número y la lista lo agrupa al final con un texto del tipo "y otros 3 más" (pedido literal de Franco).
- **D-07:** Reciprocidad: quien se oculta no ve la lista de los demás, solo el número.
- **D-08:** Staff y usuarios Wellhub que reservan aparecen con nombre y foto, sin puntos. Las cuentas borradas no aparecen nunca.
- **D-09:** La lista con nombres y fotos la ven solo los alumnos con plan vigente y el staff. Cuentas freemium, de prueba o con el plan vencido ven solo el número.
- **D-10:** La ubicación de la lista NO está decidida. Franco: "hay que hacer un ui spec y analizar bien dónde queda mejor ponerlo, me suena que dentro de un pop up es demasiada información... podés pensar varios sketch con distintas ideas". Se define con `/gsd-sketch` y un UI-SPEC.
- **D-11:** Propuestas mías que Franco vio y no objetó (quedan como decisión salvo que diga otra cosa): los menores de 18 y los alumnos de sedes fuera de Argentina arrancan ocultos hasta que lo activen. Antes de encender la lista sale un anuncio a todos (novedad o push) con el acceso para ocultarse.

**Aura visible**
- **D-12:** Endpoint propio del alumno con sus puntos y su historial. Un alumno no puede leer los puntos ni el historial de otro. Hoy no existe ninguna ruta de Aura.
- **D-13:** Detalle de Aura: el total y los últimos 20 movimientos con un texto claro por motivo, y "ver más" para seguir. Las filas de 0 puntos (referidos) no se muestran. Las reversas sí, en negativo. No hay tabla de "cómo ganar puntos".
- **D-14:** Sin niveles de estatus. Solo puntos.
- **D-15:** Al staff no se le muestra Aura en ningún lado. Staff = roles de `ALL_STAFF_ROLES`. La acreditación al staff no se toca.
- **D-16:** Dónde se ve: encabezado de Mi Templo, Perfil y la lista de anotados. Tocar los puntos del encabezado lleva al detalle.
- **D-17:** Sin ranking entre alumnos.

**Valores de Aura**
- **D-18:** Escala nueva: una clase vale 5 puntos (hoy 10).
- **D-19:** Asistir 10→5 (y su reversa) · Onboarding 50→5 · Antigüedad 3m/6m/cada año 50/100/250→15/25/50 · Rachas 7/14/30/60/100: 20/35/50/100/200→5/10/15/25/50 · Entrenar en la app (por día) 10→3 con regla de tiempo · Plan a medida (por día) 10→3, misma regla · Bloque libre 5→2 · Estiramiento 5→1 · Foto de perfil, una sola vez, nuevo: 5.
- **D-20:** Entrenar en la app da Aura solo si la sesión duró al menos el 80 % del tiempo propuesto total y están todos los bloques. Solo cambia el servidor, no se manda tiempo por bloque. El día que el alumno asistió a clase, la sesión de la app no da Aura (no se suman). La regla condiciona solo el Aura: no toca el registro de la sesión, la racha ni el programa.
- **D-21:** Lo ya acreditado se re-valoriza por migración con los valores nuevos y los saldos se recalculan.
- **D-22:** El descuento por Aura se apaga en el admin por ahora. Los tramos (500 / 1.000 / 2.000 / 5.000) no se reescalan.
- **D-23:** Los textos fijos de la app que prometen un monto se corrigen: los "+5 AURA" de estirar y bloque libre, y el "+50" de respaldo del onboarding. Conviene que salgan antes de los builds de tiendas de la 1.9.6.
- **D-24:** La economía con puntos "gastables / gastados" no es de esta fase.

**Encabezado de Mi Templo**
- **D-25:** Se sacan "Hola" y la fecha. Queda el nombre con una miniatura de la foto al costado, o el acceso para subir una foto si no tiene. Datos: cuánto tiempo lleva y cuántos puntos de Aura tiene.
- **D-26:** Sin contador de sesiones en el encabezado.
- **D-27:** El encabezado duplicado en `MainLayout.vue` se extrae a un solo componente.
- **D-28:** Sello de antigüedad, selector de nivel y convivencia de dorados se definen en los sketches.
- **D-29:** 367 alumnos importados en marzo de 2026 tienen la fecha de importación como fecha de alta. Si hay una fecha real, se corrige por migración. Si no, se le lleva a Franco.

**Foto propia**
- **D-30:** El alumno sube su propia foto con un endpoint propio. Subirla da 5 puntos de Aura, una sola vez: si después se quita, no se devuelven ni se vuelven a dar.
- **D-31:** La foto queda pendiente de aprobación y el staff la revisa desde una sección del admin.
- **D-32:** El staff puede quitar una foto ya aprobada. `/me` devuelve `photoUrl`.
- **D-33:** Nunca se rechaza una foto por pesada: la reducción de calidad corre por nuestra cuenta.
- **D-34:** Las fotos no quedan en una dirección pública adivinable. Al planificar se revisa qué exigen las tiendas. Si piden reporte, entra un botón mínimo que avisa al staff.
- **D-35:** `@capacitor/camera` ya está instalado. No se instala ni actualiza ninguna dependencia sin preguntarle a Franco. Hay que actualizar el texto del permiso de iOS.

**Medición y prueba**
- **D-36:** Línea de base de 4 semanas antes de lanzar y la misma medición después: reservas y asistencias por alumno activo por semana. Activo = asistió al menos una vez en las últimas 8 semanas.
- **D-37:** Tests de integración: el endpoint de anotados nunca devuelve apellido completo, teléfono, sesiones de prueba ni a quien se ocultó. Un alumno no puede leer los puntos ni el historial de otro.
- **D-38:** Consulta de conciliación: los puntos que muestra la app son iguales a la suma del ledger, por usuario.
- **D-39:** Prueba en teléfono real, iOS incluido.
- **D-40:** Aviso mejorado al marcar asistencia: se dibuja en los sketches y se implementa si alguna variante convence.

**Ejecución**
- **D-41:** Planes con `gsd-executor` en sonnet, secuenciales, verificando typecheck y lint después de cada plan. Staging primero. Preguntar a Franco antes de cualquier push.
- **D-42:** Antes de planificar: `/gsd-sketch` y después un UI-SPEC.

### Claude's Discretion (copiado)
- Cómo se calcula el "Aura ganada" (suma del ledger sin canjes, o saldo más canjes) mientras la conciliación de D-38 se cumpla.
- Programas: 15 por semana y 100 por programa pasan a 8 y 50. El redondeo y si se tocan los valores ya cargados por programa quedan a criterio del planificador. Decirlo en el plan.
- Orden de los hechos en D-20.
- Cómo se estima el tiempo propuesto de los bloques por repeticiones.
- Qué se muestra mientras una foto está pendiente, cuándo se acreditan los 5 puntos, qué aviso recibe el alumno si se la rechazan y qué roles del staff aprueban.
- Redacción de los textos de cada movimiento y del aviso de visibilidad.
- Bucket, formato de la URL y redimensionado de la foto.
- Si `aura_config` pasa a ser la fuente de los montos o siguen en constantes de código.

### Deferred Ideas (OUT OF SCOPE, copiado)
- Fase siguiente: regalar Aura entre personas (el número visible tiene que poder sumar regalos después).
- Niveles de estatus de Aura. Economía con puntos gastables y volver a encender el descuento. Cortar la acreditación al staff. Aura retroactiva por antigüedad. Regla estricta por bloque (inicio registrado por el servidor).
- Posibles bugs sin tocar: `trialSpotsRemaining` fuera del schema, detalle de horario del staff sin filtrar cancelados, semana de programa acreditada una sola vez por inscripción, racha que cuenta sesiones y no días, reversa de asistencia que no se aplica sin saldo, canje que gasta antes de la transacción, plan a medida que manda inicio ≈ fin al retomar, `/sessions/complete` que no valida `dayId` contra fecha y nivel.
</user_constraints>

> Nota sobre lo diferido: el arreglo de `GoalPlanSession.vue:403` (inicio ≈ fin al retomar) figura como bug diferido. Pero con D-20 deja de ser cosmético: sin arreglarlo, un plan a medida retomado nunca da Aura. Recomiendo incluir ese arreglo de una línea en el plan de la app y avisarle a Franco (ver "Decisiones que necesitan a Franco").

## Project Constraints (from CLAUDE.md y skills)

- Logging: API con `request.log` y `app.log` (Pino), nunca `console.log`. Front con `createLogger()`.
- TypeScript sin `any`. `catch (err: unknown)` con `instanceof Error`.
- Toda ruta nueva de la API lleva test de integración en `el-templo-api/test/`, contra MySQL real (CI).
- Schema en `src/db/schema/` + SQL **a mano** en el mismo commit, numerado desde la **0344** (verificado: `origin/master` y `origin/staging` terminan en `0343_tv_class_state_timer_minutes.sql`). Nunca `drizzle-kit migrate` ni `db:push`.
- Runner propio: parte por `;` **antes** de sacar comentarios. Sin `;` en comentarios **ni dentro de literales de texto**. Si un statement falla con "already exists" o "Duplicate", el resto de los errores del archivo se saltean (`el-templo-db-migrations` §runner).
- Los datos de producción se cambian por migración. Los datos de prueba nunca van en una migración (staging y prod comparten el servidor MySQL).
- Variable de entorno nueva → `.env.example`. Esta fase no necesita ninguna: usa `R2_PRIVATE_BUCKET_NAME`, que ya existe.
- Staging primero, `git add` por ruta, sin `git add -A`. Push solo con OK de Franco. Sin bump de versión en fases GSD.
- No instalar ni actualizar dependencias.
- Patrones: stores Pinia con `setup`. Los composables exponen `cleanup()`, sin `onUnmounted` adentro.
- Tenancy: ruta nueva → `test/tenant-manifest.ts` + `ENTRADAS_BASELINE`. Bajo prefijos ISO-03 → caso de aislamiento + `CASOS_BASELINE`. Tabla nueva → los 5 conteos fijos. Lecturas nuevas con `tenantWhere` (la allowlist del lint no se agranda).
- Ejecutores sonnet: tests solo en primer plano, nunca `run_in_background`. Según la memoria de Franco, **no se corren suites locales**: solo typecheck local, y los tests corren en CI.
- CI **no** typechequea app ni admin. Hay que correr `vue-tsc` local, que tiene unos 21 errores preexistentes en el admin: comparar contra la base, no contra cero.

## Decisiones que necesitan a Franco

Escritas en lenguaje llano. Cada una con mi recomendación primero.

1. **Fotos que ya subió el staff desde la ficha.** Hoy están en una dirección pública y solo se ven en el admin. ¿Se muestran a los demás alumnos en la lista?
   **Recomiendo que no.** En la lista solo aparece la foto que el alumno sube y aprueba él mismo. Así nadie aparece con una foto que no eligió, y los 5 puntos se ganan subiéndola. Las fotos del staff siguen en la ficha como hoy.
2. **Interruptor para encender la lista.** ¿Agregamos un interruptor del servidor para prender la lista cuando ya salió el anuncio y la mayoría actualizó la app?
   **Recomiendo que sí**, porque quien todavía no actualizó la app no puede ocultarse pero ya aparece en la lista de los demás. Se prende con una migración en un deploy posterior, y en ese mismo deploy se ponen al día los puntos (punto 3 de la migración). Alternativa: un botón en Ajustes del admin, que es más código y más tests.
3. **Menores que cumplen 18 sin haber tocado la preferencia.** ¿Pasan a visibles solos ese día?
   **Recomiendo que sí, como cualquier adulto**, y que vean el aviso de primera vez. Dejarlos ocultos para siempre obliga a guardar el estado de cada uno.
4. **Alumnos sin fecha de nacimiento cargada.** ¿Se tratan como adultos (visibles) o como menores (ocultos)?
   **Recomiendo tratarlos como adultos.** La consulta 06 de abajo dice cuántos son.
5. **Bloquear personas.** Apple pide que el usuario pueda bloquear a otro. Google lo pide solo si hay chat o contenido público.
   **Recomiendo no construir bloqueo entre alumnos ahora**: no hay chat ni mensajes, y la foto pasa antes por el staff. Entra un botón "Reportar foto" que avisa al staff, el staff puede quitar la foto, y quien se siente incómodo puede ocultarse. Si Apple lo pide en la revisión, se agrega en la versión siguiente. Riesgo: un rechazo de Apple que demora una semana.
6. **Normas de la comunidad.** Google Play exige que la persona acepte unas normas antes de subir su foto.
   Hace falta un texto corto que Franco apruebe (cuatro o cinco renglones: foto propia, sin desnudos, sin ofensas, el staff puede quitarla) y un lugar donde leerlo.
7. **Los 367 importados.** Si la consulta 04 confirma que la base no tiene su fecha real, el único lugar donde está es el archivo del sistema anterior ("Socios según fecha de ingreso").
   ¿Lo tenés? Si sí, se arma una migración con esas fechas. Si no, **recomiendo dejarlos como están**: van a figurar con antigüedad desde marzo de 2026.
8. **Textos "+5" de la versión 1.9.6** (antes de los builds de tiendas). La 1.9.6 dice "+5 AURA" al estirar y en el bloque libre, y con la escala nueva sería +1 y +2.
   **Recomiendo sacar el número de esos textos en la 1.9.6** ("Sumás Aura al terminar"). Así la versión que queda en las tiendas no promete un monto viejo. Es un cambio chico en la rama de la 213, que hoy está en otro worktree.
9. **Quién aprueba fotos.** **Recomiendo los mismos roles que hoy suben la foto desde la ficha** (`MEMBER_ROLES`, incluye profes). Alternativa más estricta: solo owner, admin, gestión y recepción.
10. **Etiquetas de privacidad de las tiendas.** Hay que revisar en App Store Connect (privacidad) y en Play Console (Seguridad de los datos) que "Fotos" figure como dato recopilado y vinculado a la persona, para la función de la app. Probablemente ya figura por las fotos de Conquer. Es una tarea de Franco en las consolas, no de código.
11. **Plan a medida retomado.** Con la regla de tiempo, retomar una sesión de plan a medida hoy no daría Aura (la app manda mal la hora de inicio). **Recomiendo arreglarlo en la app** en esta misma fase (una línea). Quien no actualice la app no recibe Aura al retomar.

## Architectural Responsibility Map

| Capacidad | Capa principal | Capa secundaria | Por qué |
|---|---|---|---|
| Montos de Aura y regla de tiempo (D-19, D-20) | API | — | Lo que se acredita no puede depender del cliente |
| Re-valorización del historial (D-21) | Base de datos (migración) | — | Dato de producción, va por migración |
| "Aura ganada" por persona | API (SQL de agregación) | — | Una sola definición para lista, encabezado y Perfil |
| Lista de anotados y visibilidad | API | App (dibujo) | Privacidad: el servidor decide qué sale, el cliente no filtra |
| Preferencia de visibilidad y aviso visto | Base de datos (`member_profiles`) | API | Persistir y respetar en el servidor |
| Reducción de la foto (D-33) | App (cámara nativa + canvas) | — | Sin dependencias nuevas, y el servidor solo valida |
| Almacenamiento y entrega de la foto | R2 privado + URL firmada | API | No queda dirección pública (D-34) |
| Aprobación y reporte de fotos | API | Admin | El estado vive en la tabla |
| Encabezado, lista, detalle de Aura, aviso de asistencia | App | — | Dependen del UI-SPEC |
| Apagar el descuento (D-22) | Admin | — | Mismo precedente que el boarding pass |
| Medición (D-36) y conciliación (D-38) | Consultas SQL de solo lectura | — | Las corre Franco en producción |

## Standard Stack

No se agrega ninguna librería. Todo lo necesario ya está instalado.

| Pieza | Versión | Uso en la fase | Fuente |
|---|---|---|---|
| `@capacitor/camera` | 8.2.0 | Foto propia: cámara o galería, reducida en el teléfono | `el-templo-app/package.json:26` [VERIFIED: codebase] |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | 3.994.0 | URL firmada de subida y lectura (bucket privado de Conquer) | `conquer/private-media.ts` [VERIFIED: codebase] |
| `@fastify/rate-limit` | (instalado) | Tope de pedidos del endpoint de anotados | `shared/rate-limits.ts:7` [VERIFIED: codebase] |
| Canvas del navegador / WKWebView | — | Recorte y reducción a JPEG en web | API estándar del navegador [ASSUMED: soporte de `toBlob` en WKWebView, ya usado en `bar-challenge/composables/useImageComposer.ts:169`] |

**Sobre `@capacitor/camera` 8.2.0:** `getPhoto` y `pickImages` están marcados `@deprecated` en favor de `takePhoto` y `chooseFromGallery` (desde 8.1.0), pero siguen funcionando (`node_modules/@capacitor/camera/dist/esm/definitions.d.ts:83-92`) [VERIFIED: node_modules del checkout principal]. Conquer usa `getPhoto` (`useBodyCheckCamera.ts:133`). **Recomiendo `getPhoto` para mantener un solo patrón** y dejar anotado que la migración a la API nueva se hace cuando se actualice el plugin. En iOS el plugin siempre devuelve `format: "jpeg"` (`ios/Sources/CameraPlugin/CameraPlugin.swift:417-464`), así que **HEIC no llega nunca desde la app nativa** [VERIFIED: código del plugin].

**Instalación:** ninguna.

## Package Legitimacy Audit

No hay paquetes nuevos: la fase no instala nada (D-35). slopcheck no aplica.

| Package | Registry | Disposición |
|---|---|---|
| — | — | Sin paquetes nuevos |

**Paquetes removidos:** ninguno. **Sospechosos:** ninguno.

## Architecture Patterns

### Diagrama de flujo

```
ALUMNO (app)                               API                                         DATOS
────────────                               ───                                         ─────
Grilla de reservas ──tap horario──▶ GET /members/scheduling/slots/:id/:date/attendees
                                     │ 1. horario del gimnasio (tenantWhere) + ventana de fecha
                                     │ 2. reservas vigentes no-trial, sin borrados ─────▶ bookings ⨝ users ⨝ branches
                                     │    ⨝ member_profiles (visibilidad) ⨝ member_photos (aprobada)
                                     │ 3. ¿quién mira? staff o status=activo y visible → lista
                                     │    si no → solo número
                                     │ 4. Aura ganada de los alumnos visibles (1 GROUP BY) ─▶ aura_transactions
                                     │ 5. URL firmada por foto (HMAC local, sin red)        ─▶ R2 privado
                                     └▶ {total, canSeeList, attendees[], hiddenCount, viewer}

Perfil ──subir foto──▶ cámara/galería (nativo reduce) → canvas 480 px JPEG
         POST /members/profile-photo/upload-url ─▶ URL PUT firmada (10 min)
         PUT directo a R2 (fetch sin token)
         POST /members/profile-photo/confirm ─▶ HEAD (tamaño/tipo) → member_photos 'pendiente'
ADMIN ──revisión──▶ GET /admin/members/profile-photos ─▶ pendientes + reportadas (URL firmada)
         POST /admin/members/:userId/profile-photo/approve ─▶ 'aprobada' + Aura 5 (una vez, unique)
         POST .../reject | DELETE ... ─▶ estado + borrar objeto

Check-in QR ─▶ POST /members/attendance/check-in ─▶ award 5 ─▶ respuesta + {auraAwarded, auraTotal}
Sesión app  ─▶ POST /sessions/complete ─▶ registro (siempre) ─▶ regla D-20 ─▶ award 3 o nada
Mi Templo   ─▶ GET /members/aura/summary | /movements ─▶ ledger del propio usuario (JWT)
```

### Estructura de archivos recomendada (API)

```
el-templo-api/src/modules/aura/
  amounts.ts            # NUEVO: única fuente de montos (D-19), incl. hitos y rachas
  earned.ts             # NUEVO: earnedAuraSql / earnedAuraByUsers(db, ctx, ids)
  movement-labels.ts    # NUEVO: source/reference → texto para el alumno
  member-routes.ts      # NUEVO: /api/members/aura/summary y /movements (módulo templo-gamification)
el-templo-api/src/modules/sessions/
  proposed-time.ts      # NUEVO: tiempo propuesto + bloques requeridos (D-20), puro y testeable
el-templo-api/src/modules/members/
  profile-photo-service.ts   # NUEVO: estados, URL firmadas, Aura al aprobar
  profile-photo-routes.ts    # NUEVO: rutas del alumno
  (routes.ts)                # + rutas admin bajo /:userId/profile-photo/...
el-templo-api/src/modules/scheduling/
  attendees-service.ts  # NUEVO: consulta de anotados + visibilidad
el-templo-api/src/db/schema/member-photos.ts  # NUEVO
el-templo-api/src/db/migrations/0344..0347 (+ 0348 de puesta al día, en un deploy posterior)
```

### Patrón 1: montos en una sola tabla de constantes

**Qué:** `aura/amounts.ts` exporta `AURA_AMOUNTS` (attendance 5, attendanceReversal 5, onboarding 5, training 3, goalPlan 3, extraBlock 2, stretch 1, profilePhoto 5, programWeekDefault 8, programCompletionDefault 50), `TENURE_AURA` (3→15, 6→25, ≥12→50) y `STREAK_AURA` (7→5, 14→10, 30→15, 60→25, 100→50). Todas las llamadas a `award` pasan `amount` explícito.

**Por qué constantes y no `aura_config`:**
- `aura_config` lo vacía `cleanAllTestData`, así que cada test siembra su propio monto (`test/sessions/complete-aura-cap.test.ts:105-114`). Con config, los tests seguirían afirmando 10 y 5 aunque producción pague 3 y 1.
- Con constantes, los tests afirman contra `AURA_AMOUNTS` y no se desincronizan.
- Hoy cuatro fuentes leen config y el resto ya usa constantes repartidas (inventario §1.1).
- `is_active` no lo lee nadie.

La migración igual actualiza `aura_config` para que no mienta. La fase 198 ("Aura configurable", en espera) puede invertir esto después. [VERIFIED: codebase]

`awardOncePerLocalDay` (`aura/daily-award.ts:38-62`) no acepta monto: hay que agregarle `amount` a `DailyAwardInput` y pasarlo a `award`.

### Patrón 2: "Aura ganada" como suma del ledger sin canjes

```sql
-- earnedAuraSql: un canje es manual_adjustment con reference_type 'subscription'
-- (aura/pricing-benefits.ts:208-213). 'subscription_discount' no se usa pero se excluye igual.
SELECT t.user_id, COALESCE(SUM(t.amount), 0) AS earned
FROM aura_transactions t
WHERE t.tenant_id = :tenant
  AND t.user_id IN (:ids)
  AND t.source_type <> 'subscription_discount'
  AND NOT (t.source_type = 'manual_adjustment' AND t.reference_type = 'subscription')
GROUP BY t.user_id
```

- Una sola consulta para 20 personas, sin N+1. El índice único `unique_user_source_ref` arranca por `user_id` y sirve de filtro [VERIFIED: `db/schema/aura-transactions.ts:50-57`].
- Hoy da lo mismo que `aura_balances`: 2.898 de 2.898 coinciden y hay cero canjes.
- Deja lugar a los regalos de la fase siguiente: se suman como filas nuevas del ledger.
- Va en `aura/earned.ts`. Lo usan Aura del alumno, anotados, la respuesta del check-in y la conciliación.
- **Usar `tenantWhere(schema.auraTransactions, ctx)`**: código nuevo fuera de la allowlist.

### Patrón 3: URL firmada estable por una hora (fotos en listas)

```ts
// Source: conquer/private-media.ts:241-264 (presignGet) + @smithy/types RequestPresigningArguments.signingDate
// (verificado en node_modules/.pnpm/@smithy+types@4.12.0/.../signature.d.ts:20)
const HOUR_MS = 3_600_000;
const signingDate = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
const url = await getSignedUrl(
  client,
  new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: "private, max-age=3600" }),
  { expiresIn: 2 * 3600, signingDate },
);
```

Firmar es un HMAC local, sin llamada de red: 20 firmas cuestan menos de un milisegundo. Redondear `signingDate` a la hora hace que la misma foto tenga la misma URL durante una hora, y el WebView la toma de caché en vez de bajarla cada vez que se abre la lista. Para `/me` conviene un vencimiento largo (24 h): la app guarda el perfil toda la sesión. Hay que extender `PrivateMediaStore.presignGet` con un tercer parámetro opcional. Conquer no cambia, porque el parámetro es opcional y sus tests usan `vi.spyOn(privateMediaResolver, "resolve")`.

### Patrón 4: el circuito de subida privada de Conquer, copiado

Se copia `bodyCheck` (`conquer/body-check-service.ts:420-480`) con estos cambios:
- clave `private/avatars/{tenant}/{user}/{uuid}.jpg` y regex `isOwnAvatarKey` anclada;
- solo `image/jpeg` (la app siempre convierte a JPEG);
- la confirmación hace HEAD: tamaño > 0 y ≤ 8 MB, tipo `image/jpeg`.

Fail-closed: sin `R2_PRIVATE_BUCKET_NAME` responde 503 y nunca cae al bucket público (`private-media.ts:225-240`). El prefijo nuevo no cae en la regla de 60 días, que aplica solo a `private/conquer-corrections/` (`private-media.ts:13-15`). La CORS de PUT del bucket privado ya admite los orígenes de la app y del admin: Conquer sube desde los dos (`201-12-PLAN.md:32`) [VERIFIED: docs del repo].

### Patrón 5: idempotencia "una vez en la vida" con el unique del ledger

Para la foto: `award({ sourceType: "profile_photo", referenceType: "profile_photo", referenceId: userId, amount: 5 })`. Como `reference_id` **no es NULL**, el unique `(user_id, source_type, reference_type, reference_id)` bloquea el segundo intento y tira `ER_DUP_ENTRY`, que se captura igual que en `awardOncePerLocalDay`. Si la foto se quita y se aprueba otra, no hay segundo premio. No usar `reference_id` NULL: MySQL no cuenta los NULL en un unique (el caso del onboarding) [VERIFIED: CONTEXT + schema].

### Anti-patrones a evitar

- **Re-valorizar con fórmulas (`amount = amount / 2`, `CEIL(amount/2)`).** Si la migración se corta a la mitad y el runner la vuelve a correr, divide dos veces. Hay que mapear valor viejo → valor nuevo con condiciones que el valor nuevo no cumpla.
- **Filtrar la privacidad en la app.** El servidor no manda a los ocultos, ni el apellido, ni el `userId`. fast-json-stringify recorta lo que no está en el schema, pero no hay que depender de eso: la consulta no tiene que seleccionar `last_name` completo hacia la respuesta.
- **Rutas del admin por `:photoId`.** `enforceMemberBranchScope` lee solo `params.userId` o `params.memberId` (`shared/branch-access.ts:491-501`). Con `:photoId` el `admin_sede` podría aprobar fotos de otra sede.
- **Repetir la lista de roles de staff en la app.** El tipo `role` de la app está desactualizado (`stores/useUserStore.ts:41` tiene solo member, coach, admin y superadmin). `/me` tiene que mandar `auraVisible` calculado con `ALL_STAFF_ROLES`.
- **Tocar `attendanceRecordSchema`.** Es compartido con el check-in forzado y el del admin (`attendance/schemas.ts:17-32`). Hay que crear un schema propio para la respuesta del check-in del alumno.

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Subida privada de imágenes | Proxy de bytes por la API | URL PUT firmada + HEAD (`private-media.ts`) | Ya probado en producción, sin tráfico por el EC2 |
| Reducir y orientar fotos en nativo | Lógica propia en JS | `getPhoto({ width, quality, correctOrientation })` | El plugin reduce y convierte a JPEG en iOS y Android |
| Idempotencia de premios | Tabla de logros, SELECT antes de INSERT | Unique del ledger + captura de `ER_DUP_ENTRY` | Sin carreras, patrón ya usado en `daily-award.ts` |
| Membresía vigente | Otra consulta de suscripciones | `users.status = 'activo'` (lo mantiene `recomputeUserStatus` con `membershipInEffectSql`, `shared/membership.ts`) | Una sola definición de "miembro hoy" |
| Excluir Wellhub | Comparar strings sueltos | `isWellhubBookingSql` y `notWellhubAttendanceSql` (`shared/wellhub-sources.ts`) | Fuente única |
| Día local de la sede | Fecha UTC | `localDateForBranch` / `todayInTz` | Evita el corrimiento nocturno (memoria `test_shifts_utc_vs_tz`) |
| Anuncio a todos | Push a mano | Novedades con push (`communications/novedades-push.ts`) | Audiencia "activos", respeta la categoría `anuncios`, idempotente |

**Clave:** casi todo ya existe en el repo. El riesgo de esta fase está en la privacidad y en la migración, no en la tecnología.

## Runtime State Inventory

La fase no es un renombre, pero la re-valorización y el cambio de escala dejan estado fuera del código:

| Categoría | Qué hay | Acción |
|---|---|---|
| Datos guardados | `aura_transactions` (unas 44.600 filas) y `aura_balances` (2.898) con escala vieja. `aura_config` con 10/5/50 (`consultas/03…txt`). `programs.aura_weekly_bonus` 15 y `aura_completion_bonus` 100 (default de columna en `0061_micro_programs.sql:10-11`) | Migración 0344 (datos) + migración 0348 de puesta al día en un deploy posterior |
| Configuración viva | `system_settings` sin claves `streak.*` en prod (solo `referral.max_percent_cap`), así que rigen los defaults de código | Solo código (`STREAK_DEFAULTS`). Verificado en el bloque F de la consulta 03 |
| Estado registrado en el SO | Ninguno: el cron de antigüedad lee montos de código en cada corrida (`jobs/tenure-milestones.ts:173-180`) | Ninguna |
| Secretos y variables | `R2_PRIVATE_BUCKET_NAME` y `STAGING_R2_PRIVATE_BUCKET_NAME` ya existen (Conquer) | Ninguna |
| Artefactos instalados | Apps 1.9.x en teléfonos con textos "+5 AURA" y "+50" | No se arregla desde el servidor. Ver decisión 8 |
| Pestañas del admin abiertas | Un bundle viejo del admin sigue ofreciendo el selector de descuento hasta que se recargue | Riesgo bajo. Ver Pitfall 6 |

## Investigación por tema

### 1. Tiendas y fotos visibles entre usuarios (D-34)

**Apple, App Review Guideline 1.2 (Last Updated: October 16, 2026)** [CITED: developer.apple.com/app-store/review/guidelines/]. Las apps con contenido generado por usuarios "must include":
1. un método para filtrar material objetable antes de que se publique;
2. un mecanismo para reportar contenido ofensivo y respuesta a tiempo;
3. la posibilidad de bloquear usuarios abusivos;
4. datos de contacto publicados.

La guía no menciona fotos de perfil explícitamente. Que una foto visible a otros cuente como contenido generado por usuarios es interpretación mía [ASSUMED, consistente con la definición "upload, share"]. La 5.1.1 pide un texto de permiso claro, poder retirar el consentimiento y usar el selector del sistema para la galería.

**Google Play, política de User Generated Content** [CITED: support.google.com/googleplay/android-developer/answer/9876937, sin fecha en la página, consultada 2026-11-17]. UGC es "content that users contribute to an app, which is visible to or accessible by at least a subset of the app's users". La política exige:
- aceptar términos o normas **antes** de crear o subir contenido;
- definir qué es objetable;
- moderar;
- un sistema dentro de la app para reportar y bloquear.

Escalonado: las apps "limited to verified or registered users must provide in-app functionality to report content and users". El bloqueo es obligatorio solo con interacción uno a uno o contenido público. El artículo de ayuda (answer/12923286) agrega que el reporte y el bloqueo tienen que ser fáciles de encontrar y estar bien rotulados.

**Qué es obligatorio para esta fase y qué es recomendación:**

| Requisito | Apple | Google | Cómo se cumple | Estado |
|---|---|---|---|---|
| Filtrar antes de publicar | Obligatorio | Moderación obligatoria | Aprobación previa del staff (D-31) | Cubierto por diseño |
| Reportar contenido o usuario dentro de la app | Obligatorio | Obligatorio (usuarios registrados) | Botón "Reportar foto" en la fila → `POST /members/profile-photos/:photoId/report` → la foto vuelve a la cola del admin como "reportada" | **Entra** (D-34 lo prevé) |
| Respuesta a tiempo | Obligatorio | "taking action" | La cola del admin muestra las reportadas primero. El staff quita la foto | Proceso de Franco |
| Bloquear usuarios | Obligatorio | No obligatorio (sin chat ni contenido público) | El staff quita la foto y puede inhabilitar la subida. Ocultarse es la defensa del usuario | **Decisión 5** (riesgo de rechazo de Apple) |
| Contacto publicado | Obligatorio | — | La app ya tiene contacto (WhatsApp, ficha de tienda) [ASSUMED] | Verificar |
| Aceptar normas antes de subir | — | Obligatorio | Texto corto + casilla o "Al subir aceptás…" con enlace | **Decisión 6** |

**Etiquetas de privacidad:**
- Play: "sharing" es transferir a un tercero. Las exenciones cubren la acción iniciada por el usuario y el consentimiento [CITED: answer/10787469]. Mostrar la foto a otros miembros dentro de la app no está listado como sharing, así que la declaración que importa es la de **recopilación** de "Fotos" [ASSUMED: interpretación].
- Apple: "Photos or Videos" dentro de "User Content" [ASSUMED].
- Las fotos de Conquer ya son recopilación de fotos, así que lo más probable es que ya esté declarado. Franco lo verifica en las consolas (decisión 10).

**Permisos:**
- `NSCameraUsageDescription` (`src-capacitor/ios/App/App/Info.plist:48-49`) enumera usos y no menciona la foto de perfil: hay que sumarla (D-35). Cambiar Info.plist exige un binario nuevo.
- `NSPhotoLibraryUsageDescription` (`:52-53`) ya sirve.
- Android declara solo `CAMERA` (`AndroidManifest.xml:53`), sin `READ_MEDIA_IMAGES`. La galería pasa por el selector del sistema, en línea con la política de permisos de fotos de Play [VERIFIED: codebase].

**Menores:** la política de Play habla de proteger a los niños de contenido inapropiado. Con la aprobación previa y los menores ocultos por defecto (D-11), el riesgo queda acotado. No encontré una regla específica sobre fotos de perfil de menores [no encontrado].

### 2. Circuito de la foto propia (D-30 a D-35)

**Modelo de datos. Recomiendo una tabla nueva `member_photos`:**

```
member_photos
  id INT PK AI
  tenant_id INT NOT NULL (tenantIdColumn)
  user_id INT NOT NULL FK users
  storage_key VARCHAR(255) NOT NULL        -- private/avatars/{tenant}/{user}/{uuid}.jpg
  member_photo_status ENUM('pendiente','aprobada','rechazada','quitada','reemplazada') NOT NULL
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  reviewed_at TIMESTAMP NULL
  reviewed_by INT NULL FK users
  report_count INT NOT NULL DEFAULT 0
  last_reported_at TIMESTAMP NULL
  created_at / updated_at
  INDEX (tenant_id, member_photo_status, uploaded_at)   -- cola del admin
  INDEX (user_id, member_photo_status)                  -- foto vigente por persona
```

- **Ojo:** el primer argumento de `mysqlEnum` es el nombre físico de la columna. Tiene que ser byte a byte igual al SQL (`el-templo-db-migrations` Hard Rule 6).
- **Invariante:** como mucho una `pendiente` y una `aprobada` por persona. Se impone en el service dentro de una transacción con `SELECT … FOR UPDATE` sobre las filas del usuario. Una columna generada con unique sería más fuerte, pero exige registrar una unique global más en `TENANT_UNIQUE_ALLOWLIST`. No vale la pena.
- **Por qué tabla y no columnas en `users`:** se necesitan dos lugares a la vez (la aprobada que se muestra y la pendiente que se revisa), auditoría (quién aprobó y cuándo), un id opaco para reportar sin exponer `userId`, y no agrandar `users`.
- **Costo de la tabla:** los 5 conteos fijos de tenancy (ver tema 6).
- **Alternativa más barata (no recomendada):** cinco columnas en `users` (`photo_key`, `photo_pending_key`, `photo_status`, `photo_reviewed_by`, `photo_reported_at`). Evita los conteos, pero el reporte necesitaría exponer otro identificador y se pierde la historia.

**Estados y flujo** (las partes a criterio quedan resueltas así; se pueden cambiar en el UI-SPEC):
- Subir con una pendiente existente: se reemplaza la pendiente (se borra el objeto anterior).
- Subir con una aprobada: se crea una pendiente nueva y la aprobada se sigue mostrando a los demás. **Mientras está pendiente, los demás ven la foto anterior o las iniciales. El dueño ve su pendiente con la marca "en revisión".**
- Aprobar: la pendiente pasa a `aprobada`, la aprobada anterior pasa a `reemplazada` y se borra su objeto. **Aura 5 al aprobar** (no al subir: evita sumar puntos con fotos basura).
- Rechazar: `rechazada` + borrar el objeto + push "Tu foto no fue aprobada" (`queueAdHocNotification`, como `jobs/tenure-milestones.ts:193-201`). `/me` devuelve `photoStatus: 'rechazada'` hasta la próxima subida.
- Quitar (staff o el propio alumno): `quitada` + borrar el objeto. No devuelve Aura (D-30).
- Reportar: `report_count + 1`, `last_reported_at`. La foto sigue visible hasta que el staff decida. Si Franco prefiere, se oculta al primer reporte.
- `POST /me/delete-account` (`auth/routes.ts:1511-1600`) hoy pone `photoUrl: null` en `users`. **Tiene que marcar `quitada` las fotos del usuario y borrar los objetos**, con borrado best-effort.

**Fotos ya subidas por el staff:** viven en `users.photo_url`, en el bucket **público**, con clave `members/photos/{userId}-{Date.now()}.{ext}` (`members/routes.ts:2097-2107`). Hoy solo se ven en la ficha del admin (`AlumnoDetailPage.vue:27-29`) y en listados del admin (`members/service.ts:547, 902`). `web-public` usa `branches.photoUrl`, no la de usuarios.
- **Recomiendo no tratarlas como aprobadas y no mostrarlas en la comunidad** (decisión 1). Migrarlas al bucket privado no se puede hacer con una migración SQL: hay que copiar objetos con credenciales de R2.
- Hallazgo de seguridad previo a la fase: esas claves son medio adivinables (id + milisegundos) y la URL se guarda **antes** de que el PUT ocurra (`members/routes.ts:2110-2111`). Queda anotado y fuera de alcance.

**Reducir en el cliente sin dependencias (D-33):**
- **Nativo (iOS y Android):** `Camera.getPhoto({ quality: 80, width: 1080, resultType: Base64, source: Camera | Photos, saveToGallery: false, correctOrientation: true })`. El plugin reduce y devuelve JPEG. En iOS, aunque la foto original sea HEIC (`CameraPlugin.swift:417-464`) [VERIFIED].
- **Web:** `webUseInput: true` abre un `<input type="file" accept="image/*">` y **no reduce nada**. El plugin web además etiqueta como `jpeg` cualquier archivo que no sea png ni gif (`web.js:86-93`), así que un `.heic` llega con un formato falso [VERIFIED].
- **Un solo camino para todo:** pasar siempre por un canvas, en nativo y en web. Recorte cuadrado centrado, lado 480 px, `toBlob('image/jpeg', 0.82)`. Resultado: unos 30 a 60 KB, sin metadatos. El canvas no copia el EXIF, así que se cae el GPS [ASSUMED: comportamiento estándar del navegador, verificar con una foto con GPS en la prueba de iOS].
- Si el `Image` no puede decodificar (HEIC en Chrome de escritorio): error claro "Ese formato no se puede abrir, elegí una JPG o PNG". No es un rechazo por peso, así que D-33 se cumple.
- Safari de iOS convierte HEIC a JPEG al elegir con `accept="image/*"` [ASSUMED, sin verificar en dispositivo]. Safari de macOS decodifica HEIC.
- Orientación: decodificar con `<img>` (los navegadores modernos aplican el EXIF por defecto). Verificar en iOS (D-39).
- **Hoja de selección:** `CameraSource.Prompt` usa la hoja nativa con rótulos en inglés por defecto ("From Photos" / "Take Picture"). Recomiendo una hoja propia de Quasar con "Sacar foto" y "Elegir de la galería", y después `getPhoto` con `source: Camera` o `Photos`.

**Entregar la foto en una lista de 20 sin URL pública adivinable:**

| Opción | Costo | Privacidad | Caché | Recomendación |
|---|---|---|---|---|
| A. Bucket privado + URL firmada por fila (hora redondeada, 2 h) | 20 HMAC locales por pedido. Extender `presignGet` | Si se borra el objeto, se corta. Una URL filtrada vence en ≤2 h | Sí, dentro de la hora | **Recomendada**: mismo bucket, mismo patrón y mismo fail-closed que Conquer |
| B. Bucket público + clave UUID | Ninguno | Una URL filtrada sirve hasta que se borre el objeto. Las pendientes quedan públicas aunque no se adivinen | Total | Más simple, pero cumple D-34 "a medias" |
| C. Proxy por la API | Ancho de banda del EC2 | Máxima | Controlable | No: carga el servidor |

**Admin:** la cola de revisión se parece a `FeedbackPage.vue`: pestañas con `canSee` por rol (`:57-73`), ya usada para "sugerencias", que son propuestas de alumnos. Una pestaña "Fotos" encaja. La otra opción es una pestaña en Alumnos. La elección es del UI-SPEC. Las imágenes del admin usan URL firmada en `<img>`, que no necesita CORS.

**`/auth/me` devuelve** (la ruta no tiene schema de respuesta, así que no recorta campos [VERIFIED: `auth/routes.ts:974-1166`]):
- `photo: { url: string|null, status: 'none'|'pendiente'|'aprobada'|'rechazada', pendingUrl: string|null }`, con URL firmadas de 24 h;
- `communityVisible: boolean` (efectivo, ya aplicada la regla de menores y del exterior);
- `auraVisible: boolean` (`!ALL_STAFF_ROLES.includes(role)`).

El total de Aura **no** va en `/me`: `auth` es core y el detalle es del módulo de gamificación. El encabezado llama a `GET /members/aura/summary`.

### 3. Los 367 importados de marzo (D-29)

**Cómo se importó** [VERIFIED: codebase + git log]:
1. `src/db/import-members.ts` (fase 59, 2026-03-16) crea los usuarios. Si el CSV de cada sede trae "Fecha de ingreso", la usa como `created_at` (`:837-840`). Si no, queda la fecha del import, y la suscripción se crea con `startDate = fechaIngreso ?? hoy` y `notes = 'Importado desde CSV'` (`:1052-1067`).
2. `src/db/import-vigentes.ts` (2026-04-01) carga el historial de vigencias y **adelanta `created_at` a la vigencia más vieja** si es anterior (`:544-549`). Las suscripciones llevan `notes = 'Importado desde CSV (vigentes)'`.
3. `src/db/import-fecha-ingreso.ts` (2026-04-18) toma "Socios segun fecha de ingreso *.csv" del sistema anterior y **pisa `created_at` con la fecha más vieja por email**. Los emails que no coinciden se saltean y se reportan (`:262-301`).

**Conclusión:** los 367 que siguen con la fecha del import son los que no tenían fecha en el CSV de sedes, ni vigencias en el CSV de vigentes, ni email coincidente en el de fecha de ingreso. **Lo más probable es que la base no tenga su fecha real.** Si la tiene, sería en una suscripción importada con `start_date` anterior al alta, o en un cobro anterior. La consulta lo confirma o lo descarta. Los CSV no están en el repo.

**Consulta de solo lectura** (dejarla como `consultas/04-importados-marzo.sql`, no correrla sin OK):

```sql
-- 214 D-29: importados de marzo con la fecha del import como alta
-- SOLO LECTURA. Agregados, sin datos personales
SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 30000;

-- A. El día del pico de altas de marzo
SELECT DATE(u.created_at) AS dia, COUNT(*) AS altas, MIN(TIME(u.created_at)) AS primera, MAX(TIME(u.created_at)) AS ultima
FROM users u
WHERE u.tenant_id = 1 AND u.role = 'member'
  AND u.created_at >= '2026-03-01' AND u.created_at < '2026-04-01'
GROUP BY DATE(u.created_at) ORDER BY altas DESC LIMIT 3;

-- B. Completar con el día de A
SET @dia = 'YYYY-MM-DD';

-- C. Qué datos tienen esos alumnos que podrían dar la fecha real
SELECT COUNT(*) AS total,
  SUM(u.deleted_at IS NULL) AS vivos,
  SUM(u.status = 'activo') AS activos_hoy,
  SUM(u.email IS NULL OR u.email = '') AS sin_email,
  SUM(EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.notes LIKE 'Importado desde CSV%')) AS con_sub_importada,
  SUM(EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.start_date < DATE(u.created_at))) AS con_sub_anterior_al_alta,
  SUM(EXISTS (SELECT 1 FROM financial_transactions f WHERE f.member_id = u.id AND f.created_at < u.created_at)) AS con_cobro_anterior,
  SUM(EXISTS (SELECT 1 FROM member_notes n WHERE n.user_id = u.id)) AS con_notas_de_import
FROM users u
WHERE u.tenant_id = 1 AND u.role = 'member' AND DATE(u.created_at) = @dia;

-- D. Si C da con_sub_anterior_al_alta > 0: distribución por año de la fecha candidata
SELECT YEAR(x.candidata) AS anio, COUNT(*) AS alumnos
FROM (
  SELECT u.id, (SELECT MIN(s.start_date) FROM subscriptions s WHERE s.user_id = u.id) AS candidata
  FROM users u
  WHERE u.tenant_id = 1 AND u.role = 'member' AND DATE(u.created_at) = @dia
) x
WHERE x.candidata < @dia
GROUP BY YEAR(x.candidata) ORDER BY anio;
```

**Efecto sobre los hitos de antigüedad si se corrige `created_at`:**
- El cron premia solo si **hoy** es exactamente el aniversario (`milestoneOnDate`, `jobs/tenure-milestones.ts:120-129`), sin retroactivo. Al mover el alta al pasado, **los hitos ya pasados no se disparan** (no hay avalancha de puntos ni de push). Los futuros llegan en la fecha real.
- **Se pierde** el hito que tocaba por la fecha del import. Ejemplo: el "1 año" de marzo de 2027 deja de existir y llega el de la fecha real.
- Quien ya cobró el hito de 6 meses por la fecha del import (septiembre de 2026, `reference_id = 6`) lo conserva. No se duplica: el unique protege el par.
- La línea "Cumple X en El Templo" del admin (`milestoneInWindow`, stateless) puede aparecer una vez en la próxima clase si un aniversario real cae dentro de la ventana.
- El sello `VeteranSeal` pasa a oro de inmediato, que es el efecto buscado.
- **Efectos colaterales:** `users.created_at` lo leen analytics (altas por mes), `member-flows`, `funnel`, segmentación, audiencias de campañas, aniversarios, `notifications/rules.ts` y `trials-service`. Corregir mueve 367 altas de marzo de 2026 a meses viejos en los reportes. Franco tiene que saberlo.

### 4. Migración de re-valorización (D-18, D-19, D-21)

**Mapa fila por fila.** Cada regla exige el valor **viejo** exacto, así que correrla dos veces no cambia nada:

| `source_type` | `reference_type` (prod) | Condición | Nuevo | Filas prod | Total hoy → nuevo |
|---|---|---|---|---|---|
| `attendance` | `attendance` | `amount = 10` | 5 | 41.468 | 414.680 → 207.340 |
| `manual_adjustment` | `attendance_reversal` | `amount = -10` | -5 | 139 | -1.390 → -695 |
| `onboarding_completion` | NULL | `amount = 50` | 5 | 2.195 | 109.750 → 10.975 |
| `tenure_milestone` | `tenure_milestone` | `reference_id = 3 AND amount = 50` | 15 | ~190 | |
| `tenure_milestone` | `tenure_milestone` | `reference_id = 6 AND amount = 100` | 25 | ~142 | |
| `tenure_milestone` | `tenure_milestone` | `reference_id >= 12 AND amount = 250` | 50 | ~79 | 43.450 → ~10.350 |
| `streak_bonus` | `streak_milestone` | `(7,20)` `(14,35)` `(30,50)` `(60,100)` `(100,200)` por `reference_id` | 5 / 10 / 15 / 25 / 50 | 4 | 95 → ~25 |
| `training_completion` | `completed_session` (viejas) y `training_day` (actuales) | `amount = 10`, sin mirar `reference_type` | 3 | 252 | 2.520 → 756 |
| `goal_plan_completion` | `goal_plan_session` / `goal_plan_day` | `amount = 10` | 3 | 1 | 10 → 3 |
| `extra_block` | `extra_block_day` | `amount = 5` | 2 | 0 | — |
| `stretch` | `stretch_day` | `amount = 5` | 1 | 0 | — |
| `program_week_completion` | `program_enrollment` | `amount = 15` | 8 | 19 | 285 → 152 |
| `program_completion` | `program_enrollment` | `amount = 100` | 50 | 0 | — |
| `referral` | `subscription` | `amount = 0` | sin cambio | 50 | 0 |
| `manual_adjustment` | `subscription` (canje) | — | sin cambio | 0 | — |

Total aproximado: de 569.400 a unos 229.000. Fuente de las filas: `consultas/01-distribucion-aura.resultado-2026-11-17.txt`.

- **Idempotencia entre reglas:** el valor nuevo nunca cumple la condición de otra regla del mismo `source_type`. Por ejemplo, el nuevo (100 sesiones, 50) no cumple la regla (30, 50) porque esa exige `reference_id = 30`. El nuevo (12 meses, 50) no cumple (3, 50).
- **Filas que no encajan en ninguna regla** (montos raros, `challenge`, `social`, ajustes manuales con otro `reference_type`): **quedan como están** y se listan con la consulta de control previa. Lo esperado es cero filas, salvo el caso conocido de una fila de antigüedad de 100 que hay que confirmar (411 filas contra 410 en el inventario).
- **Programas** (a criterio, se informa en el plan): `UPDATE programs SET aura_weekly_bonus = 8 WHERE aura_weekly_bonus = 15` y `aura_completion_bonus = 50 WHERE aura_completion_bonus = 100`. Es idempotente. Los valores personalizados no se tocan y se listan con la consulta de control. Además, `ALTER TABLE programs ALTER aura_weekly_bonus SET DEFAULT 8` y `… aura_completion_bonus SET DEFAULT 50`, el schema `micro-programs.ts:34-35`, los fallbacks `?? 15` y `?? 100` en `programs/service.ts:108-109, 198-199, 888-889` y los defaults del asistente del admin `ProgramWizardDialog.vue:427-428, 669-670`.
- **`aura_config` coherente:** `UPDATE aura_config SET default_amount = X WHERE aura_config_source_type = 'Y'`, con training 3, goal_plan 3, extra_block 2, stretch 1, onboarding 5 y attendance 5 (ya está en 5). Idempotente.
- **Saldos:**
  ```sql
  UPDATE aura_balances b
  LEFT JOIN (SELECT user_id, SUM(amount) AS s FROM aura_transactions GROUP BY user_id) x ON x.user_id = b.user_id
  SET b.balance = COALESCE(x.s, 0)
  ```
  Es idempotente.
- **Respaldo previo** (los deploys no respaldan la base), con el patrón de `0183_backfill_lost_leads.sql:40-44`:
  ```sql
  CREATE TABLE aura_transactions_backup_0344 AS
  SELECT id, user_id, source_type, reference_type, reference_id, amount, created_at FROM aura_transactions
  ```
  y lo mismo con `aura_balances_backup_0344 (user_id, balance)`.
  - El nombre **tiene que** terminar en `_backup_<n>`: el verificador de uniques reconoce ese patrón y lo trata como advertencia (`verify-tenant-uniques.ts:90-97`).
  - **Sin `tenant_id` y sin índices** (no usar `CREATE TABLE … LIKE`): si no, el verificador vería una unique sin clasificar.
  - Si el runner vuelve a correr el archivo, el `CREATE` falla con "already exists". El runner saltea ese error y sigue con los UPDATE, que son idempotentes. El respaldo conserva los valores originales.
- **Sin `;` en comentarios ni en literales.** Ningún texto del ledger lleva `;`.

**La ventana del deploy.** El deploy hace rsync → migraciones → reinicio. Entre la 0344 y el reinicio, la API vieja sigue acreditando 10 por asistencia (unas 300 por día). Esas filas quedan en la escala vieja. Solución: **una migración 0348 de puesta al día con exactamente los mismos UPDATE y el recálculo de saldos, en un deploy posterior.** Lo natural es el que prende la lista (decisión 2), así los puntos están conciliados en el momento en que se vuelven visibles. Antes de ese deploy nada muestra totales.

**Orden de los archivos:**
- 0344 re-valorización y programas;
- 0345 enums `profile_photo` (agregados al final en `source_type` y `aura_config_source_type`, + `INSERT IGNORE` de la fila de config);
- 0346 `member_photos`;
- 0347 `member_profiles` + 2 columnas;
- 0348 puesta al día + interruptor (deploy posterior).

**Verificación (conciliación D-38)**, en `consultas/05-conciliacion-aura.sql`:

```sql
SET SESSION TRANSACTION READ ONLY;
-- 1. Control previo: filas que ninguna regla mapea (esperado: vacío o casos conocidos)
SELECT source_type, IFNULL(reference_type,'-') AS ref, amount, COUNT(*) AS filas
FROM aura_transactions
WHERE NOT (
     (source_type = 'attendance' AND amount IN (10, 5))
  OR (source_type = 'manual_adjustment' AND reference_type = 'attendance_reversal' AND amount IN (-10, -5))
  OR (source_type = 'onboarding_completion' AND amount IN (50, 5))
  OR (source_type = 'tenure_milestone' AND ((reference_id = 3 AND amount IN (50, 15)) OR (reference_id = 6 AND amount IN (100, 25)) OR (reference_id >= 12 AND amount IN (250, 50))))
  OR (source_type = 'streak_bonus' AND (reference_id, amount) IN ((7,20),(7,5),(14,35),(14,10),(30,50),(30,15),(60,100),(60,25),(100,200),(100,50)))
  OR (source_type IN ('training_completion','goal_plan_completion') AND amount IN (10, 3))
  OR (source_type = 'extra_block' AND amount IN (5, 2))
  OR (source_type = 'stretch' AND amount IN (5, 1))
  OR (source_type = 'program_week_completion' AND amount IN (15, 8))
  OR (source_type = 'program_completion' AND amount IN (100, 50))
  OR (source_type = 'referral' AND amount = 0)
)
GROUP BY source_type, ref, amount;
-- 2. Saldo guardado = suma del ledger, por usuario (esperado: difieren = 0)
SELECT COUNT(*) AS usuarios, SUM(b.balance = COALESCE(x.s,0)) AS coinciden, SUM(b.balance <> COALESCE(x.s,0)) AS difieren
FROM aura_balances b LEFT JOIN (SELECT user_id, SUM(amount) s FROM aura_transactions GROUP BY user_id) x ON x.user_id = b.user_id;
-- 3. Aura ganada (sin canjes) = saldo mientras no haya canjes (esperado: 0 filas)
SELECT COUNT(*) FROM aura_transactions WHERE source_type = 'manual_adjustment' AND reference_type = 'subscription';
-- 4. Filas en escala vieja (después de la 0348: esperado 0)
SELECT source_type, COUNT(*) FROM aura_transactions
WHERE (source_type = 'attendance' AND amount = 10) OR (source_type = 'onboarding_completion' AND amount = 50)
   OR (source_type = 'training_completion' AND amount = 10) GROUP BY source_type;
```

**Constantes a cambiar** (líneas verificadas):
- `attendance/service.ts:391, 563, 1041` (10 → `AURA_AMOUNTS.attendance`) y la reversa `:1301`.
- `onboarding/service.ts:71, 176` (50 → 5). **Arreglar también `:68` y `:173`**: hoy guardan en `auraAwarded` el **saldo** que devuelve `award`, no el monto. Con montos chicos, la app mostraría "+5" cuando en realidad se sumaron 5 a un saldo de 300. La app hace `auraAwarded || 50` (`OnboardingResult.vue:24`, `OnboardingRecommendation.vue:14`).
- `shared/tenure-milestones.ts:35-44` (y su comentario).
- `aura/streak-reward.ts:44-50`. La descripción `Racha de N dias` en `:142` conviene pasarla a "sesiones": la racha cuenta sesiones (bug diferido).
- `sessions/routes.ts:568-573` y `goal-plans/routes.ts:426-431`: monto explícito 3 + regla D-20.
- `sessions/free-blocks-service.ts:542-548` (2) y `sessions/stretch-service.ts:835-841` (1).
- `programs/service.ts`, `micro-programs.ts` y `ProgramWizardDialog.vue`, como arriba.

**Tests que cambian** (estimado: 15 a 18 archivos, entre 60 y 80 aserciones o fixtures):
- `onboarding/onboarding.test.ts` (7 × 50 en `:67, 111, 553, 563, 569, 586`; y `auraAwarded` pasa a ser el monto).
- `unit/tenure-milestones.test.ts:54-58, 144-154` y `jobs/tenure-milestones.test.ts:127-134`.
- `attendance/attendance.test.ts:346, 896-909` (`amount === 10`) y `attendance/attendance-cross-tenant.test.ts`, en títulos y aserciones de "+10" (`:233-314`).
- `scheduling/scheduling.test.ts:3155` (`>= 10`).
- `sessions/stretch-complete.test.ts:293` y `sessions/free-blocks-complete.test.ts:291, 358`.
- `streaks/streak-service.test.ts:244` y `sessions/session-complete-streak.test.ts:125` (training 10).
- `sessions/complete-aura-cap.test.ts` y `goal-plans/complete-aura-cap.test.ts`. Además del monto, la regla D-20 los rompe: ver tema 5.
- Nuevos: `test/migrations/0344-aura-revaluation.test.ts`, con el precedente de `test/backfill-lost-leads.test.ts`. Extrae los UPDATE reales con `splitSqlStatements`, los corre sobre filas sembradas con valores viejos, verifica los nuevos y **los vuelve a correr** para probar la idempotencia. También prueba que una fila con monto raro no se toca.
- `0285-0286-extra-blocks.test.ts` y `0342-aura-source-stretch.test.ts` ya afirman "incluye" y no "termina en", así que la 0345 no los rompe (memoria `tests_enum_termina_en`). Antes de commitear la 0345: `grep -rn "termina en\|values.length - 1" el-templo-api/test/migrations/`.

### 5. Regla de tiempo para entrenar en la app (D-20)

**Qué hay hoy** [VERIFIED]:
- `POST /sessions/complete` calcula `durationSec = completedAt(servidor) − startedAt(cliente)`, con piso en 0 (`sessions/routes.ts:477-485`).
- Guarda la sesión y después premia una vez por día local (`:556-575`).
- El cuerpo trae `blocksCompleted: string[]` con **roles** (`schemas.ts:328-351`).
- `sessionService.getSessionByDayId(dayId, true)` reconstruye bloques y prescripciones (`sessions/service.ts:574-600`).
- El plan a medida usa la misma reconstrucción (`goal-plans/service.ts:735-738`) y no guarda `duration` (`goal-plans/routes.ts:356-369`).

**Regla más simple que cumple D-20** (archivo puro `sessions/proposed-time.ts`):

1. **Bloques requeridos**, copiando `useSessionPlayer.ts:66-120`:
   - Si la sesión tiene `DEUTEROS_1` o `DEUTEROS_2`, los requeridos son `INITIUM` y `NUCLEUS` (los que existan), **el Deuteros que esté en `blocksCompleted`** (si vienen los dos, se toma el de menor tiempo) y el `ATHLOS` o `EPIKOS` presente.
   - Si no hay Deuteros (ROM, combos, técnica), los requeridos son todos los bloques.
   - Están "todos los bloques" si cada rol requerido aparece en `blocksCompleted`. Si no hay ningún bloque requerido, no hay Aura (fail-closed).
2. **Tiempo propuesto por bloque**, en segundos:
   - **Tiempo fijo:** `amrap`, `amrap_series`, `time_cap`, `for_tech`, `open_style` con minutos → minutos × 60. `emom` y `every_x_seconds` → `totalMinutes`. `emom_for_time` → `emomMinutes`. `on_the_x` → intervalo × rondas. `tabata` → (trabajo + descanso) × rondas. `interval` y `hiit` → (trabajo + descanso) × rondas × ejercicios.
   - Es la misma tabla de `tv/timer-spec.ts:63-226` (`toTimerSpec`), y conviene reusarla: `countdown.totalMs`, `interval.intervalMs × rounds`, `work_rest (workMs + restMs) × rounds`.
   - **Sin tiempo declarado (por repeticiones), incluidos los de tope opcional:** la estimación de la app (`blockMeta.ts:103-114`): por ejercicio `seconds > 0 ? seconds : reps × 3`, más `rest`, por `rounds` o `totalRounds`, mínimo 60 s.
   - **Con tope** (`for_time`, `death_by`, `rounds_for_time`…): `min(estimación, tope)`. El tope es un máximo: terminar rápido es legítimo.
3. **Propuesto total** = suma de los bloques requeridos.
4. **Aura** si:
   - bloques completos,
   - `durationSec ≥ 0.8 × propuesto`,
   - `startedAt` no está en el futuro (más de 5 min) ni a más de 12 h,
   - **y no hay asistencia** (`attendance`, cualquier origen) del alumno con `session_date = localDate` de su sede.

   Si no se cumple, la sesión se guarda igual y la racha y el programa siguen como hoy.
5. Log: `request.log.info({ dayId, proposedSec, durationSec, ratio, blocksOk, attendedToday, awarded }, "Regla de Aura de la sesión")`. Sirve para medir cuántos quedan afuera en las primeras semanas.

**Casos borde:**
- **Propuesto 0:** no ocurre si hay bloques, por el mínimo de 60 s por bloque.
- **Deuteros:** resuelto por `blocksCompleted`.
- **Plan a medida:** `GoalPlanSession.vue:403` manda `startedAt = ahora` si `sessionStartedAt` es null, y es null al retomar después de cerrar la app (`:305-306`). Duración ≈ 0, sin Aura. Se arregla copiando `DayPlayer.vue:379-382`: al retomar, `new Date(Date.now() − elapsedSeconds × 1000)`. Requiere build. Conviene además guardar `duration` en `goal-plans/routes.ts` para parejo con `/sessions/complete`.
- **`startedAt` sin ventana:** el tope de 12 h solo frena el truco burdo (mandar un inicio de ayer). Alguien que mande `ahora − 0,8 × propuesto` pasa igual. **Eso no está cubierto, y es la regla estricta diferida.**
- **Orden de los hechos:**
  - Asistencia primero y app después: la app no da Aura (cubierto).
  - **App primero y asistencia después el mismo día: recomiendo no revertir.** El alumno queda con 3 + 5 ese día. Es raro (78 alumnos usan la app de entrenamiento en total), y revertir obliga a otra fila de reversa sin vínculo y a explicarla en el historial.
  - **No cubierto:** sesión en la app a las 8 y clase a las 19 el mismo día suman las dos.

**Tests afectados por la regla** (además del monto):
- `sessions/complete-aura-cap.test.ts` (manda `startedAt: new Date()` y `blocksCompleted: ["INITIUM","NUCLEUS"]`, `:53-54`).
- `goal-plans/complete-aura-cap.test.ts`.
- `streaks/streak-service.test.ts` (`:244`).
- `sessions/session-complete-streak.test.ts` (`:125`).
- `sessions/sessions.test.ts` y `goal-plans/goal-plans.test.ts`, si afirman Aura.

Hace falta un helper de test que siembre una sesión aprobada **con bloques y prescripciones** y devuelva el `startedAt` que alcanza el 80 %. Casos nuevos:
- sin bloques completos, sin Aura;
- 79 % sin Aura y 80 % con Aura;
- asistencia el mismo día, sin Aura;
- inicio a más de 12 h, sin Aura;
- la sesión se guarda en todos los casos y la racha avanza igual.

Más tests unitarios puros de `proposed-time.ts` en `test/unit/`.

### 6. Endpoint de anotados y visibilidad (D-01 a D-11)

**Ruta:** `GET /api/members/scheduling/slots/:scheduleId/:date/attendees` en `schedulingMemberRoutes` (`scheduling/routes.ts:1168`). Hereda `authenticate + attachCountryScope` del hook del plugin (`:1233-1236`).

**Validaciones:**
- `scheduleId` entero.
- `date` con patrón `^\d{4}-\d{2}-\d{2}$` y dentro de una ventana: desde hoy (zona de la sede) hasta hoy + 31 días. Así no se puede reconstruir quién vino a qué clase en el pasado.
- Horario del gimnasio con `tenantWhere(schedules)`. Si no existe o es de otro gimnasio, 404 (indistinguible).
- Tope de pedidos: entrada nueva en `RATE_LIMITS`, por ejemplo `attendees: { max: 120, timeWindow: "1 minute" }`. El tope es por IP y en la sede hay Wi-Fi compartido, por eso conviene generoso.

**Consulta** (un solo round-trip para las filas, otro para el Aura):

```sql
SELECT b.id, b.booked_at, u.id AS uid, u.first_name, LEFT(u.last_name, 1) AS last_initial,
       u.role, u.status, u.date_of_birth, br.country AS branch_country,
       mp.community_visible, ph.id AS photo_id, ph.storage_key,
       (b.source = 'wellhub') AS is_wellhub_booking
FROM bookings b
JOIN users u ON u.id = b.member_id AND u.tenant_id = :t AND u.deleted_at IS NULL
JOIN branches br ON br.id = u.branch_id AND br.tenant_id = :t
LEFT JOIN member_profiles mp ON mp.user_id = u.id AND mp.tenant_id = :t
LEFT JOIN member_photos ph ON ph.user_id = u.id AND ph.tenant_id = :t AND ph.member_photo_status = 'aprobada'
WHERE b.tenant_id = :t AND b.schedule_id = :scheduleId AND b.booking_date = :date
  AND b.booking_status IN ('reservado','qr_escaneado','confirmado')
  AND b.is_trial = 0
ORDER BY b.booked_at, b.id
```

- Usa el índice `idx_bookings_schedule_date_status`.
- Los turnos fijos creados en lote empatan en `booked_at`, por eso se desempata por `id`.
- `LEFT(last_name, 1)` en SQL: el apellido completo no sale nunca de la base hacia el handler.
- En Drizzle cada join lleva `tenantWhere`. `users`, `bookings`, `member_profiles` y `branches` son strict, y el sentinel tira si falta.

**Reglas de visibilidad:**
- **Visible por defecto:**
  `visible = mp.community_visible ?? !(menor || exterior)`
  - `menor`: `date_of_birth` no nulo y edad < 18 a la fecha de hoy en la zona de la sede.
  - `exterior`: `branch_country <> 'AR'`.
  - `date_of_birth` nulo cuenta como adulto (decisión 4).
- **Quién ve la lista (D-09 y D-07):**
  - El que mira es staff (`ALL_STAFF_ROLES`): ve la lista.
  - Si no, tiene que tener `status = 'activo'` **y** ser visible él mismo.
  - Si no se cumple: solo `total`, con `reason` `sin_plan` u `oculto`.
  - Si el interruptor está apagado: `reason = 'apagado'` y solo número. Así la app vieja y la nueva conviven.
- **Puntos (D-08 y D-15):**
  - `null` para staff y para Wellhub (`status = 'wellhub'` o reserva Wellhub).
  - `null` si el módulo `templo-gamification` está apagado para el gimnasio (`isModuleEnabled`).
  - Para el resto, `earnedAuraByUsers` en una sola consulta.
- **"Plan vigente" = `users.status = 'activo'`**: es la única definición, mantenida por `recomputeUserStatus` con `membershipInEffectSql` (`shared/membership.ts:56-63`). Excluye planes `is_trial`. Freemium, prueba, inactivo y wellhub ven solo el número.

**Respuesta** (schema declarado completo):

```
{ total: int,                    // reservas vigentes no-trial de cuentas no borradas
  canSeeList: boolean,
  reason: 'ok'|'sin_plan'|'oculto'|'apagado',
  attendees: [{ firstName: string, lastInitial: string|null, photoUrl: string|null,
                photoId: int|null,      // solo para "Reportar"
                aura: int|null, kind: 'alumno'|'staff'|'wellhub', isMe: boolean }],
  hiddenCount: int,
  viewer: { visible: boolean, noticeSeen: boolean } }
```

Nunca `userId`, apellido, teléfono ni email. `total` puede diferir en ±1 del `bookedCount` de la grilla, porque la grilla no excluye cuentas borradas (`scheduling/service.ts:384-399`).

**Dónde guardar la preferencia y el "ya vi el aviso":** dos columnas nuevas en **`member_profiles`**: `community_visible TINYINT(1) NULL` (NULL = regla por defecto) y `community_notice_seen_at TIMESTAMP NULL`.
- Es la tabla 1:1 del miembro, ya guarda "vistos" (`intro_stories_seen_at`) y tiene el upsert probado contra carreras (`auth/routes.ts:1441-1467`, `onDuplicateKeyUpdate` + `COALESCE`).
- Agregar columnas **no** dispara los 5 conteos.
- `notification_preferences` no sirve tal cual: su categoría es un enum cerrado.

Rutas:
- `PUT /api/members/scheduling/attendees/visibility { visible: boolean }`
- `POST /api/members/scheduling/attendees/notice-seen` (idempotente)

**Gates exactos que disparan las rutas y la tabla nuevas:**

| Gate | Archivo | Qué cambia |
|---|---|---|
| ISO-01 manifiesto | `test/tenant-manifest.ts` + `test/tenancy/iso-01-manifiesto.test.ts:473` | 13 claves nuevas (lista abajo). `ENTRADAS_BASELINE` 577 → 590 y el título del `it` |
| ISO-03 subs+sched | `iso-03-sched-lecturas.test.ts` / `iso-03-sched-escritura.test.ts` + `iso-03-cobertura-subs-sched.test.ts:201` | 3 casos (attendees, visibility, notice-seen) con dos `it` cada uno (ajeno = 404 + control positivo). `CASOS_BASELINE` 74 → 77 |
| ISO-03 members | `iso-03-members-*.test.ts` + `iso-03-cobertura-members.test.ts:198` | 4 casos (cola, aprobar, rechazar, quitar). `CASOS_BASELINE` 38 → 42 |
| Tabla gym-owned | `src/db/tenant-tables.ts` (`GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES.members`) | + `member_photos` |
| Conteos fijos | `test/db/tenant-tables.test.ts:152, 157` (135 → 136, 140 → 141) y `MODULOS_DECLARADOS`; `test/migrations/0196-tenant-unique-contracts.test.ts:616-656` (135 → 136, título y mensaje); `test/migrations/0192-0195-tenant-columns.test.ts` (`gymOwnedChecked`) | Mismo commit |
| Limpieza de tests | `test/helpers.ts:197` (`TABLES_TO_CLEAN`, antes de `users`) + limpieza del segundo gimnasio en fixtures | FK a `users` |
| Lint de tenancy | `pnpm --dir el-templo-api lint:tenant` | Lecturas nuevas a Aura con `tenantWhere`. Prohibido agrandar `tenant-lint-allowlist.json` |
| Uniques | `verify-tenant-uniques` | Sin uniques nuevas en `member_photos` (solo índices), así que no hay entrada en la allowlist |

Las 13 rutas:
- `GET /api/members/scheduling/slots/:scheduleId/:date/attendees`
- `PUT /api/members/scheduling/attendees/visibility`
- `POST /api/members/scheduling/attendees/notice-seen`
- `GET /api/members/aura/summary`
- `GET /api/members/aura/movements`
- `POST /api/members/profile-photo/upload-url`
- `POST /api/members/profile-photo/confirm`
- `DELETE /api/members/profile-photo`
- `POST /api/members/profile-photos/:photoId/report`
- `GET /api/admin/members/profile-photos`
- `POST /api/admin/members/:userId/profile-photo/approve`
- `POST /api/admin/members/:userId/profile-photo/reject`
- `DELETE /api/admin/members/:userId/profile-photo`

Las de Aura van como `categoria: "templo-module", modulo: "templo-gamification"`, igual que `POST /api/bar-challenge/result` (`tenant-manifest.ts:2057-2060`). Las demás como `tenant-scoped`. Si se agrega el botón de Ajustes de la decisión 2, son 2 rutas más (sin prefijo ISO-03 de settings). Hay que contar de nuevo las claves al cerrar el plan: el número es el que importa.

**Import core → módulo:** el doc 04 prohíbe que el core importe del módulo salvo por hooks. Pero `attendance`, `sessions`, `programs`, `onboarding` y `goal-plans` ya importan `AuraService` directo, y ningún test lo impide (solo está documentado en `shared/hooks.ts:1-12`). Recomiendo importar `earnedAuraByUsers` desde scheduling y attendance (precedente) y condicionarlo con `isModuleEnabled`. Agregar un filter nuevo al registry cerrado (`hooks.ts:13-17`: "No se agrega un tercero sin releer el doc 04") es desproporcionado.

### 7. Endpoint de Aura del alumno (D-12, D-13, D-15)

**Montaje:** plugin nuevo `aura/member-routes.ts`, agregado a `temploGamificationModule.routes` (`aura/module.ts:34`) con prefijo `/api/members/aura`. Así queda bajo `moduleScope`: con el módulo apagado responde 404 (`mod-01-guard`). Usa `fastify.authenticate` + `attachCountryScope` + `assertTenant`.

**Rutas (solo el propio usuario; no hay parámetro `userId`, así que leer lo de otro es imposible por construcción):**
- `GET /summary` devuelve `{ earned: int }`.
- `GET /movements?before=<id>&limit=20` (máx. 50) devuelve `{ movements: [{ id, amount, label, createdAt }], nextBefore: int|null }`.
  - Keyset por `id DESC`: `WHERE user_id = :me AND amount <> 0 AND id < :before ORDER BY id DESC LIMIT limit + 1`.
  - El filtro por `user_id` usa el índice único. El orden lo resuelve un filesort sobre unas 400 filas por persona como máximo.
  - `amount <> 0` oculta los referidos (D-13). Las reversas salen en negativo.
- **Staff (`ALL_STAFF_ROLES`): 404 `{ error: "No encontrado" }`** en las dos rutas. Hace cumplir D-15 en el servidor y es fácil de testear. La acreditación al staff sigue.

**Textos por motivo** (`movement-labels.ts`; la redacción final es del UI-SPEC):

| source_type / reference_type | Texto propuesto |
|---|---|
| `attendance` | Clase |
| `manual_adjustment` / `attendance_reversal` | Asistencia anulada |
| `manual_adjustment` / `subscription` | Canje: descuento en tu plan |
| `onboarding_completion` | Completaste tu perfil |
| `tenure_milestone` (ref = meses) | `{formatMilestoneLabel(ref)} en El Templo` (reusa `tenure-milestones.ts:51-55`) |
| `streak_bonus` (ref = N) | Racha de {N} sesiones |
| `training_completion` | Entrenamiento en la app |
| `goal_plan_completion` | Sesión de tu plan |
| `extra_block` | Bloque libre |
| `stretch` | Estiramiento |
| `program_week_completion` / `program_completion` | Semana de programa / Programa completo |
| `profile_photo` | Subiste tu foto |
| otro | Movimiento de Aura |

**Respuestas con schema declarado.** Tests:
- dos alumnos, cada uno ve solo lo suyo (D-37);
- el staff recibe 404;
- las filas de 0 no salen;
- la paginación no repite ni saltea;
- la suma de los montos del historial completo es igual a `earned`.

### 8. Apagar el descuento por Aura (D-22)

**Recomiendo solo el admin**, con el mismo precedente que el boarding pass: se retiró de la UI el 2026-09-07 y la API sigue soportándolo (`AssignPlanDialog.vue:373-378`).
- Quitar el bloque del selector (`AssignPlanDialog.vue:380-399`) y `auraOptions` (`:1579-1589`).
- `assignForm.auraSpend` queda siempre `null`.
- Dejar `SubscriptionCard.vue:120-122`, que muestra descuentos históricos.

Impacto en tests: **cero**. Los 73 usos de `auraSpend` en 14 archivos de test (golden de pricing, invitaciones, partners, referidos, `mod-02-pricing-module-off`) siguen pasando. El arbitraje de la 194 (`pricing-benefits.ts:211-220`) queda sin uso real, intacto. Volver a prenderlo es restaurar la UI.

**Alternativa descartada:** rechazar `auraSpend > 0` en el servidor. Rompe esos 14 archivos (o exige un flag sembrado en cada uno) para cubrir un riesgo de cero canjes en la historia.

**Riesgo residual:** una pestaña del admin abierta con el bundle viejo hasta que se recargue. Con la escala nueva, poca gente llega a 500.

### 9. Anuncio previo (D-11) y aviso de asistencia (D-40)

**Anuncio:** Novedades con push. El staff la crea desde Comunicaciones (`communications/novedades-routes.ts:49-190`), sin código.
- La push sale al publicarse, a los socios `role = 'member'`, `status = 'activo'`, respetando la categoría `anuncios` y solo a quien tiene token (`novedades-push.ts:1-40`). Es idempotente.
- Destinos posibles: las secciones de `communications/destinations.ts:48-97` (`mi_templo`, `reservas`…). **No existe "perfil"**: agregarla toca API, admin y app, con el test `test/communications/destinations-sync.test.ts`. Recomiendo que el texto diga "podés ocultarte desde Perfil" y apunte a `reservas`, sin sección nueva.
- El staff no está en la audiencia: Franco les avisa aparte.
- **Orden:** build con el interruptor de Perfil publicado → anuncio → interruptor prendido (decisión 2).

**Aviso de asistencia:**
- Hoy `POST /api/members/attendance/check-in` (`attendance/routes.ts:219-241`) responde 201 con `attendanceRecordSchema` (`schemas.ts:17-32`): id, socio, sede, hora, estado y origen. La app muestra un tilde, la sede y "Volver" (`CheckInPage.vue:33-41, 143-150`).
- Agregar un **schema propio** `memberCheckInResponseSchema` = el de siempre + `auraAwarded: integer|null` + `auraTotal: integer|null`. Si no se declaran, fast-json-stringify los descarta en silencio.
- `null` para staff (D-15) y si el módulo está apagado.
- `auraAwarded` sale de `AURA_AMOUNTS.attendance` cuando el award no tiró. `auraTotal` sale de `earnedAuraByUsers`, con una consulta más.
- Variante C del sketch 033 ("con quiénes entrenás hoy"): la app puede llamar a anotados. Para eso la respuesta tendría que incluir `scheduleId` y `sessionDate`, que hoy no están. Agregarlos solo si gana C.

### 10. Línea de base (D-36)

Los datos son históricos (`bookings` conserva las filas canceladas, `attendance` es inmutable). **La medición de las 4 semanas previas se puede correr cualquier día después del lanzamiento:** no hay que capturarla antes. Guardar como `consultas/07-linea-de-base.sql`:

```sql
-- 214 D-36: reservas y asistencias por alumno activo por semana
-- SOLO LECTURA. Sin CONVERT_TZ: booking_date y session_date ya son fecha local de la sede
-- Activo en la semana S = asistió (no Wellhub) al menos una vez en las 8 semanas ANTERIORES al lunes de S
--   (la semana misma no cuenta: si contara, quien vino esa semana sería activo por definición)
SET SESSION TRANSACTION READ ONLY;
SET SESSION max_execution_time = 60000;
SET @lanzamiento = 'YYYY-MM-DD';   -- lunes de la semana en que se prende la lista
SET @desde = DATE_SUB(@lanzamiento, INTERVAL 28 DAY);   -- antes: 4 semanas previas
-- Para "después": @desde = @lanzamiento y @hasta = DATE_ADD(@lanzamiento, INTERVAL 28 DAY)
SET @hasta = @lanzamiento;

WITH RECURSIVE semanas AS (
  SELECT @desde AS lunes
  UNION ALL
  SELECT DATE_ADD(lunes, INTERVAL 7 DAY) FROM semanas WHERE DATE_ADD(lunes, INTERVAL 7 DAY) < @hasta
),
activos AS (
  SELECT s.lunes, a.member_id
  FROM semanas s
  JOIN attendance a ON a.tenant_id = 1
   AND a.session_date >= DATE_SUB(s.lunes, INTERVAL 56 DAY) AND a.session_date < s.lunes
   AND a.attendance_source IN ('qr','manual')
  JOIN users u ON u.id = a.member_id AND u.tenant_id = 1 AND u.role = 'member' AND u.deleted_at IS NULL
  GROUP BY s.lunes, a.member_id
),
reservas AS (
  SELECT s.lunes, b.member_id, COUNT(*) AS n, SUM(b.source = 'self_service') AS n_app
  FROM semanas s
  JOIN bookings b ON b.tenant_id = 1
   AND b.booking_date >= s.lunes AND b.booking_date < DATE_ADD(s.lunes, INTERVAL 7 DAY)
   AND b.is_trial = 0
   AND b.booking_status IN ('reservado','qr_escaneado','confirmado','no_show')
   AND (b.source IS NULL OR b.source <> 'wellhub')
  GROUP BY s.lunes, b.member_id
),
asist AS (
  SELECT s.lunes, a.member_id, COUNT(*) AS n
  FROM semanas s
  JOIN attendance a ON a.tenant_id = 1
   AND a.session_date >= s.lunes AND a.session_date < DATE_ADD(s.lunes, INTERVAL 7 DAY)
   AND a.attendance_source IN ('qr','manual')
  GROUP BY s.lunes, a.member_id
)
SELECT ac.lunes AS semana,
  COUNT(*) AS alumnos_activos,
  ROUND(SUM(COALESCE(r.n, 0)) / COUNT(*), 3) AS reservas_por_alumno,
  ROUND(SUM(COALESCE(r.n_app, 0)) / COUNT(*), 3) AS reservas_desde_app_por_alumno,
  ROUND(SUM(COALESCE(x.n, 0)) / COUNT(*), 3) AS asistencias_por_alumno
FROM activos ac
LEFT JOIN reservas r ON r.lunes = ac.lunes AND r.member_id = ac.member_id
LEFT JOIN asist x ON x.lunes = ac.lunes AND x.member_id = ac.member_id
GROUP BY ac.lunes
ORDER BY ac.lunes;
```

- Trampas cubiertas (memoria `consultas_prod_solo_lectura`): sin `CONVERT_TZ`, que en prod da NULL; ancla de semana en el lunes con fechas locales; sin `lag` como nombre; columnas físicas `booking_status` y `attendance_source`.
- Incluye `no_show` como reserva hecha.
- Separa las reservas desde la app (`source = 'self_service'`) de las automáticas o del admin (turnos fijos con `source` NULL o `admin`). Las de la app son las que la lista puede mover.
- Una variante por país (AR y ES) se arma agregando `br.country` desde `users.branch_id`.

**Consulta extra para la decisión 4** (`consultas/06-visibilidad-por-defecto.sql`): cuántos activos son menores, cuántos no tienen fecha de nacimiento y cuántos son de sedes fuera de Argentina.

```sql
SELECT COUNT(*) activos,
  SUM(u.date_of_birth IS NULL) sin_nacimiento,
  SUM(u.date_of_birth > DATE_SUB(CURDATE(), INTERVAL 18 YEAR)) menores,
  SUM(b.country <> 'AR') exterior,
  SUM(u.photo_url IS NOT NULL) con_foto_del_staff
FROM users u JOIN branches b ON b.id = u.branch_id
WHERE u.tenant_id = 1 AND u.role = 'member' AND u.status = 'activo' AND u.deleted_at IS NULL;
```

### 11. Orden de planes y dependencias

Ejecución secuencial (worktree compartido). Cada plan cierra con typecheck de la API y de los tests, y `lint:tenant`. Los planes de app y admin cierran además con `vue-tsc` comparado contra la base.

**Plan 0 (preparación, sin código).** Symlinks de `node_modules`:
- raíz → `/home/franco/projects/el-templo/node_modules`;
- `el-templo-api`, `el-templo-admin` → los del checkout principal;
- `el-templo-app` → el que use `et-estiramiento` (`et-202-carga`) o el del principal (`/home/franco/projects/el-templo/el-templo-app/node_modules` existe).

Escribir las consultas 04 a 07 en `consultas/` (Franco las corre con su OK). Las consultas 04 y 06 alimentan las decisiones 4 y 7.

**(a) Independiente de los sketches. Se puede planificar ya:**

| # | Plan | Toca | Depende de |
|---|---|---|---|
| A1 | Montos: `aura/amounts.ts`, `amount` en `awardOncePerLocalDay`, cambio en todas las fuentes, arreglo del valor de retorno del onboarding, defaults de programas en API, tests de montos | API | — |
| A2 | Migración 0344 (respaldo, re-valorización por valor, programas, `aura_config`, saldos) + test de migración con re-ejecución + consulta 05 | API, base | A1 (mismo deploy) |
| A3 | Regla de tiempo D-20: `proposed-time.ts`, sesión y plan a medida, asistencia del mismo día, log, refactor de los 4 a 6 tests de completar sesión, helper de sesión con bloques | API | A1 |
| A4 | `aura/earned.ts` + `movement-labels.ts` + rutas `/members/aura/*` + manifiesto + tests (D-12, D-13, D-15, D-37) + campos `auraAwarded` y `auraTotal` del check-in | API | A2 |
| A5 | Foto, backend: 0345 (enum), 0346 (`member_photos`) + los 5 conteos + `presignGet` con fecha de firma + rutas del alumno y del admin (por `:userId`) + reporte + Aura al aprobar + `/me` (`photo`, `auraVisible`) + delete-account + tests e ISO-03 members | API, base | A4 (usa `earned`) |
| A6 | Anotados: 0347 (`member_profiles`) + interruptor `community.attendees_enabled` en `system_settings` (apagado) + rutas attendees, visibility y notice-seen + `RATE_LIMITS.attendees` + `communityVisible` en `/me` + tests D-37 (sin apellido, sin teléfono, sin trial, sin ocultos, sin borrados, reciprocidad, sin plan, staff y Wellhub sin puntos, menores y exterior ocultos) + ISO-03 sched | API, base | A5 (fotos) |
| A7 | Admin: quitar el selector de descuento + defaults del asistente de programas | Admin | — (puede ir con A1) |

**(b) Depende del UI-SPEC:**

| # | Plan | Toca | Notas |
|---|---|---|---|
| B1 | Capa de datos de la app: tipos de `/me` (`photo`, `auraVisible`, `communityVisible`), `useAuraApi`, `useAttendeesApi`, `useProfilePhoto` (cámara + canvas + PUT con `fetch` sin token, siguiendo `useBodyCheckCamera.ts`), arreglo de `GoalPlanSession.vue:403`, texto de `NSCameraUsageDescription`, textos D-23 (monto desde el servidor o sin número) | App | Tests unitarios de utilidades puras (cálculo del recorte, etiquetas) |
| B2 | Encabezado de Mi Templo en un solo componente (D-25 a D-28) | App | Sketch 031 |
| B3 | Lista de anotados + aviso de primera vez + "y otros N más" + botón Reportar + interruptor en Perfil | App | Sketches 030 y 032. **Si gana la variante B (caras en la card), hace falta un dato por horario en la grilla semanal** (`weeklySlotViewSchema`, `scheduling/schemas.ts:77`, con las primeras 3 caras). Eso son N horarios × 3 firmas: replanificar A6 |
| B4 | Perfil: subir, ver pendiente y quitar foto, total de Aura y pantalla de detalle con "ver más" | App | — |
| B5 | Aviso de asistencia (`CheckInPage.vue`) | App | Sketch 033. La variante C necesita `scheduleId` y `sessionDate` en la respuesta |
| B6 | Admin: sección de revisión de fotos (pendientes y reportadas, aprobar, rechazar, quitar) | Admin | Pestaña en Feedback o en Alumnos |
| C1 | Cierre: migración 0348 (puesta al día + interruptor prendido), en un deploy posterior al anuncio; UAT en iOS y Android (D-39); conciliación (consulta 05) | Base | Decisión 2 |

**Despliegue seguro:**
1. A1 + A2 (+ A7) pueden ir juntos a staging y a master sin pantallas. Hoy nada muestra totales, y la app vieja sigue funcionando.
2. A3 a A6 van después, en el mismo tren o en otro. Todo es aditivo: el check-in agrega campos y las rutas son nuevas.
3. B1 a B6 van en el build de tiendas. **Requieren build:** todos los B de app (incluido Info.plist).
4. C1 va en el deploy siguiente, después del anuncio.

El admin y la API no necesitan tiendas. La web de la app recibe todo al deployar.

### 12. Notas de seguridad específicas

Ver la sección Security Domain.

## Common Pitfalls

### Pitfall 1: Re-valorización no idempotente
**Qué pasa:** el runner reejecuta un archivo cortado a la mitad y divide dos veces.
**Por qué:** fórmulas como `amount/2`, y que el runner no use transacción por archivo.
**Cómo evitarlo:** reglas por valor viejo exacto, con test que corre los UPDATE dos veces.
**Señal:** la consulta 05 bloque 1 muestra montos fuera de la tabla.

### Pitfall 2: Filas en escala vieja durante el deploy
**Qué pasa:** asistencias acreditadas con 10 entre la migración y el reinicio.
**Cómo evitarlo:** la 0348 de puesta al día en el deploy siguiente, y la consulta 05 bloque 4 en cero antes de prender la lista.

### Pitfall 3: La regla D-20 rompe tests que no parecen de Aura
**Qué pasa:** CI rojo en streaks y en sesiones porque `startedAt = ahora`.
**Cómo evitarlo:** un helper de sesión con bloques y `startedAt` válido, y migrar los 4 a 6 archivos en el mismo plan.
**Señal:** `expect(trainingTx!.amount)` sin fila.

### Pitfall 4: Fuga de privacidad por el schema o la consulta
**Qué pasa:** sale el apellido o el `userId`, o la app filtra a los ocultos del lado del cliente.
**Cómo evitarlo:** `LEFT(last_name,1)` en SQL, ocultos sin fila, schema sin campos extra y tests que recorren el JSON buscando claves prohibidas (`lastName`, `phone`, `email`, `userId`).

### Pitfall 5: `admin_sede` aprueba fotos de otra sede
**Cómo evitarlo:** rutas por `/:userId/…`, y la cola filtrada por `enforcedBranchIds`.

### Pitfall 6: Descuento apagado solo en la UI
**Qué pasa:** un bundle viejo abierto puede mandar `auraSpend`.
**Cómo evitarlo:** aceptado. Si preocupa, ver la alternativa del tema 8.

### Pitfall 7: Los 5 conteos fijos de tabla nueva
**Qué pasa:** `tsc` y `lint:tenant` pasan, pero CI cae en `tenant-tables`, 0192-0195 y 0196.
**Cómo evitarlo:** `grep -rn "gymOwnedChecked\|MODULOS_DECLARADOS\|GYM_OWNED_TABLES.length" el-templo-api/test` y actualizar todo en el mismo commit (memoria `tabla_gym_owned_nueva_cinco_conteos`).

### Pitfall 8: Enum de Aura con cola afirmada
**Cómo evitarlo:** antes de la 0345, `grep -rn "termina en\|values.length - 1" el-templo-api/test/migrations/`. Agregar `profile_photo` al final en los **dos** enums y en `AuraSourceType`.

### Pitfall 9: URL firmada vencida en pantalla
**Qué pasa:** la app abierta varias horas con un `/me` viejo muestra la imagen rota.
**Cómo evitarlo:** 24 h en `/me` y 2 h en la lista. Si la imagen falla al cargar, mostrar las iniciales y volver a pedir.

### Pitfall 10: Foto con GPS u orientación mal
**Cómo evitarlo:** pasar siempre por el canvas. Probar en iOS real con una foto vertical que tenga ubicación (D-39).

### Pitfall 11: Hoja de cámara en inglés
**Cómo evitarlo:** hoja propia en español y `getPhoto` con la fuente explícita.

### Pitfall 12: Quien no actualizó la app aparece y no puede ocultarse
**Cómo evitarlo:** el interruptor del servidor (decisión 2), que se prende después del anuncio y con la mayoría actualizada.

### Pitfall 13: Onboarding devuelve el saldo como monto
**Qué pasa:** con la escala nueva el saldo puede ser chico, y el error pasa desapercibido en los tests.
**Cómo evitarlo:** devolver el monto acreditado o 0, y testear `auraAwarded === AURA_AMOUNTS.onboarding` en un usuario con saldo previo.

## Code Examples

### Migración 0344 (fragmento, sin `;` en comentarios)

```sql
-- 0344_aura_revaluation.sql
-- Fase 214 D-18 D-19 D-21: escala nueva de Aura (una clase = 5) y re-valorizacion del historial
-- Hand-written. Idempotente: cada UPDATE exige el valor VIEJO exacto, que el valor nuevo nunca cumple
-- Respaldo con sufijo _backup_0344 (lo reconoce verify-tenant-uniques como efimero)
CREATE TABLE aura_transactions_backup_0344 AS
SELECT id, user_id, source_type, reference_type, reference_id, amount, created_at FROM aura_transactions;
CREATE TABLE aura_balances_backup_0344 AS SELECT user_id, balance FROM aura_balances;
UPDATE aura_transactions SET amount = 5 WHERE source_type = 'attendance' AND amount = 10;
UPDATE aura_transactions SET amount = -5 WHERE source_type = 'manual_adjustment' AND reference_type = 'attendance_reversal' AND amount = -10;
UPDATE aura_transactions SET amount = 5 WHERE source_type = 'onboarding_completion' AND amount = 50;
UPDATE aura_transactions SET amount = 15 WHERE source_type = 'tenure_milestone' AND reference_id = 3 AND amount = 50;
UPDATE aura_transactions SET amount = 25 WHERE source_type = 'tenure_milestone' AND reference_id = 6 AND amount = 100;
UPDATE aura_transactions SET amount = 50 WHERE source_type = 'tenure_milestone' AND reference_id >= 12 AND amount = 250;
UPDATE aura_transactions SET amount = 5 WHERE source_type = 'streak_bonus' AND reference_id = 7 AND amount = 20;
-- (14,35)->10 (30,50)->15 (60,100)->25 (100,200)->50, una linea por regla
UPDATE aura_transactions SET amount = 3 WHERE source_type IN ('training_completion', 'goal_plan_completion') AND amount = 10;
UPDATE aura_transactions SET amount = 2 WHERE source_type = 'extra_block' AND amount = 5;
UPDATE aura_transactions SET amount = 1 WHERE source_type = 'stretch' AND amount = 5;
UPDATE aura_transactions SET amount = 8 WHERE source_type = 'program_week_completion' AND amount = 15;
UPDATE aura_transactions SET amount = 50 WHERE source_type = 'program_completion' AND amount = 100;
UPDATE programs SET aura_weekly_bonus = 8 WHERE aura_weekly_bonus = 15;
UPDATE programs SET aura_completion_bonus = 50 WHERE aura_completion_bonus = 100;
ALTER TABLE programs ALTER COLUMN aura_weekly_bonus SET DEFAULT 8;
ALTER TABLE programs ALTER COLUMN aura_completion_bonus SET DEFAULT 50;
UPDATE aura_config SET default_amount = 3 WHERE aura_config_source_type IN ('training_completion', 'goal_plan_completion');
-- extra_block 2, stretch 1, onboarding_completion 5, una linea por fuente
UPDATE aura_balances b
LEFT JOIN (SELECT user_id, SUM(amount) AS s FROM aura_transactions GROUP BY user_id) x ON x.user_id = b.user_id
SET b.balance = COALESCE(x.s, 0);
```

### Recorte y reducción en la app (sin dependencias)

```ts
// Patrón: bar-challenge/composables/useImageComposer.ts:53-172 (canvas + toBlob ya en producción)
export async function toAvatarJpeg(src: Blob, side = 480, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(src)
  try {
    const img = new Image()
    img.src = url
    await img.decode() // HEIC en Chrome de escritorio tira acá → error de formato, no de peso
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const out = Math.min(side, s)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas sin contexto 2d')
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob devolvió null'))), 'image/jpeg', quality),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

### Schema de respuesta del check-in del alumno

```ts
// attendance/schemas.ts — NO tocar attendanceRecordSchema (lo comparten force y admin)
export const memberCheckInResponseSchema = {
  type: "object",
  properties: {
    ...attendanceRecordSchema.properties,
    auraAwarded: { type: ["integer", "null"] },
    auraTotal: { type: ["integer", "null"] },
  },
} as const;
// memberCheckInSchema.response[201] = memberCheckInResponseSchema
```

## State of the Art

| Antes | Ahora | Cuándo | Impacto |
|---|---|---|---|
| `getPhoto` / `pickImages` | `takePhoto` / `chooseFromGallery` | `@capacitor/camera` 8.1.0 | `getPhoto` sigue andando en 8.2.0 y está marcado deprecated. Migrar en la próxima mayor |
| Montos repartidos y config parcial | Constantes únicas (propuesta) | Esta fase | Tests y producción alineados |

## Assumptions Log

| # | Afirmación | Sección | Riesgo si es falsa |
|---|---|---|---|
| A1 | Una foto de perfil visible a otros cuenta como UGC para Apple y Google | Tema 1 | Bajo: igual conviene el reporte |
| A2 | Mostrar la foto a otros miembros no es "sharing" en Play | Tema 1 | Formulario de Data safety mal completado |
| A3 | Ya está declarada la recopilación de fotos en las tiendas (por Conquer) | Tema 1 | Rechazo o aviso de la tienda: Franco verifica |
| A4 | Canvas → JPEG descarta el EXIF (GPS) | Tema 2 | Fuga de ubicación: verificar en iOS |
| A5 | Safari de iOS convierte HEIC a JPEG con `accept="image/*"` | Tema 2 | Error de formato en la web de iOS (hay mensaje claro) |
| A6 | La CORS del bucket privado admite PUT desde la app y el admin | Patrón 4 | Falla la subida: ajustar CORS (tarea de Franco) |
| A7 | No hay `sql_require_primary_key` en el MySQL de prod (`CREATE TABLE … AS SELECT` sin PK) | Tema 4 | La 0344 falla. El precedente 0183 corrió en prod, así que es poco probable |
| A8 | La app tiene contacto publicado accesible (Apple 1.2) | Tema 1 | Pedido de la revisión |
| A9 | Los 367 no tienen fecha real en la base | Tema 3 | Si la tienen, se corrige por migración (consulta 04) |

## Open Questions (RESOLVED)

1. **¿Hay una fila de antigüedad fuera de 50/100/250?** La consulta 01 da 411 filas y 43.450 puntos, contra 410 y 43.350 del inventario.
   **RESOLVED:** se resuelve con la consulta 05 bloque 1 (`consultas/05-conciliacion-aura.sql`, plan 214-04), que Franco corre antes del merge. La 0344 no toca filas que no encajan en ninguna regla, así que una fila rara queda como está y aparece listada; si hace falta corregirla, va por una migración aparte.
2. **¿Programas con bonus personalizados?**
   **RESOLVED:** se resuelve con la consulta 05 bloques 0 y 1, antes del merge. La 0344 solo pasa a 8/50 los valores exactamente iguales al default (15/100); un programa cargado a mano con esos mismos valores es indistinguible y el bloque 0 lo lista para que Franco decida (plan 214-04).
3. **¿La variante B del sketch 030 (caras en la card)?**
   **RESOLVED:** D-59. La card del horario muestra solo el número de anotados (variante C2); no se agregan datos a la grilla semanal y el endpoint de lista completo alcanza.

## Environment Availability

| Dependencia | Para | Disponible | Versión | Alternativa |
|---|---|---|---|---|
| `node_modules` en el worktree | typecheck y lint | ✗ (sin symlinks) | — | Symlinks al checkout principal (plan 0) |
| MySQL local para tests | Integración | No se usa (regla de Franco: tests en CI) | — | CI |
| R2 privado (`R2_PRIVATE_BUCKET_NAME`) | Fotos | ✓ en prod y staging (Conquer). En local probablemente no | — | 503 limpio en local (fail-closed) |
| `@capacitor/camera` | Foto | ✓ | 8.2.0 | — |
| Xcode / Android Studio | Builds de tiendas | Franco | — | — |

**Faltantes que bloquean:** ninguno. Los symlinks son un paso del plan 0.

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|---|---|
| Framework | Vitest. API: integración contra MySQL 8 real (CI). App: unitarios sin DOM de canvas. Admin: sin runner |
| Config | `el-templo-api/vitest.config.ts`, `el-templo-app` (`vitest run`) |
| Comando rápido (local, obligatorio por plan) | `cd el-templo-api && pnpm exec tsc --noEmit && pnpm typecheck:tests && pnpm lint:tenant` |
| Frontends (local) | `cd el-templo-app && npx vue-tsc --noEmit -p tsconfig.json` y lo mismo en `el-templo-admin`, comparando la cantidad de errores contra la base (~21 preexistentes en el admin) |
| Suite completa | CI al pushear a staging (con OK de Franco). No se corre local |

### Criterios → tests

| Criterio | Comportamiento | Tipo | Archivo | ¿Existe? |
|---|---|---|---|---|
| 1 | Lista: nombre, inicial, foto, puntos, orden de reserva. Nunca apellido, teléfono, trial, cancelados, lista de espera, borrados | Integración | `test/scheduling/attendees.test.ts` | ❌ |
| 2 | Oculto cuenta en `total` y `hiddenCount`, no ve la lista. Menores y exterior ocultos. Sin plan ve solo número | Integración | ídem | ❌ |
| 3 | Aura propia, paginado, sin filas 0, staff 404, no se lee la de otro | Integración | `test/aura/member-aura.test.ts` | ❌ |
| 4 | Montos nuevos por fuente. Migración idempotente. Saldo = ledger | Integración + migración | `test/migrations/0344-aura-revaluation.test.ts` + tests de fuentes actualizados | ❌ / ✅ (a modificar) |
| 5 | Regla 80 % + bloques + asistencia del día | Unit + integración | `test/unit/proposed-time.test.ts`, `test/sessions/complete-aura-rule.test.ts` | ❌ |
| 6 | Sin selector de descuento | Manual (admin sin runner) | UAT | — |
| 7 | Subir, pendiente, aprobar (Aura 5 una sola vez), rechazar, quitar, reportar. HEAD rechaza no-JPEG y >8 MB. Admin_sede limitado a su sede | Integración (`privateMediaResolver` espiado, como Conquer) | `test/members/profile-photo.test.ts` + ISO-03 members | ❌ |
| 8 | Encabezado único | Manual + `vue-tsc` | UAT | — |
| 9 | Línea de base | Consulta SQL | `consultas/07-linea-de-base.sql` | ❌ |
| 10 | Teléfono real, iOS | Manual | UAT | — |
| D-40 | Check-in devuelve `auraAwarded` y `auraTotal`. Null para staff | Integración | `test/attendance/attendance.test.ts` (ampliar) | ✅ (a ampliar) |
| D-38 | Conciliación | SQL + integración | consulta 05 + aserción `sum(movements) == earned` | ❌ |

### Ritmo de muestreo
- **Por tarea:** typecheck de la API y de los tests, y `lint:tenant` (el de la app y el admin si se tocaron).
- **Por plan:** worktree limpio + lo anterior (D-41).
- **Puerta de fase:** CI verde en staging (push con OK de Franco) + consulta 05 en staging + UAT en dispositivo.

### Huecos de Wave 0
- [ ] Symlinks de `node_modules` en `et-comunidad`.
- [ ] Helper de test: sesión aprobada con bloques y prescripciones + `startedAt` válido (lo usan 4 a 6 archivos).
- [ ] Fixture de foto: `privateMediaResolver` espiado (copiar el de los tests de Conquer en `test/conquer/`).

## Security Domain

### ASVS aplicables

| Categoría ASVS | Aplica | Control estándar |
|---|---|---|
| V2 Autenticación | Sí (heredada) | `fastify.authenticate` en todos los plugins |
| V3 Sesiones | No (sin cambios) | — |
| V4 Control de acceso | **Sí** | Aura solo del JWT (sin parámetro de usuario). Staff 404 en Aura. Ver la lista exige `activo` y visible, o staff. Admin por `:userId` + `enforceMemberBranchScope`. `tenantWhere` en todo |
| V5 Validación de entrada | Sí | JSON schema de Fastify (fecha con patrón y ventana, enteros, `visible: boolean`). Tipo de contenido cerrado (`image/jpeg`). Regex anclada de la clave |
| V6 Criptografía | Sí | Firmas con `@aws-sdk/s3-request-presigner`, nunca a mano |
| V8 Protección de datos | **Sí** | Mínimo de datos (nombre de pila + inicial). Ocultos por defecto para menores y exterior. EXIF descartado. Bucket privado. Borrado de la cuenta → fotos quitadas |
| V12 Archivos | Sí | HEAD con tope de 8 MB y tipo. Clave con UUID. Nunca bucket público. Fail-closed 503 |

### Amenazas conocidas

| Amenaza | STRIDE | Mitigación |
|---|---|---|
| Recorrer horarios y fechas para saber dónde y cuándo está una persona (acoso) | Information disclosure | Solo con plan vigente, ventana de hoy a +31 días (sin pasado), tope de pedidos, opción de ocultarse, menores ocultos |
| Leer el Aura o la foto de otro (IDOR) | Information disclosure | Sin `userId` en rutas del alumno. `photoId` solo para reportar. Recurso ajeno = 404 |
| Fuga de campos por el schema | Information disclosure | Schema declarado + SQL que no selecciona el apellido completo + test que busca claves prohibidas |
| Subir algo que no es imagen o es enorme | Tampering / DoS | URL PUT firmada con Content-Type. HEAD valida tipo y tamaño. Regex de clave |
| Contenido ofensivo | Abuse | Aprobación previa (D-31) + reporte + quitar |
| URL firmada filtrada | Information disclosure | Vence en 2 h (lista) o 24 h (`/me`). Borrar el objeto la corta |
| Doble premio de Aura (carrera) | Tampering | Unique del ledger con `reference_id` no nulo |
| Inflar Aura de la app con `startedAt` falso | Tampering | Tope de 12 h + 80 %. Lo residual se acepta (regla estricta diferida) |
| `admin_sede` fuera de su sede | Elevation | Rutas por `:userId` |

## Sources

### Primarias (ALTA)
- Código del repo en `868e1be29` (todas las rutas `archivo:línea` citadas).
- `node_modules/@capacitor/camera` 8.2.0 (`definitions.d.ts`, `web.js`, `ios/Sources/CameraPlugin/CameraPlugin.swift`) del checkout principal.
- `@smithy/types@4.12.0/dist-types/signature.d.ts` (`signingDate`, `expiresIn`).
- `consultas/01-03` de la fase (datos de producción del 2026-11-17).
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 1.2 y 5.1.1, "Last Updated: October 16, 2026".
- [Google Play, User Generated Content policy](https://support.google.com/googleplay/android-developer/answer/9876937): consultada 2026-11-17, sin fecha en la página.

### Secundarias (MEDIA)
- [Google Play, artículo de ayuda de UGC](https://support.google.com/googleplay/android-developer/answer/12923286).
- [Google Play, Data safety: definición de sharing](https://support.google.com/googleplay/android-developer/answer/10787469).
- Skills del repo (`el-templo-db-migrations`, `el-templo-change-control`, `el-templo-build-and-run`) y memorias de Franco sobre gates de tenancy y consultas de producción.

### Terciarias (BAJA)
- Conversión de HEIC en Safari de iOS y descarte de EXIF por canvas (conocimiento general, sin verificar en esta sesión).

## Metadata

**Confianza:**
- Stack: ALTA. No hay paquetes nuevos y todo está verificado en el código y en `node_modules`.
- Arquitectura: ALTA. Precedentes directos: Conquer, 0183, `member_profiles` y los gates de tenancy.
- Migración: ALTA en el diseño. MEDIA en los conteos exactos de filas (dos consultas difieren en una fila).
- Tiendas: MEDIA. Textos oficiales citados, pero aplicarlos a fotos de perfil es interpretación.
- Pitfalls: ALTA. La mayoría salen de incidentes documentados en la memoria y los skills.

**Fecha:** 2026-11-17. **Vigencia:** 30 días para código y datos. Revisar las políticas de tiendas antes de enviar el build.
