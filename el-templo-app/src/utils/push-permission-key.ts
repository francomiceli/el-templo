/**
 * Clave de Preferences del pre-pedido de notificaciones (PushPermissionDialog):
 * `'1'` = ya se le preguntó en este dispositivo. Vive acá (y no dentro del
 * componente) porque el pop-up de dirección la lee para no encimarse con ese
 * pedido en la primera apertura.
 */
export const PUSH_PERMISSION_ASKED_KEY = 'push_permission_asked_v1'
