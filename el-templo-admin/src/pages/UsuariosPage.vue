<template>
  <!-- Phase 110 v1: form per-role (country / multi-sede) — deploy redeploy trigger -->
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

      <!-- Status column (Phase 103-06: reads staffDisabled with semantic
           inversion — staffDisabled=false = "Activo" positive, true = grey) -->
      <template #body-cell-estado="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.staffDisabled ? 'grey' : 'positive'"
            :label="props.row.staffDisabled ? 'Inactivo' : 'Activo'"
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
            :icon="props.row.staffDisabled ? 'check_circle' : 'block'"
            :color="props.row.staffDisabled ? 'positive' : 'negative'"
            @click="handleToggleStatus(props.row)"
          >
            <q-tooltip>{{ props.row.staffDisabled ? 'Activar' : 'Desactivar' }}</q-tooltip>
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
          <!-- Phase 110 D-11: País selector for admin/gestion roles. -->
          <q-select
            v-if="needsCountry"
            v-model="form.country"
            label="País"
            :options="countryOptions"
            emit-value
            map-options
            outlined
            dense
            :rules="[(v: string | null) => !!v || 'Requerido']"
          />
          <q-select
            v-if="needsBranch"
            v-model="form.branchId"
            label="Sede principal"
            hint="La sede que ve por default al usar la app de miembros para entrenar (no afecta su alcance de gestión ni operativo)."
            :options="branches"
            option-value="id"
            option-label="name"
            emit-value
            map-options
            outlined
            dense
            :rules="[(v: number | null) => v !== null || 'Requerido']"
          />
          <!-- Phase 110 D-11: multi-select operativo para coach/recepción.
               Lista con checkboxes (q-option-group) — más obvio que es
               multi-select que un dropdown con chips. -->
          <div v-if="needsOperationalBranches" class="q-mt-md">
            <div class="text-caption text-grey-7 q-mb-xs">
              Sedes operativas
              <span class="text-caption text-grey-6">
                — sedes donde trabaja (toma asistencia, da clase, atiende mostrador)
              </span>
            </div>
            <q-option-group
              v-model="form.branchIds"
              :options="branches.map((b) => ({ label: b.name, value: b.id }))"
              type="checkbox"
              color="primary"
              dense
            />
            <div v-if="form.branchIds.length === 0" class="text-negative text-caption q-mt-xs">
              Requerido al menos una sede
            </div>
          </div>
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
import { ref, computed, onMounted } from 'vue';
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
  // Phase 110 D-11: country only required for admin/gestion; branchIds only required for coach/recepción.
  country: null as 'AR' | 'ES' | null,
  branchIds: [] as number[],
});

// =========================================================================
// Constants
// =========================================================================

const roleOptions = [
  { label: 'Coach', value: 'coach' },
  { label: 'Admin', value: 'admin' },
  { label: 'Owner', value: 'owner' },
  { label: 'Gestion', value: 'gestion' },
  { label: 'Recepcion', value: 'recepcion' },
];

const BRANCH_ROLES = new Set(['admin', 'coach', 'gestion', 'recepcion']);
const needsBranch = computed(() => BRANCH_ROLES.has(form.value.role));

// Phase 110 D-11: roles that need País selector (country-wide scope).
const COUNTRY_ROLES = new Set(['admin', 'gestion']);
// Phase 110 D-11: roles that need multi-sede selector (per-branch scope).
const OPERATIONAL_BRANCH_ROLES = new Set(['coach', 'recepcion']);

const needsCountry = computed(() => COUNTRY_ROLES.has(form.value.role));
const needsOperationalBranches = computed(() => OPERATIONAL_BRANCH_ROLES.has(form.value.role));

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

