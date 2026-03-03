import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc } from "drizzle-orm";
import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { appWaitlist } from "../../db/schema/app-waitlist";
import { labsInquiries } from "../../db/schema/labs-inquiries";

const WHATSAPP_URL = "https://wa.link/ci8dpl";

interface WaitlistData {
  nombre: string;
  email: string;
  moduloInteres: string;
  ciudadPais?: string;
}

interface LabsInquiryData {
  nombre: string;
  email: string;
  telefono: string;
  nombreGimnasio: string;
  ciudadPais: string;
  cantidadSocios: string;
  sistemaActual: string;
  mensaje?: string;
}

interface SubmitResult {
  whatsappUrl: string;
}

export class AppLandingService {
  private db: MySql2Database<typeof schema>;
  private log: FastifyBaseLogger;

  constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) {
    this.db = db;
    this.log = log;
  }

  async submitWaitlist(data: WaitlistData): Promise<SubmitResult> {
    await this.db.insert(appWaitlist).values({
      nombre: data.nombre,
      email: data.email,
      moduloInteres: data.moduloInteres,
      ciudadPais: data.ciudadPais ?? null,
    });

    this.log.info(
      { email: data.email, moduloInteres: data.moduloInteres },
      "App waitlist entry submitted",
    );

    await this.sendNotificationEmail(
      `Nuevo registro Waitlist App: ${data.nombre}`,
      [
        `Nuevo registro en la lista de espera de la App:`,
        ``,
        `Nombre: ${data.nombre}`,
        `Email: ${data.email}`,
        `M\u00F3dulos de Inter\u00E9s: ${data.moduloInteres}`,
        data.ciudadPais ? `Ciudad/Pa\u00EDs: ${data.ciudadPais}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return { whatsappUrl: WHATSAPP_URL };
  }

  async submitLabsInquiry(data: LabsInquiryData): Promise<SubmitResult> {
    await this.db.insert(labsInquiries).values({
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      nombreGimnasio: data.nombreGimnasio,
      ciudadPais: data.ciudadPais,
      cantidadSocios: data.cantidadSocios,
      sistemaActual: data.sistemaActual,
      mensaje: data.mensaje ?? null,
    });

    this.log.info(
      { email: data.email, gimnasio: data.nombreGimnasio },
      "Labs inquiry submitted",
    );

    await this.sendNotificationEmail(
      `Nueva consulta Labs: ${data.nombre} \u2014 ${data.nombreGimnasio}`,
      [
        `Nueva consulta Labs recibida:`,
        ``,
        `Nombre: ${data.nombre}`,
        `Email: ${data.email}`,
        `Tel\u00E9fono: ${data.telefono}`,
        `Gimnasio: ${data.nombreGimnasio}`,
        `Ciudad/Pa\u00EDs: ${data.ciudadPais}`,
        `Cantidad de Socios: ${data.cantidadSocios}`,
        `Sistema Actual: ${data.sistemaActual}`,
        data.mensaje ? `\nMensaje:\n${data.mensaje}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return { whatsappUrl: WHATSAPP_URL };
  }

  async listWaitlist() {
    return this.db
      .select()
      .from(appWaitlist)
      .orderBy(desc(appWaitlist.createdAt));
  }

  async listLabsInquiries() {
    return this.db
      .select()
      .from(labsInquiries)
      .orderBy(desc(labsInquiries.createdAt));
  }

  async updateLabsInquiryStatus(id: number, status: string): Promise<boolean> {
    const validStatuses = ["new", "contacted", "closed"];
    if (!validStatuses.includes(status)) {
      return false;
    }

    await this.db
      .update(labsInquiries)
      .set({ status })
      .where(eq(labsInquiries.id, id));

    this.log.info({ id, status }, "Labs inquiry status updated");
    return true;
  }

  private async sendNotificationEmail(
    subject: string,
    body: string,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const notificationEmail =
      process.env.APP_NOTIFICATION_EMAIL || "ignaciobordon@eltemplo.org";

    if (!apiKey) {
      this.log.info(
        "RESEND_API_KEY not configured, skipping App notification email",
      );
      return;
    }

    try {
      const resend = new Resend(apiKey);

      await resend.emails.send({
        from: "El Templo <noreply@eltemplo.org>",
        to: notificationEmail,
        subject,
        text: body,
      });

      this.log.info("App landing notification email sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error({ err: message }, "Failed to send App notification email");
    }
  }
}
