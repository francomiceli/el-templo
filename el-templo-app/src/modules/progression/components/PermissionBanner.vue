<template>
  <div v-if="showBanner" class="permission-banner">
    <div class="permission-banner__content">
      <q-icon name="notifications_off" size="20px" color="white" class="permission-banner__icon" />
      <span class="permission-banner__text">
        Activa las notificaciones para no perderte tu resumen semanal
      </span>
    </div>
    <q-btn
      flat
      no-caps
      dense
      class="permission-banner__btn"
      :loading="requesting"
      @click="handleEnable"
    >
      Activar
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { usePushNotifications } from 'src/composables/usePushNotifications'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PermissionBanner')
const store = useNotificationStore()
const { isNative, requestPermission } = usePushNotifications()
const requesting = ref(false)

// Show banner when: native platform AND permission not granted (per D-24: stays until granted)
const showBanner = computed(() => {
  return isNative && store.permissionStatus !== 'granted'
})

async function handleEnable() {
  requesting.value = true
  try {
    const granted = await requestPermission()
    if (granted) {
      log.info('Notification permission granted from banner')
    } else {
      log.info('Notification permission still denied after banner tap')
    }
  } catch (err: unknown) {
    log.error('Permission request failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    requesting.value = false
  }
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.permission-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, $primary, #804d34);
  border-radius: 12px;
  padding: 12px 14px;
  gap: 10px;
}

.permission-banner__content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.permission-banner__icon {
  flex-shrink: 0;
}

.permission-banner__text {
  font-size: 13px;
  color: white;
  line-height: 1.3;
}

.permission-banner__btn {
  color: white;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  border: 1px solid rgba(white, 0.3);
  border-radius: 8px;
  padding: 4px 12px;
}
</style>
