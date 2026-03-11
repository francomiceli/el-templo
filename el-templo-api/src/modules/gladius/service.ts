import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, asc } from "drizzle-orm";
import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { gladiusProducts } from "../../db/schema/gladius-products";
import { gladiusInquiries } from "../../db/schema/gladius-inquiries";

const WHATSAPP_URL = "https://wa.link/ci8dpl";

interface ProductData {
  name: string;
  slug?: string;
  description: string;
  photo?: string | null;
  status?: string;
  sortOrder?: number;
}

interface InquiryData {
  nombre: string;
  email: string;
  productoInteres: string;
  mensaje?: string;
}

interface InquiryResult {
  whatsappUrl: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // strip special chars
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

export class GladiusService {
  private db: MySql2Database<typeof schema>;
  private log: FastifyBaseLogger;

  constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) {
    this.db = db;
    this.log = log;
  }

  async listPublishedProducts() {
    return this.db
      .select()
      .from(gladiusProducts)
      .where(eq(gladiusProducts.status, "published"))
      .orderBy(asc(gladiusProducts.sortOrder));
  }

  async getProductBySlug(slug: string) {
    const [product] = await this.db
      .select()
      .from(gladiusProducts)
      .where(eq(gladiusProducts.slug, slug));
    return product ?? null;
  }

  async listAllProducts() {
    return this.db
      .select()
      .from(gladiusProducts)
      .orderBy(asc(gladiusProducts.sortOrder));
  }

  async createProduct(data: ProductData) {
    const slug = data.slug || slugify(data.name);

    await this.db.insert(gladiusProducts).values({
      name: data.name,
      slug,
      description: data.description,
      photo: data.photo ?? null,
      status: data.status ?? "published",
      sortOrder: data.sortOrder ?? 0,
    });

    const [created] = await this.db
      .select()
      .from(gladiusProducts)
      .where(eq(gladiusProducts.slug, slug));

    this.log.info({ slug }, "Gladius product created");
    return created;
  }

  async updateProduct(
    id: number,
    data: Partial<Omit<ProductData, "slug">> & { slug?: string },
  ) {
    const updateValues: Partial<typeof gladiusProducts.$inferInsert> = {};
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.description !== undefined)
      updateValues.description = data.description;
    if (data.photo !== undefined) updateValues.photo = data.photo;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;

    await this.db
      .update(gladiusProducts)
      .set(updateValues)
      .where(eq(gladiusProducts.id, id));

    const [updated] = await this.db
      .select()
      .from(gladiusProducts)
      .where(eq(gladiusProducts.id, id));

    this.log.info({ id }, "Gladius product updated");
    return updated ?? null;
  }

  async deleteProduct(id: number) {
    await this.db.delete(gladiusProducts).where(eq(gladiusProducts.id, id));

    this.log.info({ id }, "Gladius product deleted");
  }

  async submitInquiry(data: InquiryData): Promise<InquiryResult> {
    await this.db.insert(gladiusInquiries).values({
      nombre: data.nombre,
      email: data.email,
      productoInteres: data.productoInteres,
      mensaje: data.mensaje ?? null,
    });

    this.log.info(
      { email: data.email, producto: data.productoInteres },
      "Gladius inquiry submitted",
    );

    await this.sendNotificationEmail(data);

    return { whatsappUrl: WHATSAPP_URL };
  }

  private async sendNotificationEmail(data: InquiryData): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const notificationEmail = process.env.GLADIUS_NOTIFICATION_EMAIL;

    if (!apiKey) {
      this.log.info(
        "RESEND_API_KEY not configured, skipping Gladius notification email",
      );
      return;
    }

    if (!notificationEmail) {
      this.log.warn(
        "GLADIUS_NOTIFICATION_EMAIL not configured, skipping email notification",
      );
      return;
    }

    try {
      const resend = new Resend(apiKey);

      const body = [
        `Nueva consulta Gladius recibida:`,
        ``,
        `Nombre: ${data.nombre}`,
        `Email: ${data.email}`,
        `Producto de interes: ${data.productoInteres}`,
        data.mensaje ? `\nMensaje:\n${data.mensaje}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await resend.emails.send({
        from: "El Templo <noreply@eltemplo.org>",
        to: notificationEmail,
        subject: `Nueva consulta Gladius: ${data.nombre} — ${data.productoInteres}`,
        text: body,
      });

      this.log.info(
        { email: data.email },
        "Gladius inquiry notification email sent",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        { err: message },
        "Failed to send Gladius notification email",
      );
    }
  }
}
