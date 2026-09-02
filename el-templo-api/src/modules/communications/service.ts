/**
 * CommunicationsService — CRUD de avisos, métricas de socios únicos, "ver
 * socios" y número de WhatsApp de ventas (Fase 193, D-11..D-20).
 *
 * Mismo patrón de constructor DI que `NotificationService` (`db`, `log`
 * inyectados por Fastify). Toda query sobre `avisos`/`aviso_events` pasa por
 * `tenantWhere`/`tenantValues` (`modules/shared/tenant.ts`) — las dos tablas
 * son gym-owned desde el día uno (193-02).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { avisos, avisoEvents, users } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
import {
  validateDestination,
  type AppSectionKey,
  type DestinationType,
} from "./destinations";
import { getSalesNumber, setSalesNumber } from "./sales-number";
import type { CountryCode } from "../shared/country-scope";

type DbInstance = MySql2Database<typeof schema>;

type AvisoPlacement = "popup" | "tarjeta";
type AvisoFrequencyType = "once" | "every_n_days" | "every_open";
type AvisoStatus = "draft" | "active" | "paused";
type AvisoRow = typeof avisos.$inferSelect;

/** Forma de un aviso en `GET /admin/avisos`, con las métricas D-17 mergeadas. */
export interface AvisoListItem {
  id: number;
  kind: "system" | "custom";
  code: string | null;
  placement: AvisoPlacement;
  title: string;
  body: string;
  buttonText: string;
  destinationType: DestinationType;
  destinationSection: string | null;
  whatsappText: string | null;
  frequencyType: AvisoFrequencyType;
  frequencyDays: number | null;
  status: AvisoStatus;
  startsOn: string | null;
  endsOn: string | null;
  scopeBranchIds: number[] | null;
  scopeCountries: string[] | null;
  scopeSegments: string[] | null;
  sortOrder: number;
  /** D-17: socios ÚNICOS alcanzados (evento `shown`). */
  reachedCount: number;
  /** D-17: socios ÚNICOS que cerraron (evento `dismissed`). */
  dismissedCount: number;
  /** D-17: socios ÚNICOS que tocaron el botón (evento `clicked`). */
  clickedCount: number;
}

/** Input de `createAviso`. Siempre nace `kind: 'custom'` — lo fija el service. */
export interface CreateAvisoInput {
  placement: AvisoPlacement;
  title: string;
  body: string;
  buttonText: string;
  destinationType: DestinationType;
  destinationSection: AppSectionKey | null;
  whatsappText: string | null;
  frequencyType: AvisoFrequencyType;
  frequencyDays: number | null;
  status?: AvisoStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: string[] | null;
  sortOrder?: number;
}

/**
 * Input de `updateAviso`. Todos los campos opcionales — solo se aplican los
 * presentes. `updateAviso` decide en runtime cuáles están PERMITIDOS según
 * `kind`/`code` de la fila (D-08/D-09/D-10/D-11).
 */
export interface UpdateAvisoInput {
  placement?: AvisoPlacement;
  title?: string;
  body?: string;
  buttonText?: string;
  destinationType?: DestinationType;
  // Sin narrowing a AppSectionKey a propósito (a diferencia de
  // CreateAvisoInput): en el route de update el body no pasó todavía por
  // `validateDestination` (eso lo hace `updateAviso` acá abajo, mergeado con
  // la fila existente) — un string suelto del body puede no ser una key
  // curada aún, y es justamente lo que la validación de acá adentro rechaza.
  destinationSection?: string | null;
  whatsappText?: string | null;
  frequencyType?: AvisoFrequencyType;
  frequencyDays?: number | null;
  status?: AvisoStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: string[] | null;
  sortOrder?: number;
}

/** D-18: quién tocó el botón de un aviso. */
export interface AvisoClicker {
  userId: number;
  fullName: string;
  phone: string | null;
  lastAt: Date;
}

/**
 * Los campos que `updateAviso` acepta para un aviso `kind: 'system'`, según
 * su `code` (D-08/D-09/D-10). Cualquier campo fuera de este set en el input
 * se rechaza con `BadRequestError` nombrándolo — nunca se ignora en
 * silencio.
 */
const SYSTEM_ALLOWED_BASE: ReadonlySet<keyof UpdateAvisoInput> = new Set([
  "title",
  "body",
  "buttonText",
  "destinationType",
  "destinationSection",
  "whatsappText",
  "status",
  "frequencyType",
  "frequencyDays",
  "sortOrder",
]);

