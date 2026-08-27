/**
 * TvService — el cerebro del poll del televisor de sucursal (fase 164).
 *
 * Todo lo derivable se calcula aca y viaja ya resuelto: el kiosco es un bundle
 * ES2015 sin test runner, en un Chromium empotrado que puede traer ICU
 * reducida. La pantalla no decide nada; solo pinta.
 *
 * Tres invariantes que este archivo sostiene:
 *
 *  1. **La sede la autoriza el caller** (`requireBranchAccess` en la ruta,
 *     T-164-20 rehecha para el login autenticado): ya no hay un token de
 *     dispositivo que la fije, asi que la ruta valida el scope del usuario
 *     ANTES de invocar `buildPollPayload(branchId)`.
 *  2. **Cero datos de socio en el payload** (T-164-21). El TV cuelga de una
 *     pared publica: solo ejercicios, prescripciones, roster y estado.
 *  3. **Reposo silencioso** (D-09, T-164-22): sin sesion aprobada el payload es
 *     `screen: "idle"` sin un solo campo de error. Un socio no puede distinguir
 *     "no hay clase ahora" de "el profe no aprobo la sesion".
 */
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { ConflictError, NotFoundError } from "../shared/errors";
import { ROLE_LABELS } from "../shared/role-labels";
import { assembleVideoUrl } from "../shared/video-url";
import {
  resolveClassDay,
  type ClassDay,
  type ClassDayBlock,
  type ClassDayPrescription,
} from "./class-day";
import {
  buildRoster,
  findBlock,
  findInitiumBlock,
  pairFor,
  visualGroupOf,
} from "./roster";
import { getRouteLabel } from "./route-labels";
import { toTimerSpec } from "./timer-spec";
import type {
  TvBlockSummary,
  TvClassPayload,
  TvControlBlock,
  TvControlContext,
  TvControlState,
  TvExercise,
  TvLevelColumn,
  TvDeuterosGroup,
  TvPollResponse,
  TvScreen,
  TvStateWrite,
  TvTimerStatus,
} from "./types";

/** Comandos del timer (D-18: exactamente estos cuatro, ninguno relativo). */
type TvTimerCommand = NonNullable<TvStateWrite["timer"]>;

/** El timer en cero: cambiar de bloque y "reset" dejan exactamente esto. */
const IDLE_TIMER = {
  timerStatus: "idle" as TvTimerStatus,
  timerStartedAt: null,
  pausedAt: null,
  pausedAccumMs: 0,
};

/** La sede, con lo minimo para resolver su dia y rotular su nombre. */
interface TvBranchRef {
  id: number;
  name: string;
  timezone: string;
}

/** Simbolos de nivel del UI-SPEC. */
const LEVEL_SYMBOLS: Record<string, string> = {
  kairos: "☉",
  alfa: "α",
  delta: "Δ",
  sigma: "Σ",
};

/**
 * Orden canonico de niveles (kairos primero), IGUAL al `LEVEL_ORDER` de
 * `constants/levels.ts` que usa el PDF. La movilidad se guarda por nivel y cada
 * nivel la sortea aparte (`selectMobilityExercise` es `Math.random()` por bloque),
 * asi que TV y PDF tienen que leerla del MISMO nivel o divergen siempre: el editor
 * y el PDF muestran la del nivel canonico (regresion KAIROS-01, fase 129) y la TV
 * arranca en `alfa` — leia otra movilidad en todos los casos. La linea de
 * movilidad se resuelve desde este orden; el titulo, el timer y las columnas de
 * ejercicios siguen saliendo del nivel seleccionado en el control.
 */
const CANONICAL_LEVEL_ORDER = [
  "kairos",
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
];

/**
 * Dia ROM (D-23): solo dos tiers, y NO se rotulan con simbolos de nivel — el
 * sabado no existe la escalera alfa/delta/sigma, existe basico y avanzado.
 */
const ROM_LEVEL_LABELS: Record<string, string> = {
  alfa: "BÁSICO",
  delta: "AVANZADO",
};

/** Etiqueta que se muestra cuando el bloque es compartido (INITIUM). */
const ALL_LEVELS_LABEL = "TODOS LOS NIVELES";

/** Nombres de dia en mayusculas, iguales a los que imprime el PDF. */
const DAY_LABELS: Record<string, string> = {
  lunes: "LUNES",
  martes: "MARTES",
  miercoles: "MIÉRCOLES",
  jueves: "JUEVES",
  viernes: "VIERNES",
  sabado: "SÁBADO",
  domingo: "DOMINGO",
};

/**
 * Formatos donde las reps/segundos los dicta la ESTRUCTURA del formato y no el
 * profe: el editor ni siquiera muestra los inputs por ejercicio, y el PDF los
 * suprime. Espejo de `FORMAT_DICTATED_TYPES` en
 * `el-templo-admin/src/constants/formats.ts` — sin esto el TV mostraria en una
 * pared un "10" que nadie prescribio.
 */
const FORMAT_DICTATED_TYPES = new Set([
  "tabata",
  "interval",
  "hiit",
  "on_the_x",
  "death_by",
  "death_by_unbroken",
]);

/**
 * Minutos de desfasaje de una TZ respecto de UTC en un instante dado.
 *
 * Se publica en el payload porque el kiosco NO puede usar
 * `Intl.DateTimeFormat({ timeZone })` (ICU reducida en TVs empotrados): con
 * este numero arma el reloj HH:MM:SS con puros `getUTC*`. Es DST-aware por
 * construccion — se recalcula en cada poll.
 */
function utcOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // algunos runtimes emiten "24" para medianoche
    get("minute"),
    get("second"),
  );
  // Redondeo al minuto: el segundo se pierde por el truncado de la TZ, no por
  // el calculo (ninguna TZ real tiene offset con segundos desde 1972).
  return Math.round((zonedAsUtc - at.getTime()) / 60_000);
}

/** Volumen de una prescripcion, con la misma logica que imprime el PDF. */
function prescriptionVolume(p: ClassDayPrescription): string {
  if (p.increment) {
    const start = p.reps || p.seconds || 0;
    return `${start}-${start + p.increment}-${start + p.increment * 2}-...`;
  }
  if (p.seconds) {
    return p.secondsMax ? `${p.seconds}-${p.secondsMax}"` : `${p.seconds}"`;
  }
  if (p.reps) {
    return p.repsMax ? `${p.reps}-${p.repsMax}` : `${p.reps}`;
  }
  return "";
}

/** Linea de movilidad del bloque: `NOMBRE 20"` / `NOMBRE 10` / `NOMBRE`. */
function mobilityText(p: ClassDayPrescription): string {
  const name = p.weighted ? `${p.exerciseName} (W)` : p.exerciseName;
  const prescription =
    p.seconds > 0 ? `${p.seconds}"` : p.reps > 0 ? `${p.reps}` : "";
  return `${name} ${prescription}`.trim();
}

