import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notifications', () => {
  const permissionStatus = ref<'prompt' | 'granted' | 'denied'>('prompt')
  const fcmToken = ref<string | null>(null)
  const pendingRoute = ref<string | null>(null) // deep link route from notification tap

  function setPermissionStatus(status: 'prompt' | 'granted' | 'denied') {
    permissionStatus.value = status
  }

  function setFcmToken(token: string | null) {
    fcmToken.value = token
  }

  function setPendingRoute(route: string | null) {
    pendingRoute.value = route
  }

  function consumePendingRoute(): string | null {
    const route = pendingRoute.value
    pendingRoute.value = null
    return route
  }

  return {
    permissionStatus,
    fcmToken,
    pendingRoute,
    setPermissionStatus,
    setFcmToken,
    setPendingRoute,
    consumePendingRoute,
  }
})
