import { useEffect, useRef } from 'react';
import { petPhoto } from '../../config/site';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
export default function PhotoLightbox({
  id,
  alt,
  src,
}: {
  id: string;
  alt: string;
  src?: string;
}) {
  const ready = useClientState();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const unlock = () => document.body.classList.remove('locked');
    element?.addEventListener('close', unlock);
    return () => {
      element?.removeEventListener('close', unlock);
      unlock();
    };
  }, []);
  return (
    <>
      <button
        disabled={!ready}
        className="circle-button zoom-button"
        aria-label="Ampliar fotografía"
        onClick={() => {
          dialog.current?.showModal();
          document.body.classList.add('locked');
        }}
      >
        <Icon name="zoom" />
      </button>
      <dialog
        ref={dialog}
        className="lightbox-dialog"
        aria-label="Fotografía ampliada"
        onClick={(event) => {
          if (event.target === dialog.current) {
            const rect = dialog.current.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              dialog.current.close();
          }
        }}
      >
        <button
          className="circle-button"
          aria-label="Cerrar fotografía"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
        <img
          src={src ?? petPhoto(id)}
          alt={alt}
          width="960"
          height="960"
          loading="lazy"
        />
      </dialog>
    </>
  );
}
