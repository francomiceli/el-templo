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
// Rutas de staff (JWT + TV_CONTROL_ROLES, prefijo /api/admin/tv)
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/tv/pair/claim
 *
 * `branchId` es obligatorio y ademas lo verifica `requireBranchAccess({ from:
 * "body.branchId" })`: la sede la elige el staff (D-01), acotado a su scope.
 */
export const tvPairClaimSchema = {
  body: {
    type: "object",
    required: ["userCode", "branchId"],
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