export class TvService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Estado de clase vigente de una sede, con EXPIRE-ON-READ (D-07).
   *
   * Si la fila quedo de un dia anterior se devuelve `null`: para el lector es
   * como si no existiera, y el TV amanece en reposo sin necesidad de un cron
   * que barra estados viejos. La fila no se borra — el proximo "iniciar clase"
   * la sobreescribe.
   *
   * `classDate` DEBE venir de `todayInTz(branch.timezone)`. El analogo de
   * subscriptions calcula "hoy" en UTC; aca eso haria que Barcelona limpiara
   * el estado a la hora argentina.
   */
  async readState(
    branchId: number,
    classDate: string,
  ): Promise<TvControlState | null> {
    const [row] = await this.db
      .select({
        classDate: schema.tvClassState.classDate,
        screen: schema.tvClassState.screen,
        blockRole: schema.tvClassState.blockRole,
        level: schema.tvClassState.level,
        exerciseIndex: schema.tvClassState.exerciseIndex,
        timerStatus: schema.tvClassState.timerStatus,
        timerStartedAt: schema.tvClassState.timerStartedAt,
        pausedAt: schema.tvClassState.pausedAt,
        pausedAccumMs: schema.tvClassState.pausedAccumMs,
        soundEnabled: schema.tvClassState.soundEnabled,
      })
      .from(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchId));

    if (!row) return null;
    if (row.classDate !== classDate) return null;

    return {
      screen: row.screen === "closing" ? "closing" : "class",
      blockRole: row.blockRole,
      level: row.level,
      exerciseIndex: row.exerciseIndex,
      timerStatus: this.parseTimerStatus(row.timerStatus),
      // Epoch ms, nunca strings: el kiosco compara contra su reloj corregido.
      timerStartedAt: row.timerStartedAt ? row.timerStartedAt.getTime() : null,
      pausedAt: row.pausedAt ? row.pausedAt.getTime() : null,
      pausedAccumMs: row.pausedAccumMs,
      soundEnabled: row.soundEnabled,
    };
  }

  /**
   * Ajustar un estado persistido a la realidad del dia.
   *
   * Es la red que hace que cambiar de nivel nunca rompa el bloque (Pitfall 1):
   * dos niveles del mismo dia pueden tener rosters de largo distinto y listas
   * de ejercicios distintas, asi que el rol se valida contra el roster vigente
   * y el indice de ejercicio se clampa contra la lista del (rol, nivel) actual.
   */
  clampState(state: TvControlState, classDay: ClassDay): TvControlState {
    const roster = buildRoster(classDay);
    if (roster.length === 0) return state;

    const blockRole = roster.some((b) => b.role === state.blockRole)
      ? state.blockRole
      : roster[0].role;
    const level = classDay.levels.includes(state.level)
      ? state.level
      : (classDay.levels[0] ?? state.level);

    const block = this.resolveBlock(classDay, blockRole, level);
    const maxIndex = Math.max(0, this.mainPrescriptions(block).length - 1);
    const exerciseIndex = Math.min(Math.max(state.exerciseIndex, 0), maxIndex);

    return { ...state, blockRole, level, exerciseIndex };
  }

  /**
   * Payload completo del poll para un televisor.
   *
   * `now` es inyectable para poder testear bordes de dia y de reloj sin
   * depender de la maquina que corre los tests.
   */
  async buildPollPayload(
    branchId: number,
    now: Date = new Date(),
  ): Promise<TvPollResponse> {
    // 1. La sede pedida (ahora resuelta por scope autenticado, ya no por la
    // fila de un dispositivo — T-164-20 queda cubierto por `requireBranchAccess`
    // en la ruta en vez de por esta funcion).
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    if (!branch) {
      // Sede inexistente: condicion esperable de datos, no una falla del
      // sistema -> warn, y reposo en pantalla.
      this.log.warn(
        { branchId },
        "tv: se pidio el estado de una sede inexistente",
      );
      return {
        serverNow: now.getTime(),
        branch: { name: "", utcOffsetMinutes: 0, dateLabel: "" },
        screen: "idle",
        class: null,
      };
    }

    // 2. Que clase es la de hoy PARA ESTA SEDE.
    const classDay = await resolveClassDay(this.db, branch, now);
    // Misma fecha que resolvio `resolveClassDay`, calculada del mismo instante:
    // se recalcula explicitamente para dejar a la vista que el expire-on-read
    // se decide con la TZ de la sede y no con UTC (D-07).
    const classDate = todayInTz(branch.timezone, now);

    const branchInfo = {
      name: branch.name.toUpperCase(),
      utcOffsetMinutes: utcOffsetMinutes(branch.timezone, now),
      dateLabel: `${DAY_LABELS[classDay.dayName] ?? classDay.dayName.toUpperCase()} · SEMANA ${classDay.week}`,
    };

    // Pattern 6: el sello del server viaja en TODOS los polls. Sin el, un TV
    // con el reloj corrido calcularia basura contra `startedAt`.
    const base = {
      serverNow: now.getTime(),
      branch: branchInfo,
    };

    // 3. Estado persistido, ya caducado y clampeado.
    const stored = await this.readState(branch.id, classDate);

    // D-09: sin sesion aprobada o sin clase iniciada -> reposo, SIN mensaje.
    if (!classDay.approved || !stored) {
      return { ...base, screen: "idle", class: null };
    }

    const state = this.clampState(stored, classDay);
    const screen: TvScreen = state.screen === "closing" ? "closing" : "class";
    if (screen !== "class") {
      return { ...base, screen, class: null };
    }

    return {
      ...base,
      screen,
      class: this.buildClassPayload(classDay, state, now),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Control del profe
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Todo lo que el control del profe necesita para dibujar su botonera CIEGA
   * (D-13), en UNA sola llamada.
   *
   * El control no espeja la pantalla del TV: no hay preview. Por eso este
   * contexto trae la cantidad de bloques, los niveles que existen HOY (en ROM
   * son dos — D-23) y cuantos ejercicios tiene cada (bloque, nivel), que es lo
   * que le permite deshabilitar el boton de "ejercicio siguiente" en el ultimo
   * sin tener que adivinar.
   *
   * Diferencia deliberada con el poll del televisor: aca `sessionApproved`
   * viaja explicito (D-10). El TV se queda en reposo mudo ante una sesion sin
   * aprobar (D-09) porque cuelga de una pared publica; el celular del profe, en
   * cambio, tiene que poder decirle por que no puede iniciar la clase.
   */
  async buildControlContext(
    branchId: number,
    now: Date = new Date(),
  ): Promise<TvControlContext> {
    const branch = await this.loadBranch(branchId);
    const classDay = await resolveClassDay(this.db, branch, now);
    const stored = await this.readState(
      branch.id,
      todayInTz(branch.timezone, now),
    );
    return this.toControlContext(branch, classDay, stored);
  }

  /**
   * La UNICA escritura del profe. Absoluta, idempotente y clampeada.
   *
   * Por que un solo endpoint con valores absolutos y no un comando por accion:
   * el profe maneja esto desde un celular en el medio de una clase, con la red
   * de la sede. Un comando relativo ("el bloque que sigue") ante un doble tap o
   * un reintento del cliente adelantaria DOS bloques; mandar el rol destino no
   * puede hacer eso, porque repetir la misma escritura da el mismo resultado.
   * Los tres comandos de timer con estado (`start`/`pause`/`resume`) son NO-OP
   * cuando el timer ya esta en ese estado, por el mismo motivo.
   *
   * D-12: ultima escritura gana. Sin locks, sin numero de version, sin 409 por
   * concurrencia — dos profes escribiendo a la vez es una decision explicita
   * del usuario, no un caso a defender.
   *
   * Todos los sellos de tiempo se toman ACA (`now`), nunca del cliente: un
   * telefono con el reloj corrido no puede mover el arranque de un timer que se
   * proyecta en la pared (T-164-43).
   *
   * Devuelve el contexto COMPLETO y ya clampeado: el control es ciego (D-13) y
   * no puede inferir el estado nuevo por su cuenta.
   */
  async writeState(
    write: TvStateWrite,
    userId: number,
    now: Date = new Date(),
  ): Promise<TvControlContext> {
    const branch = await this.loadBranch(write.branchId);
    const classDay = await resolveClassDay(this.db, branch, now);
    const classDate = todayInTz(branch.timezone, now);
    const roster = buildRoster(classDay);

    // Sin sesion aprobada no existe un estado valido que escribir: no hay rol
    // al que apuntar ni nivel al que caer. El control ya lo sabe por
    // `sessionApproved` (D-10) y tiene la botonera deshabilitada, asi que una
    // escritura aca solo puede venir de una carrera (aprobaron/desaprobaron la
    // sesion mientras el profe tenia la pantalla abierta). Se responde
    // explicito en vez de crear una fila corrupta que dejaria el TV en blanco.
    if (!classDay.approved || roster.length === 0) {
      throw new ConflictError("La sesión de hoy no está aprobada");
    }

    // Expire-on-read (D-07): una fila de ayer es como si no existiera, asi que
    // la primera escritura del dia siempre nace con los defaults.
    const stored = await this.readState(branch.id, classDate);
    let state = this.clampState(
      stored ?? {
        screen: "class",
        blockRole: roster[0].role,
        // D-15: la clase arranca en alfa. Si hoy no hay alfa, el clamp de abajo
        // lo baja al primer nivel que si exista.
        level: "alfa",
        exerciseIndex: 0,
        soundEnabled: false,
        ...IDLE_TIMER,
      },
      classDay,
    );

    // El orden importa y es parte del contrato: el bloque resetea, el nivel no.
    state = this.applyBlockRole(state, write.blockRole, classDay, roster);
    state = this.applyLevel(state, write.level, classDay);
    if (write.exerciseIndex !== undefined) {
      // El clamp final lo acota a la lista del (rol, nivel) que quedo vigente.
      state = { ...state, exerciseIndex: write.exerciseIndex };
    }
    if (write.timer) {
      state = this.applyTimerCommand(state, write.timer, now);
    }
    if (write.soundEnabled !== undefined) {
      state = { ...state, soundEnabled: write.soundEnabled };
    }
    // D-08: la pantalla de cierre es un estado del profe, no del reloj. "idle"
    // no se escribe: para volver a reposo esta `endClass`.
    if (write.screen === "class" || write.screen === "closing") {
      state = { ...state, screen: write.screen };
    }

    const next = this.clampState(state, classDay);
    await this.persistState(branch.id, classDate, next, userId);
    return this.toControlContext(branch, classDay, next);
  }

  /**
   * Terminar la clase (D-07, boton manual del profe): el TV vuelve a reposo.
   *
   * Borra la fila en vez de marcarla: el expire-on-read ya trata un estado de
   * otro dia como inexistente, asi que "sin fila" es exactamente el mismo
   * reposo que amanece solo. Idempotente — terminar dos veces no falla.
   */
  async endClass(branchId: number): Promise<void> {
    await this.db
      .delete(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchId));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Cambiar de bloque: resetea el ejercicio y el timer, CONSERVA el nivel.
   *
   * D-15 al pie de la letra. Y solo si el rol cambia de verdad: reescribir el
   * bloque en el que ya estas (doble tap) no puede reiniciar un timer en curso.
   *
   * Un rol que no existe en el roster de hoy se DESCARTA en silencio en vez de
   * aplicarse: aplicarlo haria que el clamp lo baje al primer bloque del dia, o
   * sea que un valor invalido moveria al profe al bloque 1 y le reiniciaria el
   * timer. El control recibe el estado real en la respuesta y se auto-corrige.
   *
   * Excepcion: `visualGroupOf` agrupa bloques que son UN mismo bloque con
   * varios caminos — DEUTEROS_1/DEUTEROS_2, y COMBOS_II/COMBOS_II_ALT (idem
   * TECNICA_II/TECNICA_II_ALT). Pasar de un camino al otro dentro del mismo
   * grupo es un cambio de VARIANTE, no un bloque nuevo — asi que el
   * cronometro NO se reinicia (el profe puede mostrar el camino alternativo
   * sin perder el tiempo corrido) y ambos caminos comparten el mismo indice
   * "BLOQUE n / M". El ejercicio si vuelve a 0: la lista del camino nuevo es
   * otra, y arrancar en un indice ajeno seria arbitrario.
   */
  private applyBlockRole(
    state: TvControlState,
    blockRole: string | undefined,
    classDay: ClassDay,
    roster: TvBlockSummary[],
  ): TvControlState {
    if (blockRole === undefined || blockRole === state.blockRole) return state;
    if (!roster.some((b) => b.role === blockRole)) {
      this.log.warn(
        { blockRole, mode: classDay.mode, date: classDay.date },
        "tv: bloque inexistente en el roster del dia, descartado",
      );
      return state;
    }
    if (visualGroupOf(blockRole) === visualGroupOf(state.blockRole)) {
      return { ...state, blockRole, exerciseIndex: 0 };
    }
    return { ...state, blockRole, exerciseIndex: 0, ...IDLE_TIMER };
  }

  /**
   * Cambiar de nivel: NO toca el bloque ni el timer (D-15).
   *
   * El ejercicio puede quedar fuera de rango porque el nivel nuevo tenga una
   * lista mas corta; de eso se encarga el clamp final, no este paso.
   *
   * Un nivel que hoy no existe se descarta (mismo criterio que el rol): el
   * sabado ROM solo tiene alfa y delta (D-23), asi que un `sigma` de un control
   * desactualizado deja al profe donde estaba en vez de saltarlo a otro tier.
   */
  private applyLevel(
    state: TvControlState,
    level: string | undefined,
    classDay: ClassDay,
  ): TvControlState {
    if (level === undefined || level === state.level) return state;
    if (!classDay.levels.includes(level)) {
      this.log.warn(
        { level, levels: classDay.levels, mode: classDay.mode },
        "tv: nivel inexistente en el dia, descartado",
      );
      return state;
    }
    return { ...state, level };
  }

  /**
   * Los cuatro comandos del timer (D-18: no hay saltar ni ajustar ronda).
   *
   * D-16: `start` arranca TRABAJO al instante, sin cuenta previa — el profe
   * avisa a viva voz.
   * D-17: la pausa acumula en vez de reescribir el arranque, asi que reanudar
   * cae exacto donde quedo por mas veces que se pause.
   */
  private applyTimerCommand(
    state: TvControlState,
    command: TvTimerCommand,
    now: Date,
  ): TvControlState {
    const at = now.getTime();
    switch (command) {
      case "start":
        // Idempotente: un doble tap con red mala no puede reiniciar el bloque.
        if (state.timerStatus === "running") return state;
        return {
          ...state,
          timerStatus: "running",
          // Arranque inmediato (D-16): el sello es "ahora", sin lead programado.
          timerStartedAt: at,
          pausedAt: null,
          pausedAccumMs: 0,
        };
      case "pause":
        if (state.timerStatus !== "running") return state;
        return { ...state, timerStatus: "paused", pausedAt: at };
      case "resume":
        if (state.timerStatus !== "paused") return state;
        return {
          ...state,
          timerStatus: "running",
          // El tramo pausado se suma al acumulado; el sello de arranque queda
          // intacto (D-17). `Math.max` cubre un `paused_at` en el futuro por
          // un ajuste de reloj del server.
          pausedAccumMs:
            state.pausedAccumMs + Math.max(0, at - (state.pausedAt ?? at)),
          pausedAt: null,
        };
      case "reset":
        return { ...state, ...IDLE_TIMER };
    }
  }

  /**
   * Upsert por sede (D-04: una sola fila por sucursal, garantizada por
   * `uq_tv_class_state_branch`).
   *
   * `updated_by` deja registro de quien toco el estado (T-164-44), y
   * `class_date` se reescribe SIEMPRE con la fecha de hoy en la TZ de la sede:
   * es lo que convierte a la primera escritura del dia en "iniciar la clase"
   * sin necesidad de un endpoint aparte.
   */
  private async persistState(
    branchId: number,
    classDate: string,
    state: TvControlState,
    userId: number,
  ): Promise<void> {
    const row = {
      classDate,
      screen: state.screen,
      blockRole: state.blockRole,
      level: state.level,
      exerciseIndex: state.exerciseIndex,
      timerStatus: state.timerStatus,
      // fsp 3: los milisegundos del sello son el corazon del timer (Pitfall 9).
      timerStartedAt: state.timerStartedAt
        ? new Date(state.timerStartedAt)
        : null,
      pausedAt: state.pausedAt ? new Date(state.pausedAt) : null,
      pausedAccumMs: state.pausedAccumMs,
      soundEnabled: state.soundEnabled,
      updatedBy: userId,
    };

    await this.db
      .insert(schema.tvClassState)
      .values({ branchId, ...row })
      // D-12: ultima escritura gana, sin comparar contra lo que habia.
      .onDuplicateKeyUpdate({ set: row });
  }

  /**
   * La sede, o 404.
   *
   * En las rutas de control esto es practicamente inalcanzable —
   * `requireBranchAccess` corre antes y una sede inexistente ya cae en 403 (su
   * predicado deniega cuando la fila no existe). Queda igual porque el servicio
   * tambien se usa fuera de ese preHandler y un `undefined` silencioso aca
   * terminaria en un TypeError 500 tres lineas mas abajo.
   */
  private async loadBranch(branchId: number): Promise<TvBranchRef> {
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId))
      .limit(1);

    if (!branch) throw new NotFoundError("Esa sede no existe");
    return branch;
  }

  /** Contexto del control a partir de datos ya resueltos (sin re-consultar). */
  private toControlContext(
    branch: TvBranchRef,
    classDay: ClassDay,
    stored: TvControlState | null,
  ): TvControlContext {
    const blocks: TvControlBlock[] = buildRoster(classDay).map((block) => ({
      ...block,
      exerciseCountByLevel: this.exerciseCountByLevel(classDay, block.role),
    }));

    return {
      branch: { id: branch.id, name: branch.name },
      // D-10: el control SI avisa. El TV no (D-09).
      sessionApproved: classDay.approved,
      mode: classDay.mode,
      levels: classDay.levels,
      blocks,
      // `null` = la clase todavia no se inicio hoy (o el estado ya caduco).
      state: stored ? this.clampState(stored, classDay) : null,
    };
  }

  /**
   * Cuantos ejercicios tiene un bloque en cada nivel del dia.
   *
   * Dos niveles del mismo dia pueden tener listas de largo distinto (Pitfall
   * 1), asi que el control necesita el mapa completo para clampear al cambiar
   * de nivel sin un round-trip extra. En INITIUM el numero es el mismo para
   * todos los niveles: la lista es compartida.
   */
  private exerciseCountByLevel(
    classDay: ClassDay,
    role: string,
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const level of classDay.levels) {
      counts[level] = this.mainPrescriptions(
        this.resolveBlock(classDay, role, level),
      ).length;
    }
    return counts;
  }

  private parseTimerStatus(value: string): TvTimerStatus {
    return value === "running" || value === "paused" ? value : "idle";
  }

  /**
   * El bloque efectivo de un (rol, nivel).
   *
   * INITIUM ignora el nivel a proposito: es la lista compartida del dia y sale
   * siempre de la misma fuente determinista, para que dos televisores de la
   * misma sede en niveles distintos no muestren entradas en calor distintas.
   */
  private resolveBlock(
    classDay: ClassDay,
    role: string,
    level: string,
  ): ClassDayBlock | undefined {
    if (role === "INITIUM") return findInitiumBlock(classDay.sessions);
    const session = classDay.sessions.find((s) => s.memberLevel === level);
    if (!session) return undefined;
    return findBlock(session.blocks, role);
  }

  /**
   * Bloque del nivel canonico (kairos primero) para un rol: el mismo que el
   * editor y el PDF muestran. La movilidad se lee de aca —no del nivel del
   * control— para no divergir del PDF (ver `CANONICAL_LEVEL_ORDER`).
   */
  private resolveCanonicalBlock(
    classDay: ClassDay,
    role: string,
  ): ClassDayBlock | undefined {
    if (role === "INITIUM") return findInitiumBlock(classDay.sessions);
    for (const level of CANONICAL_LEVEL_ORDER) {
      const block = this.resolveBlock(classDay, role, level);
      if (block) return block;
    }
    return undefined;
  }

  private mainPrescriptions(
    block: ClassDayBlock | undefined,
  ): ClassDayPrescription[] {
    if (!block) return [];
    return block.prescriptions.filter((p) => p.exerciseType === "main");
  }

  /**
   * Línea de movilidad de un bloque puntual (`MOVILIDAD · …`) o `null` si no
   * trae. Se usa para la movilidad POR columna del 2×2 de deuteros; la versión
   * global del payload (`buildClassPayload`) sale del bloque canónico y sirve
   * para el resto de los layouts.
   */
  private mobilityLineOf(block: ClassDayBlock | undefined): string | null {
    const mobility = block?.prescriptions.filter(
      (p) => p.exerciseType === "mobility",
    );
    return mobility && mobility.length > 0
      ? `MOVILIDAD · ${mobility.map(mobilityText).join(" · ")}`
      : null;
  }

  private levelLabel(
    classDay: ClassDay,
    level: string,
    shared: boolean,
  ): string {
    if (shared) return ALL_LEVELS_LABEL;
    if (classDay.mode === "rom") {
      return ROM_LEVEL_LABELS[level] ?? level.toUpperCase();
    }
    const symbol = LEVEL_SYMBOLS[level];
    return symbol ? `NIVEL ${symbol}` : level.toUpperCase();
  }

  /**
   * `contraction` y `dose` viajan SEPARADOS (rediseño fase 164, paridad con la
   * app — `CompactExerciseList.vue`): el badge de contraccion y la dosis son
   * dos zonas visuales distintas, no un string ya concatenado como el viejo
   * `rx`. `contraction` sale CRUDO ('CON'/'EXC'/'ISO', tal cual lo guarda la
   * DB) para que el kiosco elija el color del badge — la abreviatura con
   * punto ("CON.") que usaba el PDF ya no aplica, el badge muestra la sigla
   * sola.
   */
  private toExercise(
    p: ClassDayPrescription,
    formatDictated: boolean,
  ): TvExercise {
    const name = p.weighted ? `${p.exerciseName} (W)` : p.exerciseName;
    return {
      name,
      contraction: p.contraction,
      dose: formatDictated ? "" : prescriptionVolume(p),
      // Nunca concatenar R2_PUBLIC_URL a mano: la key vive sola en la DB.
      videoUrl: assembleVideoUrl(p.videoKey),
    };
  }

  /**
   * Las columnas del bloque en curso (fase 164 rediseño — dos niveles lado a
   * lado; el control elige el NIVEL por PARES).
   *
   * Shared (INITIUM/PYROS): UNA columna con la lista comun, igual que antes
   * salia por `listHeader`/`exercises` a secas — `block` ya es el bloque
   * canonico de INITIUM (`resolveBlock` ignora el nivel para ese rol) y
   * `formatDictated` es el que calculo el caller para ESE bloque.
   *
   * No shared, caso general: una columna por nivel del PAR de `state.level`
   * que este presente en `classDay.levels` (`pairFor`, `roster.ts`) — 1 o 2,
   * nunca mas. Cada columna resuelve SU PROPIO bloque (mismo rol, nivel del
   * par): dos niveles del mismo dia pueden tener ruta/intensidad/formato
   * distintos (Pitfall 1), asi que el header y el `formatDictated` de cada
   * columna salen de su propio bloque, no del bloque de `state.level`.
   *
   * No shared, caso DEUTEROS (fase 178, dia regular): en vez de 1 columna por
   * nivel de UN rol, se emiten columnas para AMBOS deuteros (I y II) × el par
   * de niveles — hasta 4 (2×2). Un dia regular puede no tener DEUTEROS_2 (o un
   * nivel puntual del par puede no tener el bloque): cada `(rol, nivel)` que
   * no resuelve bloque se OMITE (nunca una columna con header roto o lista
   * vacia), asi que un dia con un solo deutero emite 2 columnas, no 4. Cada
   * columna se prefija con la etiqueta del deutero (`ROLE_LABELS`, "DEUTEROS
   * I"/"DEUTEROS II") para distinguir las 4 en pantalla. El bloque alt
   * (`state.blockRole = *_II_ALT`) NO es deuteros: cae en el caso general.
   */
  private buildColumns(
    classDay: ClassDay,
    state: TvControlState,
    shared: boolean,
    block: ClassDayBlock | undefined,
    formatDictated: boolean,
  ): TvLevelColumn[] {
    if (shared) {
      // INITIUM o STRETCHING: una sola columna comun a todos los niveles. El
      // rol va por su nombre de bloque, NO por ROLE_LABELS (INITIUM mapea a
      // "PYROS" y el header historico del kiosco es "INITIUM"). La segunda
      // mitad lista los niveles del dia con sus simbolos (UAT 2026-08-18)
      // en vez del literal "TODOS LOS NIVELES" — el kiosco ya pinta esos
      // glifos via paintGlyphText. ROM no usa la escalera de simbolos
      // (D-23: BASICO/AVANZADO) y conserva el literal.
      const levelsLabel =
        classDay.mode === "rom"
          ? ALL_LEVELS_LABEL
          : // Solo los niveles con simbolo canonico (kairos/alfa/delta/sigma):
            // omega/spartan no se planifican por dia (class-day.ts) y si se
            // cuelan no van en el header compartido de INITIUM/STRETCHING.
            `NIVELES ${classDay.levels
              .filter((lvl) => LEVEL_SYMBOLS[lvl])
              .map((lvl) => LEVEL_SYMBOLS[lvl])
              .join(" ")}`;
      // STRETCHING se rotula KINESIS (misma categoria que PYROS/NUCLEUS/DEUTEROS).
      // INITIUM conserva su header historico del kiosco ("INITIUM", no "PYROS").
      const sharedName =
        state.blockRole === "STRETCHING" ? "KINESIS" : state.blockRole;
      return [
        {
          header: `${sharedName} | ${levelsLabel}`,
          exercises: this.mainPrescriptions(block).map((p) =>
            this.toExercise(p, formatDictated),
          ),
        },
      ];
    }

    const pairLevels = pairFor(state.level).filter((lvl) =>
      classDay.levels.includes(lvl),
    );
    // Defensivo: `state.level` siempre esta en `classDay.levels` (clampState
    // lo garantiza) y `pairFor` siempre incluye al propio nivel en su par, asi
    // que esto nunca deberia quedar vacio — pero un payload sin columnas
    // dejaria al TV sin lista, asi que el fallback no se saca.
    const levels = pairLevels.length > 0 ? pairLevels : [state.level];

    if (visualGroupOf(state.blockRole) === "DEUTEROS") {
      // Orden de las 4 celdas (grilla 2×2, row-major en el CSS): recorremos
      // primero el nivel y adentro los dos deuteros, así cada FILA es un nivel
      // del par y cada COLUMNA es un deutero — DEUTEROS I a la izquierda,
      // DEUTEROS II a la derecha (pedido de diseño).
      const columns: TvLevelColumn[] = [];
      for (const level of levels) {
        for (const deuterosRole of ["DEUTEROS_1", "DEUTEROS_2"]) {
          const levelBlock = this.resolveBlock(classDay, deuterosRole, level);
          // Guard: un dia regular puede no tener DEUTEROS_2 (o un nivel
          // puntual del par sin bloque) — se omite, nunca una columna rota.
          if (!levelBlock) continue;
          const dictated =
            !!levelBlock.formatParams &&
            FORMAT_DICTATED_TYPES.has(levelBlock.formatParams.type);
          const label = this.levelLabel(classDay, level, false);
          // El rótulo del deutero (DEUTEROS I/II) vive en la cabecera (izq/der),
          // NO al lado del nivel: el header de la celda es sólo NIVEL | RUTA %.
          // La identidad DEUTEROS I/II la trae `payload.deuteros` (buildDeuterosPanel),
          // que es lo que verifica el contrato en tv-service.test.ts.
          columns.push({
            header: `${label} | ${getRouteLabel(levelBlock.route)} ${levelBlock.intensity}%`,
            exercises: this.mainPrescriptions(levelBlock).map((p) =>
              this.toExercise(p, dictated),
            ),
          });
        }
      }
      return columns;
    }

    return levels.map((level) => {
      const levelBlock = this.resolveBlock(classDay, state.blockRole, level);
      const dictated =
        !!levelBlock?.formatParams &&
        FORMAT_DICTATED_TYPES.has(levelBlock.formatParams.type);
      const label = this.levelLabel(classDay, level, false);
      // ROM: la ruta es el rol de la zona (ROM_LOWER/…) y la intensidad un 50
      // fijo informativo — nada de eso aporta en pantalla, así que el header es
      // solo el tier (BÁSICO/AVANZADO, ROM_LEVEL_LABELS). El resto de los modos
      // conservan "NIVEL | RUTA %".
      const header =
        classDay.mode === "rom"
          ? label
          : `${label} | ${getRouteLabel(levelBlock?.route)} ${levelBlock?.intensity ?? 0}%`;
      return {
        header,
        exercises: this.mainPrescriptions(levelBlock).map((p) =>
          this.toExercise(p, dictated),
        ),
      };
    });
  }

  /**
   * Los dos deuteros del 2×2 (día regular con DEUTEROS_1/2): etiqueta + UNA
   * movilidad por deutero, tomada del bloque canónico (kairos-first) como el
   * PDF/editor — no una por nivel. `null` cuando el bloque activo no es
   * deuteros. La cabecera (izq/der) y el pie del 2×2 se pintan desde acá.
   */
  private buildDeuterosPanel(
    classDay: ClassDay,
    state: TvControlState,
  ): TvDeuterosGroup[] | null {
    if (visualGroupOf(state.blockRole) !== "DEUTEROS") return null;
    const groups: TvDeuterosGroup[] = [];
    for (const role of ["DEUTEROS_1", "DEUTEROS_2"]) {
      const canonical = this.resolveCanonicalBlock(classDay, role);
      if (!canonical) continue;
      groups.push({
        label: ROLE_LABELS[role] ?? role,
        mobilityLine: this.mobilityLineOf(canonical),
      });
    }
    return groups.length > 0 ? groups : null;
  }

  private buildClassPayload(
    classDay: ClassDay,
    state: TvControlState,
    now: Date,
  ): TvClassPayload {
    const blocks: TvBlockSummary[] = buildRoster(classDay);

    // COMBOS_II_ALT/TECNICA_II_ALT viven en el roster canonico (roster.ts):
    // se resuelven exactamente igual que cualquier otro rol, sin swap. El
    // viejo toggle "Ver alternativo" (fase 178, showAlternative) que mostraba
    // el alt como un sibling fuera de `blocks` quedo eliminado.
    const blockIndex = blocks.findIndex((b) => b.role === state.blockRole);
    const summary = blocks[blockIndex];
    const shared = summary?.shared ?? false;

    // C1: DEUTEROS_1/DEUTEROS_2 (y ahora COMBOS_II_ALT/TECNICA_II_ALT con su
    // II) son caminos del MISMO bloque visual — los puntitos "BLOQUE n / M"
    // cuentan grupos, no entradas del roster real.
    const visualGroups: string[] = [];
    for (const b of blocks) {
      const g = visualGroupOf(b.role);
      if (!visualGroups.includes(g)) visualGroups.push(g);
    }
    const visualBlockCount = visualGroups.length;
    const rawVisualBlockIndex = visualGroups.indexOf(
      visualGroupOf(state.blockRole),
    );
    const visualBlockIndex = rawVisualBlockIndex >= 0 ? rawVisualBlockIndex : 0;

    const block = this.resolveBlock(classDay, state.blockRole, state.level);
    const formatDictated =
      !!block?.formatParams &&
      FORMAT_DICTATED_TYPES.has(block.formatParams.type);

    // La lista COMPARTIDA (STRETCHING/INITIUM) se lee del nivel CANONICO
    // (kairos-first) —el mismo que muestran el editor, el PDF y la movilidad
    // (resolveCanonicalBlock)—, NO del nivel del control. Stretching es un
    // bloque comun a todos los niveles: idealmente ni deberia tener niveles,
    // pero hoy cada nivel genera su propio bloque y pueden divergir (kairos con
    // sostenes editados a mano, otros niveles con los defaults del generador,
    // donde los estiramientos CON traen 10 reps). Sin esto el TV mostraba el
    // stretching del nivel del control (con reps) mientras el editor de kairos
    // mostraba sostenes: divergencia. Leyendo el canonico, el TV colapsa los
    // niveles en UNA sola version y no diverge del editor. INITIUM no cambia
    // (resolveBlock ya ignora el nivel para ese rol). El timer y el resto
    // siguen usando `block` (nivel del control) — solo cambia la lista shared.
    const columnBlock = shared
      ? this.resolveCanonicalBlock(classDay, state.blockRole)
      : block;
    const columnDictated = shared
      ? !!columnBlock?.formatParams &&
        FORMAT_DICTATED_TYPES.has(columnBlock.formatParams.type)
      : formatDictated;

    const title = summary?.title ?? "";

    const levelLabel = this.levelLabel(classDay, state.level, shared);
    // La movilidad sale del nivel canonico (kairos-first), como el PDF/editor
    // (regresion KAIROS-01, tambien cubierta en la TV).
    const mobilityBlock = this.resolveCanonicalBlock(classDay, state.blockRole);
    const mobility = mobilityBlock?.prescriptions.filter(
      (p) => p.exerciseType === "mobility",
    );

    return {
      mode: classDay.mode,
      levels: classDay.levels,
      level: state.level,
      levelLabel,
      blocks,
      blockRole: state.blockRole,
      // Pitfall 1: DERIVADO del roster en cada lectura, nunca persistido.
      blockIndex: blockIndex >= 0 ? blockIndex : 0,
      // C1: derivados del roster igual que `blockIndex`, colapsando DEUTEROS
      // (y el II/II_ALT).
      visualBlockIndex,
      visualBlockCount,
      title,
      mobilityLine:
        mobility && mobility.length > 0
          ? `MOVILIDAD · ${mobility.map(mobilityText).join(" · ")}`
          : null,
      columns: this.buildColumns(
        classDay,
        state,
        shared,
        columnBlock,
        columnDictated,
      ),
      deuteros: this.buildDeuterosPanel(classDay, state),
      exerciseIndex: state.exerciseIndex,
      timer: {
        // `mainPrescriptions(block).length` = estaciones del circuito: interval
        // y hiit corren `estaciones × rondas` ciclos (toTimerSpec). tabata lo
        // ignora (sus rondas ya son el total de intervalos). El alt reusa
        // este mismo camino: su spec sale de SU propio bloque (`block`), como
        // cualquier rol — ya no hay un "timerBlock" separado del persistido.
        spec: toTimerSpec(
          block?.formatParams ?? null,
          this.mainPrescriptions(block).length,
        ),
        status: state.timerStatus,
        startedAt: state.timerStartedAt,
        pausedAt: state.pausedAt,
        pausedAccumMs: state.pausedAccumMs,
        soundEnabled: state.soundEnabled,
      },
    };
  }
}
