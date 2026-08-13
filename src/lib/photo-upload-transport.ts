export interface PhotoUploadTransportResponse {
  ok: boolean;
  status: number;
  body: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('The selected image could not be read.'));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('The selected image could not be read.'));
    reader.onabort = () => reject(new Error('Reading the selected image was canceled.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Materialize the picker-backed File through the same FileReader data-URL path
 * used by Pic2Map before upload. The returned File owns its bytes in browser
 * memory, so the multipart request no longer re-opens an Android/iOS content
 * URI through a second, potentially different media-provider path.
 */
export async function materializePhotoUploadFile(
  source: File,
  fallbackContentType: string,
): Promise<File> {
  const dataUrl = await readAsDataUrl(source);
  return photoFileFromDataUrl(dataUrl, source, fallbackContentType);
}

export function photoFileFromDataUrl(
  dataUrl: string,
  source: Pick<File, 'name' | 'lastModified'>,
  fallbackContentType: string,
): File {
  const commaIndex = dataUrl.indexOf(',');
  const header = commaIndex >= 0 ? dataUrl.slice(0, commaIndex) : '';
  if (commaIndex < 0 || !header.startsWith('data:') || !/;base64$/iu.test(header)) {
    throw new Error('The selected image was returned in an unsupported format.');
  }

  const encoded = dataUrl.slice(commaIndex + 1);
  let binary: string;
  try {
    binary = globalThis.atob(encoded);
  } catch {
    throw new Error('The selected image contains invalid encoded data.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const declaredContentType = header.slice(5).split(';', 1)[0]?.trim().toLowerCase();
  const contentType =
    declaredContentType && declaredContentType !== 'application/octet-stream'
      ? declaredContentType
      : fallbackContentType;

  return new File([bytes], source.name, {
    type: contentType,
    lastModified: source.lastModified,
  });
}

/**
 * Pic2Map submits its reconstructed image Blob using XHR/FormData. Keeping the
 * same transport avoids asking a mobile browser to serialize the original
 * picker-backed File again after JavaScript has already inspected it.
 */
export function uploadPhotoForm(
  url: string,
  authToken: string,
  form: FormData,
): Promise<PhotoUploadTransportResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url, true);
    request.setRequestHeader('Authorization', `Bearer ${authToken}`);
    request.setRequestHeader('Accept', 'application/json');
    request.timeout = 120_000;
    request.onload = () => {
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        body: request.responseText,
      });
    };
    request.onerror = () => reject(new Error('The image upload could not reach the server.'));
    request.ontimeout = () => reject(new Error('The image upload timed out.'));
    request.onabort = () => reject(new Error('The image upload was canceled.'));
    request.send(form);
  });
}
