# FieldPilot provider registry

Authoritative list of external providers. Update this file with every provider change.

Last reviewed: 2026-08-27

## Selected

| Provider                                                  | Status                 | Purpose                                                       | Data held                                         |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| [GitHub](https://github.com/)                             | Connected              | Source control and deployment trigger                         | Code and issue/PR metadata                        |
| [Vercel](https://vercel.com/)                             | Selected               | Host the React/Vite frontend and previews                     | Build logs and deployment variables               |
| [Convex](https://www.convex.dev/)                         | Configured             | Database, server functions, realtime, auth, and authorization | App records, identities, logs, and optional files |
| [Google Identity](https://developers.google.com/identity) | Configured             | Google OAuth sign-in                                          | Consent, identity, and sign-in events             |
| [Brevo](https://www.brevo.com/)                           | Configuration required | Email verification and password-reset codes                   | Recipient, message, and delivery data             |
| [OpenAI](https://openai.com/)                             | Configuration required | AI chat reasoning, tool calling, and responses                | Chat prompts and selected project records         |

## Brevo requirements

- Call Brevo only from Convex actions; never expose its API key to the browser.
- Set `AUTH_BREVO_KEY` and `AUTH_EMAIL_FROM` on every Convex deployment. `AUTH_EMAIL_FROM` must be
  an email sender verified in Brevo.
- For the no-domain alpha, Brevo can verify an existing mailbox and may rewrite the visible sender
  to a Brevo-managed address. Authenticate a FieldPilot domain and update `AUTH_EMAIL_FROM` before
  production launch; no auth UI changes are required when the sender changes.
- Codes are six digits and expire after 15 minutes. Until configured, Google sign-in still works;
  email sign-up is rejected before any user or password record is created, and password reset
  returns a configuration error.
- Unverified password users receive no app session; reminders and change-email actions stay in auth,
  and successful verification goes directly to Projects.

## AI chat requirements

- Call the LLM only from the scheduled Convex agent action; never expose the API key to the browser
  or through a `VITE_*` variable. Agent tools are internal Convex functions and receive project and
  user scope from the authenticated thread binding, never from model-generated arguments.
- Set `AI_CHAT_API_KEY` on every Convex deployment that enables AI chat. `AI_CHAT_PROVIDER`
  controls the protocol:
  - `compatible` (the default) uses OpenAI-compatible Chat Completions. Set `AI_CHAT_BASE_URL` and
    `AI_CHAT_MODEL` for OpenRouter or another compatible gateway.
  - `openai` uses OpenAI's native Responses API through the OpenAI provider. `AI_CHAT_BASE_URL`
    remains optional for an approved OpenAI-compatible network proxy, and `AI_CHAT_MODEL` selects
    the OpenAI model.
- `AI_CHAT_BASE_URL` defaults to `https://api.openai.com/v1` and `AI_CHAT_MODEL` defaults to
  `gpt-4o-mini`. A third-party compatible endpoint must support function tools and streaming for
  the agent experience; compatibility should be verified before production use.
- New chat history and tool events are stored by the Convex Agent component. The app-owned
  `agentThreadBindings` table binds each component thread to one project member and browser
  conversation. Entering a project starts a fresh conversation, while refreshing or navigating
  inside that project keeps the current one. Conversations are private to each member and never
  shared project-wide. The legacy `chatMessages` table remains temporarily for rollback.
- The current agent release is read-only. Its six project-data tools re-check project membership on
  every call. Write tools will be added only with persisted approval, execution-time role checks,
  idempotency, audit receipts, and task pin placement before row creation.
- Chat requests are limited per authenticated user to a short burst of three, replenishing at six
  per minute, plus 60 per hour. The limit is consumed transactionally before any prompt is saved or
  model run is scheduled.
- Until `AI_CHAT_API_KEY` is configured, the chat panel opens normally but replies return a
  configuration error.

## Conditional

| Provider                                                                    | Adopt when                                                         | Purpose                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) | Production files need expiring/revocable URLs or lower egress cost | Store binary attachments; Convex keeps metadata |

Convex File Storage is acceptable for alpha only when bearer URLs are acceptable. Use R2 with
short-lived, authorization-checked signed URLs when membership removal must revoke file access.

## Not selected

Resend is not used as a provider; “resend code” is only an authentication retry action. WorkOS,
Clerk, Sentry, PostHog, Stripe, Fastify, NestJS, PostgreSQL, Prisma, Redis, and a standalone
WebSocket service are out of scope. Revisit them only when their corresponding product need is
approved.

## Rules

- Commit environment-variable names only; never secrets.
- Keep client-visible variables public and isolate Convex data across environments.
- Do not log plan contents, attachment URLs, access tokens, or note bodies.
- Project deletion must eventually remove both Convex records and binary objects.
