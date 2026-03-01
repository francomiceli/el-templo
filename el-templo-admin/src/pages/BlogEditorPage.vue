<template>
  <q-page class="q-pa-md">
    <!-- Loading existing post -->
    <q-inner-loading :showing="loadingPost" label="Cargando post..." />

    <template v-if="!loadingPost">
      <!-- Top bar -->
      <div class="row items-center q-mb-md">
        <q-btn flat icon="arrow_back" to="/blog" class="q-mr-sm" />
        <div class="text-h5 ellipsis" style="max-width: 400px">
          {{ form.title || 'Nuevo Post' }}
        </div>
        <q-space />
        <div class="q-gutter-sm">
          <q-btn
            v-if="currentPost?.status === 'published'"
            outline
            color="warning"
            label="Despublicar"
            :loading="saving"
            @click="handleUnpublish"
          />
          <q-btn
            outline
            color="primary"
            label="Guardar Borrador"
            :loading="saving"
            @click="handleSaveDraft"
          />
          <q-btn color="primary" label="Publicar" :loading="saving" @click="handlePublish" />
        </div>
      </div>

      <!-- Form fields -->
      <div class="q-gutter-md q-mb-md">
        <q-input
          v-model="form.title"
          label="Titulo *"
          outlined
          :rules="[(v: string) => !!v || 'Titulo es requerido']"
          class="text-h6"
          @blur="autoGenerateSlug"
        />
        <q-input v-model="form.slug" label="Slug" outlined dense hint="Auto-generado si vacio" />
        <q-input v-model="form.excerpt" label="Extracto" outlined dense type="textarea" rows="2" />
      </div>

      <!-- Cover image -->
      <div class="q-mb-md">
        <div class="text-subtitle2 q-mb-xs">Imagen de portada</div>
        <div class="row items-center q-gutter-sm">
          <q-avatar v-if="form.coverImage" square size="80px" class="q-mr-sm">
            <img :src="form.coverImage" alt="Cover" />
          </q-avatar>
          <q-avatar
            v-else
            square
            size="80px"
            color="grey-3"
            text-color="grey-6"
            icon="image"
            class="q-mr-sm"
          />
          <q-btn
            outline
            color="primary"
            label="Subir Portada"
            icon="upload"
            :loading="imageUpload.uploading.value"
            @click="triggerCoverUpload"
          />
          <q-btn
            v-if="form.coverImage"
            flat
            color="negative"
            icon="close"
            @click="form.coverImage = ''"
          >
            <q-tooltip>Quitar portada</q-tooltip>
          </q-btn>
        </div>
        <input
          ref="coverInputRef"
          type="file"
          accept="image/*"
          style="display: none"
          @change="onCoverFileSelected"
        />
      </div>

      <!-- Toolbar + Editor / Preview -->
      <div class="q-mb-md">
        <div class="row items-center q-mb-xs">
          <div class="text-subtitle2">Contenido</div>
          <q-space />
          <q-btn
            flat
            dense
            :label="showPreview ? 'Editor' : 'Vista Previa'"
            :icon="showPreview ? 'edit' : 'visibility'"
            @click="showPreview = !showPreview"
          />
        </div>

        <!-- Markdown toolbar (visible when not in preview) -->
        <div v-if="!showPreview" class="row q-gutter-xs q-mb-sm">
          <q-btn flat dense icon="format_bold" @click="insertMarkdown('bold')">
            <q-tooltip>Negrita</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="format_italic" @click="insertMarkdown('italic')">
            <q-tooltip>Cursiva</q-tooltip>
          </q-btn>
          <q-btn flat dense @click="insertMarkdown('h2')">
            <span class="text-weight-bold text-caption">H2</span>
            <q-tooltip>Titulo H2</q-tooltip>
          </q-btn>
          <q-btn flat dense @click="insertMarkdown('h3')">
            <span class="text-weight-bold text-caption">H3</span>
            <q-tooltip>Titulo H3</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="link" @click="insertLink">
            <q-tooltip>Enlace</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            icon="image"
            :loading="imageUpload.uploading.value"
            @click="triggerImageUpload"
          >
            <q-tooltip>Imagen</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="format_list_bulleted" @click="insertMarkdown('ul')">
            <q-tooltip>Lista</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="format_list_numbered" @click="insertMarkdown('ol')">
            <q-tooltip>Lista numerada</q-tooltip>
          </q-btn>
        </div>

        <!-- Editor textarea -->
        <textarea
          v-if="!showPreview"
          ref="textareaRef"
          v-model="form.body"
          class="blog-editor-textarea"
          placeholder="Escribe el contenido del post en Markdown..."
          @dragover.prevent
          @drop.prevent="onDrop"
        />

        <!-- Preview -->
        <div v-else class="blog-editor-preview q-pa-md" v-html="renderedPreview" />

        <!-- Hidden file input for body images -->
        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          style="display: none"
          @change="onImageFileSelected"
        />
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Notify, useQuasar } from 'quasar';
import { marked } from 'marked';
import { useBlogApi } from 'src/composables/useBlogApi';
import { useBlogImageUpload } from 'src/composables/useBlogImageUpload';
import { createLogger } from 'src/utils/logger';
import type { BlogPost } from 'src/composables/useBlogApi';

