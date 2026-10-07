# Guía paso a paso: web, Google, Meta y medición (fase 195)

Esta guía es para Franco y el equipo. Dice, en orden, **todo lo que tiene que hacer una persona** para que lo que construimos en la fase 195 funcione. Lo demás ya lo hace el sistema solo.

Cada paso termina con una línea **"Resultado → se carga en:"** que dice exactamente dónde va el dato que conseguiste (un secret de GitHub, una pantalla del admin, un archivo del repo o ningún lado).

Orden de la guía, de lo más urgente a lo menos:

1. **Primero lo que desbloquea la publicación** (secciones 1 a 5).
2. **Después la medición**: saber de dónde vienen los alumnos y cuánto cuesta cada uno (secciones 6 a 9).
3. **Al final el bloque C**, que no necesita código (secciones 10 a 12).

---

## Palabras que aparecen en esta guía

- **Secret de GitHub:** una caja fuerte dentro de GitHub donde se guardan claves y códigos. Se carga en el repositorio, en Settings, Secrets and variables, Actions, botón "New repository secret". Se pone el nombre exacto y se pega el valor. **Nunca se manda un secret por chat, mail ni WhatsApp.**
- **DNS:** la libreta de direcciones de un dominio (`eltemplo.org`). Ahí se agregan registros de texto para que Google y Bing sepan que el dominio es nuestro.
- **Token:** una contraseña larga que le damos a un programa (no a una persona) para que entre a una cuenta.
- **Pixel:** un pedacito de código de Meta que avisa qué hace la gente en la web.
- **CAPI (Conversions API):** nuestro servidor le avisa a Meta "esta persona se registró, reservó la prueba o pagó", con el mail y el teléfono convertidos en un código que no se puede deshacer. Así Meta busca gente parecida a la que paga.
- **Ficha de Google (GBP):** la ficha de Google Maps de cada sede (Google Business Profile).
- **Deploy:** publicar los cambios en el servidor.
- **"Solo web":** un botón de GitHub (Actions, Deploy, Run workflow, target `solo-web`) que vuelve a publicar solamente la página `eltemplo.org`. Sirve para cambios de contenido.
- **Migración:** un archivo que cambia datos o tablas de la base. Se aplica sola cuando se publica la API.
- **noindex:** una orden para que Google no muestre una página en sus resultados. La usamos en staging, la app y el admin.
- **nginx:** el programa del servidor que entrega las páginas. Tocarlo requiere entrar por SSH.

---

## Resumen: qué hace solo el sistema y qué te toca a vos

| Lo hace solo el sistema                                                                                     | Te toca a vos (o a tu equipo)                                                    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Publicar las páginas de cada sede, disciplinas, profes, planes y Barcelona (`/es`) con los datos de la base | Completar teléfonos reales, links de Google Maps y códigos postales de las sedes |
| Armar el mapa del sitio, `robots.txt` y `llms.txt` con las sedes reales                                     | Aprobar `/privacidad` y completar los datos legales de España                    |
| Guardar de dónde vino cada alta (campaña, QR, Instagram, IA) y mostrarlo en Reportes                        | Crear las cuentas y permisos en Google y Meta, y cargar los secrets              |
| Traer el gasto de Meta cada día y calcular el costo por alumno que paga                                     | Poner el mismo formato de nombre y de link en todos los anuncios                 |
| Avisarle a Meta de registros, pruebas y pagos (solo Argentina, solo web y Android)                          | Validar en Meta con el código de prueba y activar con una fecha                  |
| Traer de Search Console las búsquedas y clics cada semana                                                   | Verificar el dominio en Google y Bing, y crear la cuenta de servicio             |
| Mandar horarios, teléfono y dirección a las fichas de Google (cuando Google apruebe la API y se active)     | Crear y verificar las fichas, pedir el acceso a la API y autorizar una vez       |
| Pedir reseña en la app de forma neutral (cada 120 días como máximo)                                         | Responder reseñas, ordenar directorios, pedir links a la prensa                  |
| Detectar tráfico que viene de ChatGPT, Perplexity, Gemini, etc.                                             | Correr la planilla de prompts una vez por mes (1 hora)                           |
| Dejar noindex en staging, app y admin                                                                       | Pedir a quien tenga el servidor que aplique nginx (con tu OK, de a un comando)   |

---

## Tabla maestra de datos

| Dato                                                                         | Dónde lo conseguís                                  | Dónde se carga                                                               | Qué pasa si falta                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Quién administra el DNS de `eltemplo.org`                                    | Preguntar en el equipo o al registrador del dominio | Nadie lo "carga": hace falta para crear 1 o 2 registros de texto (sección 6) | No se puede verificar Search Console ni Bing, y no hay estadísticas de búsqueda                     |
| Texto de `/privacidad` aprobado, con razón social, NIF y domicilio de España | Franco y un asesor legal                            | Archivo `el-templo-web/pages/privacidad.vue` (sección 1)                     | CAPI no se activa. Si se publica con el marcador, se ve un cartel "PENDIENTE" en la página          |
| Decisiones: Moreno, bio de Ignacio, HSTS                                     | Franco                                              | Sección 1 (cada una dice su archivo)                                         | Se publica con el comportamiento actual                                                             |
| Link de Google Maps, Place ID, teléfono y código postal de cada sede         | Google Maps, Place ID Finder y cada sede            | JSON del paso 2.2, que genera la migración `0275_sedes_maps_franco.sql`      | La web no publica coordenadas exactas, y la ficha de Google usa el WhatsApp de ventas como teléfono |
| ID de Google Analytics 4 (`G-…`)                                             | GA4, Administrar, Flujos de datos                   | Secret `WEB_GA4_ID`                                                          | La web no mide visitas                                                                              |
| ID del Pixel de Meta                                                         | Meta, Events Manager                                | Secrets `WEB_META_PIXEL_ID` (web) y `META_PIXEL_ID` (API)                    | La web no usa el Pixel y CAPI queda apagado                                                         |
| Token del usuario del sistema de Meta                                        | Meta, Business Manager                              | Secret `META_ACCESS_TOKEN`                                                   | Ni gasto ni CAPI                                                                                    |
| IDs de cuentas publicitarias (`act_…`)                                       | Meta, Business Manager                              | Secret `META_AD_ACCOUNT_IDS`                                                 | No hay gasto ni costo por alumno                                                                    |
| Código de evento de prueba                                                   | Meta, Events Manager, Probar eventos                | Secret `META_CAPI_TEST_EVENT_CODE` (temporal, se borra)                      | No se puede validar CAPI sin ensuciar los datos reales                                              |
| Fecha de activación de CAPI                                                  | Vos, el día que activás                             | Secret `META_CAPI_START_AT`                                                  | CAPI queda apagado                                                                                  |
| Cuenta de servicio de Search Console (archivo JSON)                          | Google Cloud                                        | Secret `GOOGLE_SC_SERVICE_ACCOUNT_BASE64`                                    | No hay datos de búsqueda en Reportes                                                                |
| Cliente OAuth de las fichas                                                  | Google Cloud                                        | Secrets `GBP_OAUTH_CLIENT_ID` y `GBP_OAUTH_CLIENT_SECRET`                    | El sync de fichas queda apagado                                                                     |
| Permiso de Google para tu usuario sobre las fichas                           | Script `gbp-authorize`                              | Secret `GBP_REFRESH_TOKEN`                                                   | El sync de fichas queda apagado                                                                     |
| Modo del sync de fichas                                                      | Vos                                                 | Secret `GBP_SYNC_MODE` (`dry-run` y después `apply`)                         | Queda `off`: no toca las fichas                                                                     |
| Identificador de cada ficha de Google                                        | Script `gbp-list-locations`                         | Migración `0276` (borrador que genera el script)                             | Esa sede se saltea en el sync                                                                       |
| Huellas SHA-256 de la app Android (producción y staging)                     | Play Console y la clave de staging                  | Archivo `el-templo-app/public/.well-known/assetlinks.json`                   | Los links no abren la app directo en Android                                                        |
| Perfil de aprovisionamiento de iOS con Associated Domains                    | Portal de desarrolladores de Apple                  | Secret `IOS_PROVISION_PROFILE_BASE64` y el archivo `App.entitlements`        | Los links no abren la app directo en iPhone                                                         |
| WhatsApp de ventas por país                                                  | Quien atiende ventas                                | Admin, Comunicaciones, botón "Ajustes"                                       | Se usan los números ya cargados                                                                     |
| Fotos y bios de profes                                                       | El equipo                                           | Archivo `el-templo-web/data/profes.ts` y la carpeta de fotos                 | Solo se publica Ignacio                                                                             |
| Tags de los artículos del blog                                               | El equipo                                           | Admin, Blog                                                                  | El blog se muestra sin tags                                                                         |
| Quién maneja los anuncios (agencia o equipo)                                 | Franco                                              | Nadie lo carga: esa persona tiene que usar los eventos de la sección 7       | Meta optimiza hacia curiosos y no hacia pagos                                                       |
| Prompts de IA del mes                                                        | Planilla `docs/planilla-prompts-ia.csv`             | Una copia en Google Sheets                                                   | No sabés si las IA te nombran                                                                       |

