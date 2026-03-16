# El Templo Bot - Development Guidelines

## Overview

WhatsApp AI chatbot for El Templo. Separate Node.js/TypeScript process that:

- Receives messages via WhatsApp Cloud API webhook
- Responds using AI (model-agnostic: OpenAI or Anthropic)
- Uses Redis for conversation context and state
- Writes to the shared MySQL database (same as el-templo-api)
- Runs proactive schedulers (class reminders, trial follow-ups)

## Architecture

- **This is a separate process**, not part of el-templo-api
- Shares the MySQL database with el-templo-api (Drizzle ORM, same schema)
- For actions that modify business data (book class, create user), call el-templo-api via localhost HTTP — do NOT duplicate business logic
- Redis for ephemeral state (context, locks, caching), MySQL for permanent records

## Key Documents

- Architecture decisions: `../.docs/whatsapp-bot-architecture.txt`
- Developer handoff: `../.docs/whatsapp-bot-developer-handoff.md`
- Reference implementation: `../digital-initiatives/whatsapp-agent-renovafacil/` (Python — patterns only)

## Standards

Same as root CLAUDE.md:

- **No `any` types.** Use `unknown` + type narrowing.
- **No `console.log`.** Use Pino logger.
- **Error handling:** `catch (err: unknown)` with `instanceof Error` checks.
- **TypeScript strict mode** enabled.

## Testing

- Integration tests for bot logic should live in `el-templo-api/test/whatsapp/` (shared test DB)
- Unit tests for bot-specific logic (AI provider, memory, state machine) can live in `el-templo-bot/test/`
- Run API tests: `cd ../el-templo-api && pnpm test`
