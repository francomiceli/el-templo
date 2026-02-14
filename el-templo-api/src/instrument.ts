import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    sendDefaultPii: true,
    beforeSend(event) {
      // Scrub sensitive fields from request data
      if (event.request?.data && typeof event.request.data === "object") {
        const data = event.request.data as Record<string, unknown>;
        const sensitiveFields = ["password", "currentPassword", "newPassword"];
        for (const field of sensitiveFields) {
          if (field in data) {
            data[field] = "[REDACTED]";
          }
        }
      }
      return event;
    },
  });
}
