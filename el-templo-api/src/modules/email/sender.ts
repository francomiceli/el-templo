/**
 * Remitentes de email, centralizados.
 *
 * Dos remitentes en dos subdominios distintos, a propósito: la reputación de
 * envío se mide por dominio firmante, no por casilla. Si una campaña de
 * marketing junta quejas de spam, no arrastra a los mails transaccionales
 * (recuperar contraseña, alta de socio, avisos internos).
 *
 * - EMAIL_FROM: transaccional. Debe ser una casilla de un dominio verificado
 *   en Resend y dentro del scope de la API key (prod: mail.eltemplo.org).
 * - CAMPAIGN_EMAIL_FROM: campañas de marketing (send.eltemplo.org).
 *
 * Sin la env var se cae al remitente histórico, que en prod NO está
 * verificado: Resend responde 403 "This API key is not authorized to send
 * emails from eltemplo.org" (incidente Sentry NODE-5K, 2026-09-16).
 */

const LEGACY_FROM = "El Templo <noreply@eltemplo.org>";

export const TRANSACTIONAL_EMAIL_FROM = process.env.EMAIL_FROM || LEGACY_FROM;

export const CAMPAIGN_EMAIL_FROM =
  process.env.CAMPAIGN_EMAIL_FROM || TRANSACTIONAL_EMAIL_FROM;
