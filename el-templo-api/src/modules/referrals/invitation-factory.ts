// Módulo: referrals — armado del InvitationService con sus dependencias (Fase 194).
//
// Un solo lugar arma `InvitationService` + `SubscriptionService` + `BookingService`
// (lección de 194-09: el `BookingService` es el 4.º argumento y `voidInvitation`
// falla cerrado sin él). Lo comparten el canal app (`referrals/routes.ts`, 194-10)
// y el canal asistido (`members/routes.ts`, 194-12): copiar el armado en cada ruta
// es la forma de que una de las dos se olvide del `BookingService`.
import type { FastifyBaseLogger } from "fastify";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { EnrollmentService } from "../programs/enrollment-service";
import { SubscriptionService } from "../subscriptions/service";
import { BookingService } from "../scheduling/booking-service";
import { NotificationService } from "../notifications/service";
import { InvitationService } from "./invitation-service";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Mismo armado que `scheduling/routes.ts`: la suscripción con su
 * `EnrollmentService`, las reservas enlazadas con ella (`setBookingService`) y
 * el `InvitationService` con ambos. Con precio 0 (plan Invitación) no hace falta
 * `TransactionService`.
 */
export function buildInvitationService(
  db: DbInstance,
  log: FastifyBaseLogger,
): InvitationService {
  const subscriptionService = new SubscriptionService(
    db,
    log,
    undefined,
    new EnrollmentService(db, log),
  );
  const bookingService = new BookingService(
    db,
    log,
    subscriptionService,
    new NotificationService(db, log),
  );
  subscriptionService.setBookingService(bookingService);
  return new InvitationService(db, log, subscriptionService, bookingService);
}