/**
 * D-10: `plan_expiry` — la regla de disparo (≤3 días, diario, supresión por
 * cobertura) queda FIJA EN CÓDIGO. Ni `status`, ni `frequencyType`, ni
 * `frequencyDays`, ni `sortOrder` son editables para este code.
 */
const SYSTEM_ALLOWED_PLAN_EXPIRY: ReadonlySet<keyof UpdateAvisoInput> =
  new Set(["title", "body", "buttonText", "whatsappText", "destinationType", "destinationSection"]);

/**
 * D-08/D-09: `rating_prompt`/`improvement_prompt` — el set de `plan_expiry` +
 * frecuencia editable + `status` (D-11: los avisos de sistema se pueden
 * desactivar, salvo vencimiento). `prompt-service.ts` ya respeta
 * `status !== 'active'` en esos escalones.
 */
const SYSTEM_ALLOWED_WITH_FREQUENCY: ReadonlySet<keyof UpdateAvisoInput> =
  new Set([
    ...SYSTEM_ALLOWED_PLAN_EXPIRY,
    "frequencyType",
    "frequencyDays",
    "status",
  ]);

function allowedFieldsForSystemAviso(
  code: string | null,
): ReadonlySet<keyof UpdateAvisoInput> {
  if (code === "plan_expiry") return SYSTEM_ALLOWED_PLAN_EXPIRY;
  if (code === "rating_prompt" || code === "improvement_prompt") {
    return SYSTEM_ALLOWED_WITH_FREQUENCY;
  }
  return SYSTEM_ALLOWED_BASE;
}

/** Etiquetas legibles de cada campo, para el mensaje del `BadRequestError` de `updateAviso`. */
const FIELD_LABELS: Record<keyof UpdateAvisoInput, string> = {
  placement: "placement",
  title: "title",
  body: "body",
  buttonText: "buttonText",
  destinationType: "destinationType",
  destinationSection: "destinationSection",
  whatsappText: "whatsappText",
  frequencyType: "frequencyType",
  frequencyDays: "frequencyDays",
  status: "status",
  startsOn: "startsOn",
  endsOn: "endsOn",
  scopeBranchIds: "scopeBranchIds",
  scopeCountries: "scopeCountries",
  scopeSegments: "scopeSegments",
  sortOrder: "sortOrder",
};

