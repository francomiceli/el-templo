# Figuras de cuerpo para el mapa muscular: referencias, assets y guías (2026-10-27)

Investigación online, sin cambios de código. Marcado de confianza: **[V]** = lo vi yo (captura/descarga/lectura de la fuente primaria), **[T]** = lo dice un texto/ficha (sin ver la imagen), **[?]** = no pude confirmarlo.

## Resumen corto

- Casi todas las apps de gimnasio dibujan el cuerpo como **anatomía realista/atlética masculina** (Hevy, JEFIT) o como el mismo tipo de polígonos que ya usamos (react-native-body-highlighter). Lo "inclusivo" en el rubro es, a lo sumo, un toggle hombre/mujer.
- No encontré ninguna app grande con figura de cuerpo no-hegemónico en mapas musculares. Lo más cercano: **Get Strong** (indie) dice permitir elegir forma de cuerpo y tono de piel [T, solo palabras del desarrollador].
- Assets abiertos de mapa muscular con zonas por músculo: todos son **atléticos**. Los de anatomía de Wikimedia/Z-Anatomy son CC BY-SA (copyleft, evitar). No hay un asset listo con cuerpos "normales" + zonas; habría que dibujarlo o adaptarlo.
- Guías de inclusión (Harvard, CDC, NHS Scotland, IBM) coinciden: diversidad de tamaños deliberada, sin caricaturas, imagen "literal", validar con personas reales.

## 1. Apps y sitios

| App / sitio | Cómo dibuja el cuerpo | Confianza | Link |
|---|---|---|---|
| **Hevy** | Render anatómico realista de un hombre atlético (tono gris, músculos en azul), vista frontal + dorsal en "Last 7 days body graph". Notas de versión 3.0.3 mencionan assets femeninos. | [V] imagen oficial; [T] lo femenino | https://www.hevyapp.com/features/muscle-group-workout-chart/ (imagen: https://www.hevyapp.com/wp-content/uploads/img-4684-2-1024x683.png) |
| **JEFIT (BodyMap)** | Dos siluetas gris claro (frente/espalda) con músculos anatómicos delineados; zonas trabajadas en azul. Figura atlética, estilo plano. Lista % por grupo debajo. Opciones de género: [?]. | [V] imagen del blog | https://www.jefit.com/blog/introducing-bodymap-a-smarter-way-to-visualize-your-training (imagen: https://cms.jefit.com/assets/626e8586-06b2-4adb-98db-4652fdc84807) |
| **Peloton (Body Activity)** | Siluetas oscuras frente/espalda sobre fondo oscuro, con zonas azules (oscuro = primario, claro = secundario) y lista de % por grupo. Es el más "zona suave sobre silueta" de los que vi, pero la captura es de baja resolución y de 2022. | [V] captura de baja res.; [T] colores | https://www.starkinsider.com/2022/04/peloton-rolls-out-body-activity-monitoring-feature.html |
| **Fitbod** | Mapa de calor de recuperación 0-100% por grupo. No pude ver cómo es la figura; el sitio no lo describe. | [T] funcionalidad / [?] estilo | https://fitbod.me/blog/muscle-recovery/ |
| **Get Strong - Rep by Rep** (indie, iOS) | "Mapa muscular interactivo" semanal como feature central. El desarrollador afirma en un hilo que hay versión femenina y que el usuario elige forma de cuerpo y color de piel; la ficha de App Store solo confirma "colores de músculos mejorados para todos los tonos de piel" (v1.5). No pude ver capturas. | [T] solo texto, no verificado en la app | https://apps.apple.com/qa/app/get-strong-rep-by-rep/id6736707416 ; hilo: https://www.indiehackers.com/post/launched-get-strong-a-gym-app-for-the-rest-of-us-b4cf83f521 |
| **openGym** (open source) | Diagrama frente/espalda con toggle hombre/mujer. | [T] | https://newreleases.io/project/github/DuarteSantos8/openGym/release/v1.2.1 |
| **Strong, Nike Training Club, Freeletics, Sweat, Ladder, Future, Caliber, Gymshark, Down Dog, Alo Moves, Apple Fitness+** | **No pude confirmar** que tengan mapa muscular ni cómo dibujan el cuerpo. Para NTC solo vi filtros por zona corporal, sin diagrama confirmado. No inferir nada. | [?] | (sin link útil) |
| **Kaia Health, Physitrack** | No encontré documentación pública de su mapa corporal. Patrones genéricos de "pain map" (frente/espalda, tocar región) en otras apps: https://patents.justia.com/patent/20170068503 , https://apps.apple.com/app/id6468995275 | [?] | -- |
| **NHS / Mayo / Cleveland Clinic** | No hallé sus ilustraciones musculares en la búsqueda. No confirmado. | [?] | -- |
| **Kenhub** (atlas de anatomía) | Dice ser el primer atlas gratuito con ilustraciones de distintos tonos de piel, géneros, etnias y tipos de cuerpo. Es educativo y no libre de licencia. | [T] | https://www.kenhub.com/en/library/education/why-is-diversity-in-medicine-important |
| **Peanut** (comunidad femenina) | Galería de ilustraciones de cuerpos de mujeres con distintas formas, tonos y edades, publicada como "royalty-free" según la cobertura (no pude abrir la nota ni verificar licencia ni si hay músculos). | [T] | https://www.thedrum.com/news/2022/05/04/ad-the-day-peanut-s-medical-illustrations-reframe-female-healthcare |

