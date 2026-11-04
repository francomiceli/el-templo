/**
 * Fastify JSON schemas + tipos de request del módulo Oficina (Fase 205).
 *
 * fast-json-stringify solo serializa las propiedades DECLARADAS en `response`:
 * todo campo del contrato tiene que estar listado acá o desaparece del JSON.
 */
import {
  OFFICE_EVENT_TYPES,
  OFFICE_TARGET_KINDS,
  OFFICE_TOPIC_ORIGINS,
  OFFICE_TOPIC_STATUSES,
} from "../../db/schema/office";
import type {
  CreateTopicInput,
  ListTopicsQuery,
  PatchTopicInput,
} from "./types";

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const personSchema = {
  type: ["object", "null"],
  properties: {
    id: { type: "integer" },
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
  },
} as const;

const eventSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    type: { type: "string", enum: [...OFFICE_EVENT_TYPES] },
    body: { type: ["string", "null"] },
    payload: { type: ["object", "null"], additionalProperties: true },
    actor: personSchema,
    createdAt: { type: "string" },
  },
} as const;

const topicListItemProperties = {
  id: { type: "integer" },
  title: { type: "string" },
  status: { type: "string", enum: [...OFFICE_TOPIC_STATUSES] },
  origin: { type: "string", enum: [...OFFICE_TOPIC_ORIGINS] },
  targetKind: {
    type: ["string", "null"],
    enum: [...OFFICE_TARGET_KINDS, null],
  },
  targetId: { type: ["integer", "null"] },
  targetLabel: { type: ["string", "null"] },
  branchId: { type: ["integer", "null"] },
  branchName: { type: ["string", "null"] },
  assignees: { type: "array", items: personSchema },
  createdBy: personSchema,
  snoozedUntil: { type: ["string", "null"] },
  lastActivityAt: { type: "string" },
  createdAt: { type: "string" },
  closedAt: { type: ["string", "null"] },
  commentCount: { type: "integer" },
  lastEvent: {
    type: ["object", "null"],
    properties: {
      type: { type: "string", enum: [...OFFICE_EVENT_TYPES] },
      body: { type: ["string", "null"] },
      actorFirstName: { type: ["string", "null"] },
      createdAt: { type: "string" },
    },
  },
  unseen: { type: "boolean" },
} as const;

const topicListItemSchema = {
  type: "object",
  properties: topicListItemProperties,
} as const;

const topicDetailSchema = {
  type: "object",
  properties: {
    ...topicListItemProperties,
    body: { type: ["string", "null"] },
    events: { type: "array", items: eventSchema },
  },
} as const;

const topicEnvelopeSchema = {
  type: "object",
  properties: { topic: topicDetailSchema },
} as const;

const idParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer" } },
} as const;

const assigneeIdsSchema = {
  type: "array",
  items: { type: "integer" },
  maxItems: 20,
} as const;

const mentionUserIdsSchema = {
  type: "array",
  items: { type: "integer" },
  maxItems: 20,
} as const;

export const officeListTopicsSchema = {
  querystring: {
    type: "object",
    properties: {
      view: {
        type: "string",
        enum: ["abiertos", "mios", "dormidos", "cerrados", "todos"],
      },
      origin: { type: "string", enum: [...OFFICE_TOPIC_ORIGINS] },
      q: { type: "string", maxLength: 200 },
      targetKind: { type: "string", enum: [...OFFICE_TARGET_KINDS] },
      targetId: { type: "integer" },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 200 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: { topics: { type: "array", items: topicListItemSchema } },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeCreateTopicSchema = {
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 160 },
      body: { type: ["string", "null"], maxLength: 4000 },
      targetKind: {
        type: ["string", "null"],
        enum: [...OFFICE_TARGET_KINDS, null],
      },
      targetId: { type: ["integer", "null"] },
      targetLabel: { type: ["string", "null"], maxLength: 160 },
      branchId: { type: ["integer", "null"] },
      assigneeIds: assigneeIdsSchema,
      mentionUserIds: mentionUserIdsSchema,
    },
  },
  response: {
    201: topicEnvelopeSchema,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeGetTopicSchema = {
  params: idParamsSchema,
  response: {
    200: topicEnvelopeSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

export const officePatchTopicSchema = {
  params: idParamsSchema,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 160 },
      body: { type: ["string", "null"], maxLength: 4000 },
      assigneeIds: assigneeIdsSchema,
      status: { type: "string", enum: ["abierto", "cerrado"] },
      snoozedUntil: {
        type: ["string", "null"],
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      note: { type: ["string", "null"], maxLength: 4000 },
    },
  },
  response: {
    200: topicEnvelopeSchema,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeAddCommentSchema = {
  params: idParamsSchema,
  body: {
    type: "object",
    required: ["body"],
    properties: {
      body: { type: "string", minLength: 1, maxLength: 4000 },
      mentionUserIds: mentionUserIdsSchema,
    },
  },
  response: {
    201: topicEnvelopeSchema,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeSeenSchema = {
  params: idParamsSchema,
  response: {
    204: { type: "null" },
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeBadgeSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        count: { type: "integer" },
        mentions: { type: "integer" },
        assigned: { type: "integer" },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeStaffSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        staff: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              role: { type: "string" },
            },
          },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

const autoDetectorSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
    perBranch: { type: "boolean" },
    disabledAll: { type: "boolean" },
    disabledBranchIds: { type: "array", items: { type: "integer" } },
    branches: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" } },
      },
    },
  },
} as const;

export const officeAutoSettingsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        detectors: { type: "array", items: autoDetectorSchema },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const officeSaveAutoSettingsSchema = {
  params: {
    type: "object",
    required: ["detector"],
    properties: { detector: { type: "string", maxLength: 40 } },
  },
  body: {
    type: "object",
    required: ["disabledAll", "disabledBranchIds"],
    properties: {
      disabledAll: { type: "boolean" },
      disabledBranchIds: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        maxItems: 200,
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: { detector: autoDetectorSchema },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

// ── Tipos de request ────────────────────────────────────────────────

export type OfficeListQuery = ListTopicsQuery;

export interface OfficeTopicParams {
  id: number;
}

export type OfficeCreateBody = CreateTopicInput;

export type OfficePatchBody = PatchTopicInput;

export interface OfficeCommentBody {
  body: string;
  mentionUserIds?: number[];
}

export interface OfficeAutoSettingsParams {
  detector: string;
}

export interface OfficeSaveAutoSettingsBody {
  disabledAll: boolean;
  disabledBranchIds: number[];
}
