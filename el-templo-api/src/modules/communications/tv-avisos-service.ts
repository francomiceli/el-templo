/**
 * TvAvisosService — CRUD de avisos de TV (Fase 193, D-24) + lectura del
 * aviso activo por sede para el control del profe (D-29).
 *
 * Entidad APARTE de `avisos` (avisos de la app): sin vigencia por fechas, sin
 * frecuencia por socio, sin destino — solo título+cuerpo, sedes, modo y
 * activo/inactivo manual (docblock de `tv_avisos`, 193-02). Mismo patrón de
 * constructor DI que `CommunicationsService` (`db`, `log` inyectados por
 * Fastify). Toda query sobre `tv_avisos`/`tv_class_state` pasa por
 * `tenantWhere`/`tenantValues` — las dos tablas son gym-owned (193-02).
 */
import { and, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tvAvisos, tvClassState } from "../../db/schema";
import type { TvAvisoEvento } from "../../db/schema/communications";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { getR2PublicBase } from "../shared/video-url";
import { isValidIsoDate } from "../shared/week-dates";
import { assertBranchesBelongToTenant } from "./branch-scope";
import { TV_AVISO_IMAGE_PREFIX } from "./schemas";

type DbInstance = MySql2Database<typeof schema>;

export type TvAvisoMode = "manual" | "flex_inicio" | "flex_final";
/** 2026-10-06 (migración 0259): fondo de la placa en la TV. */
export type TvAvisoTema = "claro" | "oscuro";
type TvAvisoRow = typeof tvAvisos.$inferSelect;

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 400;
// Formato evento (2026-11-12): la tarjeta de la TV es mucho más chica que la
// placa — el nombre va a 7.6rem en UNA línea y el resto en un renglón cada uno.
const EVENTO_NOMBRE_MAX_LENGTH = 40;
const EVENTO_SUBTITULO_MAX_LENGTH = 60;
const EVENTO_HORA_MAX_LENGTH = 20;
const EVENTO_LUGAR_MAX_LENGTH = 80;
const EVENTO_SELLO_MAX_LENGTH = 40;
const VALID_TEMAS: readonly TvAvisoTema[] = ["claro", "oscuro"];
const VALID_MODES: readonly TvAvisoMode[] = [
  "manual",
  "flex_inicio",
  "flex_final",
];

/** Forma de un aviso de TV en las respuestas del CRUD admin y del control. */
export interface TvAvisoItem {
  id: number;
  title: string;
  body: string;
  mode: TvAvisoMode;
  tema: TvAvisoTema;
  isActive: boolean;
  scopeBranchIds: number[] | null;
  /** `null` = placa de título + cuerpo. */
  evento: TvAvisoEvento | null;
}

/** Lo que manda el editor: `sello` e `imageUrl` pueden faltar (= sin). */
export interface TvAvisoEventoInput {
  fecha: string;
  hora: string;
  lugar: string;
  sello?: string | null;
  imageUrl?: string | null;
}

export interface CreateTvAvisoInput {
  title: string;
  body: string;
  mode: TvAvisoMode;
  /** Sin `tema`, el default de la columna ("oscuro"). */
  tema?: TvAvisoTema;
  isActive?: boolean;
  scopeBranchIds?: number[] | null;
  /** Sin `evento` (o `null`), el aviso es una placa. */
  evento?: TvAvisoEventoInput | null;
}

export interface UpdateTvAvisoInput {
  title?: string;
  body?: string;
  mode?: TvAvisoMode;
  tema?: TvAvisoTema;
  isActive?: boolean;
  scopeBranchIds?: number[] | null;
  /** `undefined` = no tocar; `null` = volver a placa; objeto = reemplazo COMPLETO. */
  evento?: TvAvisoEventoInput | null;
}

