/**
 * JSON Schemas + interfaces tipadas de las rutas del modulo TV (fase 164).
 *
 * Patron del repo: el schema de validacion y la interfaz que lo describe viven
 * en el MISMO archivo (ver `modules/sessions/schemas.ts`), asi el handler tipa
 * `request.body` contra lo que Fastify realmente valido.
 *
 * Validacion de entrada (ASVS V5): ningun string libre sin `pattern` o limite.
 *
 * El pairing por device token (RFC 8628) se elimino: la pantalla TV ahora es
 * una vista del admin AUTENTICADA. Toda esta superficie es staff con JWT
 * (`/api/admin/tv/*`), asi que la validacion sintactica sigue siendo la primera
 * linea pero ya no hay una superficie publica separada.
 *
 * Los schemas de RESPUESTA no son decorativos: fast-json-stringify solo
 * serializa las propiedades declaradas, asi que actuan de red de contencion
 * contra una futura fuga de datos si alguien cambia un `select({...})`
 * explicito por un `select()` (T-164-11).
 */

/**
 * Timer del bloque, tal como se publica en el poll.
 *
 * `spec` es una union de 4 formas (`TimerSpec` en `types.ts`) y se declara como
 * UN objeto con la union de sus campos: fast-json-stringify omite las
 * propiedades ausentes del objeto real, asi que un `countup` sale como
 * `{ kind: "countup" }` y un `work_rest` con sus tres numeros. Declararlo con
 * `anyOf` obligaria a repetir cuatro variantes para ganar cero seguridad — lo
 * que importa es que ningun campo NO declarado pueda salir.
 *
 * `startedAt` / `pausedAt` son epoch ms (Pitfall 9: con milisegundos, nunca
 * redondeados a segundo) y el tiempo transcurrido NO viaja: lo calcula el TV.
 */
const tvTimerStateSchema = {
  type: "object",
  properties: {
    spec: {
      type: "object",
      properties: {
        kind: { type: "string" },
        workMs: { type: "integer" },
        restMs: { type: "integer" },
        rounds: { type: "integer" },
        intervalMs: { type: "integer" },
        totalMs: { type: "integer" },
      },
    },
    status: { type: "string" },
    startedAt: { type: ["integer", "null"] },
    pausedAt: { type: ["integer", "null"] },
    pausedAccumMs: { type: "integer" },
    soundEnabled: { type: "boolean" },
  },
};

/** El bloque en vivo. `null` en el payload siempre que `screen !== "class"`. */
const tvClassPayloadSchema = {
  type: "object",
  properties: {
    mode: { type: "string" },
    levels: { type: "array", items: { type: "string" } },
    level: { type: "string" },
    levelLabel: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          title: { type: "string" },
          shared: { type: "boolean" },
        },
      },
    },
    blockRole: { type: "string" },
    // Pitfall 1: derivado del roster en cada lectura, nunca persistido.
    blockIndex: { type: "integer" },
    // C1: bloque VISUAL (colapsa DEUTEROS_1/DEUTEROS_2), tambien derivado.
    visualBlockIndex: { type: "integer" },
    visualBlockCount: { type: "integer" },
    title: { type: "string" },
    listHeader: { type: "string" },
    mobilityLine: { type: ["string", "null"] },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          rx: { type: "string" },
          videoUrl: { type: ["string", "null"] },
        },
      },
    },
    exerciseIndex: { type: "integer" },
    timer: tvTimerStateSchema,
  },
};

// ---------------------------------------------------------------------------
// Rutas de staff (JWT + TV_CONTROL_ROLES, prefijo /api/admin/tv)
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/tv/control/screen?branchId=NN
 *
 * La proyeccion TV-facing (idle/class/closing) del estado de clase de una
 * sede, AUTENTICADA y scopeada por `requireBranchAccess({ from:
 * "query.branchId" })` — reemplaza al viejo `GET /api/tv/state`, que
 * autenticaba por device token y sacaba la sede de la fila del dispositivo
 * (T-164-31). Con el login de staff, la sede la elige quien pregunta, dentro
 * de su scope, en vez de venir fija por un token de kiosco.
 *
 * `branchId` requerido, misma forma que `tvControlContextSchema`.
 *
 * El schema de respuesta sigue siendo la red de contencion de D-09:
 * fast-json-stringify solo serializa lo declarado, asi que un campo de
 * diagnostico agregado mañana no puede aparecer en la pared de la sede sin
 * declararlo aca. El reposo es exactamente
 * `{ serverNow, branch, screen: "idle", class: null }`.
 */
