/**
 * Servicio de la canasta de bloques libres (Fase 197 D-04/D-08/D-09/D-10/D-12/D-14).
 *
 * Junta los bloques candidatos del subnivel del socio (planis `approved` de la
 * plani regular, fecha <= hoy en la zona de la sede), los rankea con las
 * funciones puras de `free-blocks-ranking.ts` y responde la lista paginada, un
 * bloque suelto y el estado de AURA del dia.
 *
 * Solo LEE. No escribe `completed_sessions` ni nada de racha, programa o RPE
 * (el cierre del bloque libre vive en 197-08, en `extra_blocks_completed`).
 *
 * Tenancy: toda query sobre una tabla gym-owned lleva `tenantWhere`. El
 * `ctx` lo arma la ruta con `attachCountryScope` + `assertTenant`.
 *
 * Performance: todo el subnivel se carga por request (~150-400 bloques, 4
 * queries); sin cache a proposito para no servir planis viejas.
 */
import { and, eq, gte, inArray, like, lte, notLike, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  DAY_NAME_TO_NUMBER,
  isTrainingLevel,
  parseDayId,
} from "../shared/training-constants";
import {
  dateToDayName,
  dateToWeekNumber,
  mondayOf,
  weekDayToDate,
} from "../shared/week-dates";
import {
  ZONAS_ORDEN,
  ejerciciosPorGrupo,
  zonasDelBloque,
  type EjercicioZonaInput,
  type GrupoZona,
} from "../tv/muscle-zones";
import { getRouteLabel } from "../tv/route-labels";
import type { TvZonaMuscular } from "../tv/types";
import {
  deduplicarMasReciente,
  claveDeDuplicado,
  esRolDeCanasta,
  limpiarNombre,
  ordenarCanasta,
  paginar,
  subtituloDeBloque,
  trabajadoHoy,
  type CandidatoCanasta,
} from "./free-blocks-ranking";
import {
  blockToResponse,
  type SessionBlockResponse,
} from "./session-response";
import {
  buildDayIdCandidates,
  effectiveLevelForDay,
  resolveSessionView,
  type ResolveViewResult,
} from "./session-view";
import { isKairos } from "./pipeline/utils/kairos";
import type { SessionGeneratorService } from "./service";
import {
  ALTERNATIVE_BLOCK_ROLES,
  type BlockPlan,
  type DaySession,
} from "./types";

/**
 * Fase 197 D-12: segundos minimos para que el primer bloque libre del dia
 * sume AURA. Lo usa el cierre (197-08) y se refleja en el app.
 */
export const FREE_BLOCK_AURA_MIN_SECONDS = 600;

/** Titulo de las cards ROM (D-09): el rol no tiene ruta con nombre propio. */
const ROM_TITULOS: Readonly<Record<string, string>> = {
  ROM_LOWER: "Tren Inferior",
  ROM_CORE: "Zona Media",
  ROM_UPPER: "Tren Superior",
};

/** Un bloque de la canasta: la forma de `blockToResponse` mas lo de la card. */
export interface FreeBlockItem extends SessionBlockResponse {
  /** "Ruta · Formato" (ROM: "Tren Inferior · Formato"). */
  title: string;
  /** Los primeros nombres de ejercicio, "A, B, C". */
  subtitle: string;
  /** "YYYY-MM-DD" de la sesion donde aparece (la mas reciente si hay copias). */
  lastDate: string;
  sourceDayId: string;
  /** Nivel de la plani de origen (ultimo segmento del dayId). */
  level: string;
  /** D-04: cruza 2 o mas zonas con la sesion de hoy (va al final). */
  workedToday: boolean;
}

/** El socio ya resuelto: nivel, zona horaria, dia local y vista de acceso. */
export interface FreeBlocksMember {
  userId: number;
  memberLevel: string;
  /** Subnivel de la canasta (D-08): kairos -> alfa. */
  basketLevel: string;
  /** Nivel de los ROM (mismo mapeo que /weekly en dias ROM). */
  romLevel: string;
  timezone: string;
  /** "YYYY-MM-DD" en la zona horaria de la sede. */
  today: string;
  view: Exclude<ResolveViewResult, { kind: "deny" }>;
}

