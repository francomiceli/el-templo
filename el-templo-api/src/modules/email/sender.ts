/**
 * Remitentes de email, centralizados.
 *
 * Dos remitentes porque la reputación de envío se mide por dominio firmante,
 * no por casilla: si una campaña de marketing junta quejas de spam, no
 * debería arrastrar a los mails transaccionales (recuperar contraseña, alta
 * de socio, avisos internos).
 *
 * - CAMPAIGN_EMAIL_FROM: campañas de marketing (prod: send.eltemplo.org).
 * - EMAIL_FROM: transaccional. Hoy (2026-09) NO está seteada en prod: no hay
 *   segundo subdominio verificado en Resend, así que cae al remitente de
 *   campañas, que sí está dentro del scope de la API key. Cuando se verifique
 *   `mail.eltemplo.org` y se amplíe el scope de la key, se setea el secret y
 *   los dos flujos quedan separados sin tocar código.
 *
 * Sin ninguna de las dos se cae al remitente histórico, que en prod NO está
 * verificado: Resend responde 403 "This API key is not authorized to send
 * emails from eltemplo.org" (incidente Sentry NODE-5K, 2026-09-16).
 */

const LEGACY_FROM = "El Templo <noreply@eltemplo.org>";

export const CAMPAIGN_EMAIL_FROM =
  process.env.CAMPAIGN_EMAIL_FROM || LEGACY_FROM;

export const TRANSACTIONAL_EMAIL_FROM =
  process.env.EMAIL_FROM || CAMPAIGN_EMAIL_FROM;