Lectura general: Hevy/JEFIT = realista-atlético. Peloton = silueta + zonas. Nadie (verificado) ofrece variedad de cuerpo real.

## 2. Assets reutilizables

| Asset | Licencia | Zonas por músculo | Estilo | Notas / link |
|---|---|---|---|---|
| **react-native-body-highlighter** (actual, v3.2.0) | MIT (Copyright 2022 ELABBASSI Hicham) [V LICENSE] | Sí (slugs: trapezius, deltoids, chest, abs, obliques, gluteal, etc.) | Culturista: V-shape, músculos con estrías, six-pack, h/m [V captura] | https://github.com/HichamELBSI/react-native-body-highlighter. Origen del arte: no figura. MIT permite modificar la geometría. |
| **react-body-highlighter** (giavinh79) | MIT [V LICENSE] | Sí, sin variante de género | Mismos polígonos copiados del RN | https://github.com/giavinh79/react-body-highlighter |
| **body-highlighter** (lahaxearnaud, fork) | No confirmada (hay LICENSE, no lo leí) | Sí | Mismos polígonos | https://github.com/lahaxearnaud/body-highlighter |
| **react-body-map** (hashangit) | MIT [T jsDelivr] | Probable [?] | [?] | https://github.com/hashangit/react-body-map |
| **muscle_mapper** (Flutter; solo para extraer SVG) | Paquete MIT; SVG "advanced" CC BY 4.0 (Ryan Graves, exige atribución), solo hombre | Sí (35 músculos / 20 grupos) | "Advanced" realista; "minimal" contorno lineal, atlético [V render del minimal] | https://pub.dev/packages/muscle_mapper ; Figma original: https://www.figma.com/community/file/1320468164820924031 (no pude abrirlo). **Alerta**: los SVG "minimal" tienen clases `mw-` y se ven como los de MuscleWiki; su procedencia y licencia real son dudosas, no usar. |
| **Wikimedia Commons** ("Muscles front and back.svg", "Musculus diagram.svg", etc.) | CC BY-SA 3.0/4.0 (consultado vía API de Commons) | Anatomía detallada, no por zonas de app | Atlas anatómico | **Copyleft: evitar** salvo aceptar compartir igual. https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg |
| **medicalgraphics.de** | CC BY-ND 4.0 (no permite modificar), solo JPG | Etiquetado | Atlas masculino | https://www.medicalgraphics.de/?p=10795 . **No sirve.** |
| **Z-Anatomy / BodyParts3D** | BodyParts3D: CC BY (ficha oficial, sin leer los términos exactos); Z-Anatomy: no pude verificar (se sabe copyleft, no lo confirmé) | 3D, no SVG por zona | Anatomía de atlas | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html . Útil solo como referencia de proporciones, no como asset 2D. |
| **Open Peeps** (Pablo Stanley) | CC0 (código MIT) [T] | No (son personas, no músculos) | Personas dibujadas a mano, mezclables. Variedad de cuerpos no confirmada (el autor menciona "more body types" como pendiente). | https://pablostanley.gumroad.com/l/openpeeps , https://github.com/opeepsfun/open-peeps |
| **Humaaans** | Contradictorio: CC0 según varias fuentes, CC BY 4.0 según otras. Verificar en humaaans.com antes de usar. | No | Personas modulares (no se habla de talles) | https://www.humaaans.com/ |
| **Blush** | No confirmé términos | No | Ilustración de personas | https://blog.blush.design/post/illustration-diversity-design |

Conclusión: ningún asset libre da cuerpos normales + zonas por músculo. Las librerías de personas sirven solo de inspiración de estilo.

