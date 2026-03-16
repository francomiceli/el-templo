<template>
  <div class="q-gutter-md">
    <!-- Datos Personales -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-md">Datos Personales</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Email</div>
            <div class="text-body1">{{ member.email }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Telefono</div>
            <div class="text-body1">{{ member.phone ?? dashPlaceholder }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Domicilio</div>
            <div class="text-body1">{{ member.address ?? 'Sin domicilio' }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Tipo de documento</div>
            <div class="text-body1">{{ member.documentType ?? 'Sin especificar' }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">DNI</div>
            <div class="text-body1">{{ member.dni ?? dashPlaceholder }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Fecha de Nacimiento</div>
            <div class="text-body1">{{ formattedDateOfBirth }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Genero</div>
            <div class="text-body1">{{ translatedGender }}</div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Sede y Nivel -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-md">Sede y Nivel</div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Sucursal</div>
            <div class="text-body1">{{ member.branchName }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Nivel</div>
            <div class="text-body1">{{ levelDisplayName }}</div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="text-caption text-grey-7">Fecha de Alta</div>
            <div class="text-body1">{{ formattedCreatedAt }}</div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Contacto de Emergencia -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-md">Contacto de Emergencia</div>
        <template v-if="hasEmergencyContact">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Nombre</div>
              <div class="text-body1">{{ member.emergencyContactName }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Telefono</div>
              <div class="text-body1">{{ member.emergencyContactPhone ?? dashPlaceholder }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Relacion</div>
              <div class="text-body1">
                {{ member.emergencyContactRelationship ?? dashPlaceholder }}
              </div>
            </div>
          </div>
        </template>
        <div v-else class="text-grey-5 text-italic">Sin contacto de emergencia registrado</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MemberProfile } from 'src/types/member';

// =========================================================================
// Props
// =========================================================================

const props = defineProps<{
  member: MemberProfile;
}>();

// =========================================================================
// Constants
// =========================================================================

const dashPlaceholder = '\u2014';

const GENDER_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
};

const LEVEL_NAMES: Record<string, string> = {
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
};

// =========================================================================
// Computed
// =========================================================================

const formattedDateOfBirth = computed(() => {
  if (!props.member.dateOfBirth) return dashPlaceholder;
  return formatDate(props.member.dateOfBirth);
});

const translatedGender = computed(() => {
  if (!props.member.gender) return dashPlaceholder;
  return GENDER_LABELS[props.member.gender] ?? props.member.gender;
});

const levelDisplayName = computed(() => {
  return LEVEL_NAMES[props.member.level.toLowerCase()] ?? props.member.level;
});

const formattedCreatedAt = computed(() => {
  return formatDate(props.member.createdAt);
});

const hasEmergencyContact = computed(() => {
  return (
    props.member.emergencyContactName !== null ||
    props.member.emergencyContactPhone !== null ||
    props.member.emergencyContactRelationship !== null
  );
});

// =========================================================================
// Helpers
// =========================================================================

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
</script>