---

## Lo que tarda semanas: arrancalo ya

Estas cosas dependen de Google o de Apple y no se pueden apurar. Conviene empezarlas aunque el resto no esté listo:

- **Verificar las fichas de Google de cada sede** (sección 8). Google pide que la ficha esté verificada y activa hace más de 60 días para darnos acceso a la API.
- **Pedir el acceso a la API de Business Profile** (sección 8). Es un formulario de Google y responde en semanas.
- **Verificar el dominio en Search Console** (sección 6): tarda minutos, pero necesita a quien administre el DNS.
- **Subir una build nueva de las tiendas** (sección 9): Apple y Google revisan unos días.

---

# PARTE 1. Lo que desbloquea la publicación

## 1. Antes de empezar

### 1.1 Quién administra el DNS de eltemplo.org

Es una pregunta abierta. Hace falta saber quién entra al lugar donde se compró o administra el dominio, para agregar registros de texto en la sección 6. Si nadie lo sabe, empezar por quien pagó el dominio.

Resultado → se carga en: ningún lado. Anotá acá el nombre de la persona: **********\_\_**********

### 1.2 Aprobar `/privacidad` y completar los datos legales de España

La página `/privacidad` se reescribió para explicar con claridad qué se mide, qué se manda a Meta y Google, y cómo pedir que no usen tus datos. **Es un borrador honesto de lo que hace el sistema, pero no es asesoramiento legal.** Antes de publicar:

1. Abrí `el-templo-web/pages/privacidad.vue` y buscá el texto `PENDIENTE DE COMPLETAR`. Está en la parte "España y el RGPD" y se ve resaltado en dorado en la página. Reemplazalo por la **razón social, el NIF y el domicilio de la entidad responsable del tratamiento en España**. No se inventó ninguno de esos datos.
2. Pedile a un asesor legal que revise el texto completo, en especial las menciones a la AEPD (organismo de control de España) y a la Agencia de Acceso a la Información Pública (organismo de Argentina). Si no corresponde, que se saquen.
3. **Importante:** hoy nada bloquea la publicación si el marcador sigue ahí. El sistema lo va a publicar tal cual y cualquier persona lo vería. Revisalo a mano antes de cada publicación.
4. **El texto promete una cosa que todavía es manual:** quien escriba a `comunidad@eltemplo.org` con el asunto "Oposición a la medición publicitaria" tiene que quedar fuera del envío a Meta. No hay un botón automático. Hasta que se haga uno, el proceso manual es pedirle a quien mantiene el código que marque los eventos de esa persona como "descartados" en la tabla `meta_capi_events` (estado `skipped_no_origin`, para los eventos `reg-<id>`, `trial-<id>` y `purchase-<id>` de esa persona). Decidí quién lo hace antes de publicar el texto.
5. **CAPI no se activa hasta que este texto ya esté en producción** (sección 7.5).

Resultado → se carga en: el archivo `el-templo-web/pages/privacidad.vue` (se publica con el rollout de la sección 4).

### 1.3 Decisiones abiertas

Hay tres decisiones que el sistema no puede tomar por vos:

**a) Moreno y los horarios publicados (filtro D-30).** La web publica como "horarios de apertura" solo las clases regulares de cada sede. En la base de desarrollo, Moreno **solo tiene Yoga, que es una clase especial**, así que quedaría sin horarios publicados: su página dice "consultá horarios por WhatsApp" y a su ficha de Google no se le mandan horarios. Antes de decidir, mirá en Admin, Horarios, si Moreno en producción tiene clases regulares cargadas.

- Si las tiene, no hay nada que hacer: salen solas.
- Si no las tiene y está bien así, no hagas nada.
- Si querés que el Yoga cuente como horario de apertura, hay que cambiar el filtro en el código (pedíselo a quien mantiene la API).

Resultado → se carga en: ningún lado si la respuesta es "dejarlo". Si se cambia, es un cambio de código en `el-templo-api/src/modules/web-public/`.

**b) La bio de Ignacio: 10 o 20 años.** El sitio dice en un lado "más de 20 años de experiencia" (la bio de `profes.ts` y la sección fundador) y en otro "más de 10 años formando atletas, más de 10.000 alumnos" (la sección del método). Elegí la correcta y hay que unificarla.

Resultado → se carga en: archivo `el-templo-web/data/profes.ts` y el texto de la sección del método (`el-templo-web/components/SectionMethod.vue`). Se publica con "solo web".

**c) HSTS.** Es una orden que le dice al navegador "usá siempre https en este sitio durante un año". El repo la declara, pero el servidor hoy no la envía. Si se aplica tal cual, vale para `eltemplo.org` y todos sus subdominios (la API, la app y el admin) durante un año, y no se puede deshacer rápido. **Recomendación: no adoptarla ahora.** El runbook de nginx trae el comando que la saca del archivo antes de subirlo. Si la querés, que sea un cambio aparte y a propósito.

