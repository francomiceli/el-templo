import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/useAuthStore'

/**
 * Cerrar sesión: el mismo recorrido desde Mi Perfil (celular, arriba de "Eliminar cuenta", desde
 * 2026-11-20) y desde la barra lateral de escritorio ("Salir"). Sin estado propio: no hay nada que
 * limpiar.
 */
export function useLogout(): { logout: () => Promise<void> } {
  const $q = useQuasar()
  const router = useRouter()
  const authStore = useAuthStore()

  async function logout(): Promise<void> {
    await authStore.logout()
    $q.notify({ type: 'positive', message: 'Sesión cerrada' })
    void router.push('/login')
  }

  return { logout }
}
