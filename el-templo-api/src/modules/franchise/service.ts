import { MySql2Database } from "drizzle-orm/mysql2";
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
