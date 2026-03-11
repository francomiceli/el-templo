<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Blog</div>
      <q-space />
      <q-btn flat icon="label" label="Tags" class="q-mr-sm" @click="openTagsDialog" />
      <q-btn label="Nuevo Post" icon="add" color="primary" to="/blog/new" />
    </div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4">
        <q-input
          v-model="search"
          label="Buscar por titulo"
          dense
          outlined
          clearable
          debounce="300"
          @update:model-value="onSearchChange"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-12 col-sm-4">
        <q-btn-toggle
          v-model="statusFilter"
          toggle-color="primary"
          :options="statusOptions"
          dense
          unelevated
          spread
          @update:model-value="onStatusChange"
        />
      </div>
    </div>

    <!-- Table -->
    <q-table
      :rows="posts"
      :columns="columns"
      row-key="id"
      :loading="blogApi.loading.value"
      :pagination="tablePagination"
      :rows-per-page-options="[10, 25, 50]"
      @request="onTableRequest"
    >
      <!-- Title column: clickable link -->
      <template #body-cell-title="props">
        <q-td :props="props">
          <router-link :to="`/blog/${props.row.id}`" class="text-primary text-weight-medium">
            {{ props.row.title }}
          </router-link>
        </q-td>
      </template>

      <!-- Status column: chip -->
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip
            :color="props.row.status === 'published' ? 'green' : 'grey-5'"
            text-color="white"
            dense
            size="sm"
          >
            {{ props.row.status === 'published' ? 'Publicado' : 'Borrador' }}
          </q-chip>
        </q-td>
      </template>

      <!-- Published date column -->
      <template #body-cell-publishedAt="props">
        <q-td :props="props">
          {{ props.row.publishedAt ? formatDate(props.row.publishedAt) : '-' }}
        </q-td>
      </template>

      <!-- Updated date column -->
      <template #body-cell-updatedAt="props">
        <q-td :props="props">
          {{ formatDate(props.row.updatedAt) }}
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense icon="edit" color="primary" :to="`/blog/${props.row.id}`">
            <q-tooltip>Editar</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            icon="delete"
            color="negative"
            @click="confirmDelete(props.row.id, props.row.title)"
          >
            <q-tooltip>Eliminar</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <!-- Empty state -->
      <template #no-data>
        <div class="full-width row flex-center q-py-xl text-grey-6">
          <q-icon name="article" size="md" class="q-mr-sm" />
          <span>No hay posts{{ statusFilter !== 'all' ? ' con este filtro' : '' }}</span>
        </div>
      </template>
    </q-table>

    <!-- Tags management dialog -->
    <q-dialog v-model="tagsDialogOpen" position="right" full-height>
      <q-card style="width: 400px; max-width: 90vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Tags del Blog</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="tagsDialogOpen = false" />
        </q-card-section>

        <q-card-section>
          <div class="row q-gutter-sm q-mb-md">
            <q-input
              v-model="newTagName"
              dense
              outlined
              placeholder="Nuevo tag..."
              class="col"
              @keyup.enter="handleCreateTag"
            />
            <q-btn
              color="primary"
              icon="add"
              dense
              :loading="savingTag"
              :disable="!newTagName.trim()"
              @click="handleCreateTag"
            />
          </div>

          <q-list separator>
            <q-item v-for="tag in tagsList" :key="tag.id">
              <q-item-section>
                <q-item-label>{{ tag.name }}</q-item-label>
                <q-item-label caption>{{ tag.slug }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn
                  flat
                  dense
                  icon="delete"
                  color="negative"
                  size="sm"
                  @click="confirmDeleteTag(tag)"
                />
              </q-item-section>
            </q-item>
          </q-list>

          <div v-if="tagsList.length === 0 && !loadingTags" class="text-center text-grey-6 q-py-md">
            No hay tags
          </div>
          <q-inner-loading :showing="loadingTags" />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { formatDate } from 'src/utils/format-date';
import { useBlogApi } from 'src/composables/useBlogApi';
import type { BlogPost, BlogTag } from 'src/composables/useBlogApi';

const $q = useQuasar();
const blogApi = useBlogApi();

// =========================================================================
// State
// =========================================================================

const posts = ref<BlogPost[]>([]);
const search = ref('');
const statusFilter = ref<'all' | 'draft' | 'published'>('all');

const tablePagination = ref({
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0,
  sortBy: 'updatedAt' as string | null,
  descending: true,
});

// =========================================================================
// Options
// =========================================================================

const statusOptions = [
  { label: 'Todos', value: 'all' },
  { label: 'Borradores', value: 'draft' },
  { label: 'Publicados', value: 'published' },
];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'title',
    label: 'Titulo',
    field: 'title',
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
    name: 'publishedAt',
    label: 'Publicado',
    field: 'publishedAt',
    align: 'left',
    sortable: true,
    style: 'width: 160px',
  },
  {
    name: 'updatedAt',
    label: 'Actualizado',
    field: 'updatedAt',
    align: 'left',
    sortable: true,
    style: 'width: 160px',
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

async function loadPosts() {
  try {
    const result = await blogApi.listPosts({
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
      status: statusFilter.value,
    });

    posts.value = result.posts;
    tablePagination.value.rowsNumber = result.total;
  } catch {
    // Error handled by composable
  }
}

// =========================================================================
// Helpers
// =========================================================================

// =========================================================================
// Event handlers
// =========================================================================

function onSearchChange() {
  // Client-side search filter: reload from page 1
  tablePagination.value.page = 1;
  loadPosts();
}

function onStatusChange() {
  tablePagination.value.page = 1;
  loadPosts();
}

function onTableRequest(props: {
  pagination: { page: number; rowsPerPage: number; sortBy: string | null; descending: boolean };
}) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  tablePagination.value.sortBy = props.pagination.sortBy;
  tablePagination.value.descending = props.pagination.descending;
  loadPosts();
}

