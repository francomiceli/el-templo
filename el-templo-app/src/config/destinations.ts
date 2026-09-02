// ESPEJO de `el-templo-api/src/modules/communications/destinations.ts`. La
// fuente de verdad es la API — si cambiás una ruta acá y no allá,
// `test/communications/destinations-sync.test.ts` queda en rojo.
//
// Fase 193 (D-01, D-02, D-03, D-04). El repo no tiene un paquete de tipos
// compartido entre las 3 apps, así que la lista curada de secciones se
// duplica de forma mínima; la validación (`validateDestination`,
// `validateWhatsAppText`) es SOLO server-side (D-05) y no vive acá.

export type AppSectionKey =
  | 'mi_templo'
  | 'reservas'
  | 'programas'
  | 'referidos'
  | 'proponer_mejora'
  | 'mi_plan'
  | 'volver'

export interface AppSection {
  key: AppSectionKey
  label: string
  route: string
}

export const APP_SECTIONS: readonly AppSection[] = [
  {
    key: 'mi_templo',
    label: 'Mi Templo',
    route: '/mi-templo',
  },
  {
    key: 'reservas',
    label: 'Reservas',
    route: '/reservas',
  },
  {
    key: 'programas',
    label: 'Programas',
    route: '/planes',
  },
  {
    key: 'referidos',
    label: 'Referidos',
    route: '/mis-referidos',
  },
  {
    key: 'proponer_mejora',
    label: 'Proponer mejora',
    route: '/proponer-mejora',
  },
  {
    key: 'mi_plan',
    label: 'Mi plan',
    route: '/planes',
  },
  {
    key: 'volver',
    label: 'Volver',
    route: '/volver',
  },
]

export type DestinationType = 'app_section' | 'whatsapp_sales'

export interface Destination {
  type: DestinationType
  section: AppSectionKey | null
  whatsappText: string | null
}

export const DEFAULT_WHATSAPP_TEXT =
  'Hola! Quiero más información sobre El Templo'

export const CONTACT_SALES_ROUTE = '/contacto-ventas'

export const FALLBACK_ROUTE = '/mi-templo'

const APP_SECTION_ROUTE_BY_KEY: ReadonlyMap<AppSectionKey, string> = new Map(
  APP_SECTIONS.map((section) => [section.key, section.route]),
)

function isAppSectionKey(value: unknown): value is AppSectionKey {
  return (
    typeof value === 'string' &&
    APP_SECTIONS.some((section) => section.key === value)
  )
}

export function resolveDestinationRoute(destination: Destination): string {
  if (destination.type === 'whatsapp_sales') {
    return CONTACT_SALES_ROUTE
  }
  if (destination.section && isAppSectionKey(destination.section)) {
    return APP_SECTION_ROUTE_BY_KEY.get(destination.section) ?? FALLBACK_ROUTE
  }
  return FALLBACK_ROUTE
}

export function fallbackRouteFor(destination: Destination): string {
  if (destination.type === 'app_section') {
    return resolveDestinationRoute(destination)
  }
  return FALLBACK_ROUTE
}
