<template>
  <q-dialog v-model="show" persistent>
    <q-card class="push-dialog">
      <q-card-section class="push-dialog__icon">
        <q-icon name="notifications_active" size="40px" />
      </q-card-section>

      <q-card-section class="push-dialog__body">
        <h3 class="push-dialog__title">Activá las notificaciones</h3>
        <p class="push-dialog__text">
          Te avisamos cuando tengas una clase pronto, comunicaciones importantes, sorteos y
          beneficios.
        </p>
      </q-card-section>

      <q-card-actions class="push-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="push-dialog__primary full-width"
          :loading="requesting"
          label="Activar"
          @click="onActivate"
        />
        <q-btn
          flat
          no-caps
          dense
          class="push-dialog__secondary"
          :disable="requesting"
          label="Ahora no"
          @click="onDismiss"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from 'stores/useAuthStore'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { usePushNotifications } from 'src/composables/usePushNotifications'
import { createLogger } from 'src/utils/logger'

// Versioned key so we can re-ask on a future release if the pre-prompt copy
// or product intent changes. Bump to `_v2` to re-trigger for all users.
const ASKED_KEY = 'push_permission_asked_v1'

const log = createLogger('PushPermissionDialog')
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const { requestPermission, checkPermission } = usePushNotifications()

const show = ref(false)
const requesting = ref(false)

async function shouldShow(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (!authStore.isAuthenticated) return false

  // Already asked on this device — never show again regardless of the answer.
  const { value: asked } = await Preferences.get({ key: ASKED_KEY })
  if (asked === '1') return false

  // Only show when the OS would actually present a dialog. If the user already
  // granted or denied at the OS level (e.g. via the MiTemplo banner), skip.
  const status = await checkPermission()
  if (status !== 'prompt') {
    // Persist so we don't re-check on every login.
    await Preferences.set({ key: ASKED_KEY, value: '1' })
    return false
  }

  return true
}

async function markAsked() {
  await Preferences.set({ key: ASKED_KEY, value: '1' })
}

async function onActivate() {
  requesting.value = true
  try {
    const granted = await requestPermission()
    log.info('Push pre-prompt activate pressed', { granted })
  } catch (err: unknown) {
    log.error('Permission request failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    requesting.value = false
    await markAsked()
    show.value = false
  }
}

async function onDismiss() {
  log.info('Push pre-prompt dismissed')
  await markAsked()
  show.value = false
}

async function evaluate() {
  if (await shouldShow()) show.value = true
}

// Trigger when the user becomes authenticated (covers login AND already-logged-in
// users opening the app). Runs once per session thanks to the asked flag.
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void evaluate()
  },
  { immediate: true },
)

// Re-check when the store's permission status changes (e.g. user granted via
// MiTemplo banner while this dialog was queued) so we don't race it.
watch(
  () => notificationStore.permissionStatus,
  (status) => {
    if (status !== 'prompt' && show.value) {
      show.value = false
      void markAsked()
    }
  },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

.push-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.push-dialog__icon {
  display: flex;
  justify-content: center;
  padding-bottom: 0;
  color: $terracotta;
}

.push-dialog__body {
  text-align: center;
  padding-top: 8px;
}

.push-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.06em;
  margin: 0 0 12px 0;
  color: $cream;
}

.push-dialog__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.75);
  margin: 0;
}

.push-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.push-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.push-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
