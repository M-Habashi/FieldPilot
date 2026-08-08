import { sanitizePhotoDiagnostic } from '../src/lib/photo-diagnostics.js';

interface DiagnosticRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface DiagnosticResponse {
  status(code: number): DiagnosticResponse;
  json(value: unknown): void;
  end(): void;
  setHeader(name: string, value: string): void;
}

const LIVE_ORIGIN = 'https://fieldpilot-app.vercel.app';

export default function handler(request: DiagnosticRequest, response: DiagnosticResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = Array.isArray(request.headers.origin)
    ? request.headers.origin[0]
    : request.headers.origin;
  if (origin !== LIVE_ORIGIN) {
    response.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  let body = request.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      response.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }
  const diagnostic = sanitizePhotoDiagnostic(body);
  if (!diagnostic) {
    response.status(400).json({ error: 'Invalid diagnostic' });
    return;
  }

  console.info(
    'PHOTO_UPLOAD_DIAGNOSTIC',
    JSON.stringify({ ...diagnostic, receivedAt: Date.now() }),
  );
  response.status(204).end();
}
