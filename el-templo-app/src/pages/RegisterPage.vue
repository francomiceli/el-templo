<template>
  <q-page class="flex flex-center">
    <q-card class="q-pa-md" style="width: 400px; max-width: 90vw">
      <q-card-section>
        <div class="text-h5 text-center">Crear Cuenta</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-md">
          <q-input
            v-model="firstName"
            label="Nombre"
            outlined
          />

          <q-input
            v-model="lastName"
            label="Apellido"
            outlined
          />

          <q-input
            v-model="email"
            type="email"
            label="Email"
            :rules="emailRules"
            lazy-rules
            outlined
          />

          <q-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Contrasena"
            :rules="passwordRules"
            lazy-rules
            outlined
          >
            <template v-slot:append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            label="Confirmar Contrasena"
            :rules="confirmPasswordRules"
            lazy-rules
            outlined
          />

          <q-select
            v-model="branchId"
            :options="branchOptions"
            label="Sucursal"
            :rules="branchRules"
            emit-value
            map-options
            outlined
          />

          <q-btn
            type="submit"
            color="primary"
            label="Crear Cuenta"
            :loading="loading"
            class="full-width"
          />
        </q-form>
      </q-card-section>

      <q-card-section class="text-center">
        <router-link to="/login" class="text-primary">
          Ya tienes cuenta? Inicia sesion
        </router-link>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'stores/useAuthStore';

const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();

const firstName = ref('');
const lastName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const branchId = ref(null);
const showPassword = ref(false);
const loading = ref(false);

// Hardcoded branch options until branches API exists
const branchOptions = [
  { label: 'Matriz', value: 1 },
  { label: 'Norte', value: 2 },
  { label: 'Sur', value: 3 },
  { label: 'Centro', value: 4 },
  { label: 'Playa', value: 5 },
];

const emailRules = [
  (val) => !!val || 'El email es requerido',
  (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Email invalido',
];

const passwordRules = [
  (val) => !!val || 'La contrasena es requerida',
  (val) => val.length >= 8 || 'Minimo 8 caracteres',
];

const confirmPasswordRules = [
  (val) => !!val || 'Confirma tu contrasena',
  (val) => val === password.value || 'Las contrasenas no coinciden',
];

const branchRules = [(val) => !!val || 'Selecciona una sucursal'];

async function onSubmit() {
  loading.value = true;
  try {
    await authStore.register({
      email: email.value,
      password: password.value,
      branchId: branchId.value,
      firstName: firstName.value || undefined,
      lastName: lastName.value || undefined,
    });
    $q.notify({
      type: 'positive',
      message: 'Cuenta creada exitosamente',
    });
    router.push('/');
  } catch (err) {
    const axiosError = err;
    $q.notify({
      type: 'negative',
      message: axiosError?.response?.data?.error || 'Error al crear cuenta',
    });
  } finally {
    loading.value = false;
  }
}
</script>
