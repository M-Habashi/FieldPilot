import { useEffect, useState } from 'react';
import { getPhotoUrl } from '../lib/photos';

export function usePhotoUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let active = true;
    void getPhotoUrl(id).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}
