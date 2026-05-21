# Phase 115: Evento Desafío de la Barra - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 115-evento-desafio-de-la-barra
**Areas discussed:** Estructura frontend + override carrusel, Estado del intento (timer + foto), Endpoint API, Composición foto + marco

---

## Estructura frontend + override carrusel

### Q1: ¿Dónde viven los archivos del desafío en el frontend?

| Option                                                           | Description                                                                                                                   | Selected |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Módulo dedicado `src/modules/bar-challenge/`                     | Carpeta nueva con pages/, components/, composables/, stores/. Sigue convención de training, progression, programs, goal-plan. | ✓        |
| Flat: `pages/desafio-barra/` + `components/BarChallengeCard.vue` | Sin módulo. Menos overhead pero rompe consistencia.                                                                           |          |
| Módulo dedicado sin `stores/` aparte                             | Estado en composable dentro de composables/, no Pinia store.                                                                  |          |

**User's choice:** Módulo dedicado.

### Q2: ¿Dónde vive la constante `BAR_CHALLENGE_WINDOW`?

| Option                                             | Description                                                                        | Selected |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Composable `useBarChallengeWindow()` en el módulo  | Centraliza lógica de fechas; expone `isActive`, `isBeforeWindow`, `isAfterWindow`. | ✓        |
| Constante exportada + computed inline en consumers | Más simple, menos abstracción.                                                     |          |
| Env var `VITE_BAR_CHALLENGE_WINDOW`                | Configurable sin rebuild pero viola constraint "hardcoded en frontend".            |          |

**User's choice:** Composable.

### Q3: ¿Cómo se integra el override del carrusel en `MiTemplo.vue`?

| Option                                                       | Description                                                                 | Selected |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| Computed local en `MiTemplo.vue` con `useBarChallengeWindow` | Mínimo cambio en MiTemplo.vue; lógica del desafío aislada en el composable. | ✓        |
| Refactor del carrusel a un componente `<PremiumCarousel>`    | Más limpio pero scope creep no relacionado al evento.                       |          |
| Computed en `useUserStore`                                   | Acopla constante de desafío al store de usuario.                            |          |

**User's choice:** Computed local.

### Q4: ¿Cómo testeamos el override en staging antes del 23/05?

| Option                                                 | Description                                                                        | Selected |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| Query param `?bar-challenge-force=1` lo activa         | Funciona en cualquier device sin tocar reloj. Se mantiene post-evento, costo cero. | ✓        |
| Override por env var `VITE_BAR_CHALLENGE_FORCE_ACTIVE` | Requiere rebuild para alternar.                                                    |          |
| Solo cambio de reloj del device                        | PITA con plugins nativos.                                                          |          |
| Query param + log warning en consola                   | Igual a opción 1 + log.                                                            |          |

**User's choice:** Query param `?bar-challenge-force=1`.

---

## Estado del intento (timer + foto)

### Q1: ¿Pinia store dedicado o composable simple?

| Option                                        | Description                                                                      | Selected |
| --------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Pinia store `useBarChallengeStore`            | Consistente con sessionPlayerStore, weekStore. Sobrevive navegación entre rutas. | ✓        |
| Composable con estado en module scope         | Más liviano pero rompe convención.                                               |          |
| Composable + `provide/inject` desde un layout | Requiere router nested.                                                          |          |

**User's choice:** Pinia store.

### Q2: Si el staff hace refresh accidental durante `/timer`, ¿qué esperamos?

| Option                                               | Description                                | Selected |
| ---------------------------------------------------- | ------------------------------------------ | -------- |
| Persistir `startTime` en sessionStorage y recomponer | Robusto contra refresh y crash.            |          |
| Aceptar pérdida — refresh = empezar de nuevo         | Simple, riesgo manejable.                  |          |
| Bloquear refresh con `beforeunload` warning          | Mal UX en Capacitor.                       |          |
| Persistir startTime + photoBase64 en sessionStorage  | Sobrevive refresh completo pero +overhead. |          |

**User's choice:** "super especifico no importa esto" — aceptamos pérdida, estado solo en memoria.
**Notes:** Decisión D-08: no persistir. Si pasa refresh, mala suerte; store resetea.

### Q3: Implementación del cronómetro — ¿cómo lo armamos?

| Option                                                       | Description                                      | Selected |
| ------------------------------------------------------------ | ------------------------------------------------ | -------- |
| `setInterval` cada 100ms + `Date.now()` como source of truth | Robusto contra throttling cuando cámara abierta. | ✓        |
| `setInterval` simple incrementando `secondsHeld++`           | SO puede pausar JS timer al ir a background.     |          |
| `requestAnimationFrame` loop                                 | Overkill para MM:SS, gasta batería.              |          |

**User's choice:** `setInterval` 100ms + `Date.now()`.

### Q4: Al apretar 'Finalizar' y submitear el POST, ¿qué hacemos si la red falla?

| Option                                                  | Description                                                           | Selected |
| ------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Reintentar automático 3 veces + queue si sigue fallando | Robusto, push a sessionStorage si fallan 3; reintento en próximo /me. | ✓        |
| Mostrar resultado optimistic + retry manual con botón   | El staff valida con foto, no backend.                                 |          |
| Bloquear avance hasta éxito del POST                    | Garantiza consistencia DB pero mal UX si red mala.                    |          |
| Fire-and-forget — ignorar errores                       | Rompe single-attempt enforcement.                                     |          |

**User's choice:** Reintentar 3 veces + queue.
**Notes:** Resultado avanza optimistic (foto/share funciona); banner discreto si POST sigue fallando.

---

## Endpoint API

### Q1: ¿Dónde vive el endpoint del backend?

