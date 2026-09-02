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
export type { SystemAvisoCode, SystemAvisoSeed } from "./system-avisos";
export { SYSTEM_AVISO_CODES, SYSTEM_AVISOS, seedSystemAvisos } from "./system-avisos";
export type {
  AvisoListItem,
  AvisoClicker,
  CreateAvisoInput,
  UpdateAvisoInput,
} from "./service";
export { CommunicationsService } from "./service";
export { communicationsRoutes } from "./routes";
export type {
  TvAvisoMode,
  TvAvisoItem,
  CreateTvAvisoInput,
  UpdateTvAvisoInput,
} from "./tv-avisos-service";
export { TvAvisosService } from "./tv-avisos-service";
export { tvAvisosRoutes } from "./tv-avisos-routes";
