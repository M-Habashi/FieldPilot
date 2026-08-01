# FieldPilot provider registry

This file is the authoritative list of external service providers used or being considered by
FieldPilot. Any provider addition, replacement, or removal must update this document in the same
change.

Last reviewed: 2026-08-01

## Current decision

Vercel, Convex, Google OAuth, and Resend support the architecture scaffold and private alpha.
FieldPilot does not need a separate API server, PostgreSQL database, cache, or WebSocket provider.

Before production file migration, the team must decide whether project drawings require expiring,
revocable download URLs. If they do, Cloudflare R2 becomes a required provider. Before invitations,
additional notification types ship, their delivery and retention requirements must be reviewed.

## Selected providers

| Provider                                                  | Status                           | Responsibility                                                                                       | Data held                                                                         |
| --------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [GitHub](https://github.com/)                             | Selected; already connected      | Source control and deployment trigger                                                                | Source code, issues, and pull-request metadata                                    |
| [Vercel](https://vercel.com/)                             | Selected                         | Build and host the React/Vite frontend, including preview deployments                                | Compiled frontend assets, build logs, and deployment environment variables        |
| [Convex](https://www.convex.dev/)                         | Selected; development configured | Database, server functions, realtime subscriptions, scheduled work, auth sessions, and authorization | Application records, user identities, function logs, and—if chosen—uploaded files |
| [Google Identity](https://developers.google.com/identity) | Selected; development configured | End-user identity provider for Google OAuth sign-in                                                  | OAuth consent, account identity, and sign-in events                               |
| [Resend](https://resend.com/)                             | Selected; configuration required | Deliver email-verification and password-reset codes                                                  | Recipient email, message content, and delivery events                             |

### Vercel

- Vercel hosts only the web client. It is not the system of record for project data.
- Production and preview deployments must use separate Convex deployments.
- `CONVEX_DEPLOY_KEY` belongs in Vercel's encrypted environment settings and must never use a
  `VITE_` prefix or enter the client bundle.
- The frontend Convex URL is public configuration and may be exposed to the Vite client.
- Deployment follows the official [Convex with Vercel](https://docs.convex.dev/production/hosting/vercel)
  workflow, translated to pnpm commands for this repository.

### Convex

- Cloud project: `mohammed-habashi/fieldpilot`.
- The repository is linked to the project through the current developer's personal cloud
  development deployment. Its identifiers and public client URLs live in ignored `.env.local`.
- The production deployment exists as part of the Convex project but has not been configured for
  Vercel or populated with application data. Preview deployments are not configured yet.
- Convex is the source of truth for users, projects, memberships, sheets, tasks, notes, and
  attachment metadata.
- Every public query and mutation must authenticate the caller and authorize access through project
  membership. Authentication alone is not authorization.
- Convex mutations allocate task sequence numbers atomically per project.
- Convex realtime subscriptions replace custom WebSocket infrastructure.
- Convex Auth is selected for the private alpha because the application is a client-rendered Vite
  app. It is currently documented as beta, so production readiness is a release gate rather than an
  assumption. See [Convex authentication](https://docs.convex.dev/auth/overview).
- Provider secrets used by Convex actions belong in Convex deployment environment variables, not
  Vercel's client-visible variables.
- Convex Auth is configured with Google and a password provider. Email/password accounts must enter
  a six-digit email code before a session or demo project is created.
- A password signup is rejected when the normalized email already belongs to Google. If an
  unfinished email signup later uses a verified Google identity, the existing user record is reused
  instead of creating a duplicate.
- Authorship and ownership identifiers are derived from authenticated server context, never
  accepted from the client.

### Google Identity

- Google Cloud project: `FieldPilot` (`innate-tempo-504200-k0`).
- OAuth client: `FieldPilot development`, type **Web application**.
- The consent screen is external and remains in **Testing** status. The current administrative
  Google account is the sole test user; add more testers deliberately in Google Auth Platform.
- Authorized development origin: `http://localhost:5173`.
- Authorized redirect URI:
  `https://grand-kookabura-810.convex.site/api/auth/callback/google`.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` exist only in the Convex development deployment's
  encrypted environment settings. Their values are not stored in the repository or Vercel.
- Create a separate OAuth client for production with the final Vercel origin. Do not reuse the
  development secret across environments.

### Resend

- Resend is called only from Convex actions; its API key is never sent to the browser.
- Set `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` separately on every Convex deployment. The sender in
  `AUTH_EMAIL_FROM` must use a domain verified in Resend.
- Verification and password-reset codes are six digits and expire after 15 minutes. Convex Auth
  applies rate limits to failed code and password attempts.
- Until both environment variables are configured, Google authentication continues to work but
  email verification and password-reset delivery return a clear configuration error.

## Conditional providers

These providers are not needed for the scaffold. The listed product capability is the trigger for
adopting one.

| Provider                                                                    | Status                                             | Adoption trigger                                                                                              | Responsibility                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) | Decision required before production file migration | Private drawings or photos require expiring and revocable URLs, or file egress economics favor object storage | Store PDF plans, photos, and other binary attachments; Convex retains metadata and object keys |

### File-storage decision gate

Convex File Storage is acceptable for an alpha when an unguessable bearer URL is an acceptable
access model. A URL returned by `storage.getUrl()` can be reused by anyone who obtains it and cannot
be revoked without deleting the file. Serving bytes through an authorization-checking Convex HTTP
action is limited to 20 MB, below FieldPilot's 50 MB+ plan-set target. These constraints are
documented in the official [Convex File Storage security model](https://docs.convex.dev/file-storage/overview).

Therefore:

- Use Convex File Storage only if the alpha explicitly accepts bearer URLs.
- Select R2 before production uploads if project membership removal must immediately revoke file
  access. Use short-lived signed URLs generated only after a Convex authorization check.
- Never expose an R2 access key to the browser. Upload/download authorization and signing belong in
  Convex functions.
- Store provider-neutral attachment metadata in Convex so changing binary storage does not rewrite
  task and note records.

## Evaluated alternatives—not selected

| Provider       | Status       | Revisit when                                                                                                                                    |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkOS AuthKit | Not selected | A production B2B release needs managed organizations, enterprise SSO, passkeys, or a stronger authentication SLA than beta Convex Auth provides |
| Clerk          | Not selected | A managed authentication UI and broader MFA/session features become more valuable than keeping identity in Convex                               |
| Sentry         | Not selected | Production error reporting and release health are needed                                                                                        |
| PostHog        | Not selected | Product analytics is approved with a documented privacy/data-retention policy                                                                   |
| Stripe         | Not selected | Paid plans and billing are scheduled                                                                                                            |

Fastify, NestJS, PostgreSQL, Prisma, Redis, and a standalone WebSocket service are not part of the
selected managed architecture.

## Secret and data-handling rules

1. Commit `.env.example` files with names and comments only—never values.
2. Client-visible variables must contain public configuration only.
3. Production and preview environments must not share Convex data.
4. Provider logs and telemetry must not contain plan contents, attachment URLs, access tokens, or
   note bodies.
5. Deleting a project must eventually delete both its Convex records and its binary objects.
6. Provider data exports and account deletion procedures must be documented before public launch.