Resultado → se carga en: el vhost de nginx, según `deploy/RUNBOOK-195-NGINX.md`, sección 1.5 ("Decisión HSTS").

### 1.4 Orden general

El orden de la publicación está explicado en `deploy/ROLLOUT-195.md` y se resume en la sección 4. Regla de oro: **todo `git push` y todo comando por SSH se hace solo con el OK explícito de Franco**, uno por uno.

---

## 2. Datos exactos de las sedes (coordenadas, Place ID, teléfono, código postal)

Hoy las coordenadas de las sedes son aproximadas y no se publican en el schema (Google las ignoraría). Con los datos reales la web puede publicar el punto exacto y el link de Maps. Se hace con un JSON y un comando.

### 2.1 Juntar los datos de cada sede

Por sede hacen falta cuatro cosas:

1. **Link de Google Maps del lugar.** Abrí Google Maps en el navegador de una computadora, buscá la ficha de la sede, hacé clic en el lugar y copiá el link largo de la barra de direcciones. Es mejor que el que sale de "Compartir" (el corto `maps.app.goo.gl` también sirve: el script lo sigue solo). Tiene que ser el link **del lugar**: el que tiene `!3d` y `!4d` en el medio. El link que solo muestra el centro del mapa trae pocos decimales y el script lo rechaza.
2. **Place ID.** Es el código que identifica la ficha (empieza con `ChIJ`). Se saca del buscador oficial de Google: https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder . Buscá la sede y copiá el "Place ID".
3. **Teléfono real de la sede**, con código de país (por ejemplo `+5492230000000`). **Es importante:** si una sede no tiene teléfono cargado, el sync de Google va a poner el **WhatsApp de ventas** como teléfono de la ficha. Cargalos **antes** de pasar `GBP_SYNC_MODE` a `apply` (sección 8).
4. **Código postal.**

### 2.2 Completar el JSON y generar la migración

1. Copiá `el-templo-api/scripts/sedes-maps.example.json` a otro lugar (por ejemplo `~/sedes-maps.json`). Tiene una entrada por sede: `CONST` Constitución, `JUJUY`, `MORENO`, `ALEM` Juan B. Justo, `ALBERTI`, `MOGOTES` Mario Bravo, `BCN` Barcelona y `PARK` Parque Primavesi. Borrá las que no quieras tocar o dejalas vacías.
2. Completá `mapsLink`, `placeId`, `phone` y `postalCode` entre comillas.
3. En una terminal, dentro de la carpeta `el-templo-api`, mirá primero el resultado sin escribir nada:

   ```
   pnpm exec tsx scripts/sedes-maps-a-migracion.ts ~/sedes-maps.json
   ```

   Muestra una tabla: sede, latitud, longitud, si la precisión alcanza, Place ID, teléfono, código postal y problemas. Si hay problemas, los explica en español. Corregí el JSON y repetí hasta que no haya ninguno.

4. Cuando la tabla esté bien, generá la migración:

   ```
   pnpm exec tsx scripts/sedes-maps-a-migracion.ts ~/sedes-maps.json --write
   ```

   Crea `el-templo-api/src/db/migrations/0275_sedes_maps_franco.sql`. Si ese archivo ya existe, no lo pisa.

5. Abrí el archivo, revisalo a mano (coordenadas, teléfonos, códigos postales) y pasáselo a quien commitea el código. Por reglas del proyecto no se aplica ni se carga por otra vía.

Qué hace el script por vos: sigue los links cortos hasta el link largo (solo si terminan en Google Maps, máximo 5 saltos), exige al menos 5 decimales, toma el Place ID del JSON antes que el del link y se niega a escribir si hay un solo error.

### 2.3 Publicar los datos

La migración se aplica cuando se publica la API. Como la web lee las sedes al construirse, **después** de ese deploy hay que apretar el botón "solo web" (sección 4) para que `eltemplo.org` tome las coordenadas nuevas.

Resultado → se carga en: la migración `0275_sedes_maps_franco.sql` (generada con `sedes-maps-a-migracion`), que escribe en la tabla `branches` y se aplica con el deploy de la API; después, "solo web".

---

## 3. IDs de medición de la web (Google Analytics 4 y Pixel de Meta)

Estos dos IDs se necesitan **antes del paso 2 del rollout en producción**. Si no existen, la web se genera igual pero sin medición.

### 3.1 Google Analytics 4

1. Entrá a https://analytics.google.com con la cuenta de Google de la empresa.
2. Administrar, Crear, **Propiedad**. Nombre "El Templo", zona horaria de Argentina, moneda peso argentino.
3. En la propiedad nueva: Administrar, Flujos de datos, Agregar flujo, **Web**. URL `https://eltemplo.org`, nombre "Web".
4. Copiá el **ID de medición**. Tiene la forma `G-XXXXXXXXXX`.
5. Cargalo como secret `WEB_GA4_ID` (ver "Secret de GitHub" arriba).
6. Para que tome efecto hay que volver a publicar la web (botón "solo web").

Resultado → se carga en: secret de GitHub `WEB_GA4_ID` (el build de la web de producción lo lee y lo pasa a la web).

### 3.2 ID del Pixel de Meta

