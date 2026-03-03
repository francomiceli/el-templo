import { MySql2Database } from "drizzle-orm/mysql2";
import { desc } from "drizzle-orm";
import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { academyInquiries } from "../../db/schema/academy-inquiries";

const WHATSAPP_URL = "https://wa.link/ci8dpl";

interface InquiryData {
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  nivelInteres: string;
  modalidad: string;
  experiencia: string;
  alumnoElTemplo: string;
  origen: string;
  mensaje?: string;
}

interface InquiryResult {
  whatsappUrl: string;
}

export class AcademyService {
  private db: MySql2Database<typeof schema>;
  private log: FastifyBaseLogger;

  constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) {
    this.db = db;
    this.log = log;
  }

  async submitInquiry(data: InquiryData): Promise<InquiryResult> {
    await this.db.insert(academyInquiries).values({
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      ciudadPais: data.ciudadPais,
      nivelInteres: data.nivelInteres,
      modalidad: data.modalidad,
      experiencia: data.experiencia,
      alumnoElTemplo: data.alumnoElTemplo,
      origen: data.origen,
      mensaje: data.mensaje ?? null,
    });

    this.log.info(
      { email: data.email, nivelInteres: data.nivelInteres },
      "Academy inquiry submitted",
    );

    await this.sendNotificationEmail(data);

    return { whatsappUrl: WHATSAPP_URL };
  }

  async listInquiries() {
    return this.db
      .select()
      .from(academyInquiries)
      .orderBy(desc(academyInquiries.createdAt));
  }

  private async sendNotificationEmail(data: InquiryData): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const notificationEmail =
      process.env.ACADEMY_NOTIFICATION_EMAIL || "ignaciobordon@eltemplo.org";

    if (!apiKey) {
      this.log.info(
        "RESEND_API_KEY not configured, skipping Academy notification email",
      );
      return;
    }

    try {
      const resend = new Resend(apiKey);

      const body = [
        `Nueva consulta Academy recibida:`,
        ``,
        `Nombre: ${data.nombre}`,
        `Email: ${data.email}`,
        `Tel\u00E9fono: ${data.telefono}`,
        `Ciudad/Pa\u00EDs: ${data.ciudadPais}`,
        `Nivel de Inter\u00E9s: ${data.nivelInteres}`,
        `Modalidad: ${data.modalidad}`,
        `Experiencia: ${data.experiencia}`,
        `Alumno El Templo: ${data.alumnoElTemplo}`,
        `Origen: ${data.origen}`,
        data.mensaje ? `\nMensaje:\n${data.mensaje}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await resend.emails.send({
        from: "El Templo <noreply@eltemplo.org>",
        to: notificationEmail,
        subject: `Nueva consulta Academy: ${data.nombre} \u2014 Nivel: ${data.nivelInteres}`,
        text: body,
      });

      this.log.info(
        { email: data.email },
        "Academy inquiry notification email sent",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        { err: message },
        "Failed to send Academy notification email",
      );
    }
  }
}
