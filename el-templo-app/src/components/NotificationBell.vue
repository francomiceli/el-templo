<template>
  <!-- Fase 215 (plan 19, D-17): campana de la barra de arriba, entre perfil y salir. Lleva a la
       pantalla Notificaciones; si ya está ahí no hace nada. Blanca sobre el degradé: nunca dorada. -->
  <q-btn
    flat
    round
    no-caps
    :icon="unreadCount > 0 ? 'notifications' : 'notifications_none'"
    class="notification-bell"
    :class="{ 'notification-bell--active': isActive }"
    :aria-label="bellAriaLabel(unreadCount)"
    :aria-current="isActive ? 'page' : undefined"
    @click="onClick"
  >
    <NotificationCountBadge :count="unreadCount" placement="bar" />
    <q-tooltip>Notificaciones</q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import NotificationCountBadge from 'src/components/NotificationCountBadge.vue'
import { useNotificationsInboxStore } from 'src/stores/useNotificationsInboxStore'
import { bellAriaLabel } from 'src/utils/notifications-view'

const route = useRoute()
const router = useRouter()
const { unreadCount } = storeToRefs(useNotificationsInboxStore())

const isActive = computed(() => route.name === 'notifications')

function onClick(): void {
  if (isActive.value) return
  void router.push({ name: 'notifications' })
}
</script>

<style scoped lang="scss">
.notification-bell {
  position: relative;
  flex-shrink: 0;
  color: #fff;

  // El badge se posiciona contra el botón y no contra el contenido (el ícono de 24 px).
  :deep(.q-btn__content) {
    position: static;
  }

  &--active {
    background: rgba(255, 255, 255, 0.2);
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
}
</style>
