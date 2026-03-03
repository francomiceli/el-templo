<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <h4 class="q-mt-none q-mb-none">App Waitlist</h4>
      <q-space />
      <q-btn
        v-if="entries.length > 0"
        icon="download"
        label="Exportar CSV"
        color="primary"
        outline
        dense
        @click="exportCsv"
      />
    </div>

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
    <div v-else-if="entries.length === 0" class="text-center q-pa-xl text-grey-6">
      No hay registros de lista de espera a&uacute;n.
    </div>

    <!-- Table -->
    <q-table
      v-else
      :rows="entries"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :pagination="{ rowsPerPage: 20 }"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from 'src/stores/useAuthStore';

interface WaitlistEntry {
  id: number;
  nombre: string;
  email: string;
  moduloInteres: string;
  ciudadPais: string | null;
  createdAt: string;
  status: string;
}

const moduloLabels: Record<string, string> = {
  'olympic-academy': 'Olympic Academy',
  labs: 'Labs',
};

function formatModulos(val: string): string {
  return val
    .split(',')
    .map((slug) => moduloLabels[slug.trim()] || slug.trim())
    .join(', ');
}

const authStore = useAuthStore();
const entries = ref<WaitlistEntry[]>([]);
const loading = ref(true);
const error = ref('');

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
    name: 'moduloInteres',
    label: 'M\u00F3dulos Interesados',
    field: 'moduloInteres',
    align: 'left' as const,
    sortable: true,
    format: (val: string) => formatModulos(val),
  },
  {
    name: 'ciudadPais',
    label: 'Ciudad/Pa\u00EDs',
    field: 'ciudadPais',
    align: 'left' as const,
    sortable: true,
    format: (val: string | null) => val ?? '\u2014',
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

async function fetchEntries(): Promise<void> {
  loading.value = true;
  error.value = '';

  try {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/app/admin/waitlist`, {
      headers: {
        Authorization: `Bearer ${authStore.token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    entries.value = await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = `Error al cargar registros: ${message}`;
  } finally {
    loading.value = false;
  }
}

function exportCsv(): void {
  if (!entries.value.length) return;

  const headers = ['Nombre', 'Email', 'Modulos Interesados', 'Ciudad/Pais', 'Fecha'];
  const rows = entries.value.map((e) => [
    e.nombre,
    e.email,
    e.moduloInteres,
    e.ciudadPais ?? '',
    new Date(e.createdAt).toLocaleDateString('es-AR'),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `app-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  fetchEntries();
});
</script>
