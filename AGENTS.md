# Development workflow

## Local authentication

- Local frontend development must use the shared Convex development deployment configured by the tracked `.env.development` file.
- A fresh clone must support Google sign-in with only `pnpm install` and `pnpm dev`, opened at exactly `http://localhost:5173`.
- Do not create or modify `.env.local` unless the user explicitly requests a personal Convex deployment. Warn that an existing `.env.local` overrides the tracked development configuration and may need to be removed.
- Keep `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` on the same deployment. Do not replace them with `127.0.0.1` or a local Convex backend in the default workflow.
- Commit only public browser configuration. Never commit Google OAuth client secrets, Convex deployment credentials, or email-provider secrets, even when the repository is private; keep them in the Convex deployment environment.
- Keep the shared development deployment's `SITE_URL` set to `http://localhost:5173`, and keep its Google callback registered as `<VITE_CONVEX_SITE_URL>/api/auth/callback/google`.

## Package management

- Use `pnpm`, not `npm`, for JavaScript and Node package operations.