const log = createLogger('BlogEditor');
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const blogApi = useBlogApi();
const imageUpload = useBlogImageUpload();

// =========================================================================
// State
// =========================================================================

const loadingPost = ref(false);
const saving = ref(false);
const showPreview = ref(false);
const currentPost = ref<BlogPost | null>(null);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const coverInputRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  body: '',
});

const isEditMode = computed(() => !!route.params.id);
const postId = computed(() => {
  const id = route.params.id;
  return typeof id === 'string' ? parseInt(id, 10) : null;
});

// =========================================================================
// Preview
// =========================================================================

const renderedPreview = computed(() => {
  if (!form.body) return '<p class="text-grey-6">Sin contenido para previsualizar</p>';
  return marked(form.body) as string;
});

// =========================================================================
// Slug generation
// =========================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function autoGenerateSlug() {
  if (!form.slug && form.title) {
    form.slug = slugify(form.title);
  }
}

// =========================================================================
// Markdown toolbar
// =========================================================================

function insertMarkdown(type: 'bold' | 'italic' | 'h2' | 'h3' | 'ul' | 'ol') {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = form.body.substring(start, end);
  const before = form.body.substring(0, start);
  const after = form.body.substring(end);

  let insertion = '';
  let cursorOffset = 0;

  switch (type) {
    case 'bold':
      insertion = `**${selected || 'texto'}**`;
      cursorOffset = selected ? insertion.length : 2;
      break;
    case 'italic':
      insertion = `*${selected || 'texto'}*`;
      cursorOffset = selected ? insertion.length : 1;
      break;
    case 'h2': {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      insertion = `${prefix}## ${selected || 'Titulo'}`;
      cursorOffset = insertion.length;
      break;
    }
    case 'h3': {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      insertion = `${prefix}### ${selected || 'Subtitulo'}`;
      cursorOffset = insertion.length;
      break;
    }
    case 'ul': {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      insertion = `${prefix}- ${selected || 'elemento'}`;
      cursorOffset = insertion.length;
      break;
    }
    case 'ol': {
      const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
      insertion = `${prefix}1. ${selected || 'elemento'}`;
      cursorOffset = insertion.length;
      break;
    }
  }

  form.body = before + insertion + after;

  // Restore cursor position
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + cursorOffset;
    textarea.setSelectionRange(pos, pos);
  });
}

function insertLink() {
  $q.dialog({
    title: 'Insertar Enlace',
    prompt: {
      model: '',
      type: 'url',
      label: 'URL',
      isValid: (val: string) => !!val,
    },
    cancel: true,
  }).onOk((url: string) => {
    const textarea = textareaRef.value;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.body.substring(start, end) || 'enlace';
    const before = form.body.substring(0, start);
    const after = form.body.substring(end);

    const insertion = `[${selected}](${url})`;
    form.body = before + insertion + after;

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + insertion.length;
      textarea.setSelectionRange(pos, pos);
    });
  });
}

// =========================================================================
// Image upload
// =========================================================================

function triggerImageUpload() {
  if (imageInputRef.value) {
    imageInputRef.value.value = '';
    imageInputRef.value.click();
  }
}

async function onImageFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await uploadAndInsertImage(file);
}

async function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  await uploadAndInsertImage(file);
}

async function uploadAndInsertImage(file: File) {
  try {
    const publicUrl = await imageUpload.uploadImage(file);
    const textarea = textareaRef.value;
    if (!textarea) {
      // Fallback: append to body
      form.body += `\n![image](${publicUrl})\n`;
      return;
    }

    const start = textarea.selectionStart;
    const before = form.body.substring(0, start);
    const after = form.body.substring(start);
    const insertion = `![image](${publicUrl})`;

    form.body = before + insertion + after;

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + insertion.length;
      textarea.setSelectionRange(pos, pos);
    });
  } catch {
    Notify.create({ type: 'negative', message: 'Error al subir imagen' });
  }
}

