# Fase 164 — Pantalla TV de sucursal: UI-SPEC (mockup v8 validado)

**Estado:** diseño CERRADO por Franco el 2026-07-24 tras 8 iteraciones de mockup.
**Mockup navegable (fuente de verdad visual):** https://claude.ai/code/artifact/f61d5518-5716-4620-b02e-1696d961e100
**Template del mockup:** `164-tv-mockup-template.html` (en este directorio; los placeholders `__CINZEL_*__`, `__NUNITO_*__`, `__MARBLE__`, `__LOGO__`, `__VIDEO__` se rellenan con los exports de `el-templo-admin/src/utils/pdf/pdf-assets.ts`).

## Origen del feature

Sugerencias de socios (`improvement_proposals`, 42 al 2026-07-24): el pedido #1 es
reloj/cronómetro/segundero visible (6 pedidos en 4 sedes — Alem, Mogotes ×3,
Constitución ×2), sobre todo para isométricos. Hoy el profe descarga PNGs del
PDF de la plani (una página por bloque) y las pasa a mano en el TV. La pantalla
reemplaza ese flujo completo.

## Concepto

Una página web por sede en el browser del TV (16:9, kiosco) que muestra el
bloque en curso de la sesión del día, estática mientras el bloque sucede.
El profe la controla desde su celular (admin). Nada se toca en el TV.

## Estética — réplica del PDF de planis

Fuente de tokens: `el-templo-admin/src/utils/pdf/session-pdf-builder.ts`.
**El PDF conserva el NAVY: la paleta "sin azul" del rebrand NO aplica acá.**

| Token        | Valor                                  | Uso                                                                   |
| ------------ | -------------------------------------- | --------------------------------------------------------------------- |
| BG_CREAM     | `#F2EBE1` + textura `MARBLE_BG_BASE64` | fondo                                                                 |
| NAVY         | `#24364A`                              | títulos, ejercicios, dígitos del timer                                |
| GOLD         | `#B08D6E`                              | acentos, bordes de cajas, headers de columna, rx del ejercicio activo |
| SAND         | `#DBCAB4`                              | sombra de títulos (offset ~0.05em/0.035em, opac ~0.85)                |
| BORDER_MUTED | `#c5b9a8`                              | bordes atenuados, timer en DESCANSO                                   |

Tipografías (base64 en `pdf-assets.ts`): **Cinzel** bold para título de bloque,
hora del TV y dígitos del timer; **NunitoSans** regular/bold para todo lo demás.
Símbolos de nivel: α Δ Σ (y ☉ para kairos).

## Layout (marco 16:9 exacto — el PDF se genera a 3840×2160)

- **Topbar:** logo real + "EL TEMPLO {SEDE}" (Cinzel) + fecha/semana (oro) | hora **HH:MM:SS** con segundero en oro (Cinzel, siempre visible — el pedido literal de los socios).
- **Cabecera centrada:** título `ROLE · FORMATO` (Cinzel navy + sombra arena, como el PDF) + línea `MOVILIDAD · …` (oro) + indicador `BLOQUE N / M` con dots de progreso.
- **Zona principal, 2 columnas 45/55:**
  - **Izquierda, partida en dos mitades:**
    - Arriba: lista de ejercicios del nivel elegido. Header `NIVEL Δ | Tracción 70%` (oro). Caja borde dorado redondeado. El **ejercicio actual gigante** (~2.2cqw) con `▶` dorado y rx en oro; los demás atenuados (opacity 0.45, ~1.45cqw). Listas >5 ítems → modo compacto automático.
    - Abajo: **timer** con el formato como header. Fase en Cinzel (TRABAJO pulsante / DESCANSO con borde muted / BLOQUE COMPLETO con fondo arena), dígitos gigantes Cinzel navy, sub-línea (RONDA 3/8, INTERVALO 4/10…), barra de progreso del bloque.
  - **Derecha:** el **video del ejercicio actual** a columna completa (header = nombre del ejercicio), `<video autoplay loop muted playsinline>` con `object-fit: cover`.
- **INITIUM/PYROS usa la MISMA grilla** (decisión v8): titula `PYROS · {formato}` (NUNCA "CALENTAMIENTO"), header de lista `INITIUM | TODOS LOS NIVELES`, selector de nivel deshabilitado (es lista compartida). Es simplemente "bloque sin niveles".

