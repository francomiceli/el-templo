<template>
  <q-page class="change-password-page" padding>
    <!-- Header -->
    <div class="change-password-page__header">
      <q-btn flat round icon="arrow_back" color="primary" @click="$router.push('/profile')" />
      <span class="change-password-page__title">Cambiar Contraseña</span>
    </div>

    <!-- Form Card -->
    <div class="form-card">
      <q-form @submit.prevent="onChangePassword" class="form-card__form">
        <q-input
          v-model="currentPassword"
          label="Contraseña actual"
          type="password"
          dense
          borderless
          class="form-card__input"
          :rules="[(v: string) => !!v || 'Requerido']"
        />
        <div class="form-card__divider" />
        <q-input
          v-model="newPassword"
          label="Nueva contraseña"
          type="password"
          dense
          borderless
          class="form-card__input"
          :rules="[
            (v: string) => !!v || 'Requerido',
            (v: string) => v.length >= 6 || 'Minimo 6 caracteres',
          ]"
        />
        <div class="form-card__divider" />
        <q-input
          v-model="confirmPassword"
          label="Confirmar nueva contraseña"
          type="password"
          dense
          borderless
          class="form-card__input"
          :rules="[(v: string) => v === newPassword || 'Las contraseñas no coinciden']"
        />

        <q-btn
          type="submit"
          color="primary"
          label="Cambiar contraseña"
          :loading="changingPassword"
          no-caps
          unelevated
          class="form-card__btn q-mt-lg"
        />
      </q-form>
    </div>
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

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.change-password-page {
  max-width: 600px;
  margin: 0 auto;
}

.change-password-page__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 16px;
}

.change-password-page__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: $primary;
}

.form-card {
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;
  padding: 16px;
}

.form-card__input {
  :deep(.q-field__control) {
    padding: 4px 0;
  }

  :deep(.q-field__label) {
    font-size: 13px;
    color: rgba($primary, 0.5);
  }

  :deep(.q-field__native) {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: $primary;
  }
}

.form-card__divider {
  height: 1px;
  background: rgba($primary, 0.08);
  margin: 4px 0;
}

.form-card__btn {
  width: 100%;
  border-radius: 8px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
}
</style>