export type ResolveMemberResult =
  | { kind: "ok"; member: FreeBlocksMember }
  | { kind: "deny"; status: 403 | 404; message: string };

export interface FreeBlocksListResult {
  items: FreeBlockItem[];
  total: number;
  page: number;
  limit: number;
  auraAvailableToday: boolean;
  todayZones: TvZonaMuscular[] | null;
  weekWorkedZones: TvZonaMuscular[];
}

/** Candidato interno: lo del ranking mas el item sin `workedToday`. */
interface CandidatoConItem extends CandidatoCanasta {
  base: Omit<FreeBlockItem, "workedToday">;
}

/** Insumo de zonas de un ejercicio (mismo mapeo que `session-response.ts`). */
function aEjercicioZona(ex: {
  category?: string | null;
  categorySecondary?: string | null;
  exerciseRoute?: string | null;
}): EjercicioZonaInput {
  return {
    category: ex.category ?? null,
    categorySecondary: ex.categorySecondary ?? null,
    route: ex.exerciseRoute ?? null,
  };
}

/** Ejercicios principales de un bloque (la movilidad no cuenta). */
function ejerciciosMain(block: BlockPlan) {
  return block.exercises.filter((ex) => ex.exerciseType !== "mobility");
}

/** Union de zonas de los bloques de trabajo de una sesion, en `ZONAS_ORDEN`. */
function zonasDeSesion(session: DaySession): Set<TvZonaMuscular> {
  const out = new Set<TvZonaMuscular>();
  for (const block of session.blocks) {
    if (!esRolDeCanasta(block.role)) continue;
    const zonas = zonasDelBloque(
      ejerciciosMain(block).map(aEjercicioZona),
      block.role,
    );
    for (const z of zonas) out.add(z);
  }
  return out;
}

/** Zonas en el orden estable de `ZONAS_ORDEN`. */
function ordenarZonas(zonas: ReadonlySet<TvZonaMuscular>): TvZonaMuscular[] {
  return ZONAS_ORDEN.filter((z) => zonas.has(z));
}

