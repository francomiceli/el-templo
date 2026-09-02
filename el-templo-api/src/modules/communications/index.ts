export type {
  AppSectionKey,
  AppSection,
  DestinationType,
  Destination,
  ValidationResult,
} from "./destinations";
export {
  APP_SECTIONS,
  DEFAULT_WHATSAPP_TEXT,
  CONTACT_SALES_ROUTE,
  FALLBACK_ROUTE,
  WHATSAPP_TEXT_MAX_LENGTH,
  isAppSectionKey,
  resolveDestinationRoute,
  fallbackRouteFor,
  validateWhatsAppText,
  validateDestination,
} from "./destinations";
