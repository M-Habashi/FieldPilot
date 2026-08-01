import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const urlCache = new Map<string, string>();

function photoKey(id: string): string {
  return `fp:img:${id}`;
}

export async function savePhotoBlob(id: string, blob: Blob): Promise<void> {
  await idbSet(photoKey(id), blob);
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(photoKey(id));
}

export async function deletePhotoBlob(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  await idbDel(photoKey(id));
}

/** Returns a stable object URL for a stored photo blob (cached per session). */
export async function getPhotoUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getPhotoBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}