1. Entrá a Meta Events Manager (https://business.facebook.com/events_manager) con el Business Manager de El Templo.
2. Orígenes de datos. Si ya existe un Pixel (o "conjunto de datos") de El Templo, usalo. Si no, Conectar orígenes de datos, Web, y creá uno.
3. Copiá el **ID** (solo números).
4. Cargalo en **dos** secrets con el mismo valor: `WEB_META_PIXEL_ID` (lo usa la web) y `META_PIXEL_ID` (lo usa la API para CAPI).

Resultado → se carga en: secrets de GitHub `WEB_META_PIXEL_ID` y `META_PIXEL_ID`.

### 3.3 Qué esperar de la medición

- En **Argentina**, GA4 y el Pixel arrancan solos al entrar a la web.
- En **Barcelona** (`/es`), no se carga nada hasta que la persona acepta el banner de cookies (es lo que pide el RGPD). Quien lo rechaza queda sin medir y su alta llega sin origen. Por eso la medición propia en España es parcial.
- Después de publicar, abrí GA4, Informes, **Tiempo real**, y entrá vos a la web desde Argentina. Tenés que verte. Si no aparece, avisá: en esta fase se cambió la forma en que se envían los datos a GA4 y no se pudo probar contra Google desde acá.

### 3.4 Segmento "Tráfico de IA" en GA4

Sirve para ver cuántas visitas llegan desde ChatGPT, Perplexity, Gemini y otros.

1. En GA4: Explorar, Exploración en blanco.
2. En Dimensiones agregá **Fuente de la sesión**.
3. Creá un filtro o segmento de sesión: "Fuente de la sesión", condición **coincide con la expresión regular**, y pegá:

   ```
   chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|meta\.ai|grok\.com|deepseek\.com|you\.com
   ```

4. Guardalo con el nombre "Tráfico de IA". Los nombres de los menús de Google cambian de vez en cuando: si no los encontrás, buscá "segmento de sesión" y "expresión regular".

Esto es solo GA4. Nuestro propio reporte (Admin, Reportes, "Origen de altas") ya separa el canal "IA" sin que hagas nada.

Resultado → se carga en: GA4 (guardado dentro de la propiedad). No se carga en ningún secret.

---

## 4. Publicar: el rollout, el servidor y la verificación

El rollout tiene un orden a propósito. La explicación completa, con los comandos exactos, está en **`deploy/ROLLOUT-195.md`**. Acá va el resumen para entender qué viene.

### 4.1 Por qué hay dos pasos

Desde esta fase, el build de la web lee las sedes de la API. Si la API de producción todavía no tiene la dirección nueva (`/api/web/site-data`), el build de la web falla a propósito (no publica datos viejos). Por eso se publica primero **solo la API** (paso 1) y después **todo lo demás** (paso 2). Staging va primero, producción después.

### 4.2 Antes del paso 2 en producción

Cargá los secrets `WEB_GA4_ID` y `WEB_META_PIXEL_ID` (sección 3). Revisá que el marcador de `/privacidad` esté completo (sección 1.2).

### 4.3 Los pasos

1. **Paso 1, solo API:** se publica hasta el último commit anterior a la web nueva. Lo identifica quien hace el push por el mensaje de commit (`feat(195-03)`), no por un número fijo. Con tu OK. Espera a que el deploy salga verde y comprobá con `curl -s https://api-staging.eltemplo.org/api/web/site-data | head -c 300` (en producción, `api.eltemplo.org`). Tiene que devolver sedes.
2. Mirá la tabla `branches` de producción después de ese deploy: la migración 0271 cargó datos reales (calle, slug, WhatsApp, publicación).
3. **Paso 2, el resto de la rama:** corre el build de la API, la app, el admin y la web. Si la web quedó en rojo, apretá "solo web".
4. **Probar el botón "solo web" en staging, una vez.** GitHub, Actions, **Deploy Staging**, Run workflow, rama `staging`, target `solo-web`. Tiene que construir solo la web. Esto confirma que el botón anda (hoy se validó leyendo la documentación de GitHub, no probándolo). Hacelo después del paso 1.
5. Prueba en staging (UAT). Recién después, el mismo orden hacia producción.

### 4.4 Servidor (nginx): 404 real, redirects y noindex

Esto se hace por SSH, con tu OK **de a un comando**. El procedimiento completo, con comandos, comprobaciones y vuelta atrás, está en **`deploy/RUNBOOK-195-NGINX.md`**.

- **Tanda A** (se puede hacer en cualquier momento): noindex en `web-staging`, la app y el admin (producción y staging), y que los archivos de links directos de la app se entreguen como JSON. Orden: `web-staging`, `app-staging`, `admin-staging`, `app`, `admin`.
- **Tanda B** (**solo cuando la web nueva ya esté en producción**): 404 real y redirects reales en `eltemplo.org`. Hay una comprobación previa en el runbook (sección 0): si da 0, no se aplica.
- **El archivo del repo NO sirve para copiarlo tal cual**: no trae las líneas de certificados que agregó certbot en el servidor. El runbook usa un "merge de 3 vías" que las conserva. No lo saltees.

Resultado → se carga en: los archivos de nginx del servidor (`/etc/nginx/sites-available/...`), siguiendo `RUNBOOK-195-NGINX.md`. El repo guarda la versión objetivo en `deploy/nginx/`.

### 4.5 Qué revisar apenas se publica

- [ ] `https://eltemplo.org/sedes/juan-b-justo` existe y muestra "Juan B. Justo 1018".
- [ ] `https://eltemplo.org/es/sedes/barcelona` existe.
- [ ] En `/es`, **antes** de aceptar el banner, la pestaña Network del navegador no muestra pedidos a `googletagmanager.com` ni a `facebook.net`. Después de aceptar sí.
- [ ] GA4 Tiempo real te muestra visitando desde Argentina.
- [ ] Un registro de prueba desde un link de la web aparece en Admin, Reportes, "Origen de altas" con su canal.
- [ ] `https://eltemplo.org/no-existe` da 404 real (solo después de la tanda B).

---

## 5. Contenido que completa el equipo

Nada de esto frena la publicación. Se puede hacer después y publicar con "solo web". Los textos sin dato no se inventaron.

1. **Profes.** Hoy solo está Ignacio Bordón. Para sumar un profe: copiá el objeto marcado "EJEMPLO" de `el-templo-web/data/profes.ts`, completá nombre, rol, bio y las sedes (los slugs: `constitucion`, `jujuy`, `moreno`, `juan-b-justo`, `alberti`, `mario-bravo`, `barcelona`), subí la foto a `el-templo-web/public/images/photos/`, poné la ruta en `foto` y cambiá `publicado` a `true`. Si falta la foto, la bio o el `publicado`, no se publica.
2. **Bio de Ignacio:** decidir 10 o 20 años (sección 1.3.b).
3. **Actividades con Aura:** en la base de desarrollo no existen "Verticales", "Acrobacias" ni "Open Gym". La página las nombra y dice "Consultá disponibilidad por WhatsApp". Revisá en producción si están cargadas y, si querés, sumá una descripción de cada una en `el-templo-web/data/disciplinas.ts`.
4. **Planes** (`el-templo-web/data/planes.ts`): se tomaron del catálogo, sin precios. Confirmá "2 sesiones de regalo" en Flex y Foundation, "ROM", "eventos exclusivos", turnos fijos o libres, y qué sedes. Los precios van por WhatsApp. No se listaron los planes online, Flexi ni los paquetes por semanas.
5. **"Dónde se dicta" de la calistenia:** se calcula con las actividades "Sesión grupal" y "ROM" (no "Máquinas"). Confirmá que es lo que querés mostrar.
6. **Moreno:** la decisión de la sección 1.3.a.
7. **Tags del blog:** el equipo los asigna desde Admin, Blog (hace falta ser owner). Mientras no haya tags no se muestra nada de tags. Temas sugeridos para artículos: "calistenia en Mar del Plata para principiantes", "calistenia vs crossfit", "dónde entrenar calistenia en Barcelona", "qué es el método El Templo" y "cómo es tu primera clase". Los artículos sin imagen usan una foto de reserva.
8. **Títulos y descripciones** de disciplinas, planes y primera clase: revisalos para que suenen a la marca.
9. **Barcelona (`/es`):** los textos de inicio, método, niveles y primera clase son una redacción en español neutro a partir de lo ya publicado. El menú y el pie de página todavía hablan en voseo argentino ("Entrená", "Probá") y `/es/planes` muestra el catálogo argentino sin precios. Revisá tono y exactitud, y pasale a Barcelona el contenido propio. Hoy nadie del sitio argentino enlaza a `/es` salvo un link discreto "Barcelona" en el pie de página.
10. **Fotos, testimonios y la imagen para compartir en redes:** cuando el equipo los tenga. No se tocaron los espacios reservados a propósito.
11. **WhatsApp de ventas:** si cambia alguno de los dos números (Argentina y España), se cambia en Admin, Comunicaciones, botón "Ajustes", y después "solo web".

Resultado → se carga en: archivos `el-templo-web/data/profes.ts`, `disciplinas.ts` y `planes.ts`, fotos en `el-templo-web/public/images/photos/`, tags en Admin, Blog, y WhatsApp en Admin, Comunicaciones, Ajustes. Todo se publica con "solo web".

---

# PARTE 2. Medición: de dónde vienen los alumnos y cuánto cuestan

## 6. Search Console y Bing Webmaster

Muestran qué busca la gente en Google y Bing para llegar a la web. Se verifican **por DNS** (nunca subiendo un archivo, porque cada publicación de la web borra los archivos puestos a mano).

### 6.1 Verificar el dominio en Google

1. Entrá a https://search.google.com/search-console con la cuenta de la empresa.
2. Agregar propiedad, tipo **Dominio** (no "Prefijo de URL"), escribí `eltemplo.org`.
3. Google te da un registro **TXT**. Pedile a quien administra el DNS (sección 1.1) que lo agregue.
4. Volvé y apretá Verificar. Puede tardar unos minutos. La propiedad se llama `sc-domain:eltemplo.org`.
5. Sitemaps, enviá `https://eltemplo.org/sitemap.xml`.

Resultado → se carga en: el DNS de `eltemplo.org` (registro TXT). Nada en GitHub.

### 6.2 Bing Webmaster

1. Entrá a https://www.bing.com/webmasters.
2. Elegí **Importar desde Google Search Console** (es lo más simple: usa la verificación que ya hiciste).
3. Revisá que el sitemap aparezca.

Resultado → se carga en: Bing Webmaster (queda guardado en la cuenta). Nada en GitHub.

### 6.3 Dejar que el sistema lea Search Console (cuenta de servicio)

El sistema trae los datos cada lunes. Para eso necesita una "cuenta de servicio": un usuario de robot de Google.

1. Entrá a https://console.cloud.google.com y elegí o creá un proyecto (por ejemplo "El Templo Marketing").
2. Habilitá la **Google Search Console API** (Biblioteca de APIs).
3. IAM y administración, Cuentas de servicio, Crear cuenta de servicio. Nombre "search-console-lector". No hace falta darle roles.
4. Dentro de la cuenta, Claves, Agregar clave, Crear clave nueva, tipo **JSON**. Se descarga un archivo.
5. Copiá el **email** de la cuenta de servicio (termina en `.iam.gserviceaccount.com`).
6. En Search Console, la propiedad de dominio, Configuración, Usuarios y permisos, Agregar usuario: pegá ese email con permiso **Restringido**.
7. Convertí el archivo a base64 en una terminal (lo hace una sola línea, sin saltos):
   - Linux: `base64 -w0 archivo.json`
   - Mac: `base64 -i archivo.json | tr -d '\n'`
8. Cargá el resultado como secret `GOOGLE_SC_SERVICE_ACCOUNT_BASE64`.
9. **Borrá el archivo JSON de tu computadora.** Es una llave. Nunca lo mandes por chat.
10. Este secret es de la API. **No llega al servidor hasta el próximo deploy de la API** (un push que toque `el-templo-api` o un dispatch con target `todo`). El botón "solo web" no lo actualiza.

Opcional: el secret `GOOGLE_SC_SITE_URL` solo hace falta si la propiedad no se llama `sc-domain:eltemplo.org`.

Dónde se ve: Admin, Reportes, "Origen de altas", panel de Search Console (la última semana, por página de sede, con las 5 búsquedas principales).

Resultado → se carga en: secret de GitHub `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` (más el usuario agregado dentro de Search Console).

### 6.4 Pedir que Google saque las URLs viejas de staging, app y admin

Si en Google siguen apareciendo páginas de `web-staging`, la app o el admin, se pueden pedir "Eliminaciones" en Search Console (Indexación, Eliminaciones, Nueva solicitud). El procedimiento completo y cuándo conviene está en `deploy/RUNBOOK-195-NGINX.md`, sección E.

Resultado → se carga en: Search Console (el pedido queda registrado ahí). Nada más.

---

## 7. Meta: gasto, conversiones y anuncios

### 7.1 Usuario del sistema y token

Un "usuario del sistema" es un usuario de robot dentro del Business Manager. Con su token el servidor puede leer el gasto de los anuncios y avisar conversiones.

1. Business Manager (https://business.facebook.com), Configuración del negocio, Usuarios, **Usuarios del sistema**, Agregar. Nombre "El Templo API", rol **Administrador**.
2. Con ese usuario seleccionado, Asignar activos: dale acceso al **Pixel (conjunto de datos)** y a la **cuenta publicitaria**.
3. Generar token nuevo. Elegí la app del negocio y marcá el permiso `ads_read`. Si el negocio no tiene ninguna app, creala en https://developers.facebook.com (tipo Negocio) y vinculala al Business Manager.
4. Copiá el token apenas aparece (no se vuelve a mostrar). Cargalo como secret `META_ACCESS_TOKEN`.

Un solo token sirve para el gasto y para CAPI. Si más adelante Meta rechaza los eventos de prueba por un tema de permisos, avisale al equipo técnico: puede hacer falta sumar el permiso `ads_management` al token (no se pudo probar contra Meta desde acá).

Resultado → se carga en: secret de GitHub `META_ACCESS_TOKEN`.

### 7.2 Comprobar que el token ve todo

Entrá a la herramienta Graph API Explorer de Meta (en `developers.facebook.com`, sección Herramientas), pegá el token en el campo "Access Token" y consultá `/me/adaccounts`. Tienen que aparecer tus cuentas publicitarias. Si no aparecen, el usuario del sistema no tiene la cuenta asignada (volvé al paso 2 de 7.1).

Resultado → se carga en: ningún lado (es solo una prueba).

### 7.3 IDs de las cuentas publicitarias

En Business Manager, Configuración, Cuentas, Cuentas publicitarias, copiá el ID de cada una (`act_` y números). Si hay más de una, van separadas por coma, con o sin el `act_`.

Resultado → se carga en: secret de GitHub `META_AD_ACCOUNT_IDS`.

Con `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_IDS` cargados y la API deployada, **se prende solo el gasto**: cada día a las 06:15 (hora de Argentina) se guarda el gasto por campaña. No necesita fecha ni Pixel.

Si la cuenta publicitaria de Argentina factura en dólares, avisale al equipo técnico: el reporte por país hoy espera pesos para Argentina y euros para España.

### 7.4 Cómo nombrar las campañas y los anuncios (esto es lo que más importa)

El costo por alumno que paga se calcula uniendo el gasto de cada campaña con las altas que llegaron de esa campaña. Se unen **por el nombre**. Por eso:

1. **En todos los anuncios**, en Ads Manager, en "Parámetros de URL" del anuncio, pegá esta plantilla tal cual (con las llaves dobles):

   ```
   utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
   ```

   `utm_campaign` **tiene que ser** `{{campaign.name}}`. Si se escribe a mano otro texto, el gasto y las altas no se encuentran.

2. **Poné el slug de la sede en el nombre de la campaña**, para que el gasto baje hasta cada sede. Los slugs: `constitucion`, `jujuy`, `moreno`, `juan-b-justo`, `alberti`, `mario-bravo`, `barcelona`. Ejemplo: `juan-b-justo-octubre`. Una campaña que nombra una sola sede se asigna a esa sede. Una campaña con dos sedes en el nombre, o con ninguna, queda a nivel campaña (no se adivina).
3. **No cambies el nombre de una campaña después de lanzarla.** Se parte el historial.
4. Cada anuncio tiene que **aterrizar en la página de su sede** (`https://eltemplo.org/sedes/<slug>`), no en la home.

Resultado → se carga en: Meta Ads Manager (en cada anuncio) y en el nombre de cada campaña. Nada en GitHub.

### 7.5 Activar CAPI (el aviso de conversiones), en este orden

**Orden obligatorio.** No se saltea ningún paso.

1. **El texto nuevo de `/privacidad` tiene que estar publicado en producción** (secciones 1.2 y 4). Mientras no esté, no se activa.
2. Cargá `META_ACCESS_TOKEN`, `META_PIXEL_ID` y `META_AD_ACCOUNT_IDS` (secciones 3.2, 7.1 y 7.3). Todavía CAPI no envía nada.
3. **Validar sin ensuciar datos:** en Events Manager, tu Pixel, **Probar eventos**, copiá el código de prueba (`TEST12345` o similar). Cargalo como secret temporal `META_CAPI_TEST_EVENT_CODE` y cargá también `META_CAPI_START_AT` con la fecha y hora de ahora (formato `2026-10-20T15:00:00-03:00`). Deployá la API.
4. Hacé un registro de prueba y, si podés, reservá una clase de prueba. En unos 10 minutos (el sistema revisa cada 10) tienen que aparecer en "Probar eventos": `CompleteRegistration`, `Schedule` y `Purchase`. Mientras dure el código de prueba, **todos los eventos van solo al panel de prueba**, incluidos los de alumnos reales, y se marcan como enviados: no se reenvían después. Por eso conviene que esta ventana sea corta.
5. Si todo está bien, **borrá el secret `META_CAPI_TEST_EVENT_CODE`** y deployá la API de nuevo. `META_CAPI_START_AT` se queda como está. Desde ahí los eventos van de verdad.
6. **Qué nunca se manda:** alumnos de España (Barcelona) ni registros desde la app de iPhone ni altas de origen desconocido. Se mandan los de la web, la app de Android y los cargados por el admin con origen.

Los secrets de la API solo llegan al servidor con un deploy de la API.

Resultado → se carga en: secrets de GitHub `META_CAPI_TEST_EVENT_CODE` (temporal, se borra) y `META_CAPI_START_AT` (queda). Secrets de staging: **ninguno, nunca**.

### 7.6 Eventos para optimizar los anuncios, y quién los maneja

Quien maneje los anuncios (una agencia o alguien del equipo) tiene que elegir como objetivo de optimización estos eventos, de más barato a más valioso:

1. `CompleteRegistration` (se registró).
2. `Schedule` (reservó la clase de prueba).
3. `Purchase` (pagó, con el importe y la moneda).

Anotá quién es: **********\_\_**********. Sin esto Meta sigue mostrando los anuncios a gente que solo hace clic.

Resultado → se carga en: Meta Ads Manager (la configuración de cada conjunto de anuncios). Nada en GitHub.

### 7.7 Qué datos viajan a Meta

Para que lo puedas explicar: el mail y el teléfono convertidos en un código irreversible, un identificador interno también convertido, el país, el tipo de acción con su fecha, en el primer pago el importe y la moneda, los códigos de clic de Meta si los hay, y solo en registros desde la web la IP y el navegador (que el sistema borra a los 7 días). No viajan nombres ni apellidos. Nunca se manda a Meta nada de personas de España.

Resultado → se carga en: ningún lado (es información).

---

## 8. Google Business Profile (las fichas de Google Maps)

### 8.1 Crear y verificar una ficha por sede

Una ficha por cada sede: las 6 de Mar del Plata (Constitución, Jujuy, Moreno, Juan B. Justo, Alberti, Mario Bravo) y Barcelona. **El Templo Park NO es una ficha de gimnasio**: es un espacio de comunidad.

Para cada una, en https://business.google.com:

1. **Verificar** la ficha (Google manda un código por correo, llamada o video).
2. **Nombre:** el que figura en la fachada. No le agregues palabras para posicionar (como "mejor gimnasio" o la ciudad): Google puede suspender la ficha.
3. **Categoría principal:** elegí con cuidado la que mejor describa el negocio (por ejemplo Gimnasio). La principal es la que más pesa.
4. **Horarios:** los mismos que muestra la web.
5. **Teléfono:** el real de la sede.
6. **Sitio web:** la página de la sede con el código de origen para saber cuánta gente llega desde Google:
   - `https://eltemplo.org/sedes/<slug>?utm_source=google&utm_medium=organic&utm_campaign=gbp-<slug>`
   - Barcelona: `https://eltemplo.org/es/sedes/barcelona?utm_source=google&utm_medium=organic&utm_campaign=gbp-barcelona`
7. **Mudanza de Juan B. Justo:** actualizá la dirección de la ficha existente a **Juan B. Justo 1018** (así no se pierden reseñas ni antigüedad). Google puede pedir verificar de nuevo.

Resultado → se carga en: Google Business Profile (cada ficha). Nada en GitHub.

### 8.2 Pedir acceso a la API de Business Profile

Sin ese acceso el sistema no puede actualizar las fichas solo. Requisitos que pide Google: fichas verificadas y activas hace más de 60 días, y un proyecto de Google Cloud.

1. Creá o usá un proyecto en https://console.cloud.google.com (puede ser el mismo de la sección 6.3).
2. Buscá en Google "Business Profile API access request" y completá el formulario oficial con el ID del proyecto. Responde en semanas.
3. Mientras no aprueben, el sistema no rompe nada: cada ficha da un aviso en los logs y se saltea.

Resultado → se carga en: el formulario de Google. Nada en GitHub todavía.

### 8.3 Autorizar al sistema (una sola vez, en tu computadora)

Cuando Google apruebe la API:

1. En Google Cloud: Credenciales, Crear credenciales, **ID de cliente OAuth**, tipo **Aplicación web**. En "URI de redireccionamiento autorizados" poné exactamente `http://127.0.0.1:53682/callback`.
2. Pantalla de consentimiento de OAuth: ponela en estado **"In production"** (En producción). Si queda en "Testing", la autorización se vence a los 7 días.
3. Copiá el ID de cliente y el secreto. Cargalos como secrets `GBP_OAUTH_CLIENT_ID` y `GBP_OAUTH_CLIENT_SECRET`.
4. En una terminal, dentro de la carpeta `el-templo-api` de **tu** computadora (nunca en el servidor), con las dos variables puestas:

   ```
   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... pnpm exec tsx scripts/gbp-authorize.ts
   ```

   Imprime un link. Abrilo, entrá con el usuario **dueño o administrador de las fichas** y aceptá. El script muestra un "refresh token". Cargalo como secret `GBP_REFRESH_TOKEN`.

5. Para saber qué ficha es de qué sede:

   ```
   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... GBP_REFRESH_TOKEN=... pnpm exec tsx scripts/gbp-list-locations.ts --write
   ```

   Lista tus fichas y sugiere la sede de cada una por el número de calle. Con `--write` deja un borrador `0276_gbp_location_ids.sql`. Revisalo a mano (son sugerencias) y pasalo a quien commitea el código. Una sede sin ficha, o con dudas, queda sin mapear y lo avisa.

Resultado → se carga en: secrets de GitHub `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET` y `GBP_REFRESH_TOKEN`, y la migración `0276_gbp_location_ids.sql` (borrador que genera el script).

### 8.4 Prender el sync, con cuidado

1. **Antes de todo: cargá los teléfonos reales de cada sede** (sección 2). Si una sede no tiene teléfono propio, el sync le pone a la ficha el **WhatsApp de ventas** del país, y pisaría el teléfono que hoy muestra Google.
2. Cargá el secret `GBP_SYNC_MODE` con el valor `dry-run`. Deployá la API. En este modo el sistema **solo comprueba** con Google que los datos serían válidos, sin cambiar nada. Dejalo **una semana** y mirá los logs de la API (los ve el equipo técnico en el servidor). Cada ficha que Google rechaza deja un aviso con el motivo.
3. Mirá en el dry-run que los horarios que se mandarían son los que querés mostrar en Google. Atención: si se manda un horario, un día sin franja se interpreta como **cerrado**. Una sede sin horarios publicados (hoy Moreno) no toca los horarios de su ficha.
4. Cuando esté bien, cambiá `GBP_SYNC_MODE` a `apply` y deployá la API. Desde ahí cada día a las 05:30 el sistema actualiza horarios, teléfono, dirección y sitio web solo si algo cambió.
5. Si algo sale mal, cambiá el secret a `off` y deployá.

Resultado → se carga en: secret de GitHub `GBP_SYNC_MODE` (`dry-run`, después `apply`).

---

## 9. Apps (Android e iPhone) y tiendas

### 9.1 Links que abren la app directo: Android

1. En Play Console, tu app, **Integridad de la app**, **Firma de apps**: copiá la huella **SHA-256** del "Certificado de la clave de firma de la app" (**no** la de la clave de subida).
2. Hacé lo mismo para la versión de staging (`com.eltemplo.app.staging`) con la huella de su clave de firma.
3. Abrí `el-templo-app/public/.well-known/assetlinks.json` y reemplazá los dos textos que empiezan con `TODO_` por esas huellas (formato `AA:BB:CC:...`, 32 pares).
4. Comprobá en la terminal, desde `el-templo-app`: `pnpm check-well-known --strict`. Tiene que terminar sin errores ni avisos.
5. Se publica con el deploy de la app. Después, `curl -sI https://app.eltemplo.org/.well-known/assetlinks.json` tiene que decir `application/json` (hace falta nginx tanda A de la sección 4.4).

Resultado → se carga en: archivo `el-templo-app/public/.well-known/assetlinks.json` (se publica con el deploy de la app).

### 9.2 Links que abren la app directo: iPhone

1. En el portal de desarrolladores de Apple (https://developer.apple.com), Identifiers, la app `com.eltemplo.app`, Capabilities: activá **Associated Domains**.
2. Generá de nuevo el **perfil de aprovisionamiento** de distribución ("El Templo App Store Distribution") y descargalo.
3. Convertilo a base64 como en la sección 6.3 y cargalo como secret `IOS_PROVISION_PROFILE_BASE64`. (Los pasos de las otras claves de iOS están en `.github/SECRETS.md`.)
4. Quien mantiene la app tiene que descomentar el bloque `com.apple.developer.associated-domains` (con `applinks:app.eltemplo.org`) en `el-templo-app/src-capacitor/ios/App/App/App.entitlements`. Se sacó antes para destrabar la build de la App Store porque el perfil no tenía la capacidad.
5. Hace falta una build nueva de la tienda.

Resultado → se carga en: secret de GitHub `IOS_PROVISION_PROFILE_BASE64` y el archivo `App.entitlements`.

### 9.3 Build de tienda nueva

La captura del origen de las altas y el pedido de reseña dentro de la app **solo existen en una build nueva**. En esta fase **no se subió la versión de la app**: la versión de la build nueva la definís vos cuando armes el release. Hasta que salga esa build y la gente la actualice:

- **Las altas desde versiones viejas de Android e iPhone llegan como origen "unknown"**: figuran como "directo" en Reportes y CAPI las deja afuera.
- Las altas desde la app web (el navegador) sí traen su origen desde que se publique.

Nota para quien arma la build: el plugin de reseña es nativo y los 4 flujos de build ya corren la sincronización de Capacitor. Además, `@capacitor-community/keep-awake` está en `el-templo-app/package.json` pero **no** en `el-templo-app/src-capacitor/package.json`, a diferencia de los otros plugins nativos: conviene revisar si llega a las builds nativas.

Resultado → se carga en: las tiendas (App Store Connect y Play Console) con la build nueva. Versión: la que decidas.

### 9.4 Fichas de las tiendas (ASO)

- App Store: poné el **idioma español** (hoy figura en inglés y tiene una sola calificación), capturas **reales** de la app, y una descripción que nombre "calistenia Mar del Plata" y "calistenia Barcelona".
- Play Store: lo mismo.
- Pedí reseñas a los alumnos (la app ya las pedirá sola, de forma neutral, al usarla 14 días).
- Actualizá las etiquetas de privacidad: en App Store "Privacidad de la app" (Privacy Nutrition Label) y en Play "Seguridad de los datos". La app ahora manda a nuestro servidor de dónde vino el alta y la plataforma, y se mide publicidad. Que lo revise quien conozca esos formularios.
- **App vieja de Virtuagym** ("El Templo Calistenia", hoy da error 404): decidí si se pide la baja o la transferencia a la cuenta nueva.

Resultado → se carga en: App Store Connect y Play Console (las fichas). Nada en GitHub.

---

# PARTE 3. Bloque C: lo que no necesita código

## 10. Presencia externa

1. **Reseñas.** Pedirlas a **todos** los alumnos, sin filtrar. Nunca preguntar antes "¿estás contento?" para mandar solo a los contentos (se llama "gating" y Google y las tiendas lo prohíben). Responder todas, también las malas.
2. **Unificar nombre, dirección y teléfono** en todos lados. Hoy hay datos distintos en Superprof (otra dirección y teléfono), Foursquare (otro teléfono), la prensa ("Mogotes") e Instagram ("6 locations"). Tienen que decir lo mismo que la web: nombre "El Templo Calistenia — <Sede>", la misma dirección y el mismo teléfono. Revisá Superprof, Foursquare, Instagram y Wellhub.
3. **Directorios de Mar del Plata.** Hoy las IA citan Yably, gimnasios.com y crossfyapp, y El Templo no está en ninguno. Anotarse ahí y en guiadeo.
4. **Prensa del Parque Primavesi.** Hay notas en 0223, Bacap, Infodeportes, Noticias MDP y mardelplata.gob.ar sin link a la web. Escribirles y pedir que agreguen el link a `eltemplo.org`.
5. **Instagram.** La bio de `@eltemplomdp` tiene que enlazar a `eltemplo.org` (hoy enlaza a beacons.ai). Revisá también el perfil de Barcelona.
6. **Bing Places y Apple Business Connect:** crear las fichas de cada sede (traen reseñas y mapas en Bing y en Apple Maps).
7. **Barcelona:** sumarse a Urban Sports Club y ClassPass.
8. **Reddit:** participar con cuentas reales y aportando valor, sin spam.
9. **Wikidata:** más adelante, cuando haya fuentes independientes que citar.

Resultado → se carga en: cada sitio o directorio externo. Nada en GitHub.

## 11. Todos los meses

1. **Planilla de prompts de IA (1 hora).** El archivo `docs/planilla-prompts-ia.csv` trae 25 preguntas. Importalo a Google Sheets (Archivo, Importar). Cada mes, en una ventana de incógnito, corré cada pregunta en **ChatGPT, Gemini, Perplexity y Google AI Mode** y anotá en una fila por motor: la fecha, el motor, si aparece El Templo, en qué posición más o menos, qué sede nombra, qué link cita, qué competidores aparecen y notas. Con los meses se ve si mejora.
2. **Admin, Reportes, "Origen de altas"** (lo ve el owner y el admin): embudo registro, prueba, pago y facturación por canal, campaña y sede; gasto de Meta; costo por alumno que paga; tráfico de IA; y Search Console. Si querés ver todo junto elegí la agrupación "Detalle".
3. **Alta manual en el admin:** al cargar un alumno en "Nuevo en Prueba" completá "¿Cómo nos conoció?" y la campaña si la hay. Es la única forma de que los registros hechos a mano tengan origen.

Resultado → se carga en: Google Sheets (la copia de la planilla). Nada en GitHub.

## 12. Semanas después del lanzamiento: etapa 2 del noindex

En la etapa 1 (sección 4.4) staging, la app y el admin dicen "no me muestres" **sin** bloquear a Google (es a propósito: si se bloquea al mismo tiempo, Google no llega a leer la orden y puede seguir mostrando esas páginas).

Cuando en Search Console esas páginas ya figuren fuera del índice (Páginas, "Excluida por la etiqueta noindex"), o ya hayas pedido su retiro (sección 6.4), se pasa a la **etapa 2**: agregar la regla `Disallow` en el `robots.txt` de esos sitios (web-staging, app, admin y sus versiones de staging). `eltemplo.org` **no** se toca.

Se hace con `deploy/RUNBOOK-195-NGINX.md`, **sección D**, por SSH, con tu OK de a un comando. **No se hace antes de tiempo.**

Resultado → se carga en: los archivos de nginx del servidor, según `RUNBOOK-195-NGINX.md` sección D (regla `Disallow` en el `robots.txt`).

---

## Lo que nunca hay que hacer

- Cargar `META_*`, `GOOGLE_SC_*` o `GBP_*` en staging. Staging usa datos reales clonados: mandaría conversiones reales a Meta y editaría fichas reales de Google.
- Mandar un token, una clave o un secret por chat, mail o WhatsApp.
- Pasar `GBP_SYNC_MODE` a `apply` sin cargar antes los teléfonos reales.
- Activar CAPI sin que `/privacidad` nueva esté en producción.
- Publicar con el marcador `PENDIENTE DE COMPLETAR` de `/privacidad`.
- Agregar `Disallow` a staging, app y admin antes de que Google los saque del índice.
- Copiar un vhost del repo encima del servidor sin el merge del runbook (rompe el certificado).
- Verificar Search Console subiendo un archivo (cada publicación de la web lo borra).

---

## Checklist final

**Desbloquea la publicación**

- [ ] 1.1 Sé quién administra el DNS
- [ ] 1.2 `/privacidad` revisada por un asesor y marcador de España completo
- [ ] 1.3 Decidí Moreno, la bio de Ignacio y HSTS
- [ ] 2 Teléfonos, links de Maps, Place ID y códigos postales juntados y migración 0275 generada y revisada
- [ ] 3.1 Secret `WEB_GA4_ID` cargado
- [ ] 3.2 Secrets `WEB_META_PIXEL_ID` y `META_PIXEL_ID` cargados
- [ ] 4 Rollout: paso 1 en staging, botón "solo web" probado en staging, paso 2 en staging, UAT, y lo mismo en producción
- [ ] 4.4 nginx tanda A aplicada y tanda B aplicada (con la comprobación previa)
- [ ] 4.5 Revisé el listado de qué mirar apenas se publica
- [ ] 5 Contenido (profes, planes, tags, WhatsApp) completo o anotado

**Medición**

- [ ] 3.4 Segmento "Tráfico de IA" creado en GA4
- [ ] 6.1 Search Console verificado por DNS y sitemap enviado
- [ ] 6.2 Bing Webmaster importado
- [ ] 6.3 Secret `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` cargado y archivo JSON borrado
- [ ] 7.1 Secret `META_ACCESS_TOKEN` cargado
- [ ] 7.3 Secret `META_AD_ACCOUNT_IDS` cargado
- [ ] 7.4 Todos los anuncios llevan la plantilla de parámetros y el slug de la sede en el nombre
- [ ] 7.5 CAPI validado con el código de prueba, código borrado y `META_CAPI_START_AT` cargado
- [ ] 7.6 Sé quién maneja los anuncios y usa los eventos
- [ ] 8.1 Fichas de Google creadas y verificadas (6 de Mar del Plata y Barcelona)
- [ ] 8.2 Acceso a la API de Business Profile pedido
- [ ] 8.3 Secrets `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_REFRESH_TOKEN` cargados y migración 0276 revisada
- [ ] 8.4 `GBP_SYNC_MODE` en `dry-run` una semana y después `apply`
- [ ] 9.1 Huellas Android cargadas y `pnpm check-well-known --strict` sin errores
- [ ] 9.2 Associated Domains en Apple, secret `IOS_PROVISION_PROFILE_BASE64` cargado y `App.entitlements` descomentado
- [ ] 9.3 Build de tienda nueva subida (versión definida por Franco)
- [ ] 9.4 Fichas de las tiendas actualizadas y decisión sobre la app vieja de Virtuagym

**Bloque C y rutina**

- [ ] 10 Reseñas, nombre, dirección y teléfono unificados, directorios, prensa, Instagram, Bing Places, Apple Business Connect, Urban Sports Club y ClassPass
- [ ] 11 Planilla de prompts en Google Sheets y rutina mensual
- [ ] 12 Etapa 2 del noindex programada para cuando Google desindexe
