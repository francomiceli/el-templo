<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Usuarios</div>
      <q-btn icon="add" label="Nuevo Usuario" color="primary" @click="openCreateDialog" />
    </div>

    <!-- QTable -->
    <q-table
      :rows="usersApi.users.value"
      :columns="columns"
      row-key="id"
      :loading="usersApi.loading.value"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[20, 50, 100]"
      flat
      bordered
    >
      <!-- Name column -->
      <template #body-cell-nombre="props">
        <q-td :props="props"> {{ props.row.firstName ?? '' }} {{ props.row.lastName ?? '' }} </q-td>
      </template>

      <!-- Role column -->
      <template #body-cell-rol="props">
        <q-td :props="props">
          <q-badge :color="roleColor(props.row.role)" :label="roleLabel(props.row.role)" />
        </q-td>
      </template>

      <!-- Branch column -->
      <template #body-cell-sede="props">
        <q-td :props="props">
          {{ props.row.branchName ?? '-' }}
        </q-td>
      </template>

      <!-- Status column -->
      <template #body-cell-estado="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.isActive ? 'positive' : 'grey'"
            :label="props.row.isActive ? 'Activo' : 'Inactivo'"
          />
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-acciones="props">
        <q-td :props="props">
          <q-btn flat dense round icon="edit" color="primary" @click="openEditDialog(props.row)">
            <q-tooltip>Editar</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            round
            :icon="props.row.isActive ? 'block' : 'check_circle'"
            :color="props.row.isActive ? 'negative' : 'positive'"
            @click="handleToggleStatus(props.row)"
          >
            <q-tooltip>{{ props.row.isActive ? 'Desactivar' : 'Activar' }}</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="dialogOpen" persistent>
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">{{ editingUser ? 'Editar Usuario' : 'Nuevo Usuario' }}</div>
        </q-card-section>

        <q-card-section class="q-gutter-sm">
          <q-input
            v-model="form.firstName"
            label="Nombre"
            outlined
            dense
            :rules="editingUser ? [] : [(v: string) => !!v || 'Requerido']"
          />
          <q-input
            v-model="form.lastName"
            label="Apellido"
            outlined
            dense
            :rules="editingUser ? [] : [(v: string) => !!v || 'Requerido']"
          />
          <q-input
            v-model="form.email"
            label="Email"
            type="email"
            outlined
            dense
            :rules="editingUser ? [] : [(v: string) => !!v || 'Requerido']"
          />
          <q-input
            v-model="form.password"
            :label="editingUser ? 'Contrasena (dejar vacio para no cambiar)' : 'Contrasena'"
            type="password"
            outlined
            dense
            :rules="editingUser ? [] : [(v: string) => !!v || 'Requerido']"
          />
          <q-select
            v-model="form.role"
            label="Rol"
            :options="roleOptions"
            emit-value
            map-options
            outlined
            dense
            :rules="[(v: string) => !!v || 'Requerido']"
          />
          <q-select
            v-model="form.branchId"
            label="Sede"
            :options="branches"
            option-value="id"
            option-label="name"
            emit-value
            map-options
            outlined
            dense
            :rules="[(v: number | null) => v !== null || 'Requerido']"
          />
        </q-card-section>

        <q-card-section v-if="usersApi.error.value" class="text-negative q-pt-none">
          {{ usersApi.error.value }}
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" @click="dialogOpen = false" />
          <q-btn
            color="primary"
            label="Guardar"
            :loading="usersApi.loading.value"
            @click="handleSave"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useUsersApi, type StaffUser } from 'src/composables/useUsersApi';
import { api } from 'src/boot/axios';

const log = createLogger('UsuariosPage');
const $q = useQuasar();
const usersApi = useUsersApi();

// =========================================================================
// State
// =========================================================================

const dialogOpen = ref(false);
const editingUser = ref<StaffUser | null>(null);
const branches = ref<{ id: number; name: string }[]>([]);

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: '' as string,
  branchId: null as number | null,
});

// =========================================================================
// Constants
// =========================================================================

const roleOptions = [
  { label: 'Coach', value: 'coach' },
  { label: 'Admin', value: 'admin' },
  { label: 'Owner', value: 'owner' },
  { label: 'Recepcionista', value: 'recepcionista' },
];

