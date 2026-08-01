import { useEffect, useState } from 'react';
import { getPhotoUrl } from '../lib/photos';

export function usePhotoUrl(id: string | null, remoteUrl?: string): string | null {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id || remoteUrl) {
      setLocalUrl(null);
      return;
    }
    let active = true;
    void getPhotoUrl(id).then((u) => {
      if (active) setLocalUrl(u);
    });
    return () => {
      active = false;
    };
  }, [id, remoteUrl]);
  return remoteUrl ?? localUrl;
}
