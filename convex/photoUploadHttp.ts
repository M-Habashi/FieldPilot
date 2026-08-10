import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
import { inspectExifPhotoLocation, photoByteFingerprint } from './lib/photoExif';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://fieldpilot-app.vercel.app',
  'https://fieldpilot-two.vercel.app',
]);

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.has(origin) || origin === process.env.SITE_URL) return true;
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname.endsWith('.trycloudflare.com') ||
      hostname.endsWith('.ts.net') ||
      hostname.endsWith('.ngrok-free.app')
    );
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && isAllowedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function formText(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const options = httpAction(async (_, request) => {
  const headers = corsHeaders(request);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
});

/**
 * Receives the photo as multipart/form-data, matching Pic2Map's Android upload
 * transport. Some Android/Chrome combinations redact GPS when a File is sent
 * as the raw request body but preserve it when the same File is a multipart
 * form part.
 */
export const upload = httpAction(async (ctx, request) => {
  if ((await ctx.auth.getUserIdentity()) === null) {
    return jsonResponse(request, { error: 'Unauthenticated' }, 401);
  }

  let storageRef: Id<'_storage'> | null = null;
  try {
    const form = await request.formData();
    const projectId = formText(form, 'projectId');
    const attemptId = formText(form, 'attemptId') ?? undefined;
    const fallbackContentType = formText(form, 'contentType') ?? 'application/octet-stream';
    const photo = form.get('photo');

    if (!projectId || !(photo instanceof Blob) || photo.size === 0) {
      return jsonResponse(request, { error: 'A photo file and project are required.' }, 400);
    }

    const contentType = photo.type || fallbackContentType;
    if (!contentType.startsWith('image/')) {
      return jsonResponse(request, { error: 'Only image files can be uploaded.' }, 415);
    }

    const fileName =
      'name' in photo && typeof photo.name === 'string' && photo.name.length > 0
        ? photo.name
        : 'photo';
    if (attemptId) {
      try {
        const receivedInspection = await inspectExifPhotoLocation(photo);
        await ctx.runMutation(api.photoUploadDiagnostics.record, {
          projectId: projectId as Id<'projects'>,
          attemptId,
          phase: 'storage-uploaded',
          stage: 'backend-received',
          contentType,
          size: photo.size,
          exifStatus: receivedInspection.status,
          byteFingerprint: await photoByteFingerprint(photo),
        });
      } catch {
        console.warn('photo_received_diagnostic_failed', JSON.stringify({ attemptId }));
      }
    }
    storageRef = await ctx.storage.store(photo);
    const result = await ctx.runAction(api.photoUploads.complete, {
      projectId: projectId as Id<'projects'>,
      storageRef,
      fileName,
      contentType,
      size: photo.size,
      attemptId,
    });

    return jsonResponse(request, result);
  } catch (error) {
    if (storageRef !== null) await ctx.storage.delete(storageRef).catch(() => undefined);
    console.error(
      'photo_multipart_upload_failed',
      JSON.stringify({
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message.slice(0, 240) : String(error),
      }),
    );
    return jsonResponse(request, { error: 'The photo could not be uploaded.' }, 400);
  }
});