## Timers por formato (de `formatParams` reales de session_blocks)

| Formato                           | Params                        | Comportamiento                                           |
| --------------------------------- | ----------------------------- | -------------------------------------------------------- |
| tabata                            | work/rest/rounds              | alterna TRABAJO/DESCANSO con colores, contador de rondas |
| emom / every_x_seconds            | intervalSeconds, totalMinutes | countdown por intervalo + "INTERVALO n/m"                |
| on_the_x                          | intervalSeconds, rounds       | ídem con rondas                                          |
| amrap / amrap_series              | minutes (, rounds)            | cuenta regresiva total                                   |
| death_by                          | timeCapMinutes                | cuenta regresiva del cap                                 |
| sin params (standard, chipper, …) | —                             | cronómetro libre count-up                                |

Al terminar: estado "BLOQUE COMPLETO" + hint "el profe avanza al siguiente
bloque". Beeps opcionales (WebAudio) en cambio de fase/intervalo.

**Regla de oro:** el tiempo NO viaja por la red. La API publica `timerStartedAt`
(timestamp) + params; el TV calcula localmente. Cambiar nivel/ejercicio NO
resetea el timer; cambiar de bloque sí.

## Control remoto del profe (celular, sección coach del admin)

Controles: bloque ◀ ▶ · nivel α/Δ/Σ/☉ (deshabilitado en bloque compartido) ·
ejercicio ◀ ▶ (mueve resaltado de lista + video juntos) · timer iniciar/pausar/
reset · sonido on/off.

## Arquitectura (acordada, para plan-phase)

- **Sin apps nuevas.** Pantalla = ruta pública `/tv` en el-templo-admin
  (`meta: { public: true }` ya existe en el router). Control = página coach del
  admin. Backend = módulo nuevo en el-templo-api.
- **Celular y TV nunca se conectan directo:** ambos hablan con la API.
  Fila de estado por sede (branch_id, session ref, block_index, nivel, ej_index,
  timer_state, timer_started_at). El celular escribe (auth coach), el TV lee.
- **TV: polling GET cada 2-3s** con device token. Ante wifi caído sigue con el
  último estado y el timer local; al volver se realinea. ~2.4 req/s total con 6
  sedes. Upgrade futuro a SSE = solo transporte, el contrato no cambia.
- **Vinculación:** el TV sin token muestra código corto; el staff lo carga en el
  admin y elige sede → device token persistido en localStorage (estilo Netflix).
- **Sesión del día:** el TV la carga con su device token (variante del
  GET /sessions/daily que hoy exige auth de usuario — la elección del dayId/level
  candidates ya está resuelta en `sessions/routes.ts`).
- **Videos:** `exercises.video_url` guarda keys (`exercises/<id>.mp4`);
  `assembleVideoUrl()` (`modules/shared/video-url.ts`) las prefija con
  `R2_PUBLIC_URL` (worker público de Cloudflare R2, sin auth, 202 ejercicios con
  video, ~1.6MB c/u). El TV usa el mismo `<video>` que `VideoPlaceholder.vue`
  de la app. Ejercicio sin video → placeholder (mismo criterio que la app).

## Decisiones ya tomadas (no reabrir en discuss)

1. Estética = PDF (mármol/Cinzel/navy+oro), NO la paleta cálida del rebrand.
2. Layout v8: 2 columnas 45/55, lista+timer apilados a la izquierda, video derecha.
3. PYROS es un bloque más (sin página especial, titula PYROS).
4. Polling con timestamp de inicio, no WebSockets ni push de "segundos restantes".
5. Vive en el admin, no en la app de socios, no es app nueva.
6. Una sola lista por vez (el profe elige nivel), no grilla 2×2.

## Abierto para discuss-phase

- Naming/estructura exacta de tablas (tv_devices, tv_class_state) y TTL del device token.
- ¿El estado de clase se limpia solo (fin del día / inactividad)?
- Duración del pairing code y quién puede vincular (¿solo owner o también coach?).
- ¿Qué muestra el TV fuera de horario de clase (reloj solo, próxima clase, logo)?
- Sonido de beeps en el TV real: ¿on por default?
- Fallback si la sesión del día no está aprobada (hoy 404 en /sessions/daily).

## Prerequisito operativo (fuera de código)

Wifi en las sedes sin internet (Moreno — sugerencias #41/#42). Sin eso el TV de
esa sede no funciona.