const ROLE_COLORS: Record<string, string> = {
  owner: 'deep-purple',
  admin: 'blue',
  coach: 'teal',
  recepcionista: 'orange',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  recepcionista: 'Recepcionista',
};

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: (row: StaffUser) => `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
    align: 'left',
    sortable: true,
  },
  {
    name: 'email',
    label: 'Email',
    field: 'email',
    align: 'left',
    sortable: true,
  },
  {
    name: 'rol',
    label: 'Rol',
    field: 'role',
    align: 'left',
    sortable: true,
    style: 'width: 130px',
  },
  {
    name: 'sede',
    label: 'Sede',
    field: 'branchName',
    align: 'left',
    sortable: true,
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'isActive',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
];

// =========================================================================
// Helpers
// =========================================================================

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? 'grey';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadUsers() {
  try {
    await usersApi.fetchUsers();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading users', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando usuarios' });
  }
}

async function loadBranches() {
  try {
    const { data } = await api.get<{ branches: { id: number; name: string }[] }>(
      '/admin/members/branches'
    );
    branches.value = data.branches;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

// =========================================================================
// Dialog actions
// =========================================================================

function resetForm() {
  form.value = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: '',
    branchId: null,
  };
  usersApi.error.value = null;
}

function openCreateDialog() {
  resetForm();
  editingUser.value = null;
  dialogOpen.value = true;
}

function openEditDialog(user: StaffUser) {
  editingUser.value = user;
  form.value = {
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email,
    password: '',
    role: user.role,
    branchId: user.branchId,
  };
  usersApi.error.value = null;
  dialogOpen.value = true;
}

async function handleSave() {
  if (editingUser.value) {
    // Edit mode: build partial update input
    const input: Record<string, unknown> = {};
    if (form.value.firstName) input.firstName = form.value.firstName;
    if (form.value.lastName) input.lastName = form.value.lastName;
    if (form.value.email) input.email = form.value.email;
    if (form.value.password) input.password = form.value.password;
    if (form.value.role) input.role = form.value.role;
    if (form.value.branchId !== null) input.branchId = form.value.branchId;

    try {
      await usersApi.updateUser(editingUser.value.id, input);
      dialogOpen.value = false;
      $q.notify({ type: 'positive', message: 'Usuario actualizado' });
      await loadUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error updating user', { error: message });
    }
  } else {
    // Create mode: validate required fields
    if (
      !form.value.firstName ||
      !form.value.lastName ||
      !form.value.email ||
      !form.value.password ||
      !form.value.role ||
      form.value.branchId === null
    ) {
      $q.notify({ type: 'warning', message: 'Completa todos los campos requeridos' });
      return;
    }

    try {
      await usersApi.createUser({
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        email: form.value.email,
        password: form.value.password,
        role: form.value.role as 'coach' | 'admin' | 'owner' | 'recepcionista',
        branchId: form.value.branchId,
      });
      dialogOpen.value = false;
      $q.notify({ type: 'positive', message: 'Usuario creado' });
      await loadUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error creating user', { error: message });
    }
  }
}

function handleToggleStatus(user: StaffUser) {
  const action = user.isActive ? 'desactivado' : 'activado';
  const title = user.isActive ? 'Desactivar usuario' : 'Activar usuario';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const message = user.isActive
    ? `El usuario ${name} sera desactivado. Los usuarios desactivados no pueden iniciar sesion.`
    : `El usuario ${name} sera activado.`;

  $q.dialog({
    title,
    message,
    cancel: { flat: true, label: 'Cancelar' },
    ok: {
      color: user.isActive ? 'negative' : 'positive',
      label: user.isActive ? 'Desactivar' : 'Activar',
    },
  }).onOk(async () => {
    try {
      await usersApi.toggleUserStatus(user.id);
      $q.notify({ type: 'positive', message: `Usuario ${action}` });
      await loadUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error toggling user status', { error: message });
      $q.notify({ type: 'negative', message: `Error al ${action.slice(0, -1)}r usuario` });
    }
  });
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadUsers();
  loadBranches();
});
</script>
