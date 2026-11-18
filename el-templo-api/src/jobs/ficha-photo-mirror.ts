/**
 * Espejo de la foto de ficha — job cada 15 minutos (fase 214, D-43).
 *
 * Copia al bucket privado las fotos de ficha (`users.photo_url`, URL pública que
 * carga el staff) que todavía no tienen espejo, una sola vez por `photo_url`.
 * La lógica vive en `modules/members/ficha-photo-mirror.ts`; acá solo está el
 * barrido y el cron. Consecuencia aceptada: una foto de ficha nueva aparece en
 * la comunidad hasta ~30 minutos después de cargarla (15 de espera mínima de la
 * URL más hasta 15 del próximo tick).
 *
 * Barrido multi-tenant obligatorio vía forEachActiveTenant (Fase 169): corre una
 * vez por gimnasio activo y aísla errores por iteración.
 */
import cron from "node-cron";
import pino from "pino";
import type { FastifyInstance } from "fastify";
import { forEachActiveTenant } from "../modules/shared/tenant";
import {
  mirrorFichaPhotos,
  type FichaMirrorResult,
} from "../modules/members/ficha-photo-mirror";

const log = pino({ name: "ficha-photo-mirror" });

/** Un barrido completo (todos los gimnasios activos). Exportada para el test. */
export async function runFichaPhotoMirror(
  app: FastifyInstance,
  opts: { now?: Date; limit?: number } = {},
): Promise<FichaMirrorResult> {
  const total: FichaMirrorResult = { mirrored: 0, failed: 0, skipped: 0 };
  await forEachActiveTenant(app.db, log, "ficha-photo-mirror", async (ctx) => {
    const r = await mirrorFichaPhotos(app, ctx, opts);
    total.mirrored += r.mirrored;
    total.failed += r.failed;
    total.skipped += r.skipped;
  });
  return total;
}

export function startFichaPhotoMirrorJob(app: FastifyInstance): void {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const res = await runFichaPhotoMirror(app);
      if (res.mirrored > 0 || res.failed > 0) {
        log.info(res, "Ficha-photo-mirror job done");
      }
    } catch (err: unknown) {
      log.error({ err }, "Ficha-photo-mirror job failed");
    }
  });

  log.info("Ficha-photo-mirror cron scheduled every 15 minutes");
}
