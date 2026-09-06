<template>
  <q-page padding>
    <h4 class="q-mt-none q-mb-md">Academy — Consultas</h4>

    <!-- Loading -->
    <div v-if="loading" class="row justify-center q-pa-xl">
      <q-spinner size="40px" color="primary" />
    </div>

    <!-- Error -->
    <q-banner v-else-if="error" class="bg-negative text-white q-mb-md">
      <template #avatar>
        <q-icon name="error" />
      </template>
      {{ error }}
    </q-banner>

    <!-- Empty state -->
    <div v-else-if="inquiries.length === 0" class="text-center q-pa-xl text-grey-6">
      No hay consultas de Academy a&uacute;n.
    </div>

    <!-- Table -->
    <q-table
      v-else
      :rows="inquiries"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :pagination="{ rowsPerPage: 20 }"
    >
      <!-- Status column with badge + inline select (same pattern as Labs) -->
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-select
            v-model="props.row.status"
            :options="statusOptions"
            dense
            borderless
            emit-value
            map-options
            style="min-width: 120px"
            @update:model-value="(val: string) => updateStatus(props.row.id, val)"
          >
            <template #selected>
              <q-badge
                :color="statusColors[props.row.status] ?? 'grey'"
                :label="statusLabels[props.row.status] ?? props.row.status"
              />
            </template>
          </q-select>
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';

interface AcademyInquiry {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  nivelInteres: string;
  modalidad: string;
  experiencia: string;
  alumnoElTemplo: string;
  origen: string;
  mensaje: string | null;
  createdAt: string;
  status: string;
}

const authStore = useAuthStore();
const adminStore = useAdminStore();
const inquiries = ref<AcademyInquiry[]>([]);
const loading = ref(true);
const error = ref('');

const statusColors: Record<string, string> = {
  new: 'primary',
  contacted: 'warning',
  closed: 'positive',
};

const statusLabels: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  closed: 'Cerrado',
};

const statusOptions = [
  { label: 'Nuevo', value: 'new' },
  { label: 'Contactado', value: 'contacted' },
  { label: 'Cerrado', value: 'closed' },
];

const nivelLabels: Record<string, string> = {
  'nivel-1-trainer': 'Nivel 1 \u2014 Trainer',
  'nivel-2-olympic-trainer': 'Nivel 2 \u2014 Olympic Trainer',
  'nivel-3-spartan-trainer': 'Nivel 3 \u2014 Spartan Trainer',
};

const columns = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: 'nombre',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'email',
    label: 'Email',
    field: 'email',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'nivelInteres',
    label: 'Nivel de Inter\u00E9s',
    field: 'nivelInteres',
    align: 'left' as const,
    sortable: true,
    format: (val: string) => nivelLabels[val] || val,
  },
  {
    name: 'status',
    label: 'Estado',
    field: 'status',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'createdAt',
    label: 'Fecha',
    field: 'createdAt',
    align: 'left' as const,
    sortable: true,
    format: (val: string) =>
      new Date(val).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
  },
];

async function fetchInquiries(): Promise<void> {
  loading.value = true;
  error.value = '';

  try {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/academy/admin/inquiries`, {
      headers: {
        Authorization: `Bearer ${authStore.token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    inquiries.value = await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = `Error al cargar consultas: ${message}`;
  } finally {
    loading.value = false;
  }
}

async function updateStatus(id: number, status: string): Promise<void> {
  try {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/academy/admin/inquiries/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    // La pelotita de "Academy" en el drawer cuenta las consultas en estado "new".
    void adminStore.fetchLandingInbox();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = `Error al actualizar estado: ${message}`;
    // Reload to revert optimistic update
    await fetchInquiries();
  }
}

onMounted(() => {
  fetchInquiries();
});
</script>