export const tvControlScreenSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["serverNow", "branch", "screen", "class"],
      properties: {
        // Sello del server en TODOS los polls (Pattern 6): el TV corrige su
        // reloj contra el, porque el suyo puede estar corrido.
        serverNow: { type: "integer" },
        branch: {
          type: "object",
          properties: {
            name: { type: "string" },
            // El kiosco arma HH:MM:SS con getUTC* + este offset: un Chromium
            // empotrado puede no tener Intl por timezone.
            utcOffsetMinutes: { type: "integer" },
            dateLabel: { type: "string" },
          },
        },
        screen: { type: "string", enum: ["idle", "class", "closing"] },
        class: {
          anyOf: [{ type: "null" }, tvClassPayloadSchema],
        },
      },
    },
  },
};

/**
 * GET /api/admin/tv/control/context?branchId=NN
 *
 * Todo lo que el control CIEGO del profe (D-13) necesita para dibujar su
 * botonera. `branchId` es obligatorio y ademas lo valida `requireBranchAccess({
 * from: "query.branchId" })`: el control arranca en la sede del profe pero
 * tiene selector (D-11), asi que la sede viaja en cada llamada y se autoriza en
 * cada llamada.
 *
 * Sin schema de respuesta a proposito: el contexto lleva un mapa de claves
 * dinamicas (`exerciseCountByLevel`, una entrada por nivel del dia) y el
 * payload lo construye el servicio campo por campo desde interfaces tipadas —
 * no se serializa ninguna fila de la DB, asi que no hay nada que fast-json-
 * stringify tenga que contener.
 */
export const tvControlContextSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer", minimum: 1 },
    },
  },
};

export interface TvControlContextQuery {
  branchId: number;
}

/**
 * Techo de `block_role` y `level`: es el largo fisico de sus columnas en
 * `tv_class_state` (varchar 20). La validacion SEMANTICA de estos dos campos no
 * puede vivir en un enum estatico — el roster y los niveles dependen del dia
 * (un sabado ROM tiene otros roles y solo dos tiers, D-23), asi que se validan
 * contra la sesion vigente dentro del servicio.
 */
const TV_STATE_TOKEN_MAX_LENGTH = 20;

/**
 * POST /api/admin/tv/control/state
 *
 * El unico endpoint de escritura del profe. Todos los campos son ABSOLUTOS y
 * opcionales: una escritura toca solo lo que nombra, y repetirla da el mismo
 * resultado. No existe ningun comando relativo (D-18) — con la red de una sede
 * y un doble tap, "el bloque que sigue" adelantaria dos.
 *
 * `additionalProperties: false` es la mitigacion de T-164-43: el cliente no
 * puede colar un sello de tiempo propio. Los timestamps los calcula el server
 * en cada escritura, y ninguno figura en este contrato.
 */
export const tvControlStateSchema = {
  body: {
    type: "object",
    required: ["branchId"],
    additionalProperties: false,
    properties: {
      branchId: { type: "integer", minimum: 1 },
      blockRole: {
        type: "string",
        minLength: 1,
        maxLength: TV_STATE_TOKEN_MAX_LENGTH,
      },
      level: {
        type: "string",
        minLength: 1,
        maxLength: TV_STATE_TOKEN_MAX_LENGTH,
      },
      // Sin techo: el clamp del servicio lo acota a la lista real del (rol,
      // nivel) vigente, que es lo unico que conoce el largo verdadero.
      exerciseIndex: { type: "integer", minimum: 0 },
      timer: { type: "string", enum: ["start", "pause", "resume", "reset"] },
      // "idle" NO se acepta: volver a reposo es `end-class`, no una pantalla.
      screen: { type: "string", enum: ["class", "closing"] },
      soundEnabled: { type: "boolean" },
    },
  },
};

/**
 * POST /api/admin/tv/control/end-class
 *
 * D-07: el boton manual "terminar clase" que deja el TV en reposo. Idempotente.
 */
export const tvControlEndClassSchema = {
  body: {
    type: "object",
    required: ["branchId"],
    additionalProperties: false,
    properties: {
      branchId: { type: "integer", minimum: 1 },
    },
  },
};

export interface TvControlEndClassBody {
  branchId: number;
}
