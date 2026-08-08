export interface PhotoStorageUpload {
  storageId: string;
}

interface UploadPhotoFileOptions {
  uploadUrl: string;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Sends a photo with real upload progress. `fetch` does not expose request-body
 * progress in browsers, which made large phone photos look frozen even while
 * bytes were still moving.
 */
export function uploadPhotoFile({
  uploadUrl,
  file,
  contentType,
  onProgress,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}: UploadPhotoFileOptions): Promise<PhotoStorageUpload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', uploadUrl);
    request.timeout = timeoutMs;
    request.setRequestHeader('Content-Type', contentType);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`The upload server returned HTTP ${request.status}.`));
        return;
      }
      try {
        const parsed = JSON.parse(request.responseText) as Partial<PhotoStorageUpload>;
        if (typeof parsed.storageId !== 'string' || parsed.storageId.length === 0) {
          throw new Error('The upload server did not return a file ID.');
        }
        onProgress?.(100);
        resolve({ storageId: parsed.storageId });
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () =>
      reject(
        new Error('The phone lost its connection while uploading. Check Wi-Fi and try again.'),
      );
    request.ontimeout = () =>
      reject(new Error('The upload took longer than 60 seconds. Check Wi-Fi and try again.'));
    request.onabort = () => reject(new Error('The upload was stopped before it finished.'));

    request.send(file);
  });
}
