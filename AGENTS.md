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

## Mobile photo upload architecture — protected invariant

The project photo map uses a deliberately unusual upload pipeline because directly uploading the
`File` returned by a mobile file picker failed on real Android and iPhone devices even though the
same photo retained usable EXIF GPS data when uploaded to Pic2Map. Desktop browsers and emulators
did not reliably reproduce the failure.

The required pipeline is:

1. Receive the picker-backed `File` from the existing file input.
2. Validate its filename, media type, and size.
3. Call `materializePhotoUploadFile` in `src/lib/photo-upload-transport.ts`.
4. Inside that function, read the picker-backed file with `FileReader.readAsDataURL`.
5. Decode the base64 result into a new `Uint8Array` and construct a new browser-owned `File` while
   preserving the original filename, MIME type, `lastModified`, and every byte of the image.
6. Run client diagnostics against this new in-memory `File`.
7. Append this same new in-memory `File` to `FormData`.
8. Send the multipart form through `uploadPhotoForm`, which uses `XMLHttpRequest` and preserves the
   `Authorization` header, JSON response handling, error handling, and 120-second timeout.
9. Parse GPS server-side from the unchanged original image bytes: standard EXIF first, followed by
   the validated Samsung Motion Photo appended-MP4 `©xyz` fallback when needed.

This makes diagnostics and the backend inspect the exact same owned bytes and prevents the browser
from re-opening or re-serializing an Android/iOS picker content-provider URI during upload.

Do not simplify or replace this path with any of the following unless a real-device regression is
first reproduced, a replacement is proven on physical Android and iPhone devices, and the user
explicitly approves the architecture change:

- Do not append the original picker-backed `File` directly to `FormData`.
- Do not replace the `FileReader.readAsDataURL` materialization step with a direct `arrayBuffer()`,
  `fetch()`, object-URL upload, or direct picker-file upload merely because it works on desktop.
- Do not replace `XMLHttpRequest` with `fetch` for photo multipart uploads merely as cleanup.
- Do not resize, recompress, draw the photo to a canvas, strip metadata, or create a lossy derivative
  before the server parses location data.
- Do not run diagnostics on one file/blob and upload another.
- Do not remove the standard EXIF parser or Samsung Motion Photo `©xyz` fallback independently.
- Do not change the photo picker UI or add capture/location behavior as part of transport cleanup.

Any change touching `src/lib/photo-upload-transport.ts`, the photo-upload block in
`src/components/projects/ProjectPhotoMap.tsx`, or the server EXIF/Motion Photo parser must preserve
these invariants and run at least:

```text
pnpm test -- src/lib/photo-upload-transport.test.ts
pnpm typecheck
pnpm lint
```

The byte-preservation and FileReader-path regression tests are safeguards and must not be weakened
or deleted to make a refactor pass. Before production deployment, also test a known GPS-bearing
original photo through the deployed site and confirm `/api/photo-upload` reports
`exifStatus: "found"`, `hasExifLocation: true`, and creates a mapped marker. Desktop/emulator success
is necessary but not sufficient for changes to this pipeline: final acceptance requires the same
original file to work from at least one physical phone using the device file picker.