const ROLE_COLORS: Record<string, string> = {
  owner: 'deep-purple',
  admin: 'blue',
  coach: 'teal',
  gestion: 'orange',
  recepcion: 'pink',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  gestion: 'Gestion',
  recepcion: 'Recepcion',
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
    name: 'estado',
    label: 'Estado',
    // Phase 103-06: column sorts on staffDisabled (semantic inversion —
    // grey/Inactivo bubble to one end of the sort, positive/Activo to the
    // other; users sort intuitively because the badge mirrors the column).
    field: 'staffDisabled',
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
    country: null,
    branchIds: [],
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
    // Phase 110: pre-populate new staff-scope fields from the row.
    country: user.country,
    branchIds: [...user.branchIds],
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
    // Phase 110: only send country/branchIds when the (effective) role needs
    // them. Sending `country: null` to AJV trips the enum validator
    // ("must be equal to one of the allowed values") because the OpenAPI
    // `nullable: true` flag is a no-op in Fastify/Ajv default config. The
    // backend handles `undefined` as "inherit current value" (Plan 05
    // updateStaff lines 274-285), so omitting the field is safer and
    // semantically equivalent to "don't change this dimension".
    if (needsCountry.value) {
      input.country = form.value.country;
    }
    if (needsOperationalBranches.value) {
      input.branchIds = form.value.branchIds;
    }

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
    const branchRequired = BRANCH_ROLES.has(form.value.role);
    const countryRequired = needsCountry.value;
    const operationalBranchesRequired = needsOperationalBranches.value;
    if (
      !form.value.firstName ||
      !form.value.lastName ||
      !form.value.email ||
      !form.value.password ||
      !form.value.role ||
      (branchRequired && form.value.branchId === null) ||
      (countryRequired && !form.value.country) ||
      (operationalBranchesRequired && form.value.branchIds.length === 0)
    ) {
      $q.notify({ type: 'warning', message: 'Completa todos los campos requeridos' });
      return;
    }

    // Admin/owner don't need a branch, but DB requires one — assign first branch
    const branchId = branchRequired
      ? form.value.branchId!
      : (form.value.branchId ?? branches.value[0]?.id ?? 1);

    try {
      // Phase 110: build payload conditionally — sending `country: null`
      // trips AJV's enum validator (Fastify default Ajv config ignores
      // `nullable: true`). Backend handles missing fields as defaults
      // (Plan 05 schema + service: country defaults to NULL on insert,
      // branchIds defaults to []).
      const createPayload: Parameters<typeof usersApi.createUser>[0] = {
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        email: form.value.email,
        password: form.value.password,
        role: form.value.role as 'coach' | 'admin' | 'owner' | 'gestion' | 'recepcion',
        branchId,
      };
      if (countryRequired && form.value.country) {
        createPayload.country = form.value.country;
      }
      if (operationalBranchesRequired) {
        createPayload.branchIds = form.value.branchIds;
      }
      await usersApi.createUser(createPayload);
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
  // Phase 103-06: UX wording stays identical (Activar/Desactivar usuario);
  // internal booleans flip from `isActive` (true=enabled) to `staffDisabled`
  // (true=disabled). The new desired payload is `disabled: !user.staffDisabled`.
  const isCurrentlyActive = !user.staffDisabled;
  const action = isCurrentlyActive ? 'desactivado' : 'activado';
  const title = isCurrentlyActive ? 'Desactivar usuario' : 'Activar usuario';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const message = isCurrentlyActive
    ? `El usuario ${name} sera desactivado. Los usuarios desactivados no pueden iniciar sesion.`
    : `El usuario ${name} sera activado.`;

  $q.dialog({
    title,
    message,
    cancel: { flat: true, label: 'Cancelar' },
    ok: {
      color: isCurrentlyActive ? 'negative' : 'positive',
      label: isCurrentlyActive ? 'Desactivar' : 'Activar',
    },
  }).onOk(async () => {
    try {
      // The new desired `disabled` value is the opposite of the current
      // `staffDisabled` (toggle the persisted state).
      await usersApi.setStaffDisabled(user.id, !user.staffDisabled);
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
