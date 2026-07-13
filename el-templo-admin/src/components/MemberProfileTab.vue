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

    <!-- Domiciliación bancaria — solo sedes de España -->
    <q-card v-if="isSpainBranch" flat bordered>
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-md">Domiciliación bancaria</div>
        <template v-if="hasSepaDetails">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Nombre del deudor</div>
              <div class="text-body1">{{ member.sepaDetails?.debtorName ?? dashPlaceholder }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">NIF / CIF</div>
              <div class="text-body1">{{ member.sepaDetails?.nif ?? dashPlaceholder }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">IBAN</div>
              <div class="text-body1 row items-center no-wrap">
                <span>
                  {{
                    member.sepaDetails?.iban
                      ? showIban
                        ? member.sepaDetails.iban
                        : maskedIban
                      : dashPlaceholder
                  }}
                </span>
                <q-btn
                  v-if="member.sepaDetails?.iban"
                  :icon="showIban ? 'visibility_off' : 'visibility'"
                  flat
                  round
                  dense
                  size="sm"
                  color="grey-7"
                  class="q-ml-xs"
                  @click="showIban = !showIban"
                >
                  <q-tooltip>{{ showIban ? 'Ocultar IBAN' : 'Mostrar IBAN' }}</q-tooltip>
                </q-btn>
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Dirección</div>
              <div class="text-body1">{{ member.sepaDetails?.address ?? dashPlaceholder }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Código Postal — Población — País</div>
              <div class="text-body1">{{ sepaLocationLine }}</div>
            </div>
          </div>
        </template>
        <div v-else class="text-grey-5 text-italic">
          Sin datos de domiciliación registrados — se cargan editando al alumno
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
import { computed, ref } from 'vue';
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
  kairos: 'Kairos',
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
};

// =========================================================================
// Computed
// =========================================================================

// IBAN oculto por defecto (dato sensible); se revela con el ojito.
const showIban = ref(false);
const maskedIban = computed(() => {
  const iban = props.member.sepaDetails?.iban;
  if (!iban) return dashPlaceholder;
  const visible = iban.slice(-4);
  return `${'•'.repeat(Math.max(iban.length - 4, 0))}${visible}`;
});

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

// Domiciliación bancaria: la card solo aplica a sedes de España.
const isSpainBranch = computed(() => props.member.branchCountry === 'ES');

const hasSepaDetails = computed(() => {
  const sepa = props.member.sepaDetails;
  if (!sepa) return false;
  return Boolean(
    sepa.debtorName ?? sepa.nif ?? sepa.iban ?? sepa.address ?? sepa.postalCode ?? sepa.city
  );
});

const sepaLocationLine = computed(() => {
  const sepa = props.member.sepaDetails;
  const parts = [sepa?.postalCode, sepa?.city, sepa?.country].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : dashPlaceholder;
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
