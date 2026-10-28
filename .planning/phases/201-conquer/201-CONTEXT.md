# Fase 201 — Conquer v2 (de cero, simple)

**Fuente de verdad:** `ref/conquer-desarrollo-sintesis.md` (Nacho, 2026-10-21). Si algo no está ahí, no se construye, salvo lo que se decida abajo.
**Spec ejecutable (oráculo del motor):** `ref/conquer-app.html` (función `next()`), con la planilla `ref/conquer-registro.xlsx`.
**Estética y pantallas:** `ref/conquer-prototipo.html`.

## Decisiones (Franco, 2026-10-21)

- **D-01 De cero.** Conquer se rehace en esta rama (`feat/201-conquer`, worktree `et-201-conquer`, base `origin/staging` `9964701ba` porque necesita la 197; ver D-10). No se refactoriza la Conquer de la fase 196.
- **D-02 Sin el circuito de Personalizados.** No hay solicitud, cuestionario, pago ni entrega. El coach activa Conquer a mano y elige nivel y días (§7.2). La pantalla Bloqueado tiene el botón "Quiero desbloquearlo", que avisa al admin (§7.1).
- **D-03 La rama 196 queda guardada** (`feat/196-personalizados`, worktree `et-196-personalizados`). No se borra ni se publica. Sirve de consulta y de cantera para copiar piezas.
- **D-04 Híbrido: piezas que se copian de la 196 y se adaptan:**
  - fotos privadas del control físico (R2 privado + URL firmada)
  - marcas del catálogo `unilateral` y `brazos_rectos`
  - editor de escaleras
  - comparador antes/después
  - **mapa muscular** (D-05)
- **D-05 Mapa muscular SÍ entra.** Es una decisión de Franco que contradice la síntesis §11 ("Mapa de equilibrio muscular" fuera de esta versión). Se trae desde la 196 (`balance-map.ts`, `muscles.ts`, `exercise_muscles`, `BalanceMap.vue`, `anatomia.json`). Ojo con la fase 200 (anatomía), que también trabaja músculos: revisar la superposición antes de planificar.
- **D-06 Lo que se escribe de cero:**
  - registro de la sesión: un número por escalón, el peor de las 3 series, más el `prev`
  - motor de progresión, con el botón Subir del alumno y sin aprobación del coach
  - pantallas Hoy, Sábado y Progreso
  - tablero del coach con semáforo y recortes
  - combos de Toro
- **D-07 Lo que NO se trae de la 196:**
  - bandeja de sugerencias (aprobación del coach)
  - modo sin conexión (cola offline)
  - registro por serie
  - alerta de estancamiento
  - acople con `personalized_*`

## Lectura punto por punto de la síntesis

(Las respuestas se anotan acá antes de pasar a la sección siguiente.)

- **D-08 Quién maneja Conquer (§5, §7.2).** Por ahora solo los roles `owner` y `admin`: activan alumnos, ven el tablero y las fichas, aceptan recortes y pasos de nivel. Más adelante se abre a los `coach`. Para que abrirlo después sea barato, el alumno guarda igual su campo `coach` (§9), y los permisos se resuelven en un solo helper. Las fotos (§6, "solo el alumno, su coach y Nacho") las ven por ahora el alumno, owner y admin.
- **D-09 Estética (§10).** Se usa la submarca de Nacho: azul noche, dorado y crema, Cormorant Garamond + Jost, sol, nubes, templo de columnas, letras griegas. Aplica **solo dentro de Conquer**; el resto de la app sigue con la paleta de El Templo. Revierte la D-51 de la fase 196. Las fuentes van empaquetadas en el build, sin CDN en producción.
- **D-10 Dónde vive en la app.** Conquer va dentro de **Entrenar**, como tab. Vuelven las tabs de la fase 197, que hoy están apagadas con `ENTRENAR_TABS_ENABLED = false` (`99152a195`). Por ahora son solo dos: **"Semana"** y **"Conquer"**. Libre sigue apagado. Por eso la rama 201 se basa en `origin/staging`, que tiene la 197.
- **D-11 Pop-up de lanzamiento.** Se diseña un pop-up que se muestra **una vez a todos los alumnos** cuando Conquer esté listo y lleva a Entrenar ▸ Conquer. Se arma con el sistema de pop-ups de Comunicaciones (fase 193, modo "una vez"), más un destino nuevo hacia la tab Conquer. El diseño va en un boceto antes de planificar.
- **D-12 Alumno sin Conquer (§7.1 Bloqueado).** Todos los alumnos ven la tab Conquer. Si no la tiene activada, ve la pantalla Bloqueado con el botón **"Quiero desbloquearlo"**. Tocarlo registra un **pedido**: aparece en una lista de pedidos en el admin, con contador, y el alumno ve "Ya le avisamos al equipo". Desde la lista, owner o admin lo activan eligiendo nivel y días (§7.2).
- **D-13 Mapa muscular: dónde se ve (complementa D-05).** Como en la 196, en dos lugares: (a) al tocar **Guardar** en Hoy, la figura con lo que se iluminó en esa sesión; (b) en **Progreso**, la figura de la semana. Solo se encienden los músculos trabajados, sin números, porcentajes ni rojo. La regla de encendido de la 196 (2 series como principal o 4 como secundario) se adapta al registro nuevo: cada escalón cargado con valor mayor que 0 cuenta como 3 series (las 3 series de la sesión). El hold final y el finisher no cuentan. Para planificar: reusar la figura anatómica compartida de la 197 (plan 197-10) en vez de copiar `anatomia.json`, y revisar qué hace la fase 200.
- **D-14 Propuestas abiertas de Nacho (§14, §2.1, §8.2).** Se construye con sus propuestas tal como están, y se dejan **editables desde el admin** para que Nacho las valide en la prueba sin tocar código:
  - plantillas de 2 y 3 días (§2.1), como datos
  - arranque de Novillo y Ternero: 1 y 2 peldaños más fáciles que Toro (§8.2), como parámetro por nivel
  - regla de combos (§14.3): si completa el objetivo de series N semanas seguidas (N = 2, editable), aparece Subir en la progresión de arranque, con el mismo patrón que los escalones (§4.5)
