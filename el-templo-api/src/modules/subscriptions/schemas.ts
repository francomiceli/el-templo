/**
 * Fastify JSON schemas for Subscriptions API request/response validation.
 */

// =============================================================================
// Shared response fragments
// =============================================================================

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const planSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    planTier: { type: "string" },
    bookingMode: { type: "string" },
    priceRegular: { type: "integer" },
    priceZero: { type: "integer" },
    priceCreditCard: { type: ["integer", "null"] },
    durationDays: { type: "integer" },
    classesPerWeek: { type: ["integer", "null"] },
    multiBranch: { type: "boolean" },
    isTrial: { type: "boolean" },
    isGroup: { type: "boolean" },
    planCategory: {
      type: "string",
      enum: ["presencial", "online_regular", "online_goal", "online_coach"],
    },
    goalPlanType: { type: ["string", "null"] },
    linkedProgramId: { type: ["integer", "null"] },
    groupMaxMembers: { type: ["integer", "null"] },
    isActive: { type: "boolean" },
    isArchived: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const subscriptionDetailSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    userId: { type: "integer" },
    planId: { type: "integer" },
    planName: { type: "string" },
    planTier: { type: "string" },
    planCategory: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    status: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: ["string", "null"] },
    pricePaid: { type: "integer" },
    priceTypeApplied: { type: "string" },
    auraDiscount: { type: ["integer", "null"] },
    auraDiscountPercent: { type: ["integer", "null"] },
    boardingPassUsed: { type: "boolean" },
    priceOverrideAmount: { type: ["integer", "null"] },
    priceOverrideReason: { type: ["string", "null"] },
    pausedAt: { type: ["string", "null"] },
    pauseEndDate: { type: ["string", "null"] },
    resumedAt: { type: ["string", "null"] },
    cancelledAt: { type: ["string", "null"] },
    classesRemaining: { type: ["integer", "null"] },
    classesBudget: { type: ["integer", "null"] },
    previousSubscriptionId: { type: ["integer", "null"] },
    replacementCredits: { type: "integer" },
    scheduleIds: { type: "array", items: { type: "integer" } },
    notes: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const pricingPreviewResponseSchema = {
  type: "object",
  properties: {
    basePrice: { type: "integer" },
    discountType: { type: "string" },
    discountAmount: { type: "integer" },
    finalPrice: { type: "integer" },
    auraToSpend: { type: "integer" },
    auraBalance: { type: "integer" },
    boardingPassEligible: { type: "boolean" },
    availableTiers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          spend: { type: "integer" },
          percent: { type: "integer" },
        },
      },
    },
  },
} as const;

// =============================================================================
// Plans Endpoints
// =============================================================================

export const listPlansSchema = {
  querystring: {
    type: "object",
    properties: {
      isActive: { type: "boolean" },
      includeArchived: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        plans: { type: "array", items: planSchema },
      },
    },
  },
};

export const getPlanSchema = {
  params: {
    type: "object",
    required: ["planId"],
    properties: {
      planId: { type: "integer" },
    },
  },
  response: {
    200: planSchema,
    404: errorSchema,
  },
};

export const createPlanSchema = {
  body: {
    type: "object",
    required: [
      "name",
      "planTier",
      "bookingMode",
      "priceRegular",
      "priceZero",
      "durationDays",
    ],
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      planTier: {
        type: "string",
        enum: ["flex", "foundation", "performance", "other"],
      },
      bookingMode: { type: "string", enum: ["fixed", "flexible"] },
      priceRegular: { type: "integer", minimum: 0 },
      priceZero: { type: "integer", minimum: 0 },
      priceCreditCard: { type: "integer", minimum: 0 },
      durationDays: { type: "integer", minimum: 1 },
      classesPerWeek: { type: "integer", minimum: 1 },
      multiBranch: { type: "boolean" },
      isTrial: { type: "boolean" },
      isGroup: { type: "boolean" },
      planCategory: {
        type: "string",
        enum: ["presencial", "online_regular", "online_goal", "online_coach"],
      },
      linkedProgramId: { type: "integer" },
      groupMaxMembers: { type: "integer", minimum: 1 },
    },
  },
  response: {
    201: planSchema,
  },
};

export const updatePlanSchema = {
  params: {
    type: "object",
    required: ["planId"],
    properties: {
      planId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: ["string", "null"] },
      planTier: {
        type: "string",
        enum: ["flex", "foundation", "performance", "other"],
      },
      bookingMode: { type: "string", enum: ["fixed", "flexible"] },
      priceRegular: { type: "integer", minimum: 0 },
      priceZero: { type: "integer", minimum: 0 },
      priceCreditCard: { type: ["integer", "null"] },
      durationDays: { type: "integer", minimum: 1 },
      classesPerWeek: { type: ["integer", "null"] },
      multiBranch: { type: "boolean" },
      isTrial: { type: "boolean" },
      isGroup: { type: "boolean" },
      planCategory: {
        type: "string",
        enum: ["presencial", "online_regular", "online_goal", "online_coach"],
      },
      linkedProgramId: { type: ["integer", "null"] },
      groupMaxMembers: { type: ["integer", "null"] },
    },
  },
  response: {
    200: planSchema,
    404: errorSchema,
  },
};

export const deactivatePlanSchema = {
  params: {
    type: "object",
    required: ["planId"],
    properties: {
      planId: { type: "integer" },
    },
  },
  response: {
    200: planSchema,
    404: errorSchema,
  },
};

// =============================================================================
// Subscription Endpoints
// =============================================================================

export const getMemberSubscriptionSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: subscriptionDetailSchema,
    404: errorSchema,
  },
};

export const getMemberSubscriptionHistorySchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        subscriptions: { type: "array", items: subscriptionDetailSchema },
      },
    },
  },
};

