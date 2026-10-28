// Módulo: web-public — datos públicos para el build de eltemplo.org (Fase 195).
//
// Lee de `branches` (fuente única, D-10) y de la grilla de horarios, y arma el
// contrato de `types.ts`. Es información 100% pública: toda columna se
// selecciona de forma EXPLÍCITA (nunca `select()` a secas — `branches` trae
// columnas internas como `gbp_location_id`) y jamás se lee el profe del
// horario (T-195-05). Todo pasa por `tenantWhere` y solo salen sedes con
// `publish_on_web = 1` (T-195-06).
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { activities, branches, schedules } from "../../db/schema";
import { getSalesNumber } from "../communications/sales-number";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { getWebBrandName } from "./brand";
import { computeOpeningHours, slugify } from "./opening-hours";
import type {
  WebActivity,
  WebCountry,
  WebScheduleSlot,
  WebSede,
  WebSiteData,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

const GOOGLE_MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1";

function toWebCountry(value: string): WebCountry {
  return value === "ES" ? "ES" : "AR";
}

function buildMapsUrl(
  mapsUrl: string | null,
  street: string | null,
  locality: string | null,
  publicName: string,
  placeId: string | null,
): string {
  if (mapsUrl) return mapsUrl;
  const query =
    [street, locality].filter((part): part is string => !!part).join(", ") ||
    publicName;
  const placePart = placeId
    ? `&query_place_id=${encodeURIComponent(placeId)}`
    : "";
  return `${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(query)}${placePart}`;
}

export class WebPublicService {
  constructor(
    private db: DbInstance,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Sedes publicadas (`publish_on_web = 1`, activas, con slug) con su grilla de
   * clases regulares y sus franjas de apertura. Lo reusa el sync de Google
   * Business Profile (195-09).
   *
   * Filtro D-30: "horarios publicados" = clases regulares activas, o sea
   * `activities.is_special = 0`. Las actividades especiales (Yoga/Aura) no
   * definen la apertura ni entran en `schedule`, pero SÍ figuran en
   * `activities` para que la sede las muestre.
   */
  async getPublishedBranchesWithHours(ctx: TenantContext): Promise<WebSede[]> {
    const branchRows = await this.db
      .select({
        id: branches.id,
        code: branches.code,
        name: branches.name,
        webSlug: branches.webSlug,
        publicName: branches.publicName,
        webKind: branches.webKind,
        country: branches.country,
        timezone: branches.timezone,
        address: branches.address,
        locality: branches.locality,
        region: branches.region,
        postalCode: branches.postalCode,
        phone: branches.phone,
        latitude: branches.latitude,
        longitude: branches.longitude,
        placeId: branches.placeId,
        mapsUrl: branches.mapsUrl,
        photoUrl: branches.photoUrl,
      })
      .from(branches)
      .where(
        and(
          tenantWhere(branches, ctx),
          eq(branches.publishOnWeb, true),
          eq(branches.isActive, true),
          isNotNull(branches.webSlug),
        ),
      )
      .orderBy(asc(branches.id));

    if (branchRows.length === 0) return [];

    // Una sola query para las grillas de todas las sedes publicadas.
    const slotRows = await this.db
      .select({
        branchId: schedules.branchId,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        activityName: activities.name,
        isSpecial: activities.isSpecial,
      })
      .from(schedules)
      .innerJoin(activities, eq(schedules.activityId, activities.id))
      .where(
        and(
          tenantWhere(schedules, ctx),
          tenantWhere(activities, ctx),
          inArray(
            schedules.branchId,
            branchRows.map((b) => b.id),
          ),
          eq(schedules.isActive, true),
          isNull(schedules.deletedFrom),
          eq(activities.isActive, true),
        ),
      )
      .orderBy(
        asc(schedules.dayOfWeek),
        asc(schedules.startTime),
        asc(schedules.endTime),
      );

    return branchRows.map((b) => {
      const slots = slotRows.filter((s) => s.branchId === b.id);

      const specialByName = new Map<string, boolean>();
      for (const s of slots) {
        specialByName.set(
          s.activityName,
          (specialByName.get(s.activityName) ?? false) || s.isSpecial,
        );
      }
      const activityList: WebActivity[] = [...specialByName.entries()]
        .map(([name, isSpecial]) => ({ name, slug: slugify(name), isSpecial }))
        .sort((x, y) => x.name.localeCompare(y.name, "es"));

      const schedule: WebScheduleSlot[] = slots
        .filter((s) => !s.isSpecial)
        .map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          activity: s.activityName,
        }));

      const country = toWebCountry(b.country);
      // La query ya filtra webSlug IS NOT NULL; el fallback solo contenta al tipo.
      const slug = b.webSlug ?? slugify(b.name);
      const publicName = b.publicName ?? b.name;

      return {
        id: b.id,
        code: b.code,
        slug,
        publicName,
        kind: b.webKind,
        country,
        timezone: b.timezone,
        address: {
          street: b.address,
          locality: b.locality,
          region: b.region,
          postalCode: b.postalCode,
          country,
        },
        geo:
          b.latitude !== null && b.longitude !== null
            ? { lat: Number(b.latitude), lng: Number(b.longitude) }
            : null,
        placeId: b.placeId,
        mapsUrl: buildMapsUrl(
          b.mapsUrl,
          b.address,
          b.locality,
          publicName,
          b.placeId,
        ),
        phone: b.phone,
        photoUrl: b.photoUrl,
        activities: activityList,
        openingHours: computeOpeningHours(schedule),
        schedule,
      };
    });
  }

  async getSiteData(ctx: TenantContext): Promise<WebSiteData> {
    const [name, ar, es, sedes] = await Promise.all([
      getWebBrandName(this.db, ctx),
      getSalesNumber(this.db, ctx, "AR"),
      getSalesNumber(this.db, ctx, "ES"),
      this.getPublishedBranchesWithHours(ctx),
    ]);

    this.log.debug({ sedes: sedes.length }, "web-public: site-data armado");

    return {
      generatedAt: new Date().toISOString(),
      brand: { name },
      countries: {
        AR: { salesWhatsapp: ar },
        ES: { salesWhatsapp: es },
      },
      sedes,
    };
  }
}