- **D-15 Control físico del día 0 (§6).** La primera vez que el alumno entra a Conquer (ya activado), lo primero que ve es el control físico: 3 fotos (frente, perfil y espalda) y perímetros, en menos de 3 minutos. Tiene un **"Lo hago después"** chico. No es obligatorio para entrenar. Si lo saltea, queda un aviso fijo en Inicio y a owner y admin les aparece una alerta 🟡 "Control día 0 pendiente". Esa alerta se suma a las del §5, junto a "Control físico vencido".
- **D-16 Qué día le toca (§1.3, §2.1, §7.1 Hoy).** Hoy no elige la sesión por día de la semana, como hace la app de Nacho. Muestra **el primer día del plan que le falta en la semana calendario en curso** (lunes a domingo, en la zona horaria de la sede), en el orden del plan: Plancha → Front → Vertical → Dominadas, y el sábado al final para Toro. El alumno puede cambiarlo con un toque. Si ya completó todos los días de la semana, ve "Semana completa" y puede repetir cualquiera. La semana calendario es la misma unidad que usan el paso de nivel (§2.2, "4 semanas seguidas") y la semana del bloque de los combos (§3.2).

## Lectura cerrada (2026-10-21)

El resto de la síntesis se sigue tal cual, sin decisiones de Franco pendientes:
- §4 motor: el oráculo es `next()` de `ref/conquer-app.html`
- §5 alertas y recortes
- §8 catálogo: lo carga una migración con los datos de Nacho
- §9 datos: el modelo lo define el planner
- §12: criterios de éxito

## Decisiones post-research (Franco, 2026-10-21)

- **D-17 Alumno sin plan activo.** Puede abrir la tab Conquer aunque Entrenar le muestre la vidriera. Ve Bloqueado y puede pedir el desbloqueo. Si se lo activan, entrena Conquer sin tener plan del Templo. (Revierte AS-4 del research.)
- **D-18 Precarga = objetivo, sin exigir toque.** Como en el oráculo: un "Guardar" sin cambios cuenta como cumplido (AS-15/A9).
- **D-19 Sin dependencias nuevas.** NO se instala `@fontsource/jost`. El texto de Conquer usa la letra actual de El Templo y Cormorant Garamond (ya instalada) queda para títulos y números grandes. Si faltan los pesos 600/700 de Cormorant, se usan los que estén instalados, sin agregar paquetes.
- **D-20 Ambigüedades de la spec: se adoptan los defaults del research.** Son A1–A16 y A19 (§9.2 de `201-RESEARCH.md`), A17 (manda la síntesis) y A18 (para Hoy, Sábado y Progreso manda `conquer-app.html`, no el registro por serie del prototipo). Las que son de Nacho van a una lista para que las valide en la prueba: calibración de todo el ejercicio, bloque = semanas desde la activación, escalón del recorte 6, caída, paso de nivel, finishers de 2/3 días, marcas y zonas de la semilla.
- **D-21 Migraciones desde 0290.** La 200 (anatomía) se queda con 0287–0289. Antes de crear el primer `.sql`, el ejecutor vuelve a chequear `origin/master`, `origin/staging` y los worktrees `et-*`.
- **D-22 UI.** No hay UI-SPEC aparte. El contrato visual es `ref/conquer-prototipo.html` (tokens, sol, nubes, columnas, letras griegas, íconos de nivel, Bloqueado, Inicio, Niveles, Evolución) más `conquer-app.html` para Hoy, Sábado y Progreso. El mapa usa `BodyFigure.vue` de la 197.
- **Infra pendiente de Franco (no bloquea planificar):** bucket R2 privado + CORS + secrets `R2_PRIVATE_BUCKET_NAME` / `STAGING_R2_PRIVATE_BUCKET_NAME`. Sin eso, el control físico responde 503 (nunca cae al bucket público).

