import { defineCollection, defineContentConfig, z } from "@nuxt/content";

export default defineContentConfig({
  collections: {
    // Placeholder collection — blog will be API-backed (Phase 35)
    // Defines minimal schema so @nuxt/content initializes without warnings
    content: defineCollection({
      type: "page",
      source: "content/**",
      schema: z.object({
        title: z.string(),
      }),
    }),
  },
});