## 3. Principios de ilustración inclusiva (con fuente)

1. **Incluir el tamaño corporal de forma explícita**, junto a raza, género, discapacidad y edad. Harvard CHC: "Use imagery that reflects diverse experiences of health... body size" https://www.hsph.harvard.edu/chc/resources/effective-health-communication-using-inclusive-language-and-images/ ; CDC: "Diverse beauty standards whenever possible" y evitar imágenes "that enforce narrow standards of beauty" https://restoredcdc.org/www.cdc.gov/health-communication/php/toolkit/inclusive-images.html . NHS Scotland: "a wide range of body shapes and sizes" https://www.turasdesignsystem.nhs.scot/design/illustrations/ . IBM habla de tipos de cuerpo, poses y ayudas técnicas (dato de resumen, no pude abrir la página) https://ibm.com/design/language/illustration/people
2. **No cuestionar el "cuerpo estándar" solo agregando variantes**: la figura por defecto de la ilustración médica es "able-bodied, thin, young, cisgender", y todo lo demás queda como desvío. https://blog.castac.org/2019/10/representing-diverse-bodies-in-medical-illustration/
3. **Ilustrar personas distintas, no atributos distintos** (no basta con pintar otro color de piel sobre la misma figura). Cita de Meg Robichaud en https://blog.blush.design/post/illustration-diversity-design
4. **Evitar caricaturas y lo "forzado"**: escenas naturales, no mostrar diversidad como pose ("avoid appearing to try too hard"). CDC (link arriba).
5. **Ser literal y validar con personas reales** (usuarios del gimnasio): las imágenes son el mensaje, y las abstractas confunden a parte del público; validar con la comunidad. CDC (link arriba).

Nota: no encontré un estándar formal único de "ilustración inclusiva por talle"; es una síntesis de guías.

## 4. Recomendación para El Templo

Restricciones: SVG, 16 zonas + no-músculo, legible de 150px a TV, frente/espalda, hombre/mujer, no hegemónico.

**A) Silueta paramétrica con zonas suaves (recomendada para prototipar).**
- Dibujar nosotros una silueta frente/espalda con pocos parámetros (hombros, cintura, cadera, grosor de brazos y piernas) y zonas como manchas suaves (sin estrías ni six-pack) recortadas por la silueta, con un `id` por zona. Estilo cercano al de Peloton, pero ya con nuestras zonas.
- Pros: licencia propia, múltiples cuerpos baratos (2-3 contexturas × hombre/mujer × frente/espalda salen de los parámetros), se lee bien a 150px porque no hay detalle fino. Contras: hay que diseñar bien las manchas para que cada zona sea reconocible; riesgo de verse "genérico/infantil". Esfuerzo: medio (unos pocos días de iteración con renders a 150px).

**B) Encargar a una ilustradora/or el set completo.**
- Pedir 3 contexturas (ej. delgada, media, grande) × frente/espalda, 16 zonas con ids, 150px a TV, con cesión de derechos. Pros: mejor calidad y personalidad; coherente con la marca (paleta cálida). Contras: costo y plazos, y cada cambio de zonas requiere volver al ilustrador. Mejor hacerlo **después** de A: la maqueta paramétrica sirve de brief y ya valida el pipeline técnico (ids, estados, escalado).

**C) Adaptar el asset MIT actual (react-native-body-highlighter).**
- Ya funciona con nuestros slugs; la licencia permite modificar. Pero el aspecto hegemónico viene de la forma de cada polígono (estrías, V-shape), no de la paleta; suavizarlo implica redibujar casi todo, así que se acerca a A con más trabajo y heredando la geometría. Solo tiene sentido como plan de contingencia, o para reaprovechar su mapeo de zonas/lados. Evitar CC BY-SA (Wikimedia, Z-Anatomy) y los SVG minimal de muscle_mapper por licencia dudosa.

Orden sugerido: A como maqueta (probar a 150px y en TV real, con feedback de socios del gimnasio según CDC/Harvard) → decidir si alcanza o pasa a B.

Pendientes de verificar a mano (no lo pude hacer): cómo dibujan el cuerpo Fitbod, Strong, NTC, Freeletics, Sweat, Ladder, Future, Caliber, Gymshark, Down Dog, Alo Moves, Kaia, Physitrack y las clínicas (NHS, Mayo, Cleveland) — hay que mirar las apps o sus tiendas; y la licencia exacta de Humaaans, Blush, Z-Anatomy y body-highlighter (lahaxearnaud).
