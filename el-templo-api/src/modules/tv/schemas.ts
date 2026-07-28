/**
 * JSON Schemas + interfaces tipadas de las rutas del modulo TV (fase 164).
 *
 * Patron del repo: el schema de validacion y la interfaz que lo describe viven
 * en el MISMO archivo (ver `modules/sessions/schemas.ts`), asi el handler tipa
 * `request.body` contra lo que Fastify realmente valido.
 *
 * Validacion de entrada (ASVS V5): ningun string libre sin `pattern` o limite.
 * Las dos superficies del modulo tienen niveles de confianza opuestos —
 * `/api/tv/*` es PUBLICA (cualquiera en internet puede llamarla, el TV no tiene
 * credenciales hasta despues del pairing) y `/api/admin/tv/*` es staff con JWT —
 * asi que la validacion sintactica es la primera linea en ambas.
 *
 * Los schemas de RESPUESTA no son decorativos: fast-json-stringify solo
 * serializa las propiedades declaradas, asi que actuan de red de contencion
 * contra una futura fuga de `token_hash` o `device_code_hash` si alguien cambia
 * un `select({...})` explicito por un `select()` (T-164-11 / T-164-14).
 */

/**
 * Alfabeto del `user_code` visible en la pantalla del TV (RFC 8628).
 *
 * Sin `I`, `1`, `O` ni `0`: el codigo se lee a 4 metros y despues se tipea en un
 * celular. 32 simbolos ^ 6 posiciones = 1.07e9 combinaciones.
 *
 * FUENTE UNICA: `pairing.ts` genera los codigos con este mismo array y el
 * `pattern` de abajo se deriva de el, de modo que el generador y el validador no
 * pueden divergir.
 */
export const TV_USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Largo del `user_code`. Ver `TV_USER_CODE_ALPHABET`. */
export const TV_USER_CODE_LENGTH = 6;

/** Regex del `user_code`, derivada del alfabeto (nunca escribirla a mano). */
export const TV_USER_CODE_PATTERN = `^[${TV_USER_CODE_ALPHABET}]{${TV_USER_CODE_LENGTH}}$`;

/**
 * Piso de largo del `device_code`. El real es `randomBytes(32).base64url` = 43
 * chars; 22 es el minimo defensivo (128 bits en base64url) para rechazar de
 * entrada cualquier intento de mandar el `user_code` de 6 chars por este campo
 * — que es exactamente el ataque del Pitfall 10.
 */
export const TV_DEVICE_CODE_MIN_LENGTH = 22;

/** Techo del `device_code`: nada legitimo supera los 64 chars. */
const TV_DEVICE_CODE_MAX_LENGTH = 64;

// ---------------------------------------------------------------------------
// Rutas de dispositivo (publicas, prefijo /api/tv)
// ---------------------------------------------------------------------------

/**
 * POST /api/tv/pair/start
 *
 * Sin body: el TV todavia no sabe nada de si mismo (ni su sede, que la elige el
 * staff al reclamar — D-01). Solo se declara la respuesta.
 */
export const tvPairStartSchema = {
  response: {
    201: {
      type: "object",
      required: ["userCode", "deviceCode"],
      properties: {
        userCode: { type: "string" },
        // Secreto que el TV guarda en localStorage. Se emite UNA sola vez y
        // nunca se muestra en pantalla ni se loguea.
        deviceCode: { type: "string" },
      },
    },
  },
};

export interface TvPairStartResponse {
  userCode: string;
  deviceCode: string;
}

/**
 * GET /api/tv/pair/status?deviceCode=...
 *
 * El poll viaja con el `device_code` SECRETO, jamas con el `user_code` visible
 * (Pattern 2 / Pitfall 10): adivinar el codigo de la pantalla no entrega ningun
 * token. El `minLength` ya rechaza sintacticamente ese intento.
 *
 * Sin schema de respuesta: el body es una union de 4 formas discriminadas por
 * `status` y fast-json-stringify borraria los campos de las variantes que no
 * matchean la primera. El handler devuelve objetos construidos a mano, campo por
 * campo, sin exponer nunca la fila.
 */
export const tvPairStatusSchema = {
  querystring: {
    type: "object",
    required: ["deviceCode"],
    properties: {
      deviceCode: {
        type: "string",
        minLength: TV_DEVICE_CODE_MIN_LENGTH,
        maxLength: TV_DEVICE_CODE_MAX_LENGTH,
      },
    },
  },
};

export interface TvPairStatusQuery {
  deviceCode: string;
}