export class FreeBlocksService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private sessionService: SessionGeneratorService,
    private formatDescriptions: Map<string, string>,
  ) {}

  /**
   * Resuelve al socio para la canasta. El gate de acceso es EXACTAMENTE el de
   * /weekly (`resolveSessionView`): presencial activo o programa activo.
   * Un `levelOverride` que no es un nivel valido se ignora (mismo efecto que
   * no mandarlo).
   */
  async resolveMember(
    ctx: TenantContext,
    userId: number,
    levelOverride?: string,
  ): Promise<ResolveMemberResult> {
    const view = await resolveSessionView(this.db, ctx, userId, undefined);
    if (view.kind === "deny") {
      return { kind: "deny", status: view.status, message: view.message };
    }

    const [user] = await this.db
      .select({
        level: schema.users.level,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (!user) {
      return { kind: "deny", status: 404, message: "Usuario no encontrado" };
    }

    const memberLevel =
      levelOverride !== undefined && isTrainingLevel(levelOverride)
        ? levelOverride
        : user.level;
    // Fase 197 D-08: kairos hereda la canasta de alfa.
    const basketLevel = isKairos(memberLevel) ? "alfa" : memberLevel;
    const romLevel = effectiveLevelForDay(memberLevel, true);

    let timezone = DEFAULT_TENANT_TIMEZONE;
    if (user.branchId !== null) {
      const [branch] = await this.db
        .select({ timezone: schema.branches.timezone })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, user.branchId),
          ),
        )
        .limit(1);
      timezone = branch?.timezone || DEFAULT_TENANT_TIMEZONE;
    }

    return {
      kind: "ok",
      member: {
        userId,
        memberLevel,
        basketLevel,
        romLevel,
        timezone,
        // Fase 197: el dia es el de la sede, nunca UTC.
        today: todayInTz(timezone),
        view,
      },
    };
  }

  /**
   * Fase 197 D-04/D-09: lista paginada de la canasta (dedupe -> orden -> pagina).
   */
  async list(
    ctx: TenantContext,
    member: FreeBlocksMember,
    opts: { group: GrupoZona | null; page: number; limit: number },
  ): Promise<FreeBlocksListResult> {
    const [candidatos, todayZones, weekWorkedZones, auraAvailableToday] =
      await Promise.all([
        this.loadCandidates(ctx, member),
        this.loadTodayZones(ctx, member),
        this.loadWeekWorkedZones(ctx, member),
        this.isAuraAvailableToday(ctx, member),
      ]);

    const unicos = deduplicarMasReciente(candidatos);
    const ordenados = ordenarCanasta(unicos, {
      grupo: opts.group,
      todayZones,
    });
    const items: FreeBlockItem[] = ordenados.map((c) => ({
      ...c.base,
      workedToday: c.workedToday,
    }));
    const pagina = paginar(items, opts.page, opts.limit);

    return { ...pagina, auraAvailableToday, todayZones, weekWorkedZones };
  }

  /**
   * Un bloque suelto por `blockId` (para abrir el player). Devuelve `null` si
   * no existe o no es elegible: no aprobado, GP, fecha futura, rol fuera de la
   * canasta o nivel desconocido. El nivel NO se exige igual al del socio (mismo
   * criterio que `/sessions/complete`: se puede entrenar en cualquier nivel).
   */
  async getOne(
    ctx: TenantContext,
    member: FreeBlocksMember,
    blockId: string,
  ): Promise<FreeBlockItem | null> {
    const [row] = await this.db
      .select({
        dayId: schema.sessions.dayId,
        week: schema.sessions.week,
        day: schema.sessions.day,
        status: schema.sessions.status,
      })
      .from(schema.sessionBlocks)
      .innerJoin(
        schema.sessions,
        eq(schema.sessionBlocks.sessionId, schema.sessions.id),
      )
      .where(
        and(
          tenantWhere(schema.sessionBlocks, ctx),
          tenantWhere(schema.sessions, ctx),
          eq(schema.sessionBlocks.blockId, blockId),
        ),
      )
      .limit(1);
    if (!row) return null;

    if (row.status !== "approved") return null;
    // Misma regla que la lista: solo plani regular (sin GP- ni P-/J- viejos).
    if (row.dayId.startsWith("GP-") || !row.dayId.startsWith("W")) return null;
    if (!isTrainingLevel(parseDayId(row.dayId).level)) return null;
    const date = weekDayToDate(row.week, row.day);
    if (date === null || date > member.today) return null;

    const sessions = await this.sessionService.getSessionsByDayIds(
      [row.dayId],
      true,
    );
    const block = sessions
      .get(row.dayId)
      ?.blocks.find((b) => b.blockId === blockId);
    if (!block) return null;
    // El rol se valida sobre el bloque reconstruido: el servicio resuelve el
    // ATHLOS_EPIKOS legado a ATHLOS o EPIKOS segun la semana.
    if (!esRolDeCanasta(block.role)) return null;
    if (ALTERNATIVE_BLOCK_ROLES.has(block.role)) return null;

    const todayZones = await this.loadTodayZones(ctx, member);
    const { base } = this.armarCandidato(block, row.dayId, date);
    return {
      ...base,
      workedToday: trabajadoHoy(base.zones, todayZones),
    };
  }

  /**
   * Fase 197 D-12: hay AURA disponible si hoy (dia local de la sede) todavia
   * no hay un bloque libre con `aura_awarded`. Se lee el flag de la tabla
   * propia, no `aura_transactions`: esa fila no lleva tenant_id.
   */
  async isAuraAvailableToday(
    ctx: TenantContext,
    member: FreeBlocksMember,
    localDate: string = member.today,
  ): Promise<boolean> {
    const [otorgado] = await this.db
      .select({ id: schema.extraBlocksCompleted.id })
      .from(schema.extraBlocksCompleted)
      .where(
        and(
          tenantWhere(schema.extraBlocksCompleted, ctx),
          eq(schema.extraBlocksCompleted.userId, member.userId),
          eq(schema.extraBlocksCompleted.localDate, localDate),
          eq(schema.extraBlocksCompleted.auraAwarded, true),
        ),
      )
      .limit(1);
    return !otorgado;
  }

  /**
   * Zonas de la sesion de hoy del socio (`null` si es domingo o no hay sesion)
   * y zonas trabajadas esta semana (lunes -> hoy, segun `completed_sessions`).
   */
  async todayContext(
    ctx: TenantContext,
    member: FreeBlocksMember,
  ): Promise<{
    todayZones: TvZonaMuscular[] | null;
    weekWorkedZones: TvZonaMuscular[];
  }> {
    const [todayZones, weekWorkedZones] = await Promise.all([
      this.loadTodayZones(ctx, member),
      this.loadWeekWorkedZones(ctx, member),
    ]);
    return { todayZones, weekWorkedZones };
  }

  // ---------------------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------------------

  /**
   * Candidatos de la canasta: una aparicion por bloque de trabajo en cada
   * sesion aprobada del subnivel (y los ROM) con fecha <= hoy.
   */
  private async loadCandidates(
    ctx: TenantContext,
    member: FreeBlocksMember,
  ): Promise<CandidatoConItem[]> {
    const rows = await this.db
      .select({
        dayId: schema.sessions.dayId,
        week: schema.sessions.week,
        day: schema.sessions.day,
      })
      .from(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, ctx),
          eq(schema.sessions.status, "approved"),
          // Plani regular: sin goal plans (GP-) ni los formatos viejos P-/J-.
          notLike(schema.sessions.dayId, "GP-%"),
          like(schema.sessions.dayId, "W%"),
          lte(schema.sessions.week, dateToWeekNumber(member.today)),
          or(
            like(schema.sessions.dayId, `%-${member.basketLevel}`),
            and(
              eq(schema.sessions.sessionMode, "rom"),
              like(schema.sessions.dayId, `%-${member.romLevel}`),
            ),
          ),
        ),
      );

    // La fecha de cada sesion sale de (semana, dia); las futuras no entran.
    const fechaPorDayId = new Map<string, string>();
    for (const row of rows) {
      const fecha = weekDayToDate(row.week, row.day);
      if (fecha === null || fecha > member.today) continue;
      fechaPorDayId.set(row.dayId, fecha);
    }
    if (fechaPorDayId.size === 0) return [];

    const sesiones = await this.sessionService.getSessionsByDayIds(
      [...fechaPorDayId.keys()],
      true,
    );

    const out: CandidatoConItem[] = [];
    for (const [dayId, fecha] of fechaPorDayId) {
      const sesion = sesiones.get(dayId);
      if (!sesion) continue;
      for (const block of sesion.blocks) {
        if (!esRolDeCanasta(block.role)) continue;
        if (ALTERNATIVE_BLOCK_ROLES.has(block.role)) continue;
        out.push(this.armarCandidato(block, dayId, fecha));
      }
    }
    return out;
  }

  /** Arma el candidato (item + datos de ranking) de una aparicion de bloque. */
  private armarCandidato(
    block: BlockPlan,
    dayId: string,
    date: string,
  ): CandidatoConItem {
    const respuesta = blockToResponse(block, 0, this.formatDescriptions);
    const main = ejerciciosMain(block);
    const formatName = block.format.name;
    const titulo =
      ROM_TITULOS[block.role] ?? getRouteLabel(block.route) || block.route;

    const base: Omit<FreeBlockItem, "workedToday"> = {
      ...respuesta,
      title: `${titulo} · ${limpiarNombre(formatName)}`,
      subtitle: subtituloDeBloque(main.map((ex) => ex.name)),
      lastDate: date,
      sourceDayId: dayId,
      level: parseDayId(dayId).level,
    };

    return {
      blockId: block.blockId,
      // Fase 197 D-09: ids main en el orden de la sesion.
      dedupeKey: claveDeDuplicado({
        route: block.route,
        pattern: block.pattern,
        formatName,
        exerciseIds: main.map((ex) => ex.exerciseId),
      }),
      date,
      role: block.role,
      zones: respuesta.zones,
      groups: respuesta.groups,
      groupHits: ejerciciosPorGrupo(main.map(aEjercicioZona), block.role),
      base,
    };
  }

  /** dayIds de la lista que pertenecen al gimnasio (sessions.day_id es unico global). */
  private async dayIdsDelGimnasio(
    ctx: TenantContext,
    dayIds: string[],
  ): Promise<string[]> {
    if (dayIds.length === 0) return [];
    const rows = await this.db
      .select({ dayId: schema.sessions.dayId })
      .from(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, ctx),
          inArray(schema.sessions.dayId, dayIds),
        ),
      );
    const propios = new Set(rows.map((r) => r.dayId));
    return dayIds.filter((id) => propios.has(id));
  }

  /**
   * Zonas de la sesion de hoy del socio, con la misma vista que /weekly. Sin
   * INITIUM (es entrada en calor). `null` si es domingo o no hay sesion.
   */
  private async loadTodayZones(
    ctx: TenantContext,
    member: FreeBlocksMember,
  ): Promise<TvZonaMuscular[] | null> {
    const dayName = dateToDayName(member.today);
    if (dayName === "domingo") return null;

    const [modo] = await this.db
      .select({ sessionMode: schema.dayModes.sessionMode })
      .from(schema.dayModes)
      .where(
        and(
          tenantWhere(schema.dayModes, ctx),
          eq(schema.dayModes.dayOfWeek, DAY_NAME_TO_NUMBER[dayName]),
        ),
      )
      .limit(1);
    const isRomDay = modo?.sessionMode === "rom";

    const buildAsTemplo =
      member.view.kind === "templo" ||
      (member.view.kind === "program" &&
        member.view.enrollment.goalPlanType === null);
    const goalPlanType =
      member.view.kind === "program"
        ? member.view.enrollment.goalPlanType
        : null;
    const candidatos = buildDayIdCandidates(
      buildAsTemplo,
      goalPlanType,
      dateToWeekNumber(member.today),
      dayName,
      effectiveLevelForDay(member.memberLevel, isRomDay),
    );

    const propios = await this.dayIdsDelGimnasio(ctx, candidatos);
    const sesiones = await this.sessionService.getSessionsByDayIds(
      propios,
      true,
    );
    const sesion = candidatos.map((id) => sesiones.get(id)).find(Boolean);
    if (!sesion) return null;
    return ordenarZonas(zonasDeSesion(sesion));
  }

  /** Zonas de las sesiones completadas esta semana (lunes -> hoy). */
  private async loadWeekWorkedZones(
    ctx: TenantContext,
    member: FreeBlocksMember,
  ): Promise<TvZonaMuscular[]> {
    const completadas = await this.db
      .select({ dayId: schema.completedSessions.dayId })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, ctx),
          eq(schema.completedSessions.userId, member.userId),
          gte(schema.completedSessions.date, mondayOf(member.today)),
          lte(schema.completedSessions.date, member.today),
        ),
      );
    const dayIds = [...new Set(completadas.map((r) => r.dayId))];
    if (dayIds.length === 0) return [];

    const propios = await this.dayIdsDelGimnasio(ctx, dayIds);
    const sesiones = await this.sessionService.getSessionsByDayIds(
      propios,
      false,
    );
    const out = new Set<TvZonaMuscular>();
    for (const sesion of sesiones.values()) {
      for (const z of zonasDeSesion(sesion)) out.add(z);
    }
    return ordenarZonas(out);
  }
}
