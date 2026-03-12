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