export class TvAvisosService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** D-24: todos los avisos de TV del tenant, activos primero, más recientes primero. */
  async list(ctx: TenantContext): Promise<TvAvisoItem[]> {
    const rows = await this.db
      .select()
      .from(tvAvisos)
      .where(tenantWhere(tvAvisos, ctx))
      .orderBy(desc(tvAvisos.isActive), desc(tvAvisos.id));
    return rows.map((row) => this.toItem(row));
  }

  /**
   * D-24: crea un aviso de TV. Valida título/cuerpo (T-193-27 no aplica acá,
   * es límite de placa: la placa es Cinzel a tamaño de TV) y que cada sede de
   * `scopeBranchIds` sea del tenant (T-193-27: una sede ajena es 400, nunca
   * se persiste).
   */
  async create(
    ctx: TenantContext,
    input: CreateTvAvisoInput,
  ): Promise<TvAvisoItem> {
    this.assertTitleAndBody(input.title, input.body);
    this.assertMode(input.mode);
    if (input.tema !== undefined) this.assertTema(input.tema);
    const evento = this.normalizeEvento(input.evento ?? null, null);
    if (evento) this.assertEventoTexts(input.title, input.body);
    await assertBranchesBelongToTenant(
      this.db,
      ctx,
      input.scopeBranchIds ?? null,
    );

    const [result] = await this.db.insert(tvAvisos).values(
      tenantValues(ctx, {
        title: input.title,
        body: input.body,
        mode: input.mode,
        ...(input.tema !== undefined ? { tema: input.tema } : {}),
        isActive: input.isActive ?? false,
        scopeBranchIds: input.scopeBranchIds ?? null,
        evento,
      }),
    );

    const insertId = Number(result.insertId);
    this.log.info(
      { tvAvisoId: insertId, tenantId: ctx.tenantId, mode: input.mode },
      "Aviso de TV creado",
    );

    const [row] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, insertId)))
      .limit(1);
    return this.toItem(row);
  }

  /**
   * Lookup por PK **con `tenantWhere`**: un id ajeno da 404 `NotFoundError`,
   * nunca 403 (criterio T-175-03, mismo que `CommunicationsService`).
   */
  async update(
    ctx: TenantContext,
    id: number,
    input: UpdateTvAvisoInput,
  ): Promise<TvAvisoItem> {
    const [existing] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso de TV no encontrado");
    }

    if (input.title !== undefined || input.body !== undefined) {
      this.assertTitleAndBody(
        input.title ?? existing.title,
        input.body ?? existing.body,
      );
    }
    if (input.mode !== undefined) {
      this.assertMode(input.mode);
    }
    if (input.tema !== undefined) {
      this.assertTema(input.tema);
    }
    if (input.scopeBranchIds !== undefined) {
      await assertBranchesBelongToTenant(this.db, ctx, input.scopeBranchIds);
    }
    // El estado FINAL manda: si el aviso queda como evento (porque llega uno
    // o porque ya lo era y no se toca), título y cuerpo tienen que entrar en
    // la tarjeta — también cuando lo único que cambia es el texto.
    const evento =
      input.evento === undefined
        ? (existing.evento ?? null)
        : this.normalizeEvento(input.evento, existing.evento ?? null);
    if (
      evento &&
      (input.evento !== undefined ||
        input.title !== undefined ||
        input.body !== undefined)
    ) {
      this.assertEventoTexts(
        input.title ?? existing.title,
        input.body ?? existing.body,
      );
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if (input.mode !== undefined) updates.mode = input.mode;
    if (input.tema !== undefined) updates.tema = input.tema;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.scopeBranchIds !== undefined)
      updates.scopeBranchIds = input.scopeBranchIds;
    if (input.evento !== undefined) updates.evento = evento;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No hay campos para actualizar");
    }

    await this.db
      .update(tvAvisos)
      .set(updates)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)));

    const [row] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    this.log.info(
      { tvAvisoId: id, tenantId: ctx.tenantId },
      "Aviso de TV actualizado",
    );
    return this.toItem(row);
  }

  /**
   * T-193-28: antes de borrar, limpia CUALQUIER `tv_class_state` que esté
   * apuntando a este aviso (`screen: 'aviso'`, `tv_aviso_id: <id>`) — si no,
   * la FK `tv_class_state.tv_aviso_id` bloquea el DELETE y un TV podría
   * quedar mostrando (o intentando mostrar) un aviso borrado. Lookup por PK
   * con `tenantWhere`: id ajeno da 404, nunca 403.
   */
  async remove(ctx: TenantContext, id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: tvAvisos.id })
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso de TV no encontrado");
    }

    await this.db
      .update(tvClassState)
      .set({ screen: "class", tvAvisoId: null })
      .where(
        and(tenantWhere(tvClassState, ctx), eq(tvClassState.tvAvisoId, id)),
      );

    await this.db
      .delete(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)));

    this.log.info(
      { tvAvisoId: id, tenantId: ctx.tenantId },
      "Aviso de TV borrado (referencia en tv_class_state limpiada antes)",
    );
  }

  /**
   * D-29: el aviso activo aplicable a `branchId` — `isActive: true` y
   * (`scopeBranchIds` null/vacío = todas las sedes, o contiene `branchId`),
   * filtrando por `mode` si se pasa. El más reciente (`id` desc) si hay más
   * de uno, o `null`. El filtro de alcance por sede se resuelve en memoria
   * (JSON column, mismo criterio que `avisos.scopeBranchIds` en
   * `CommunicationsService` — dataset chico por tenant, sin N+1).
   */
  async getActiveForBranch(
    ctx: TenantContext,
    branchId: number,
    mode?: TvAvisoMode,
  ): Promise<TvAvisoItem | null> {
    const [first] = await this.listActiveForBranch(ctx, branchId, mode);
    return first ?? null;
  }

  /**
   * Todos los avisos activos aplicables a `branchId` (mismo filtro que
   * `getActiveForBranch`), más reciente primero. 2026-10-06: el control del
   * profe muestra un botón por aviso manual.
   */
  async listActiveForBranch(
    ctx: TenantContext,
    branchId: number,
    mode?: TvAvisoMode,
  ): Promise<TvAvisoItem[]> {
    const rows = await this.db
      .select()
      .from(tvAvisos)
      .where(
        mode
          ? and(
              tenantWhere(tvAvisos, ctx),
              eq(tvAvisos.isActive, true),
              eq(tvAvisos.mode, mode),
            )
          : and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.isActive, true)),
      )
      .orderBy(desc(tvAvisos.id));

    return rows
      .filter((row) => this.appliesToBranch(row, branchId))
      .map((row) => this.toItem(row));
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  private appliesToBranch(row: TvAvisoRow, branchId: number): boolean {
    const scope = row.scopeBranchIds;
    if (!scope || scope.length === 0) return true;
    return scope.includes(branchId);
  }

  private toItem(row: TvAvisoRow): TvAvisoItem {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      mode: row.mode,
      tema: row.tema,
      isActive: row.isActive,
      scopeBranchIds: row.scopeBranchIds ?? null,
      evento: row.evento ?? null,
    };
  }

  /**
   * Valida y normaliza el formato evento (recorta espacios, vacío → `null` en
   * los opcionales). `previo` es el evento que ya tenía la fila: una foto que
   * NO cambia no se vuelve a validar contra `R2_PUBLIC_URL`, así un cambio de
   * esa variable no traba la edición del resto (mismo criterio que el logo de
   * las marcas, `SponsorsService.update`).
   */
  private normalizeEvento(
    input: TvAvisoEventoInput | null,
    previo: TvAvisoEvento | null,
  ): TvAvisoEvento | null {
    if (input === null) return null;

    const fecha = input.fecha.trim();
    if (!isValidIsoDate(fecha)) {
      throw new BadRequestError(
        "La fecha del evento tiene que ser un día válido (AAAA-MM-DD)",
      );
    }
    const hora = input.hora.trim();
    if (hora.length === 0) {
      throw new BadRequestError("La hora del evento no puede estar vacía");
    }
    if (hora.length > EVENTO_HORA_MAX_LENGTH) {
      throw new BadRequestError(
        `La hora no puede superar los ${EVENTO_HORA_MAX_LENGTH} caracteres`,
      );
    }
    const lugar = input.lugar.trim();
    if (lugar.length === 0) {
      throw new BadRequestError("El lugar del evento no puede estar vacío");
    }
    if (lugar.length > EVENTO_LUGAR_MAX_LENGTH) {
      throw new BadRequestError(
        `El lugar no puede superar los ${EVENTO_LUGAR_MAX_LENGTH} caracteres`,
      );
    }
    const sello = (input.sello ?? "").trim() || null;
    if (sello !== null && sello.length > EVENTO_SELLO_MAX_LENGTH) {
      throw new BadRequestError(
        `El sello no puede superar los ${EVENTO_SELLO_MAX_LENGTH} caracteres`,
      );
    }
    const imageUrl = (input.imageUrl ?? "").trim() || null;
    if (imageUrl !== null && imageUrl !== (previo?.imageUrl ?? null)) {
      this.assertOwnImageUrl(imageUrl);
    }

    return { fecha, hora, lugar, sello, imageUrl };
  }

  /**
   * La foto solo puede ser una subida desde el editor (R2 propio, prefijo
   * `tv/avisos/`): la TV la carga como fondo, y una URL arbitraria sería un
   * recurso ajeno pintado en todas las pantallas de la sede. Se compara con
   * la barra final incluida para que `https://<base>.evil.com/` no pase.
   */
  private assertOwnImageUrl(imageUrl: string): void {
    const base = getR2PublicBase();
    if (base === "") {
      throw new BadRequestError(
        "No hay almacenamiento de imágenes configurado: no se puede asignar una foto",
      );
    }
    if (!imageUrl.startsWith(`${base}/${TV_AVISO_IMAGE_PREFIX}/`)) {
      throw new BadRequestError(
        "La foto tiene que subirse desde el editor (almacenamiento de El Templo)",
      );
    }
  }

  /** En formato evento `title` es el nombre y `body` el subtítulo: más cortos. */
  private assertEventoTexts(title: string, body: string): void {
    if (title.trim().length > EVENTO_NOMBRE_MAX_LENGTH) {
      throw new BadRequestError(
        `El nombre del evento no puede superar los ${EVENTO_NOMBRE_MAX_LENGTH} caracteres`,
      );
    }
    if (body.trim().length > EVENTO_SUBTITULO_MAX_LENGTH) {
      throw new BadRequestError(
        `El subtítulo del evento no puede superar los ${EVENTO_SUBTITULO_MAX_LENGTH} caracteres`,
      );
    }
  }

  private assertTitleAndBody(title: string, body: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestError("El título no puede estar vacío");
    }
    if (title.length > TITLE_MAX_LENGTH) {
      throw new BadRequestError(
        `El título no puede superar los ${TITLE_MAX_LENGTH} caracteres`,
      );
    }
    if (!body || body.trim().length === 0) {
      throw new BadRequestError("El cuerpo no puede estar vacío");
    }
    if (body.length > BODY_MAX_LENGTH) {
      throw new BadRequestError(
        `El cuerpo no puede superar los ${BODY_MAX_LENGTH} caracteres (la placa es Cinzel a tamaño de TV: más texto no entra)`,
      );
    }
  }

  private assertTema(tema: string): void {
    if (!VALID_TEMAS.includes(tema as TvAvisoTema)) {
      throw new BadRequestError(`tema inválido: '${tema}'`);
    }
  }

  private assertMode(mode: string): void {
    if (!VALID_MODES.includes(mode as TvAvisoMode)) {
      throw new BadRequestError(`mode inválido: '${mode}'`);
    }
  }
}
