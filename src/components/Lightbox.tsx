import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useProject } from '../store/project';
import { usePhotoUrl } from '../hooks/usePhotoUrl';

export function Lightbox() {
  const photoId = useProject((s) => s.lightboxPhotoId);
  const remoteUrl = useProject((s) => {
    if (!s.lightboxPhotoId) return undefined;
    for (const task of Object.values(s.tasks)) {
      const photo = task.photos.find((candidate) => candidate.id === s.lightboxPhotoId);
      if (photo) return photo.url;
    }
    return undefined;
  });
  const setLightbox = useProject((s) => s.setLightbox);
  const url = usePhotoUrl(photoId, remoteUrl);

  useEffect(() => {
    if (!photoId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLightbox(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [photoId, setLightbox]);

  if (!photoId) return null;

  return (
    <div
      className="fp-lightbox fixed inset-0 z-90 flex items-center justify-center p-6"
      onClick={() => setLightbox(null)}
    >
      <button
        type="button"
        aria-label="Close photo"
        className="absolute right-4 top-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25"
        onClick={() => setLightbox(null)}
      >
        <X className="size-5" />
      </button>
      {url && (
        <img
          src={url}
          alt=""
          className="max-h-full max-w-full rounded-lg object-contain shadow-e3"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
