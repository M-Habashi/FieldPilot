# FieldPilot provider registry

Authoritative list of external providers. Update this file with every provider change.

Last reviewed: 2026-08-01

## Selected

| Provider                                                  | Status                 | Purpose                                                       | Data held                                         |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| [GitHub](https://github.com/)                             | Connected              | Source control and deployment trigger                         | Code and issue/PR metadata                        |
| [Vercel](https://vercel.com/)                             | Selected               | Host the React/Vite frontend and previews                     | Build logs and deployment variables               |
| [Convex](https://www.convex.dev/)                         | Configured             | Database, server functions, realtime, auth, and authorization | App records, identities, logs, and optional files |
| [Google Identity](https://developers.google.com/identity) | Configured             | Google OAuth sign-in                                          | Consent, identity, and sign-in events             |
| [Brevo](https://www.brevo.com/)                           | Configuration required | Email verification and password-reset codes                   | Recipient, message, and delivery data             |

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
