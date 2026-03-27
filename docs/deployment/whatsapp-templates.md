# WhatsApp Template Messages

Template messages must be submitted and approved in Meta Business Manager **before** the bot's schedulers can send them. This document describes each template, its variable mapping, and the submission process.

## Templates

### 1. `class_reminder` (Class Reminder)

| Field    | Value                            |
| -------- | -------------------------------- |
| Name     | `class_reminder`                 |
| Category | UTILITY (transactional reminder) |
| Language | Spanish (Argentina) -- `es_AR`   |

**Body text (suggested, Argentine Spanish with voseo):**

> Hola {{1}}! Te recordamos que hoy tenes clase de {{2}} a las {{3}}hs. Te esperamos en El Templo!

**Variable mapping:**

| Placeholder | Description       | Source in code                                  |
| ----------- | ----------------- | ----------------------------------------------- |
| `{{1}}`     | Member first name | `booking.first_name` (class-reminder.ts:139)    |
| `{{2}}`     | Activity name     | `booking.activity_name` (class-reminder.ts:140) |
| `{{3}}`     | Class start time  | `booking.start_time` (class-reminder.ts:141)    |

**Sample values for Meta review:** Juan, Calistenia, 18:00

**Component structure sent by code** (class-reminder.ts:135-144):

```json
[
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "Juan" },
      { "type": "text", "text": "Calistenia" },
      { "type": "text", "text": "18:00" }
    ]
  }
]
```

---

### 2. `trial_followup` (Trial Follow-up)

| Field    | Value                             |
| -------- | --------------------------------- |
| Name     | `trial_followup`                  |
| Category | MARKETING (post-trial engagement) |
| Language | Spanish (Argentina) -- `es_AR`    |

**Body text (suggested, Argentine Spanish with voseo):**

> Hola {{1}}! Como estuvo tu clase de prueba en El Templo? Nos encantaria saber que te parecio. Si te interesa seguir entrenando, escribinos y te contamos sobre nuestros planes.

**Variable mapping:**

| Placeholder | Description       | Source in code                                |
| ----------- | ----------------- | --------------------------------------------- |
| `{{1}}`     | Member first name | `attendee.first_name` (trial-followup.ts:151) |

**Sample values for Meta review:** Maria

**Component structure sent by code** (trial-followup.ts:149-154):

```json
[
  {
    "type": "body",
    "parameters": [{ "type": "text", "text": "Maria" }]
  }
]
```

---

## Meta Submission Instructions

1. Go to **Meta Business Manager > WhatsApp Manager > Message Templates**
2. Click **Create Template**
3. Select the category:
   - `class_reminder` -> UTILITY
   - `trial_followup` -> MARKETING
4. Select language: **Spanish (Argentina)**
5. Enter the template name exactly as shown (`class_reminder` or `trial_followup`)
6. Enter the body text with `{{1}}`, `{{2}}`, etc. variable placeholders
7. Add sample values for review (use the examples listed above)
8. Submit for review
   - UTILITY templates are typically approved within minutes
   - MARKETING templates may take longer (up to 24 hours)

## Important Notes

- Templates **must be approved** before the schedulers can send messages. Unapproved templates will cause Cloud API errors.
- If a template is rejected, modify the body text and resubmit. Common rejection reasons: promotional language in UTILITY category, missing opt-out instructions in MARKETING.
- UTILITY templates have higher approval rates than MARKETING templates.
- The language code `es_AR` must match what the code passes to `sendTemplateMessage` in `client.ts`.
- Template names are **case-sensitive** and must match exactly what the code sends.
- Do not modify template names in the code without updating Meta Business Manager (and vice versa).
