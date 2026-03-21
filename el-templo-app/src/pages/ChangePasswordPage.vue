<template>
  <q-page padding>
    <q-card class="q-mx-auto" style="max-width: 500px">
      <q-card-section>
        <div class="text-h5">Cambiar Contraseña</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit.prevent="onChangePassword" class="q-gutter-sm">
          <q-input
            v-model="currentPassword"
            label="Contraseña actual"
            type="password"
            dense
            outlined
            :rules="[(v: string) => !!v || 'Requerido']"
          />
          <q-input
            v-model="newPassword"
            label="Nueva contraseña"
            type="password"
            dense
            outlined
            :rules="[
              (v: string) => !!v || 'Requerido',
              (v: string) => v.length >= 6 || 'Minimo 6 caracteres',
            ]"
          />
          <q-input
            v-model="confirmPassword"
            label="Confirmar nueva contraseña"
            type="password"
            dense
            outlined
            :rules="[(v: string) => v === newPassword || 'Las contraseñas no coinciden']"
          />
          <div class="row q-gutter-sm q-mt-sm">
            <q-btn flat label="Volver" to="/profile" no-caps />
            <q-btn
              type="submit"
              color="primary"
              label="Cambiar contraseña"
              :loading="changingPassword"
              no-caps
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { api } from 'boot/axios'
import { extractError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ChangePasswordPage')
const $q = useQuasar()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)

async function onChangePassword() {
  changingPassword.value = true
  try {
    await api.post('/auth/me/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    $q.notify({ type: 'positive', message: 'Contraseña actualizada' })
    router.push('/profile')
  } catch (err: unknown) {
    const message = extractError(err, 'Error cambiando contraseña')
    log.error('Error changing password', { error: message })
    $q.notify({ type: 'negative', message })
  } finally {
    changingPassword.value = false
  }
}
</script>
