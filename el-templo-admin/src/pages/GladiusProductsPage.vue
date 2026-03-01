<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Gladius - Productos</div>
      <q-space />
      <q-btn label="Agregar Producto" icon="add" color="primary" @click="openAddDialog" />
    </div>

    <!-- Table -->
    <q-table
      :rows="sortedProducts"
      :columns="columns"
      row-key="id"
      :loading="gladiusApi.loading.value"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[25, 50, 100]"
    >
      <!-- Photo column -->
      <template #body-cell-photo="props">
        <q-td :props="props">
          <q-avatar v-if="props.row.photo" square size="40px">
            <img :src="props.row.photo" :alt="props.row.name" />
          </q-avatar>
          <q-avatar v-else square size="40px" color="grey-3" text-color="grey-6" icon="image" />
        </q-td>
      </template>

      <!-- Status column -->
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip
            :color="props.row.status === 'published' ? 'green' : 'grey-5'"
            text-color="white"
            dense
            size="sm"
          >
            {{ props.row.status === 'published' ? 'Publicado' : 'No publicado' }}
          </q-chip>
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense icon="edit" color="primary" @click="openEditDialog(props.row)">
            <q-tooltip>Editar</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            icon="delete"
            color="negative"
            @click="confirmDelete(props.row.id, props.row.name)"
          >
            <q-tooltip>Eliminar</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <!-- Empty state -->
      <template #no-data>
        <div class="full-width row flex-center q-py-xl text-grey-6">
          <q-icon name="fitness_center" size="md" class="q-mr-sm" />
          <span>No hay productos</span>
        </div>
      </template>
    </q-table>

    <!-- Add/Edit Dialog -->
    <q-dialog v-model="dialogOpen" persistent>
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">
            {{ editingProduct ? 'Editar Producto' : 'Agregar Producto' }}
          </div>
        </q-card-section>

        <q-card-section>
          <q-form @submit.prevent="saveProduct" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Nombre *"
              outlined
              dense
              :rules="[(v: string) => !!v || 'Nombre es requerido']"
              @blur="generateSlug"
            />
            <q-input
              v-model="form.description"
              label="Descripcion *"
              outlined
              dense
              type="textarea"
              autogrow
              :rules="[(v: string) => !!v || 'Descripcion es requerida']"
            />
            <q-input v-model="form.photo" label="URL de foto" outlined dense clearable />
            <q-input
              v-model="form.slug"
              label="Slug"
              outlined
              dense
              hint="Auto-generado si vacio"
            />
            <q-select
              v-model="form.status"
              :options="productStatusOptions"
              label="Estado"
              outlined
              dense
              emit-value
              map-options
            />
            <q-input
              v-model.number="form.sortOrder"
              label="Orden"
              outlined
              dense
              type="number"
              :rules="[(v: number) => v >= 0 || 'Debe ser mayor o igual a 0']"
            />
          </q-form>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            color="primary"
            :label="editingProduct ? 'Guardar' : 'Crear'"
            :loading="saving"
            @click="saveProduct"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useGladiusApi } from 'src/composables/useGladiusApi';
import type { GladiusProduct } from 'src/composables/useGladiusApi';

const $q = useQuasar();
const gladiusApi = useGladiusApi();

// =========================================================================
// State
// =========================================================================

const products = ref<GladiusProduct[]>([]);
const dialogOpen = ref(false);
const editingProduct = ref<GladiusProduct | null>(null);
const saving = ref(false);

const form = reactive({
  name: '',
  description: '',
  photo: '',
  slug: '',
  status: 'published' as 'published' | 'unpublished',
  sortOrder: 0,
});

// =========================================================================
// Computed
// =========================================================================

const sortedProducts = computed(() =>
  [...products.value].sort((a, b) => a.sortOrder - b.sortOrder)
);

// =========================================================================
// Options
// =========================================================================

const productStatusOptions = [
  { label: 'Publicado', value: 'published' },
  { label: 'No publicado', value: 'unpublished' },
];

// =========================================================================
// Table columns
// =========================================================================

import type { QTableProps } from 'quasar';

const columns: QTableProps['columns'] = [
  {
    name: 'photo',
    label: 'Foto',
    field: 'photo',
    align: 'center',
    sortable: false,
    style: 'width: 60px',
  },
  {
    name: 'name',
    label: 'Nombre',
    field: 'name',
    align: 'left',
    sortable: false,
  },
  {
    name: 'slug',
    label: 'Slug',
    field: 'slug',
    align: 'left',
    sortable: false,
  },
  {
    name: 'status',
    label: 'Estado',
    field: 'status',
    align: 'center',
    sortable: false,
    style: 'width: 120px',
  },
  {
    name: 'sortOrder',
    label: 'Orden',
    field: 'sortOrder',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
  },
  {
    name: 'actions',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 120px',
  },
];

// =========================================================================
// Data loading
// =========================================================================

async function loadProducts() {
  try {
    products.value = await gladiusApi.listProducts();
  } catch {
    // Error handled by composable
  }
}

// =========================================================================
// Helpers
// =========================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateSlug() {
  if (!form.slug && form.name) {
    form.slug = slugify(form.name);
  }
}

function resetForm() {
  form.name = '';
  form.description = '';
  form.photo = '';
  form.slug = '';
  form.status = 'published';
  form.sortOrder = 0;
  editingProduct.value = null;
}

// =========================================================================
// Dialog handlers
// =========================================================================

function openAddDialog() {
  resetForm();
  dialogOpen.value = true;
}

function openEditDialog(product: GladiusProduct) {
  editingProduct.value = product;
  form.name = product.name;
  form.description = product.description;
  form.photo = product.photo ?? '';
  form.slug = product.slug;
  form.status = product.status;
  form.sortOrder = product.sortOrder;
  dialogOpen.value = true;
}

async function saveProduct() {
  if (!form.name || !form.description) return;

  saving.value = true;
  try {
    const data = {
      name: form.name,
      description: form.description,
      photo: form.photo || undefined,
      slug: form.slug || undefined,
      sortOrder: form.sortOrder,
      status: form.status as 'published' | 'unpublished',
    };

    if (editingProduct.value) {
      await gladiusApi.updateProduct(editingProduct.value.id, data);
      $q.notify({ type: 'positive', message: 'Producto actualizado' });
    } else {
      await gladiusApi.createProduct(data);
      $q.notify({ type: 'positive', message: 'Producto creado' });
    }

    dialogOpen.value = false;
    resetForm();
    loadProducts();
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

// =========================================================================
// Delete
// =========================================================================

function confirmDelete(productId: number, name: string) {
  $q.dialog({
    title: 'Eliminar Producto',
    message: `Eliminar "${name}"? Esta accion no se puede deshacer.`,
    cancel: true,
    persistent: true,
    ok: {
      label: 'Eliminar',
      color: 'negative',
    },
  }).onOk(async () => {
    try {
      await gladiusApi.deleteProduct(productId);
      $q.notify({ type: 'positive', message: 'Producto eliminado' });
      loadProducts();
    } catch {
      // Error handled by composable
    }
  });
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadProducts();
});
</script>