export class CommunicationsService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ── Avisos: lectura ─────────────────────────────────────────────────────

  /**
   * D-17: lista los avisos del tenant con `reachedCount`/`dismissedCount`/
   * `clickedCount` (socios ÚNICOS por tipo de evento) mergeados en memoria.
   * UN solo `select ... group by` sobre `aviso_events` — nunca un subquery
   * por fila (T-193-15, evita N+1 con N = cantidad de avisos).
   */
  async listAvisos(
    ctx: TenantContext,
    placement?: AvisoPlacement,
  ): Promise<AvisoListItem[]> {
    const rows = await this.db
      .select()
      .from(avisos)
      .where(
        placement
          ? and(tenantWhere(avisos, ctx), eq(avisos.placement, placement))
          : tenantWhere(avisos, ctx),
      )
      .orderBy(avisos.placement, avisos.sortOrder, avisos.id);

    // Agregado único de eventos, scopeado por tenant (aviso_events es
    // gym-owned, 193-02) — NO por lista de ids: un solo select cubre todos
    // los avisos del tenant de una vez (T-193-15).
    const eventCounts = await this.db
      .select({
        avisoId: avisoEvents.avisoId,
        eventType: avisoEvents.eventType,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(avisoEvents)
      .where(tenantWhere(avisoEvents, ctx))
      .groupBy(avisoEvents.avisoId, avisoEvents.eventType);

    const countsByAviso = new Map<
      number,
      { shown: number; dismissed: number; clicked: number }
    >();
    for (const row of eventCounts) {
      const entry = countsByAviso.get(row.avisoId) ?? {
        shown: 0,
        dismissed: 0,
        clicked: 0,
      };
      const cnt = Number(row.cnt);
      if (row.eventType === "shown") entry.shown = cnt;
      else if (row.eventType === "dismissed") entry.dismissed = cnt;
      else if (row.eventType === "clicked") entry.clicked = cnt;
      countsByAviso.set(row.avisoId, entry);
    }

    return rows.map((row) => this.toListItem(row, countsByAviso));
  }

  private toListItem(
    row: AvisoRow,
    countsByAviso: Map<
      number,
      { shown: number; dismissed: number; clicked: number }
    >,
  ): AvisoListItem {
    const counts = countsByAviso.get(row.id) ?? {
      shown: 0,
      dismissed: 0,
      clicked: 0,
    };
    return {
      id: row.id,
      kind: row.kind,
      code: row.code,
      placement: row.placement,
      title: row.title,
      body: row.body,
      buttonText: row.buttonText,
      destinationType: row.destinationType,
      destinationSection: row.destinationSection,
      whatsappText: row.whatsappText,
      frequencyType: row.frequencyType,
      frequencyDays: row.frequencyDays,
      status: row.status,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      scopeBranchIds: row.scopeBranchIds ?? null,
      scopeCountries: row.scopeCountries ?? null,
      scopeSegments: row.scopeSegments ?? null,
      sortOrder: row.sortOrder,
      reachedCount: counts.shown,
      dismissedCount: counts.dismissed,
      clickedCount: counts.clicked,
    };
  }

  // ── Avisos: escritura ───────────────────────────────────────────────────

  /**
   * D-12..D-15: crea un aviso `kind: 'custom'`. Valida el destino (D-05),
   * la coherencia de frecuencia y de vigencia. D-15b: `placement: 'tarjeta'`
   * fuerza `frequencyType: 'every_open'` / `frequencyDays: null` — el
   * carrusel se ve en cada apertura, las tarjetas no tienen frecuencia.
   */
  async createAviso(
    ctx: TenantContext,
    input: CreateAvisoInput,
  ): Promise<AvisoListItem> {
    const destResult = validateDestination({
      type: input.destinationType,
      section: input.destinationSection,
      whatsappText: input.whatsappText,
    });
    if (!destResult.ok) {
      throw new BadRequestError(destResult.reason);
    }

    let frequencyType = input.frequencyType;
    let frequencyDays = input.frequencyDays;
    if (input.placement === "tarjeta") {
      // D-15b: forzado, no negociable — el input del admin para estos dos
      // campos se descarta silenciosamente a propósito en este único caso
      // (no es "un campo no permitido" porque tarjeta SIEMPRE puede recibir
      // cualquier valor de frecuencia; el service normaliza).
      frequencyType = "every_open";
      frequencyDays = null;
    } else {
      this.assertFrequencyCoherence(frequencyType, frequencyDays);
    }

    if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
      throw new BadRequestError(
        "La fecha de inicio de vigencia no puede ser posterior a la de fin",
      );
    }

    const [result] = await this.db.insert(avisos).values(
      tenantValues(ctx, {
        kind: "custom" as const,
        code: null,
        placement: input.placement,
        title: input.title,
        body: input.body,
        buttonText: input.buttonText,
        destinationType: destResult.value.type,
        destinationSection: destResult.value.section,
        whatsappText: destResult.value.whatsappText,
        frequencyType,
        frequencyDays,
        status: input.status ?? "draft",
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        scopeBranchIds: input.scopeBranchIds ?? null,
        scopeCountries: input.scopeCountries ?? null,
        scopeSegments: input.scopeSegments ?? null,
        sortOrder: input.sortOrder ?? 0,
      }),
    );

    const insertId = Number(result.insertId);
    this.log.info(
      { avisoId: insertId, tenantId: ctx.tenantId, placement: input.placement },
      "Aviso custom creado",
    );

    const [row] = await this.db
      .select()
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, insertId)))
      .limit(1);
    return this.toListItem(row, new Map());
  }

  /**
   * D-08..D-11: actualiza un aviso. Lookup por PK **con `tenantWhere`**: un
   * id ajeno da 404 `NotFoundError`, NUNCA 403 (criterio T-175-03). Para
   * `kind: 'system'` solo acepta el subset de campos que corresponde a su
   * `code` — cualquier otro campo del input se RECHAZA con `BadRequestError`
   * nombrándolo (nunca se ignora en silencio).
   */
  async updateAviso(
    ctx: TenantContext,
    id: number,
    input: UpdateAvisoInput,
  ): Promise<AvisoListItem> {
    const [existing] = await this.db
      .select()
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso no encontrado");
    }

    // `!== undefined` es OBLIGATORIO acá: routes.ts arma el input con las
    // 16 keys SIEMPRE presentes (`placement: request.body.placement`, etc.),
    // así que un campo que el body NO mandó llega como `undefined` pero la
    // KEY sigue estando — `Object.keys` la vería igual y un PUT que solo
    // manda `title` rechazaría por "placement no editable" (bug real,
    // encontrado por el test (4) de este plan).
    const providedFields = (
      Object.keys(input) as Array<keyof UpdateAvisoInput>
    ).filter((field) => input[field] !== undefined);

    if (existing.kind === "system") {
      const allowed = allowedFieldsForSystemAviso(existing.code);
      for (const field of providedFields) {
        if (!allowed.has(field)) {
          throw new BadRequestError(
            `El campo '${FIELD_LABELS[field]}' no es editable para el aviso de sistema '${existing.code}'`,
          );
        }
      }
    }

    const updates: Record<string, unknown> = {};

    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if (input.buttonText !== undefined) updates.buttonText = input.buttonText;
    if (input.status !== undefined) updates.status = input.status;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
    if (input.startsOn !== undefined) updates.startsOn = input.startsOn;
    if (input.endsOn !== undefined) updates.endsOn = input.endsOn;
    if (input.scopeBranchIds !== undefined)
      updates.scopeBranchIds = input.scopeBranchIds;
    if (input.scopeCountries !== undefined)
      updates.scopeCountries = input.scopeCountries;
    if (input.scopeSegments !== undefined)
      updates.scopeSegments = input.scopeSegments;
    // `placement` solo lo puede tocar un aviso custom (los de sistema no
    // están en SYSTEM_ALLOWED_* así que ya se rechazó arriba si vino).
    if (input.placement !== undefined) updates.placement = input.placement;

    // Destino: si viene CUALQUIERA de los 3 campos, se revalida el destino
    // COMPLETO (los 3 juntos), mergeado con lo existente — evita una
    // combinación inválida a mitad de camino (ej. solo cambiar
    // `destinationSection` y dejar `destinationType` en `whatsapp_sales`).
    if (
      input.destinationType !== undefined ||
      input.destinationSection !== undefined ||
      input.whatsappText !== undefined
    ) {
      const mergedType = input.destinationType ?? existing.destinationType;
      const mergedSection =
        input.destinationSection !== undefined
          ? input.destinationSection
          : existing.destinationSection;
      const mergedWhatsapp =
        input.whatsappText !== undefined
          ? input.whatsappText
          : existing.whatsappText;
      const destResult = validateDestination({
        type: mergedType,
        section: mergedSection,
        whatsappText: mergedWhatsapp,
      });
      if (!destResult.ok) {
        throw new BadRequestError(destResult.reason);
      }
      updates.destinationType = destResult.value.type;
      updates.destinationSection = destResult.value.section;
      updates.whatsappText = destResult.value.whatsappText;
    }

    // Frecuencia: si viene CUALQUIERA de los 2 campos, se revalida la
    // coherencia COMPLETA, mergeada con lo existente. D-15b: si el
    // `placement` resultante (nuevo o existente) es 'tarjeta', se fuerza
    // `every_open`/`null` igual que en `createAviso` — evita que un update
    // deje una tarjeta con frecuencia inválida.
    const resultingPlacement = (input.placement ?? existing.placement) as
      | AvisoPlacement
      | undefined;
    if (
      input.frequencyType !== undefined ||
      input.frequencyDays !== undefined ||
      input.placement !== undefined
    ) {
      if (resultingPlacement === "tarjeta") {
        updates.frequencyType = "every_open";
        updates.frequencyDays = null;
      } else {
        const mergedFrequencyType =
          input.frequencyType ?? existing.frequencyType;
        const mergedFrequencyDays =
          input.frequencyDays !== undefined
            ? input.frequencyDays
            : existing.frequencyDays;
        this.assertFrequencyCoherence(mergedFrequencyType, mergedFrequencyDays);
        if (input.frequencyType !== undefined)
          updates.frequencyType = input.frequencyType;
        if (input.frequencyDays !== undefined)
          updates.frequencyDays = input.frequencyDays;
      }
    }

    const mergedStartsOn =
      input.startsOn !== undefined ? input.startsOn : existing.startsOn;
    const mergedEndsOn =
      input.endsOn !== undefined ? input.endsOn : existing.endsOn;
    if (mergedStartsOn && mergedEndsOn && mergedStartsOn > mergedEndsOn) {
      throw new BadRequestError(
        "La fecha de inicio de vigencia no puede ser posterior a la de fin",
      );
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No hay campos para actualizar");
    }

    await this.db
      .update(avisos)
      .set(updates)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, id)));

    const [row] = await this.db
      .select()
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, id)))
      .limit(1);

    this.log.info(
      { avisoId: id, tenantId: ctx.tenantId, fields: providedFields },
      "Aviso actualizado",
    );

    return this.toListItem(row, new Map());
  }

  /**
   * D-11: solo borra avisos `kind: 'custom'` — los de sistema se desactivan
   * (`status: 'paused'`), nunca se borran. Lookup por PK con `tenantWhere`:
   * un id ajeno da 404, nunca 403.
   */
  async deleteAviso(ctx: TenantContext, id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: avisos.id, kind: avisos.kind })
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso no encontrado");
    }

    if (existing.kind === "system") {
      throw new BadRequestError(
        "Los avisos de sistema no se borran: desactivalos",
      );
    }

    await this.db
      .delete(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, id)));

    this.log.info({ avisoId: id, tenantId: ctx.tenantId }, "Aviso custom borrado");
  }

  // ── Métricas: ver socios ────────────────────────────────────────────────

  /**
   * D-18: quiénes tocaron el botón de un aviso, con nombre y teléfono. El
   * aviso y los socios se resuelven con `tenantWhere` en los DOS lados — un
   * `avisoId` ajeno da 404 (T-193-13/T-193-14).
   */
  async listAvisoClickers(
    ctx: TenantContext,
    avisoId: number,
    limit = 500,
  ): Promise<AvisoClicker[]> {
    const [aviso] = await this.db
      .select({ id: avisos.id })
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, avisoId)))
      .limit(1);

    if (!aviso) {
      throw new NotFoundError("Aviso no encontrado");
    }

    const rows = await this.db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        lastAt: avisoEvents.lastAt,
      })
      .from(avisoEvents)
      .innerJoin(
        users,
        and(tenantWhere(users, ctx), eq(avisoEvents.userId, users.id)),
      )
      .where(
        and(
          tenantWhere(avisoEvents, ctx),
          eq(avisoEvents.avisoId, avisoId),
          eq(avisoEvents.eventType, "clicked"),
        ),
      )
      .orderBy(desc(avisoEvents.lastAt))
      .limit(limit);

    return rows.map((row) => ({
      userId: row.userId,
      fullName: [row.firstName, row.lastName].filter(Boolean).join(" "),
      phone: row.phone,
      lastAt: row.lastAt,
    }));
  }

  // ── Número de ventas (D-20/D-21) ────────────────────────────────────────

  /** Delegan en `sales-number.ts` — no reimplementa la validación acá. */
  async getSalesNumbers(
    ctx: TenantContext,
  ): Promise<Record<CountryCode, string | null>> {
    const [ar, es] = await Promise.all([
      getSalesNumber(this.db, ctx, "AR"),
      getSalesNumber(this.db, ctx, "ES"),
    ]);
    return { AR: ar, ES: es };
  }

  async setSalesNumbers(
    ctx: TenantContext,
    input: { AR?: string; ES?: string },
  ): Promise<void> {
    if (input.AR !== undefined) {
      await setSalesNumber(this.db, ctx, "AR", input.AR);
    }
    if (input.ES !== undefined) {
      await setSalesNumber(this.db, ctx, "ES", input.ES);
    }
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  /**
   * D-11: `every_n_days` exige `frequencyDays >= 1`; `once`/`every_open`
   * exigen `frequencyDays: null`.
   */
  private assertFrequencyCoherence(
    frequencyType: AvisoFrequencyType,
    frequencyDays: number | null | undefined,
  ): void {
    if (frequencyType === "every_n_days") {
      if (
        frequencyDays === null ||
        frequencyDays === undefined ||
        frequencyDays < 1
      ) {
        throw new BadRequestError(
          "frequencyDays debe ser >= 1 cuando frequencyType es 'every_n_days'",
        );
      }
      return;
    }
    // once | every_open
    if (frequencyDays !== null && frequencyDays !== undefined) {
      throw new BadRequestError(
        `frequencyDays debe ser null cuando frequencyType es '${frequencyType}'`,
      );
    }
  }
}
