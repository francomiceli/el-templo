<!--
  Galería de Conquer (fase 201, §6, §7.2, D-08): el antes y el después de los alumnos, filtrable
  por "Solo autorizados" (los que activaron el permiso de publicación). Cada tarjeta muestra al
  alumno, las semanas entre controles, el día 0 y el último de frente (o la primera pose con foto).
  Las fotos son privadas: cada ConquerPhoto pide su URL firmada y las tarjetas viven dentro de un
  q-intersection, así que solo se piden las de las tarjetas que se ven. "Sin cara" es un
  recordatorio para quien use la foto como testimonio.
-->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <q-toggle
        v-model="onlyAuthorized"
        label="Solo autorizados"
        color="secondary"
        data-test="conquer-gallery-authorized"
      />
      <q-space />
      <div v-if="items" class="text-caption text-grey-8">
        {{ items.length }} {{ items.length === 1 ? 'alumno' : 'alumnos' }}
      </div>
    </div>

    <div v-if="loading && !items" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError && !items" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <template v-else-if="items">
      <div v-if="items.length === 0" class="text-center text-grey-8 q-pa-lg">
        <q-icon name="photo_library" size="40px" color="grey-6" />
        <div class="q-mt-sm">
          {{
            onlyAuthorized
              ? 'Ningún alumno autorizó publicar todavía'
              : 'Todavía no hay controles físicos con fotos o medidas'
          }}
        </div>
      </div>

      <div v-else class="row q-col-gutter-md" data-test="conquer-gallery-grid">
        <div v-for="item in items" :key="item.userId" class="col-12 col-sm-6 col-md-4">
          <q-intersection once style="min-height: 380px">
            <q-card flat bordered data-test="conquer-gallery-card">
              <q-card-section class="q-pb-sm">
                <div class="text-subtitle1 text-weight-medium">{{ nameOf(item) }}</div>
                <div class="text-caption text-grey-8">
                  {{ item.level ? LEVEL_LABELS[item.level] : 'Sin nivel' }} ·
                  {{ item.compare ? weeksText(item.compare.weeks) : 'un solo control' }}
                </div>
                <div class="q-mt-xs">
                  <q-chip
                    v-if="item.publishEnabled"
                    dense
                    square
                    color="secondary"
                    text-color="white"
                    class="q-ma-none q-mr-xs"
                  >
                    Autorizó publicar
                  </q-chip>
                  <q-chip
                    v-if="item.publishEnabled && item.publishNoFace"
                    dense
                    square
                    outline
                    color="accent"
                    class="q-ma-none"
                    data-test="conquer-gallery-noface"
                  >
                    Sin cara
                  </q-chip>
                </div>
              </q-card-section>

              <q-card-section class="q-pt-none">
                <div class="row q-col-gutter-sm">
                  <div v-for="side in sidesOf(item)" :key="side.key" class="col-6">
                    <div class="text-caption text-grey-8 q-mb-xs">{{ side.label }}</div>
                    <ConquerPhoto
                      v-if="side.pose"
                      :user-id="item.userId"
                      :check-id="side.check.id"
                      :pose="side.pose"
                      :alt="`${side.label} de ${nameOf(item)}`"
                    />
                    <div v-else class="conquer-gallery__nophoto text-grey-8 text-caption">
                      Sin fotos
                    </div>
                  </div>
                </div>
              </q-card-section>

              <q-card-actions align="right">
                <q-btn
                  flat
                  no-caps
                  color="secondary"
                  label="Ver ficha"
                  :to="{ name: 'conquer-alumno', params: { userId: item.userId } }"
                />
              </q-card-actions>
            </q-card>
          </q-intersection>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import ConquerPhoto from 'src/components/conquer/ConquerPhoto.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { LEVEL_LABELS, type BodyCheckView, type GalleryItem, type Pose } from 'src/types/conquer';
import { fullName, galleryPose, weeksText } from 'src/utils/conquer-format';

const props = defineProps<{
  /** Sube cuando la página necesita que se relea la galería. */
  reloadToken: number;
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const items = ref<GalleryItem[] | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const onlyAuthorized = ref(false);
// Descarta la respuesta de un filtro que ya cambió.
let token = 0;

interface Side {
  key: 'from' | 'to';
  label: string;
  check: BodyCheckView;
  pose: Pose | null;
}

function nameOf(item: GalleryItem): string {
  return fullName(item.firstName, item.lastName) || `Alumno ${item.userId}`;
}

// Con un solo control (`last` = null) la tarjeta muestra solo el día 0.
function sidesOf(item: GalleryItem): Side[] {
  const sides: Side[] = [];
  if (item.day0) {
    sides.push({
      key: 'from',
      label: item.last ? 'Antes' : 'Día 0',
      check: item.day0,
      pose: galleryPose(item.day0),
    });
  }
  if (item.last) {
    sides.push({ key: 'to', label: 'Último', check: item.last, pose: galleryPose(item.last) });
  }
  return sides;
}

async function load(): Promise<void> {
  const mine = ++token;
  loading.value = true;
  loadError.value = null;
  try {
    const res = await conquerApi.getGallery(onlyAuthorized.value ? true : undefined);
    if (mine !== token) return;
    items.value = res.items;
  } catch (err: unknown) {
    if (mine !== token) return;
    const message = err instanceof Error ? err.message : 'No pudimos cargar la galería';
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    if (mine === token) loading.value = false;
  }
}

onMounted(load);
watch(onlyAuthorized, load);
watch(() => props.reloadToken, load);
</script>

<style scoped lang="scss">
.conquer-gallery__nophoto {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $grey-2;
  border-radius: 4px;
}
</style>
