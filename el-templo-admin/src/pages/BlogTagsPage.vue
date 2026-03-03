<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Tags del Blog</div>
      <q-space />
      <q-btn color="primary" icon="add" label="Nuevo Tag" @click="openCreateDialog" />
    </div>

    <!-- Tags table -->
    <q-table
      :rows="tags"
      :columns="columns"
      row-key="id"
      :loading="loading"
      flat
      bordered
      :pagination="{ rowsPerPage: 50 }"
    >
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense icon="edit" color="primary" @click="openEditDialog(props.row)">
            <q-tooltip>Editar</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="delete" color="negative" @click="confirmDelete(props.row)">
            <q-tooltip>Eliminar</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Create/Edit dialog -->
    <q-dialog v-model="dialogOpen" persistent>
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">{{ editingTag ? 'Editar Tag' : 'Nuevo Tag' }}</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model="dialogForm.name"
            label="Nombre *"
            outlined
            dense
            autofocus
            :rules="[(v: string) => !!v || 'Nombre es requerido']"
          />
          <q-input
            v-model="dialogForm.slug"
            label="Slug"
            outlined
            dense
            class="q-mt-sm"
            hint="Auto-generado si vacio"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" @click="dialogOpen = false" />
          <q-btn
            color="primary"
            :label="editingTag ? 'Guardar' : 'Crear'"
            :loading="saving"
            @click="handleSaveTag"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Notify, useQuasar } from 'quasar';
import { useBlogApi } from 'src/composables/useBlogApi';
import type { BlogTag } from 'src/composables/useBlogApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('BlogTagsPage');
const $q = useQuasar();
const blogApi = useBlogApi();

const tags = ref<BlogTag[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogOpen = ref(false);
const editingTag = ref<BlogTag | null>(null);
const dialogForm = reactive({ name: '', slug: '' });

const columns = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' as const, sortable: true },
  { name: 'slug', label: 'Slug', field: 'slug', align: 'left' as const, sortable: true },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' as const },
];

async function loadTags() {
  loading.value = true;
  try {
    const result = await blogApi.listAdminTags();
    tags.value = result.tags;
  } catch (err: unknown) {
    log.error('Failed to load tags', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  editingTag.value = null;
  dialogForm.name = '';
  dialogForm.slug = '';
  dialogOpen.value = true;
}

function openEditDialog(tag: BlogTag) {
  editingTag.value = tag;
  dialogForm.name = tag.name;
  dialogForm.slug = tag.slug;
  dialogOpen.value = true;
}

async function handleSaveTag() {
  if (!dialogForm.name.trim()) {
    Notify.create({ type: 'warning', message: 'El nombre es requerido' });
    return;
  }

  saving.value = true;
  try {
    if (editingTag.value) {
      await blogApi.updateTag(editingTag.value.id, {
        name: dialogForm.name.trim(),
        slug: dialogForm.slug.trim() || undefined,
      });
      Notify.create({ type: 'positive', message: 'Tag actualizado' });
    } else {
      await blogApi.createTag({
        name: dialogForm.name.trim(),
        slug: dialogForm.slug.trim() || undefined,
      });
      Notify.create({ type: 'positive', message: 'Tag creado' });
    }
    dialogOpen.value = false;
    await loadTags();
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

function confirmDelete(tag: BlogTag) {
  $q.dialog({
    title: 'Eliminar Tag',
    message: `¿Eliminar el tag "${tag.name}"? Se desvinculará de todos los posts.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await blogApi.deleteTag(tag.id);
      Notify.create({ type: 'positive', message: 'Tag eliminado' });
      await loadTags();
    } catch {
      // Error handled by composable
    }
  });
}

onMounted(() => {
  loadTags();
});
</script>