## Decisiones post-UAT local (Franco, 2026-10-22)

Salen de los hallazgos 1 y 2 del UAT local (`201-UAT.md` §8). Las DA-15..DA-28 detalladas viven en los planes 201-27..201-33.

- **D-23 Estética (hallazgo 2; DA-15..DA-20).** Conquer adopta la variante B "Pórtico nocturno" del sketch 022 (`.planning/sketches/022-conquer-templo-clasico/`) con las fuentes del app (Geologica, Montserrat y Cinzel solo en el kicker). Usa la página, las cards y los botones de El Templo; el azul noche y el dorado quedan en las terminaciones y en una pieza oscura por pantalla. **Revierte de D-09** el sol, las nubes, Cormorant y Jost, y **de D-22** el contrato visual: manda el sketch 022 B, no `ref/conquer-prototipo.html`. Siguen azul noche, dorado, crema, el templo de columnas, las letras griegas y los íconos de nivel. La puerta "Conquer" de Entrenar no cambia (DA-18). Los tokens `--cq-*` viven solo dentro de `.cq-root` y `conquer-tokens.test.ts` impide que vuelvan los del cielo.
- **D-24 Guía "¿Cómo funciona?" (hallazgo 1; DA-21..DA-28).** Guía de 6 pantallas (5 para Ternero y Novillo) que se muestra una sola vez después del día 0 (o de "Lo hago después"), con acceso fijo en Inicio para reabrirla. El "ya la vio" se guarda en `conquer_members.guide_seen_at` (migración 0294) vía `POST /guide-seen`. El copy del método sale de `CQ_TEXTOS`, no se duplica. Criterio de éxito: quien la lee, sin ayuda, anota el peor de las series, sabe cuándo aparece Subir y dónde se toca, y marca la molestia antes de guardar.

## Pedidos del UAT en staging (Franco, 2026-10-23)

Llegan del profe probando staging. Se planificaron como 201-36..50 y pasaron a la **Phase 202** (`.planning/phases/202-conquer-tutoriales-correcciones/`, planes 202-01..15, retomar desde `202-HANDOFF.md`). Antes: niveles renombrados a Legionario / Centurión / Espartano solo en lo visible (`413924288`) y cascos como ícono de nivel (`108375889`); los códigos internos siguen `ternero` / `novillo` / `toro`.

- **D-25 Tutoriales.** Un video por ejercicio del catálogo y uno por combo (`COMBO_KEYS`: plancha, front, vertical, dominadas, push, pull). Lo sube owner/admin desde el Catálogo del admin (ejercicio) y desde Ajustes de combos (combo), reusando la subida al bucket **público** de `admin/video-service.ts` (contenido del gimnasio, no sensible). El alumno lo ve con "Ver cómo se hace" en el ejercicio (Hoy y Progreso) y en la card del combo (apertura y sábado). Sin video cargado no hay botón.
- **D-26 Correcciones.** El alumno manda un video de **30 s como máximo** de un escalón de su plan, con un comentario opcional. El coach (owner/admin por ahora, D-08) lo ve en una bandeja nueva del admin y responde con texto, con **un video propio (también 30 s como máximo)** o con los dos. El alumno ve sus correcciones (enviadas, pendientes y respondidas) en una pantalla nueva de Conquer.
- **D-27 Dónde se guardan.** Los videos de alumnos y las respuestas en video del coach van al bucket **privado** de `conquer/private-media.ts` (fail-closed, URL firmada de pocos minutos, nunca pública). Sin bucket privado configurado, enviar o ver un video da 503 con un mensaje claro y el resto de Conquer sigue andando. Los 30 s se validan en la app (duración del archivo antes de subir) y el servidor pone un tope de tamaño a la subida.
- **D-28 Borrado.** El coach puede borrar el video del alumno al corregir (acción explícita; la corrección y el texto quedan). Red de seguridad: regla de vencimiento en R2 que borra los videos de correcciones a los 60 días (la configura Franco en Cloudflare). Cuando el video ya no está, la app muestra "Video no disponible" en vez de romperse.
- **D-29 Defaults adoptados sin preguntar (Franco puede cambiarlos).** Solo ejercicios del plan del alumno, más los combos si es Espartano (`toro`). Hasta 3 correcciones sin responder por alumno. Sin push por ahora: el aviso es un contador en Inicio de Conquer y en el menú del admin, como los pedidos (D-12). Sin dependencias nuevas: el video se elige o graba con `<input type="file" accept="video/*">`.
