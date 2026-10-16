import { boot } from 'quasar/wrappers'
import { Notify } from 'quasar'

/**
 * Mensajes flash (sketch 014 variante B): íconos por tipo cuando el llamado no trae `icon`.
 *
 * `registerType` pisa los tipos de fábrica de Quasar (positive/negative/warning/info), así los
 * `$q.notify({ type: 'positive' })` ya existentes toman el ícono nuevo sin tocarse. Un `icon`
 * explícito en el llamado sigue ganando. `warning` pierde el `textColor: 'dark'` de fábrica:
 * el texto crema lo pone _notify.scss sobre la píldora oscura.
 * Posición y timeout salen de `framework.config.notify`; el aspecto, de src/css/_notify.scss.
 */
export default boot(() => {
  Notify.registerType('positive', { icon: 'check', color: 'positive' })
  Notify.registerType('negative', { icon: 'error_outline', color: 'negative' })
  Notify.registerType('warning', { icon: 'warning_amber', color: 'warning' })
  Notify.registerType('info', { icon: 'info', color: 'info' })
})