// =========================================================================
// Cover image
// =========================================================================

function triggerCoverUpload() {
  if (coverInputRef.value) {
    coverInputRef.value.value = '';
    coverInputRef.value.click();
  }
}

async function onCoverFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const publicUrl = await imageUpload.uploadImage(file);
    form.coverImage = publicUrl;
    Notify.create({ type: 'positive', message: 'Portada subida' });
  } catch {
    Notify.create({ type: 'negative', message: 'Error al subir portada' });
  }
}

// =========================================================================
// Save / Publish
// =========================================================================

async function handleSaveDraft() {
  if (!form.title) {
    Notify.create({ type: 'warning', message: 'El titulo es requerido' });
    return;
  }

  saving.value = true;
  try {
    const data = {
      title: form.title,
      slug: form.slug || undefined,
      excerpt: form.excerpt || undefined,
      coverImage: form.coverImage || undefined,
      body: form.body || undefined,
      status: 'draft' as const,
    };

    if (isEditMode.value && postId.value) {
      currentPost.value = await blogApi.updatePost(postId.value, data);
      Notify.create({ type: 'positive', message: 'Borrador guardado' });
    } else {
      currentPost.value = await blogApi.createPost(data);
      Notify.create({ type: 'positive', message: 'Borrador creado' });
      // Navigate to edit mode with the new ID
      router.replace(`/blog/${currentPost.value.id}`);
    }
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

async function handlePublish() {
  if (!form.title) {
    Notify.create({ type: 'warning', message: 'El titulo es requerido' });
    return;
  }

  saving.value = true;
  try {
    const data = {
      title: form.title,
      slug: form.slug || undefined,
      excerpt: form.excerpt || undefined,
      coverImage: form.coverImage || undefined,
      body: form.body || undefined,
      status: 'published' as const,
    };

    if (isEditMode.value && postId.value) {
      currentPost.value = await blogApi.updatePost(postId.value, data);
    } else {
      currentPost.value = await blogApi.createPost(data);
      router.replace(`/blog/${currentPost.value.id}`);
    }
    Notify.create({ type: 'positive', message: 'Post publicado' });
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

async function handleUnpublish() {
  if (!postId.value) return;

  saving.value = true;
  try {
    currentPost.value = await blogApi.unpublishPost(postId.value);
    Notify.create({ type: 'positive', message: 'Post despublicado' });
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

// =========================================================================
// Load existing post
// =========================================================================

async function loadPost(id: number) {
  loadingPost.value = true;
  try {
    const post = await blogApi.getPost(id);
    currentPost.value = post;
    form.title = post.title;
    form.slug = post.slug;
    form.excerpt = post.excerpt ?? '';
    form.coverImage = post.coverImage ?? '';
    form.body = post.body ?? '';
  } catch (err: unknown) {
    log.error('Failed to load post', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    router.push('/blog');
  } finally {
    loadingPost.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  if (postId.value) {
    loadPost(postId.value);
  }
});
</script>

<style scoped>
.blog-editor-textarea {
  width: 100%;
  min-height: 400px;
  padding: 12px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.6;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.blog-editor-textarea:focus {
  border-color: var(--q-primary);
}

.blog-editor-preview {
  min-height: 400px;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow-y: auto;
  line-height: 1.7;
}

.blog-editor-preview :deep(h2) {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 1.5em 0 0.5em;
}

.blog-editor-preview :deep(h3) {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.25em 0 0.4em;
}

.blog-editor-preview :deep(p) {
  margin: 0.8em 0;
}

.blog-editor-preview :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 1em 0;
}

.blog-editor-preview :deep(a) {
  color: var(--q-primary);
  text-decoration: underline;
}

.blog-editor-preview :deep(ul),
.blog-editor-preview :deep(ol) {
  padding-left: 1.5em;
  margin: 0.8em 0;
}

.blog-editor-preview :deep(blockquote) {
  border-left: 4px solid #ccc;
  padding-left: 1em;
  margin: 1em 0;
  color: #666;
}

.blog-editor-preview :deep(code) {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.9em;
}

.blog-editor-preview :deep(pre) {
  background: #f5f5f5;
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
}

.blog-editor-preview :deep(pre code) {
  padding: 0;
  background: none;
}
</style>