function confirmDelete(postId: number, title: string) {
  $q.dialog({
    title: 'Eliminar Post',
    message: `Eliminar "${title}"? Esta accion no se puede deshacer.`,
    cancel: true,
    persistent: true,
    ok: {
      label: 'Eliminar',
      color: 'negative',
    },
  }).onOk(async () => {
    try {
      await blogApi.deletePost(postId);
      $q.notify({ type: 'positive', message: 'Post eliminado' });
      loadPosts();
    } catch {
      // Error handled by composable
    }
  });
}

// =========================================================================
// Lifecycle
// =========================================================================

// =========================================================================
// Tag management
// =========================================================================

const tagsDialogOpen = ref(false);
const tagsList = ref<BlogTag[]>([]);
const loadingTags = ref(false);
const savingTag = ref(false);
const newTagName = ref('');

async function loadTags() {
  loadingTags.value = true;
  try {
    const result = await blogApi.listAdminTags();
    tagsList.value = result.tags;
  } catch {
    // Error handled by composable
  } finally {
    loadingTags.value = false;
  }
}

function openTagsDialog() {
  tagsDialogOpen.value = true;
  loadTags();
}

async function handleCreateTag() {
  const name = newTagName.value.trim();
  if (!name) return;

  savingTag.value = true;
  try {
    await blogApi.createTag({ name });
    newTagName.value = '';
    $q.notify({ type: 'positive', message: 'Tag creado' });
    await loadTags();
  } catch {
    // Error handled by composable
  } finally {
    savingTag.value = false;
  }
}

function confirmDeleteTag(tag: BlogTag) {
  $q.dialog({
    title: 'Eliminar Tag',
    message: `¿Eliminar "${tag.name}"? Se desvinculará de todos los posts.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await blogApi.deleteTag(tag.id);
      $q.notify({ type: 'positive', message: 'Tag eliminado' });
      await loadTags();
    } catch {
      // Error handled by composable
    }
  });
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadPosts();
});
</script>