// ---------------------------------------------------------------------------
// Rutas de dispositivo (device token, prefijo /api/tv)
// ---------------------------------------------------------------------------

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

/**
 * GET /api/tv/state — el poll del televisor (cada 2.5 s).
 *
 * Sin querystring ni params A PROPOSITO: la sede sale de la fila del
 * dispositivo (`request.tvDevice.branchId`). Si esta ruta aceptara un
 * `branchId`, un TV comprometido podria leer la clase de otra sucursal
 * (T-164-31).
 *
 * El schema de respuesta es la red de contencion de D-09: fast-json-stringify
 * solo serializa lo declarado, asi que aunque alguien agregue mañana un campo
 * de diagnostico al payload, NO puede aparecer en la pared de la sede sin
 * declararlo aca. El reposo es exactamente
 * `{ serverNow, branch, screen: "idle", class: null }`.
 */
export const tvStateSchema = {
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
 * POST /api/tv/client-log — el unico canal de diagnostico del kiosco.
 *
 * Nadie va a abrir devtools en un televisor colgado a 3 metros del piso, asi
 * que el TV reporta sus propios errores por aca. La superficie esta acotada a
 * proposito (T-164-34): `level` es un enum cerrado, `message` y `context`
 * tienen techo de largo, y no se acepta ningun campo mas — un dispositivo no
 * puede inflar los logs del servidor con estructuras arbitrarias.
 */
export const tvClientLogSchema = {
  body: {
    type: "object",
    required: ["level", "message"],
    additionalProperties: false,
    properties: {
      // El nivel REPORTADO por el kiosco. Que se escriba siempre como warn en
      // el log del server es decision del handler, no de este enum.
      level: { type: "string", enum: ["warn", "error"] },
      message: { type: "string", minLength: 1, maxLength: 500 },
      context: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
};

export interface TvClientLogBody {
  level: "warn" | "error";
  message: string;
  context?: string;
}

// ---------------------------------------------------------------------------
// Rutas de staff (JWT + TV_CONTROL_ROLES, prefijo /api/admin/tv)
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/tv/pair/claim
 *
 * `branchId` es obligatorio y ademas lo verifica `requireBranchAccess({ from:
 * "body.branchId" })`: la sede la elige el staff (D-01), acotado a su scope.
 *
 * `additionalProperties: false` (fase 169, CON-04) es la regla dura del
 * milestone v6.0 llevada a este borde: el `tenant_id` JAMAS viene del payload.
 * Este claim es el momento en que el pairing aprende de que gimnasio es, y ese
 * dato sale de `assertTenant(request.scope, …)`; con el schema abierto, un
 * `tenantId` colado en el body quedaria a un solo spread de distancia de la
 * escritura. Mismo precedente que `tvControlStateSchema` (T-164-43), donde la
 * mitigacion evita que el cliente cuele su propio sello de tiempo.
 */
export const tvPairClaimSchema = {
  body: {
    type: "object",
    required: ["userCode", "branchId"],
    additionalProperties: false,
    properties: {
      userCode: { type: "string", pattern: TV_USER_CODE_PATTERN },
      branchId: { type: "integer", minimum: 1 },
      // Etiqueta libre para el panel ("TV sala grande"). Acotada en largo.
      name: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
};

export interface TvPairClaimBody {
  userCode: string;
  branchId: number;
  name?: string;
}

/**
 * GET /api/admin/tv/devices?branchId=NN
 *
 * `branchId` es opcional (sin el, se listan todas las sedes del scope del
 * usuario). El schema de respuesta fija el contrato del panel y garantiza que
 * `token_hash` nunca pueda salir por esta ruta.
 */
export const tvDevicesListSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["devices"],
      properties: {
        devices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: ["string", "null"] },
              branchId: { type: "integer" },
              branchName: { type: ["string", "null"] },
              isActive: { type: "boolean" },
              // D-05: alimenta el "visto hace X".
              lastSeenAt: { type: ["string", "null"], format: "date-time" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  },
};

export interface TvDevicesListQuery {
  branchId?: number;
}

export interface TvDeviceListItem {
  id: number;
  name: string | null;
  branchId: number;
  branchName: string | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

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

/**
 * POST /api/admin/tv/devices/:id/revoke
 *
 * `:id` es el id del dispositivo, no de la sede — el acceso por sede se valida
 * en el handler contra la sede REAL de la fila (no se puede leer del payload).
 */
export const tvDeviceRevokeSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  },
};

export interface TvDeviceIdParams {
  id: number;
}
