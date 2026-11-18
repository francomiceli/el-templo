# Fase 214: Comunidad: anotados en la clase y Aura visible

Prompt consolidado al 2026-11-17. Incluye las ideas de Franco para el discuss y la corrección sobre el
contador de sesiones.

Fuera del milestone v6.1, como la 213. Worktree nuevo `et-comunidad` desde `origin/master` fresco, rama
`feat/comunidad-anotados-aura`, migraciones desde la 0344. Sin bump de versión. Arrancar por
`/gsd-discuss-phase`.

Fuente: la transcripción 00:00:00–00:02:00 de la reunión del 16-11
(`.docs/La reunión se inició a las 2026_11_16 16_19 GMT-03_00 - Notas de Gemini.txt`). Usar la
transcripción, no el resumen de Gemini.

## Límite de la fase

No se toca la economía de Aura: ni montos, ni fuentes, ni canje. Sobre `aura_balances`,
`aura_transactions` y `aura_config` esta fase solo lee, salvo el bloque 3 si se confirma.

## Bloque 1: anotados visibles al reservar

- Endpoint para el alumno en `schedulingMemberRoutes`. Para un horario y fecha devuelve nombre de pila,
  inicial del apellido, foto y puntos de Aura de quienes tienen reserva vigente.
- Excluye sesiones de prueba, cancelados y lista de espera.
- Schema de respuesta declarado (fast-json-stringify descarta lo que no está en el schema).
- Preferencia de visibilidad en Perfil: quien se oculta cuenta en el número pero no aparece en la lista.
- Desplegable en el diálogo de reserva de `ReservasPage.vue`, con iniciales cuando no hay foto.

## Bloque 2: Aura visible

- Endpoint de saldo e historial para el alumno. Hoy no existe: solo ve toasts "+N AURA".
- Nivel de estatus derivado, sin tabla nueva si se puede.
- Umbrales de nivel por percentiles reales. Sacar de producción, solo lectura y con OK de Franco para el
  SSH, la distribución de `aura_balances` y de lo ganado por usuario. No inventar números.
- Dónde se ve: encabezado de Mi Templo, Perfil (saldo, nivel, últimos movimientos) y la lista de
  anotados.
- Sin ranking entre alumnos (`.planning/research/COMMUNITY-BENCHMARK.md`).
- Nombres de nivel que no choquen con `users.level` (kairos…spartan) ni con los rótulos de rol.
- Reutilizar `VeteranSeal` como patrón visual. El dorado ya está reservado a Aura.

## Ideas de Franco para el discuss (17-11), a resolver antes de planificar

1. En la lista de anotados, al lado de cada persona van sus puntos de Aura.
   - Decidir: saldo actual o Aura ganada histórica. El saldo baja cuando alguien canjea, el histórico no.
   - Decidir el orden de la lista. Recomendado: orden de reserva, no por puntos.

2. Encabezado de Mi Templo: sacar "Hola" y la fecha. Queda el nombre con una miniatura de la foto al
   costado, o el acceso para subir una foto propia si no tiene. Más tres datos: cuánto tiempo lleva en
   El Templo, a cuántas sesiones fue, y cuántos puntos de Aura tiene.
   - El encabezado está duplicado en `MainLayout.vue:34` (escritorio) y `MainLayout.vue:110` (celular).
     Extraer a un componente.
   - Antigüedad: ya existe `memberSince` y `VeteranSeal`. Decidir si el sello se queda.
   - Sesiones: ya existe. Es `totalSessions` del endpoint de estadísticas de progresión
     (`progression/routes.ts:90`, cuenta `completed_sessions`) y hoy se muestra al pie de "Tus sesiones"
     (`WeekStrip.vue:36`). Reutilizar ese dato, no crear otro contador.
   - Decidir si al subir al encabezado se saca del pie de "Tus sesiones".
   - Confirmar que ese número es el que Franco quiere mostrar como "sesiones a las que fue": cuenta
     sesiones registradas, no filas de `attendance`.
   - Tocar los puntos lleva al detalle de Aura (saldo, nivel, movimientos).

3. La subida de foto propia entra al núcleo de la fase.
   - Endpoint propio del alumno. Hoy solo la sube el staff.
   - `/me` tiene que devolver `photoUrl`. Hoy no lo devuelve.
   - El staff puede quitar una foto.
   - Revisar qué exigen las tiendas para fotos visibles entre usuarios.
   - Si hace falta un plugin de Capacitor para cámara o galería, preguntar antes de instalarlo.

4. La distribución de toda esta información se define con `/gsd-sketch` después del discuss: variantes
   del encabezado en celular y en escritorio, y de la fila de anotados con foto y puntos.

## Bloque 3: a confirmar en el discuss, puede salir de la fase

- Regalar Aura entre personas. Tres cosas a definir:
  - de dónde salen los puntos regalados (del saldo de quien regala o de un cupo aparte);
  - el tope de regalos por persona y por semana;
  - si los profes regalan. Hoy están excluidos de Aura en `attendance/service.ts:115`.
- Puntos por subir la foto, una sola vez.

## Prueba de que está bien, además de que Franco lo vea

- Tests de integración: el endpoint de anotados nunca devuelve apellido completo, teléfono, sesiones de
  prueba, ni a quien se ocultó.
- Tests de integración: un alumno no puede leer el saldo ni el historial de otro.
- Consulta de conciliación: el saldo que muestra la app es igual a la suma del ledger, por usuario.
- Línea de base de 4 semanas antes de lanzar. Se miden dos cosas por alumno activo por semana: reservas
  y asistencias. La misma medición se repite después del lanzamiento.
- Prueba en teléfono real, iOS incluido.

## Ejecución

Planes con `gsd-executor` en sonnet, secuenciales, verificando typecheck y lint después de cada plan.
Staging primero. Preguntar a Franco antes de cualquier push.

---

_Copia literal de `.docs/PROMPT-fase214-comunidad-aura.md` (checkout principal, 2026-11-17), versión vigente del prompt. Las decisiones del discuss viven en `214-CONTEXT.md`._

## Extracto de la transcripción (reunión 2026-11-16, 00:00:00–00:02:00)

> **Matías Mamana:** tenemos dos cosas, por un lado lo del CRM y por otro lado lo de la comunidad. Lo de
> la comunidad, yo haría algo muy simple ahora, por eso arranco por eso, que sería mostrar la gente que
> se anotó en la clase cuando alguien se vaya a anotar, tipo un desplegable, lo que sea.
>
> **Franco:** sí, lo resuelvo.
>
> **Matías:** Y por otro lado, los puntos, si le ponemos de aura quedan los puntos. Esto de "asististe,
> tres puntos". "El Nach te dio 10 puntos porque tenés alta burra", o sea, que puedas regalarlos, que
> todos lo puedan regalar, creo. Y eso calculo que también tenga como una especie de leveleo de estatus,
> pero que solo sirva para esto, para estatus, o sea, no sirva para ganarse nada.
>
> **Franco:** Es solo "tenés esto". No te explico ni para qué ni por qué lo tenés, pero está ahí.
>
> **Matías:** lo pensamos así con el Nach (…) con esas dos cosas como que ya cambiamos y agregamos un
> "chuku" (sic, así quedó transcripto) que bueno fue.
> Después que por ahí subir una foto de perfil te dé puntos también, o sea, completar tu perfil, como
> esas cositas.
>
> **Franco:** Sí, la típica de engagement.
