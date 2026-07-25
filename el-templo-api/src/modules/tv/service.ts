/**
 * TvService — el cerebro del poll del televisor de sucursal (fase 164).
 *
 * Todo lo derivable se calcula aca y viaja ya resuelto: el kiosco es un bundle
 * ES2015 sin test runner, en un Chromium empotrado que puede traer ICU
 * reducida. La pantalla no decide nada; solo pinta.
 *
 * Tres invariantes que este archivo sostiene:
 *
 *  1. **La sede sale de la FILA del dispositivo** (`device.branchId`), jamas de
 *     un parametro del request: un TV no puede leer la clase de otra sucursal
 *     (T-164-20).
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
import { assembleVideoUrl } from "../shared/video-url";
import {
  resolveClassDay,
  type ClassDay,
  type ClassDayBlock,
  type ClassDayPrescription,
} from "./class-day";
import { buildRoster, findBlock, findInitiumBlock } from "./roster";
import { toTimerSpec } from "./timer-spec";
import type {
  TvBlockSummary,
  TvClassPayload,
  TvControlBlock,
  TvControlContext,
  TvControlState,
  TvExercise,
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

/** Lo unico que el servicio necesita saber de un televisor vinculado. */
export interface TvDeviceRef {
  id: number;
  branchId: number;
}

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

/** Abreviatura de contraccion, igual que el PDF. */
const CONTRACTION_ABBR: Record<string, string> = {
  CON: "CON.",
  EXC: "EXC.",
  ISO: "ISO.",
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
    device: TvDeviceRef,
    now: Date = new Date(),
  ): Promise<TvPollResponse> {
    // 1. La sede sale de la FILA del dispositivo (T-164-20).
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, device.branchId));

    if (!branch) {
      // Sede borrada con un TV todavia vinculado: condicion esperable de datos,
      // no una falla del sistema -> warn, y reposo en pantalla.
      this.log.warn(
        { deviceId: device.id, branchId: device.branchId },
        "tv: dispositivo vinculado a una sede inexistente",
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
      class: this.buildClassPayload(classDay, state),
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

  private mainPrescriptions(
    block: ClassDayBlock | undefined,
  ): ClassDayPrescription[] {
    if (!block) return [];
    return block.prescriptions.filter((p) => p.exerciseType === "main");
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

  private toExercise(
    p: ClassDayPrescription,
    formatDictated: boolean,
  ): TvExercise {
    const name = p.weighted ? `${p.exerciseName} (W)` : p.exerciseName;
    const contraction = CONTRACTION_ABBR[p.contraction] ?? p.contraction;
    const volume = formatDictated ? "" : prescriptionVolume(p);
    return {
      name,
      rx: [volume, contraction].filter(Boolean).join(" "),
      // Nunca concatenar R2_PUBLIC_URL a mano: la key vive sola en la DB.
      videoUrl: assembleVideoUrl(p.videoKey),
    };
  }

  private buildClassPayload(
    classDay: ClassDay,
    state: TvControlState,
  ): TvClassPayload {
    const blocks: TvBlockSummary[] = buildRoster(classDay);
    const blockIndex = blocks.findIndex((b) => b.role === state.blockRole);
    const summary = blocks[blockIndex];
    const shared = summary?.shared ?? false;

    const block = this.resolveBlock(classDay, state.blockRole, state.level);
    const prescriptions = this.mainPrescriptions(block);
    const formatDictated =
      !!block?.formatParams &&
      FORMAT_DICTATED_TYPES.has(block.formatParams.type);

    const levelLabel = this.levelLabel(classDay, state.level, shared);
    const mobility = block?.prescriptions.filter(
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
      title: summary?.title ?? "",
      listHeader: shared
        ? `INITIUM | ${ALL_LEVELS_LABEL}`
        : `${levelLabel} | ${block?.route ?? ""} ${block?.intensity ?? 0}%`,
      mobilityLine:
        mobility && mobility.length > 0
          ? `MOVILIDAD · ${mobility.map(mobilityText).join(" · ")}`
          : null,
      exercises: prescriptions.map((p) => this.toExercise(p, formatDictated)),
      exerciseIndex: state.exerciseIndex,
      timer: {
        spec: toTimerSpec(block?.formatParams ?? null),
        status: state.timerStatus,
        startedAt: state.timerStartedAt,
        pausedAt: state.pausedAt,
        pausedAccumMs: state.pausedAccumMs,
        soundEnabled: state.soundEnabled,
      },
    };
  }
}