| Option                                                     | Description                                               | Selected |
| ---------------------------------------------------------- | --------------------------------------------------------- | -------- |
| Módulo nuevo `el-templo-api/src/modules/bar-challenge/`    | Aislamiento limpio, espeja decisión frontend.             | ✓        |
| Extender módulo `auth` con ruta `/me/bar-challenge/result` | Ensucia auth con feature one-shot.                        |          |
| Módulo nuevo + path bajo `/api/me/`                        | Más código de mounting; respeta convención REST del SPEC. |          |

**User's choice:** Módulo nuevo.

### Q2: Path exacto del endpoint

| Option                              | Description                                             | Selected |
| ----------------------------------- | ------------------------------------------------------- | -------- |
| `POST /api/bar-challenge/result`    | Consistente con módulo aislado. Override sobre el SPEC. | ✓        |
| `POST /api/me/bar-challenge/result` | Respeta SPEC literal pero requiere prefix manual.       |          |
| `POST /api/bar-challenge/attempts`  | Plural confunde — single-attempt lockeado.              |          |

**User's choice:** `POST /api/bar-challenge/result`.
**Notes:** SPEC se actualiza implícitamente. `userId` sale de `request.user`.

### Q3: Validación y bound del `secondsHeld`

| Option                                          | Description                                       | Selected |
| ----------------------------------------------- | ------------------------------------------------- | -------- |
| zod inline: `secondsHeld: int, min 0, max 600`  | Bound 10min — realista.                           | ✓        |
| zod inline: `secondsHeld: int, min 0, max 3600` | Bound 1h más laxo.                                |          |
| Solo `min 0` sin límite superior                | Abre puerta a payloads ruidosos.                  |          |
| `min 1, max 600`                                | Rechaza 0 — pero un POST con 0 no debería llegar. |          |

**User's choice:** min 0, max 600.

### Q4: Exposición de los 3 campos en `GET /me`

| Option                                            | Description                                                       | Selected |
| ------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| Exponer siempre los 3 campos                      | Consistente con /me actual. Frontend lee del `userStore.profile`. | ✓        |
| Exponer solo `barChallengeAttemptedAt`            | Falla criterio SPEC (card muestra 'Aguantaste Xs').               |          |
| Endpoint dedicado `GET /api/bar-challenge/status` | +1 request al cargar MiTemplo.                                    |          |
| Exponer los 3 solo durante la ventana             | Duplica lógica de fechas en 2 lados.                              |          |

**User's choice:** Exponer siempre los 3 campos.

---

## Composición foto + marco

### Q1: Tamaño del canvas y cómo encaja la foto bajo el marco

| Option                                                  | Description                                                   | Selected |
| ------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| Canvas 1080x1920 (vertical IG/stories), foto en `cover` | Sin letterbox, look consistente. Pierde un poquito en bordes. | ✓        |
| Canvas = dimensiones de la foto original                | Si user sacó horizontal, marco vertical queda raro.           |          |
| Canvas 1080x1920, foto en `contain`                     | Letterbox negro desprolijo.                                   |          |
| Canvas 1080x1080 (cuadrado)                             | Menos universal que stories.                                  |          |

**User's choice:** 1080x1920 cover.

### Q2: ¿Quién genera el PNG placeholder del marco y cuándo?

| Option                                                            | Description                              | Selected |
| ----------------------------------------------------------------- | ---------------------------------------- | -------- |
| Claude lo genera en execute-phase (logo SVG + texto programático) | Reemplazable post-evento.                | ✓        |
| Usuario pasa el PNG antes del execute-phase                       | Mejor calidad visual día 1 pero bloquea. |          |
| Frontend genera el marco en runtime (sin asset)                   | Difícil de iterar visualmente.           |          |
| Placeholder simplísimo en execute + reemplazo usuario             | Híbrido pero misma idea.                 |          |

**User's choice:** Claude lo genera en execute-phase.

### Q3: ¿Dónde vive `composeWithFrame()`?

| Option                                       | Description                                  | Selected |
| -------------------------------------------- | -------------------------------------------- | -------- |
| Composable `useImageComposer()` en el módulo | Aislado y testeable.                         | ✓        |
| Utility flat `utils/composeWithFrame.ts`     | Más liviano sin reactividad.                 |          |
| Inline en `Resultado.vue`                    | SPEC pide test específico — mejor extraerlo. |          |

**User's choice:** Composable `useImageComposer()`.

### Q4: Path final del marco PNG en el repo

| Option                                                      | Description                                        | Selected |
| ----------------------------------------------------------- | -------------------------------------------------- | -------- |
| `el-templo-app/public/desafio-barra/marco-placeholder.png`  | Lo del SPEC. Self-hosted en public.                | ✓        |
| `el-templo-app/src/modules/bar-challenge/assets/marco.png`  | Bundled por Vite. Si borrás módulo se va el asset. |          |
| `el-templo-app/public/desafio-barra/marco.png` (sin sufijo) | Honest naming si reemplaza.                        |          |

**User's choice:** `public/desafio-barra/marco-placeholder.png`.

---

## Claude's Discretion

- Detalles internos de cleanup del `useBarChallengeStore` (referencia: `sessionPlayerStore`).
- Estilos visuales del cambio "logrado" — tokens del design system existente.
- Layout exacto del fallback cuando cámara denegada por SO.
- Patrón fallback `Share.share` si files no soportado.

## Deferred Ideas

- Marco con diseño profesional (path conservado para reemplazo post-evento).
- Endpoint genérico de desafíos / tabla `challenge_attempts` (out of scope SPEC).
- Sonido/vibración al pasar 1:30 (out of scope SPEC).
- Notificaciones push del evento (out of scope SPEC).
- Backend feature flag para el evento (constraint hardcoded frontend del SPEC).