export const assignPlanSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: [
      "planId",
      "branchId",
      "startDate",
      "priceTypeApplied",
      "paymentMethod",
    ],
    properties: {
      planId: { type: "integer" },
      branchId: { type: "integer" },
      startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      priceTypeApplied: {
        type: "string",
        enum: ["regular", "zero", "credit_card"],
      },
      paymentMethod: { type: "string", enum: ["cash", "transfer", "card"] },
      scheduleIds: { type: "array", items: { type: "integer" }, minItems: 1 },
      auraSpend: { type: "integer", minimum: 0 },
      priceOverrideAmount: { type: "integer", minimum: 0 },
      priceOverrideReason: { type: "string" },
      boardingPass: { type: "boolean" },
      notes: { type: "string" },
    },
  },
  response: {
    201: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const changePlanSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: [
      "planId",
      "branchId",
      "startDate",
      "priceTypeApplied",
      "paymentMethod",
    ],
    properties: {
      planId: { type: "integer" },
      branchId: { type: "integer" },
      startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      priceTypeApplied: {
        type: "string",
        enum: ["regular", "zero", "credit_card"],
      },
      paymentMethod: { type: "string", enum: ["cash", "transfer", "card"] },
      scheduleIds: { type: "array", items: { type: "integer" }, minItems: 1 },
      auraSpend: { type: "integer", minimum: 0 },
      priceOverrideAmount: { type: "integer", minimum: 0 },
      priceOverrideReason: { type: "string" },
      boardingPass: { type: "boolean" },
      notes: { type: "string" },
      startMode: {
        type: "string",
        enum: ["now", "after_current"],
      },
    },
  },
  response: {
    201: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const renewSubscriptionSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["paymentMethod"],
    properties: {
      paymentMethod: { type: "string", enum: ["cash", "transfer", "card"] },
    },
  },
  response: {
    201: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const pauseSubscriptionSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    anyOf: [
      {
        type: "object",
        properties: {
          pauseEndDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
      },
      { type: "null" },
    ],
  },
  response: {
    200: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const resumeSubscriptionSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const cancelSubscriptionSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      notes: { type: "string" },
    },
  },
  response: {
    200: subscriptionDetailSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const bulkMigratePlanSchema = {
  body: {
    type: "object",
    required: ["userIds", "targetPlanId", "targetBranchId"],
    properties: {
      userIds: {
        type: "array",
        items: { type: "integer" },
        minItems: 1,
      },
      targetPlanId: { type: "integer" },
      targetBranchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        migrated: { type: "integer" },
        skipped: { type: "integer" },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    400: errorSchema,
    404: errorSchema,
  },
};

export const classUsageSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        classesRemaining: { type: ["integer", "null"] },
        classesBudget: { type: ["integer", "null"] },
        classesUsedThisWeek: { type: "integer" },
        weeklyLimit: { type: ["integer", "null"] },
        bookingMode: { type: "string" },
        scheduleIds: { type: "array", items: { type: "integer" } },
        scheduleSlots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              dayOfWeek: { type: "integer" },
              startTime: { type: "string" },
              endTime: { type: "string" },
              activityName: { type: "string" },
            },
          },
        },
      },
    },
    404: errorSchema,
  },
};

export const changePlanPreviewSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    required: ["targetPlanId"],
    properties: {
      targetPlanId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        allowed: { type: "boolean" },
        reason: { type: "string" },
        currentPlan: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            priceRegular: { type: "integer" },
            pricePaid: { type: "integer" },
          },
        },
        targetPlan: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            priceRegular: { type: "integer" },
          },
        },
        proration: {
          type: ["object", "null"],
          properties: {
            remainingValue: { type: "integer" },
            remainingRatio: { type: "number" },
            remainingDetail: { type: "string" },
          },
        },
        netAmount: { type: ["integer", "null"] },
        expiryDate: { type: "string" },
      },
    },
    404: errorSchema,
  },
};

// =============================================================================
// Promo Plan Endpoints
// =============================================================================

export const listPromosSchema = {
  tags: ["subscriptions"],
  response: { 200: { type: "array" } },
};

export const createPromoSchema = {
  tags: ["subscriptions"],
  body: {
    type: "object",
    required: [
      "name",
      "promoCode",
      "planDurationDays",
      "startDate",
      "expiryDate",
      "promoType",
      "subscriptionPlanId",
    ],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 150 },
      promoCode: { type: "string", minLength: 1, maxLength: 50 },
      planDurationDays: { type: "integer", minimum: 1 },
      startDate: { type: "string" },
      expiryDate: { type: "string" },
      promoType: { type: "string", enum: ["auto", "admin_assignable"] },
      subscriptionPlanId: { type: "integer" },
    },
  },
};

export const updatePromoSchema = {
  tags: ["subscriptions"],
  params: {
    type: "object",
    properties: { promoId: { type: "integer" } },
    required: ["promoId"],
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 150 },
      planDurationDays: { type: "integer", minimum: 1 },
      startDate: { type: "string" },
      expiryDate: { type: "string" },
      promoType: { type: "string", enum: ["auto", "admin_assignable"] },
      subscriptionPlanId: { type: "integer" },
    },
  },
};

export const deactivatePromoSchema = {
  tags: ["subscriptions"],
  params: {
    type: "object",
    properties: { promoId: { type: "integer" } },
    required: ["promoId"],
  },
};

export const pricingPreviewSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    required: ["planId", "priceType"],
    properties: {
      planId: { type: "integer" },
      priceType: {
        type: "string",
        enum: ["regular", "zero", "credit_card"],
      },
      auraSpend: { type: "integer", minimum: 0 },
    },
  },
  response: {
    200: pricingPreviewResponseSchema,
    404: errorSchema,
  },
};
