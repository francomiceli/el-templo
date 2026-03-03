<template>
  <q-page padding>
    <h4 class="q-mt-none q-mb-md">Labs &mdash; Consultas</h4>

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
      No hay consultas de Labs a&uacute;n.
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
      <!-- Status column with badge + inline select -->
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

interface LabsInquiry {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  nombreGimnasio: string;
  ciudadPais: string;
  cantidadSocios: string;
  sistemaActual: string;
  mensaje: string | null;
  createdAt: string;
  status: string;
}

const authStore = useAuthStore();
const inquiries = ref<LabsInquiry[]>([]);
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

const cantidadSociosLabels: Record<string, string> = {
  'menos-de-50': 'Menos de 50',
  '50-200': '50-200',
  '200-500': '200-500',
  'mas-de-500': 'M\u00E1s de 500',
};

const sistemaActualLabels: Record<string, string> = {
  ninguno: 'Ninguno',
  excel: 'Excel',
  fitco: 'Fitco',
  crosshero: 'CrossHero',
  otro: 'Otro',
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
    name: 'nombreGimnasio',
    label: 'Gimnasio',
    field: 'nombreGimnasio',
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
    name: 'ciudadPais',
    label: 'Ciudad/Pa\u00EDs',
    field: 'ciudadPais',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'cantidadSocios',
    label: 'Socios',
    field: 'cantidadSocios',
    align: 'left' as const,
    sortable: true,
    format: (val: string) => cantidadSociosLabels[val] ?? val,
  },
  {
    name: 'sistemaActual',
    label: 'Sistema',
    field: 'sistemaActual',
    align: 'left' as const,
    sortable: true,
    format: (val: string) => sistemaActualLabels[val] ?? val,
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
    const res = await fetch(`${baseUrl}/app/admin/labs-inquiries`, {
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
    const res = await fetch(`${baseUrl}/app/admin/labs-inquiries/${id}/status`, {
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
