import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, like, or, count, desc, asc, sql } from "drizzle-orm";
import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { franchiseApplications } from "../../db/schema/franchise-applications";

const WHATSAPP_URL = "https://wa.link/ci8dpl";

interface ApplicationData {
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  modelo: string;
  experiencia: string;
  capital: string;
  origen: string;
  mensaje?: string;
}

interface SubmitResult {
  success: boolean;
  whatsappUrl: string;
}

export interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export type FranchiseApplication = typeof franchiseApplications.$inferSelect;

interface ListResult {
  applications: FranchiseApplication[];
  total: number;
  page: number;
  totalPages: number;
}

type AgentColumn = "aiStrategy" | "aiOutreach" | "aiFollowup" | "aiNegotiation";

const AGENT_COLUMN_MAP: Record<string, AgentColumn> = {
  strategy: "aiStrategy",
  outreach: "aiOutreach",
  followup: "aiFollowup",
  negotiation: "aiNegotiation",
};

const SORTABLE_COLUMNS: Record<
  string,
  (typeof franchiseApplications._.columns)[keyof typeof franchiseApplications._.columns]
> = {
  createdAt: franchiseApplications.createdAt,
  nombre: franchiseApplications.nombre,
  ciudadPais: franchiseApplications.ciudadPais,
  capital: franchiseApplications.capital,
  status: franchiseApplications.status,
};

export class FranchiseService {
  private db: MySql2Database<typeof schema>;
  private log: FastifyBaseLogger;

  constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) {
    this.db = db;
    this.log = log;
  }

  async submitApplication(data: ApplicationData): Promise<SubmitResult> {
    // Persist to database
    await this.db.insert(franchiseApplications).values({
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      ciudadPais: data.ciudadPais,
      modelo: data.modelo,
      experiencia: data.experiencia,
      capital: data.capital,
      origen: data.origen,
      mensaje: data.mensaje ?? null,
    });

    this.log.info(
      { email: data.email, ciudad: data.ciudadPais },
      "Franchise application submitted",
    );

    // Send email notification (skip gracefully if no API key)
    await this.sendNotificationEmail(data);

    return {
      success: true,
      whatsappUrl: WHATSAPP_URL,
    };
  }

  async listApplications(params: ListParams): Promise<ListResult> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? "createdAt";
    const sortDir = params.sortDir ?? "desc";
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    if (params.status && params.status !== "all") {
      conditions.push(eq(franchiseApplications.status, params.status));
    }

    if (params.search) {
      const pattern = `%${params.search}%`;
      conditions.push(
        or(
          like(franchiseApplications.nombre, pattern),
          like(franchiseApplications.email, pattern),
          like(franchiseApplications.ciudadPais, pattern),
        )!,
      );
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : sql`${conditions[0]} AND ${conditions[1]}`;

    // Determine sort column
    const sortColumn =
      SORTABLE_COLUMNS[sortBy] ?? franchiseApplications.createdAt;
    const orderFn = sortDir === "asc" ? asc : desc;

    // Execute count query
    const countQuery = this.db
      .select({ value: count() })
      .from(franchiseApplications);

    if (whereClause) {
      countQuery.where(whereClause);
    }

    const [{ value: total }] = await countQuery;

    // Execute data query
    const dataQuery = this.db
      .select()
      .from(franchiseApplications)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);

    if (whereClause) {
      dataQuery.where(whereClause);
    }

    const applications = await dataQuery;

    return {
      applications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getApplication(id: number): Promise<FranchiseApplication | null> {
    const rows = await this.db
      .select()
      .from(franchiseApplications)
      .where(eq(franchiseApplications.id, id));

    return rows[0] ?? null;
  }

  async updateApplication(
    id: number,
    data: { status?: string; notes?: string },
  ): Promise<FranchiseApplication | null> {
    // Check existence first
    const existing = await this.getApplication(id);
    if (!existing) {
      return null;
    }

    // Build update object with only provided fields
    const updateData: Record<string, string> = {};
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(franchiseApplications)
        .set(updateData)
        .where(eq(franchiseApplications.id, id));

      this.log.info({ id, ...data }, "Franchise application updated");
    }

    // Re-fetch and return updated row
    return this.getApplication(id);
  }

  async saveAiOutput(
    id: number,
    agentType: string,
    content: string,
  ): Promise<FranchiseApplication | null> {
    const columnName = AGENT_COLUMN_MAP[agentType];
    if (!columnName) {
      throw new Error(`Invalid agent type: ${agentType}`);
    }

    await this.db
      .update(franchiseApplications)
      .set({ [columnName]: content })
      .where(eq(franchiseApplications.id, id));

    return this.getApplication(id);
  }

  private async sendNotificationEmail(data: ApplicationData): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const notificationEmail = process.env.FRANCHISE_NOTIFICATION_EMAIL;

    if (!apiKey) {
      this.log.info(
        "RESEND_API_KEY not configured, skipping email notification",
      );
      return;
    }

    if (!notificationEmail) {
      this.log.warn(
        "FRANCHISE_NOTIFICATION_EMAIL not configured, skipping email notification",
      );
      return;
    }

    try {
      const resend = new Resend(apiKey);

      const modeloLabel: Record<string, string> = {
        activa: "Franquicia Activa (opera el gym)",
        pasiva: "Franquicia Pasiva (inversor)",
        ambas: "Ambas opciones",
      };

      const experienciaLabel: Record<string, string> = {
        fitness: "Fitness / Deporte",
        negocios: "Negocios / Emprendimiento",
        ambas: "Ambas",
        sin_experiencia: "Sin experiencia previa",
      };

      const capitalLabel: Record<string, string> = {
        menos_50k: "Menos de USD 50.000",
        entre_50k_100k: "Entre USD 50.000 y 100.000",
        mas_100k: "Mas de USD 100.000",
      };

      const body = [
        `Nueva solicitud de franquicia recibida:`,
        ``,
        `Nombre: ${data.nombre}`,
        `Email: ${data.email}`,
        `Telefono: ${data.telefono}`,
        `Ciudad / Pais: ${data.ciudadPais}`,
        `Modelo: ${modeloLabel[data.modelo] ?? data.modelo}`,
        `Experiencia: ${experienciaLabel[data.experiencia] ?? data.experiencia}`,
        `Capital disponible: ${capitalLabel[data.capital] ?? data.capital}`,
        `Como nos conocio: ${data.origen}`,
        data.mensaje ? `\nMensaje:\n${data.mensaje}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await resend.emails.send({
        from: "El Templo <noreply@eltemplo.org>",
        to: notificationEmail,
        subject: `Nueva solicitud de franquicia: ${data.nombre} - ${data.ciudadPais}`,
        text: body,
      });

      this.log.info(
        { email: data.email },
        "Franchise application notification email sent",
      );
    } catch (err: unknown) {
      // Email failure should not fail the application submission
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        { err: message },
        "Failed to send franchise notification email",
      );
    }
  }
}
