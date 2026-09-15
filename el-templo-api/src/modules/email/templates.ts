/**
 * Email templates for transactional emails.
 * Simple inline CSS, no external dependencies.
 */

/**
 * HTML email body for password-set notification.
 * Sent when admin creates a member with auto-generated password.
 */
export function passwordSetEmailHtml(
  firstName: string,
  tempPassword: string,
): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a1a1a;">Bienvenido a El Templo, ${firstName}</h2>
  <p>Se ha creado tu cuenta. A continuacion encontraras tu contrasena temporal para ingresar a la app:</p>
  <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Tu contrasena temporal:</p>
    <p style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #1a1a1a;">${tempPassword}</p>
  </div>
  <p><strong>Importante:</strong> Te recomendamos cambiar tu contrasena despues de iniciar sesion por primera vez.</p>
  <p style="color: #666; font-size: 14px; margin-top: 30px;">Este es un correo automatico, por favor no respondas a este mensaje.</p>
</body>
</html>`;
}

/**
 * Plain-text subject for the password-set email.
 */
export const PASSWORD_SET_SUBJECT = "Tu cuenta en El Templo";

/**
 * Escape a string for safe interpolation into HTML context.
 * Fase 180 (T-180-11): `body` viene de la fila `pending_notifications`
 * (compuesto server-side con datos de sede — nombre/dirección leídos de la
 * DB, no del socio), pero se escapa igual antes de interpolar como HTML,
 * mismo criterio que `esc()` en campaigns/templates.ts.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML email body for the trial-session reminder fallback (D-24). Sent by
 * processQueue when a freemium/prueba user with a pending
 * `trial_session_reminder` notification has no device token registered.
 */
export function trialReminderEmailHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #3D3732;">
  <h2 style="color: #3D3732;">Tu sesion de prueba en El Templo</h2>
  <p>${esc(body)}</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://app.eltemplo.org/reservas" style="background: #C07A56; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ver mi reserva</a>
  </div>
  <p style="color: #8A8472; font-size: 14px; margin-top: 30px;">Este es un correo automatico, por favor no respondas a este mensaje.</p>
</body>
</html>`;
}

/** Asunto del mail con el código de recuperación de contraseña. */
export const PASSWORD_RESET_SUBJECT =
  "Tu código para recuperar la contraseña - El Templo";

/**
 * HTML del mail de "olvidé mi contraseña" (código de 6 dígitos, 2026-09-15).
 * El código se tipea en la app o en el admin: no hay link a propósito (en
 * iOS los Universal Links están deshabilitados). `firstName` viene de la DB
 * pero se escapa igual, como el resto de los templates.
 */
export function passwordResetEmailHtml(
  firstName: string | null,
  code: string,
  expiresInMinutes: number,
): string {
  const greeting = firstName ? `Hola ${esc(firstName)},` : "Hola,";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #3D3732;">
  <h2 style="color: #3D3732;">Recuperá tu contraseña</h2>
  <p>${greeting}</p>
  <p>Recibimos un pedido para cambiar la contraseña de tu cuenta en El Templo. Ingresá este código en la app para elegir una contraseña nueva:</p>
  <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #8A8472;">Tu código:</p>
    <p style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #3D3732;">${esc(code)}</p>
  </div>
  <p>El código vence en ${expiresInMinutes} minutos y sirve una sola vez.</p>
  <p>Si no pediste cambiar tu contraseña, ignorá este mail: tu cuenta sigue igual.</p>
  <p style="color: #8A8472; font-size: 14px; margin-top: 30px;">Este es un correo automatico, por favor no respondas a este mensaje.</p>
</body>
</html>`;
}
